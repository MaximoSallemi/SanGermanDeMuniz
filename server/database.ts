import { DatabaseSync, backup as sqliteBackup } from 'node:sqlite';
import { mkdirSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  ROOMS,
  todayLocal,
  type Reservation,
  type CashSession,
  type Movement,
  type Consumption,
  type Payment,
} from '../shared/domain.ts';

type Row = Record<string, any>;
export class AppError extends Error {
  constructor(
    public statusCode: number,
    message: string,
  ) {
    super(message);
  }
}
export const uid = () => randomUUID();
export const now = () => new Date().toISOString();

export class Store {
  db: DatabaseSync;
  restoring = false;
  readonly filename: string;
  readonly backupDir: string;
  constructor(filename: string) {
    this.filename = resolve(filename);
    this.backupDir = join(dirname(this.filename), 'backups');
    mkdirSync(dirname(this.filename), { recursive: true });
    mkdirSync(this.backupDir, { recursive: true });
    this.db = this.connect();
    this.migrate();
  }
  private connect() {
    const db = new DatabaseSync(this.filename);
    db.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;');
    return db;
  }
  private migrate() {
    const version = (this.db.prepare('PRAGMA user_version').get() as Row).user_version;
    if (version > 2)
      throw new Error('La base de datos pertenece a una versión más nueva de la aplicación.');
    if (version === 2) return;
    if (version === 1) {
      this.db.exec(`BEGIN IMMEDIATE;
        CREATE TABLE commands (key TEXT PRIMARY KEY, fingerprint TEXT NOT NULL, result_json TEXT NOT NULL);
        ALTER TABLE payments ADD COLUMN voided_at TEXT;
        PRAGMA user_version = 2;
        COMMIT;`);
      return;
    }
    this.db.exec(`BEGIN IMMEDIATE;
      CREATE TABLE rooms (id INTEGER PRIMARY KEY, name TEXT NOT NULL, floor TEXT NOT NULL);
      CREATE TABLE reservations (
        id TEXT PRIMARY KEY, number INTEGER NOT NULL UNIQUE, guest_name TEXT NOT NULL, document TEXT NOT NULL DEFAULT '',
        phone TEXT NOT NULL DEFAULT '', email TEXT NOT NULL DEFAULT '', fiscal_data TEXT NOT NULL DEFAULT '',
        booked_on TEXT NOT NULL, pax INTEGER NOT NULL CHECK(pax > 0), lodging_cents INTEGER NOT NULL CHECK(lodging_cents >= 0),
        state TEXT NOT NULL CHECK(state IN ('pending','confirmed','checked_in','checked_out','cancelled')),
        channel TEXT NOT NULL CHECK(channel IN ('direct','booking','other')), visual_tag TEXT NOT NULL,
        notes TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, updated_at TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1
      );
      CREATE TABLE assignments (id TEXT PRIMARY KEY, reservation_id TEXT NOT NULL REFERENCES reservations(id),
        room_id INTEGER NOT NULL REFERENCES rooms(id), check_in TEXT NOT NULL, check_out TEXT NOT NULL, CHECK(check_out > check_in));
      CREATE INDEX assignment_dates ON assignments(room_id, check_in, check_out);
      CREATE TABLE consumptions (id TEXT PRIMARY KEY, reservation_id TEXT NOT NULL REFERENCES reservations(id), room_id INTEGER NOT NULL REFERENCES rooms(id),
        date TEXT NOT NULL, description TEXT NOT NULL, quantity INTEGER NOT NULL CHECK(quantity > 0), unit_cents INTEGER NOT NULL CHECK(unit_cents >= 0),
        notes TEXT NOT NULL DEFAULT '', voided_at TEXT, void_reason TEXT, created_at TEXT NOT NULL);
      CREATE TABLE cash_sessions (id TEXT PRIMARY KEY, date TEXT NOT NULL UNIQUE, opening_cents INTEGER NOT NULL CHECK(opening_cents >= 0),
        counted_cents INTEGER CHECK(counted_cents >= 0), closed_at TEXT, notes TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL);
      CREATE UNIQUE INDEX one_open_session ON cash_sessions((1)) WHERE closed_at IS NULL;
      CREATE TABLE movements (id TEXT PRIMARY KEY, date TEXT NOT NULL REFERENCES cash_sessions(date), direction TEXT NOT NULL CHECK(direction IN ('income','expense')),
        method TEXT NOT NULL CHECK(method IN ('cash','transfer','card')), amount_cents INTEGER NOT NULL CHECK(amount_cents > 0),
        description TEXT NOT NULL, category TEXT NOT NULL, reservation_id TEXT REFERENCES reservations(id),
        source TEXT NOT NULL CHECK(source IN ('manual','payment','reversal')), reversal_of TEXT UNIQUE REFERENCES movements(id), created_at TEXT NOT NULL);
      CREATE TABLE payments (id TEXT PRIMARY KEY, reservation_id TEXT NOT NULL REFERENCES reservations(id), date TEXT NOT NULL,
        amount_cents INTEGER NOT NULL CHECK(amount_cents > 0), method TEXT NOT NULL CHECK(method IN ('cash','transfer','card')),
        allocation TEXT NOT NULL CHECK(allocation IN ('lodging','consumption')), notes TEXT NOT NULL DEFAULT '',
        movement_id TEXT UNIQUE REFERENCES movements(id), reversed_by TEXT REFERENCES movements(id), origin TEXT NOT NULL DEFAULT 'local', voided_at TEXT);
      CREATE TABLE audit (id TEXT PRIMARY KEY, reservation_id TEXT REFERENCES reservations(id), action TEXT NOT NULL,
        summary TEXT NOT NULL, before_json TEXT, after_json TEXT, created_at TEXT NOT NULL);
      CREATE TABLE products (description TEXT PRIMARY KEY COLLATE NOCASE, unit_cents INTEGER NOT NULL CHECK(unit_cents >= 0));
      CREATE TABLE import_candidates (id TEXT PRIMARY KEY, source_key TEXT NOT NULL UNIQUE, source_file TEXT NOT NULL, source_sheet TEXT NOT NULL,
        source_row TEXT NOT NULL, guest_name TEXT NOT NULL, proposed_json TEXT NOT NULL, raw_json TEXT NOT NULL,
        issues_json TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', reservation_id TEXT REFERENCES reservations(id));
      CREATE TABLE commands (key TEXT PRIMARY KEY, fingerprint TEXT NOT NULL, result_json TEXT NOT NULL);
      PRAGMA user_version = 2;
      COMMIT;`);
    this.transaction(() => {
      for (const room of ROOMS)
        this.db.prepare('INSERT INTO rooms VALUES (?, ?, ?)').run(room.id, room.name, room.floor);
      for (const name of [
        'Agua',
        'Gaseosa',
        'Cerveza',
        'Copa de vino',
        'Café',
        'Té',
        'Snack',
        'Comida',
      ])
        this.db.prepare('INSERT INTO products VALUES (?, 0)').run(name);
    });
  }
  transaction<T>(fn: () => T): T {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const result = fn();
      this.db.exec('COMMIT');
      return result;
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }
  audit(
    action: string,
    summary: string,
    reservationId: string | null = null,
    before: unknown = null,
    after: unknown = null,
  ) {
    this.db
      .prepare('INSERT INTO audit VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(
        uid(),
        reservationId,
        action,
        summary,
        before === null ? null : JSON.stringify(before),
        after === null ? null : JSON.stringify(after),
        now(),
      );
  }
  reservations(): Reservation[] {
    const rows = this.db
      .prepare(
        `SELECT r.*, (SELECT COALESCE(SUM(quantity*unit_cents),0) FROM consumptions WHERE reservation_id=r.id AND voided_at IS NULL) AS consumption_cents,
      (SELECT COALESCE(SUM(amount_cents),0) FROM payments WHERE reservation_id=r.id AND reversed_by IS NULL AND voided_at IS NULL AND allocation='lodging') AS lodging_paid_cents,
      (SELECT COALESCE(SUM(amount_cents),0) FROM payments WHERE reservation_id=r.id AND reversed_by IS NULL AND voided_at IS NULL AND allocation='consumption') AS consumption_paid_cents,
      (SELECT COALESCE(SUM(amount_cents),0) FROM payments WHERE reservation_id=r.id AND reversed_by IS NULL AND voided_at IS NULL AND method='cash') AS paid_cash,
      (SELECT COALESCE(SUM(amount_cents),0) FROM payments WHERE reservation_id=r.id AND reversed_by IS NULL AND voided_at IS NULL AND method='transfer') AS paid_transfer,
      (SELECT COALESCE(SUM(amount_cents),0) FROM payments WHERE reservation_id=r.id AND reversed_by IS NULL AND voided_at IS NULL AND method='card') AS paid_card
      FROM reservations r ORDER BY r.booked_on DESC, r.number DESC`,
      )
      .all() as Row[];
    const assignments = this.db
      .prepare('SELECT * FROM assignments ORDER BY check_in, room_id')
      .all() as Row[];
    const byReservation = new Map<string, Row[]>();
    for (const a of assignments)
      byReservation.set(a.reservation_id, [...(byReservation.get(a.reservation_id) ?? []), a]);
    return rows.map((r) => {
      const rooms = byReservation.get(r.id) ?? [];
      const dates = rooms.map((a) => a.check_in).sort();
      const ends = rooms.map((a) => a.check_out).sort();
      return {
        id: r.id,
        number: r.number,
        guestName: r.guest_name,
        document: r.document,
        phone: r.phone,
        email: r.email,
        fiscalData: r.fiscal_data,
        bookedOn: r.booked_on,
        pax: r.pax,
        lodgingCents: r.lodging_cents,
        state: r.state,
        channel: r.channel,
        visualTag: r.visual_tag,
        notes: r.notes,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
        version: r.version,
        assignments: rooms.map((a) => ({
          id: a.id,
          roomId: a.room_id,
          checkIn: a.check_in,
          checkOut: a.check_out,
        })),
        checkIn: dates[0] ?? '',
        checkOut: ends.at(-1) ?? '',
        consumptionCents: r.consumption_cents,
        lodgingPaidCents: r.lodging_paid_cents,
        consumptionPaidCents: r.consumption_paid_cents,
        paidByMethod: { cash: r.paid_cash, transfer: r.paid_transfer, card: r.paid_card },
        paidCents: r.lodging_paid_cents + r.consumption_paid_cents,
        balanceCents:
          r.lodging_cents + r.consumption_cents - r.lodging_paid_cents - r.consumption_paid_cents,
      };
    });
  }
  reservation(id: string) {
    const item = this.reservations().find((r) => r.id === id);
    if (!item) throw new AppError(404, 'No se encontró la reserva.');
    return item;
  }
  consumptions(reservationId?: string): Consumption[] {
    return (
      this.db
        .prepare(
          `SELECT * FROM consumptions ${reservationId ? 'WHERE reservation_id=?' : ''} ORDER BY date DESC, created_at DESC`,
        )
        .all(...(reservationId ? [reservationId] : [])) as Row[]
    ).map((c) => ({
      id: c.id,
      reservationId: c.reservation_id,
      roomId: c.room_id,
      date: c.date,
      description: c.description,
      quantity: c.quantity,
      unitCents: c.unit_cents,
      totalCents: c.quantity * c.unit_cents,
      notes: c.notes,
      voidedAt: c.voided_at,
      voidReason: c.void_reason,
    }));
  }
  payments(reservationId: string): Payment[] {
    return (
      this.db
        .prepare('SELECT * FROM payments WHERE reservation_id=? ORDER BY date DESC, rowid DESC')
        .all(reservationId) as Row[]
    ).map((p) => ({
      id: p.id,
      reservationId: p.reservation_id,
      date: p.date,
      amountCents: p.amount_cents,
      method: p.method,
      allocation: p.allocation,
      notes: p.notes,
      movementId: p.movement_id,
      reversedBy: p.reversed_by,
      origin: p.origin,
      voidedAt: p.voided_at,
    }));
  }
  movements(): Movement[] {
    return (
      this.db
        .prepare(
          `SELECT m.*, r.number AS reservation_number, rev.id AS reversed_by FROM movements m LEFT JOIN reservations r ON r.id=m.reservation_id
      LEFT JOIN movements rev ON rev.reversal_of=m.id ORDER BY m.date DESC, m.created_at DESC, m.rowid DESC`,
        )
        .all() as Row[]
    ).map((m) => ({
      id: m.id,
      date: m.date,
      direction: m.direction,
      method: m.method,
      amountCents: m.amount_cents,
      description: m.description,
      category: m.category,
      reservationId: m.reservation_id,
      reservationNumber: m.reservation_number,
      source: m.source,
      reversalOf: m.reversal_of,
      reversedBy: m.reversed_by,
      createdAt: m.created_at,
    }));
  }
  sessions(): CashSession[] {
    return (
      this.db
        .prepare(
          `SELECT s.*,
      COALESCE(SUM(CASE WHEN m.method='cash' AND m.direction='income' THEN m.amount_cents ELSE 0 END),0) AS income_cents,
      COALESCE(SUM(CASE WHEN m.method='cash' AND m.direction='expense' THEN m.amount_cents ELSE 0 END),0) AS expense_cents
      FROM cash_sessions s LEFT JOIN movements m ON s.date=m.date GROUP BY s.id ORDER BY s.date DESC`,
        )
        .all() as Row[]
    ).map((s) => {
      const expectedCents = s.opening_cents + s.income_cents - s.expense_cents;
      return {
        id: s.id,
        date: s.date,
        openingCents: s.opening_cents,
        countedCents: s.counted_cents,
        closedAt: s.closed_at,
        notes: s.notes,
        incomeCents: s.income_cents,
        expenseCents: s.expense_cents,
        expectedCents,
        differenceCents: s.counted_cents === null ? null : s.counted_cents - expectedCents,
      };
    });
  }
  requireOpenSession(date: string) {
    const session = this.db.prepare('SELECT * FROM cash_sessions WHERE date=?').get(date) as
      | Row
      | undefined;
    if (!session || session.closed_at)
      throw new AppError(409, 'Abrí la caja de esa fecha para registrar el movimiento.');
  }
  detail(id: string) {
    return {
      reservation: this.reservation(id),
      consumptions: this.consumptions(id),
      payments: this.payments(id),
      history: this.db
        .prepare(
          'SELECT id, action, summary, created_at AS createdAt FROM audit WHERE reservation_id=? ORDER BY rowid DESC LIMIT 100',
        )
        .all(id) as Row[],
    };
  }
  bootstrap() {
    return {
      today: todayLocal(),
      rooms: ROOMS,
      reservations: this.reservations(),
      consumptions: this.consumptions(),
      sessions: this.sessions(),
      movements: this.movements(),
      products: this.db
        .prepare('SELECT description, unit_cents AS unitCents FROM products ORDER BY description')
        .all(),
      pendingImports: (
        this.db
          .prepare("SELECT COUNT(*) AS total FROM import_candidates WHERE status='pending'")
          .get() as Row
      ).total,
      dataPath: this.filename,
    };
  }
  backups() {
    return readdirSync(this.backupDir)
      .filter((name) => /^sg-[\w-]+\.sqlite$/.test(name))
      .sort()
      .reverse();
  }
  backup(label = 'manual') {
    const localTime = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'America/Argentina/Buenos_Aires',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    })
      .format(new Date())
      .replaceAll(':', '-');
    const name = `sg-${todayLocal()}T${localTime}-${label}-${uid().slice(0, 6)}.sqlite`;
    this.db.prepare('VACUUM INTO ?').run(join(this.backupDir, name));
    return name;
  }
  dailyBackup() {
    if (!this.backups().some((n) => n.startsWith(`sg-${todayLocal()}`))) this.backup('automatico');
  }
  async restore(name: string) {
    if (!this.backups().includes(name)) throw new AppError(404, 'Copia de seguridad inexistente.');
    const backupFile = join(this.backupDir, name);
    const check = new DatabaseSync(backupFile, { readOnly: true });
    try {
      const result = check.prepare('PRAGMA integrity_check').get() as Row;
      if (
        result.integrity_check !== 'ok' ||
        ![1, 2].includes((check.prepare('PRAGMA user_version').get() as Row).user_version)
      )
        throw new AppError(400, 'La copia no es compatible o está dañada.');
      for (const table of [
        'reservations',
        'payments',
        'movements',
        'cash_sessions',
        'import_candidates',
      ])
        check.prepare(`SELECT count(*) FROM ${table}`).get();
    } catch (error) {
      check.close();
      throw error;
    }
    let before: string;
    try {
      before = this.backup('antes-de-restaurar');
    } catch (error) {
      check.close();
      throw error;
    }
    this.restoring = true;
    let closed = false;
    try {
      this.db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
      this.db.close();
      closed = true;
      // SQLite replaces the destination within its own transaction, without a Windows file rename.
      await sqliteBackup(check, this.filename);
    } finally {
      check.close();
      try {
        if (closed) {
          this.db = this.connect();
          this.migrate();
        }
      } finally {
        this.restoring = false;
      }
    }
    this.audit('restore', `Base restaurada desde ${name}. Copia previa: ${before}`);
    return before;
  }
  close() {
    this.db.close();
  }
}
