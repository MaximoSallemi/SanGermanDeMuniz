import Fastify, { type FastifyRequest } from 'fastify';
import fastifyStatic from '@fastify/static';
import { resolve, join } from 'node:path';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { ZodError, z } from 'zod';
import { Store, AppError, uid, now } from './database.ts';
import {
  reservationSchema,
  consumptionSchema,
  paymentSchema,
  movementSchema,
  openSchema,
  closeSchema,
  reverseSchema,
  reasonSchema,
} from './validation.ts';
import { METHODS, ROOMS, money } from '../shared/domain.ts';

type Options = {
  filename?: string;
  staticDir?: string;
  logger?: boolean;
  automaticBackup?: boolean;
};
export async function createApp(options: Options = {}) {
  const store = new Store(
    options.filename ?? process.env.SG_DATABASE ?? resolve('data/san-german.sqlite'),
  );
  if (options.automaticBackup !== false) store.dailyBackup();
  const app = Fastify({ logger: options.logger ?? false, bodyLimit: 1024 * 1024 });
  app.addHook('onClose', async () => store.close());
  app.addHook('onRequest', async (request, reply) => {
    if (store.restoring)
      return reply
        .code(503)
        .send({ error: 'Se está restaurando una copia. Volvé a intentar en unos segundos.' });
    const origin = request.headers.origin;
    if (origin) {
      let allowed = false;
      try {
        const url = new URL(origin);
        allowed =
          ['localhost', '127.0.0.1'].includes(url.hostname) &&
          ['4310', '5173', String(process.env.PORT ?? '4310')].includes(url.port) &&
          url.protocol === 'http:';
      } catch {}
      if (!allowed) return reply.code(403).send({ error: 'Origen no autorizado.' });
    }
    const hostname = request.hostname;
    if (!['localhost', '127.0.0.1'].includes(hostname))
      return reply.code(403).send({ error: 'La aplicación solo admite acceso local.' });
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('Referrer-Policy', 'no-referrer');
    reply.header('Cache-Control', request.url.startsWith('/api') ? 'no-store' : 'no-cache');
  });
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ZodError)
      return reply
        .code(400)
        .send({ error: error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(' · ') });
    if (error instanceof AppError)
      return reply.code(error.statusCode).send({ error: error.message });
    if (
      error instanceof Error &&
      'statusCode' in error &&
      typeof error.statusCode === 'number' &&
      error.statusCode < 500
    )
      return reply.code(error.statusCode).send({ error: error.message });
    request.log.error(error);
    return reply.code(500).send({
      error: 'No se pudo completar la operación. Revisá el estado antes de volver a intentarlo.',
    });
  });

  function command<T>(request: FastifyRequest, fn: () => T): T {
    const key = request.headers['idempotency-key'];
    if (key && (typeof key !== 'string' || !/^[\w-]{16,100}$/.test(key)))
      throw new AppError(400, 'Identificador de operación inválido.');
    const fingerprint = createHash('sha256')
      .update(`${request.method}:${request.url}:${JSON.stringify(request.body)}`)
      .digest('hex');
    return store.transaction(() => {
      if (key) {
        const saved = store.db
          .prepare('SELECT fingerprint,result_json FROM commands WHERE key=?')
          .get(key) as { fingerprint: string; result_json: string } | undefined;
        if (saved) {
          if (saved.fingerprint !== fingerprint)
            throw new AppError(
              409,
              'Este identificador ya se usó para una operación diferente. Cerrá el formulario y volvé a abrirlo.',
            );
          return JSON.parse(saved.result_json) as T;
        }
      }
      const result = fn();
      if (key)
        store.db
          .prepare('INSERT INTO commands VALUES (?,?,?)')
          .run(key, fingerprint, JSON.stringify(result ?? null));
      return result;
    });
  }

  function validateAssignments(
    assignments: z.infer<typeof reservationSchema>['assignments'],
    excludeId: string | null,
    cancelled: boolean,
  ) {
    if (cancelled) return;
    for (let i = 0; i < assignments.length; i++) {
      const a = assignments[i];
      for (const b of assignments.slice(i + 1))
        if (a.roomId === b.roomId && a.checkIn < b.checkOut && b.checkIn < a.checkOut)
          throw new AppError(409, 'La misma habitación aparece dos veces en fechas superpuestas.');
      const conflict = store.db
        .prepare(
          `SELECT r.number, r.guest_name FROM assignments a JOIN reservations r ON r.id=a.reservation_id
        WHERE a.room_id=? AND a.check_in < ? AND a.check_out > ? AND r.state!='cancelled' AND (? IS NULL OR r.id!=?) LIMIT 1`,
        )
        .get(a.roomId, a.checkOut, a.checkIn, excludeId, excludeId) as
        | Record<string, any>
        | undefined;
      if (conflict)
        throw new AppError(
          409,
          `${ROOMS.find((r) => r.id === a.roomId)!.name} ya está reservada por ${conflict.guest_name} (reserva ${conflict.number}).`,
        );
    }
  }

  app.get('/api/health', async () => ({ ok: true, application: 'san-german' }));
  app.get('/api/bootstrap', async () => store.bootstrap());
  app.get<{ Params: { id: string } }>('/api/reservations/:id', async (request) =>
    store.detail(request.params.id),
  );
  app.post('/api/reservations', async (request, reply) => {
    const data = reservationSchema.parse(request.body);
    const id = command(request, () => {
      if (data.historicalPayments?.length && !data.importId)
        throw new AppError(
          400,
          'Los saldos iniciales solo se permiten durante una importación revisada.',
        );
      if (data.importId) {
        const candidate = store.db
          .prepare("SELECT id FROM import_candidates WHERE id=? AND status='pending'")
          .get(data.importId);
        if (!candidate) throw new AppError(409, 'Este registro de importación ya fue procesado.');
      }
      validateAssignments(data.assignments, null, data.state === 'cancelled');
      const id = uid();
      const number = (
        store.db.prepare('SELECT COALESCE(MAX(number),0)+1 AS number FROM reservations').get() as {
          number: number;
        }
      ).number;
      store.db
        .prepare(
          `INSERT INTO reservations (id,number,guest_name,document,phone,email,fiscal_data,booked_on,pax,lodging_cents,state,channel,visual_tag,notes,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        )
        .run(
          id,
          number,
          data.guestName,
          data.document,
          data.phone,
          data.email,
          data.fiscalData,
          data.bookedOn,
          data.pax,
          data.lodgingCents,
          data.state,
          data.channel,
          data.visualTag,
          data.notes,
          now(),
          now(),
        );
      for (const a of data.assignments)
        store.db
          .prepare('INSERT INTO assignments VALUES (?,?,?,?,?)')
          .run(uid(), id, a.roomId, a.checkIn, a.checkOut);
      if (data.importId) {
        for (const p of data.historicalPayments ?? [])
          store.db
            .prepare(
              `INSERT INTO payments (id,reservation_id,date,amount_cents,method,allocation,notes,movement_id,origin) VALUES (?,?,?,?,?,?,?,NULL,'import')`,
            )
            .run(
              uid(),
              id,
              data.bookedOn,
              p.amountCents,
              p.method,
              p.allocation,
              'Saldo inicial revisado de Excel; no genera movimiento de caja.',
            );
        store.db
          .prepare("UPDATE import_candidates SET status='imported', reservation_id=? WHERE id=?")
          .run(id, data.importId);
      }
      store.audit(
        data.importId ? 'import' : 'create',
        data.importId ? 'Reserva incorporada desde Excel con revisión manual.' : 'Reserva creada.',
        id,
        null,
        data,
      );
      return id;
    });
    return reply.code(201).send(store.detail(id));
  });
  app.put<{ Params: { id: string } }>('/api/reservations/:id', async (request) => {
    const data = reservationSchema.parse(request.body);
    const id = request.params.id;
    command(request, () => {
      const before = store.reservation(id);
      if (data.version !== before.version)
        throw new AppError(
          409,
          'La reserva cambió en otra ventana. Cerrá el formulario y volvé a abrirlo.',
        );
      if (data.importId || data.historicalPayments?.length)
        throw new AppError(400, 'La edición no permite modificar saldos históricos.');
      validateAssignments(data.assignments, id, data.state === 'cancelled');
      const consumedRooms = store.db
        .prepare(
          'SELECT DISTINCT room_id FROM consumptions WHERE reservation_id=? AND voided_at IS NULL',
        )
        .all(id) as { room_id: number }[];
      for (const room of consumedRooms)
        if (!data.assignments.some((a) => a.roomId === room.room_id))
          throw new AppError(
            409,
            'Esa habitación tiene consumiciones. Conservá su asignación como parte del historial de la estadía.',
          );
      store.db
        .prepare(
          `UPDATE reservations SET guest_name=?,document=?,phone=?,email=?,fiscal_data=?,booked_on=?,pax=?,lodging_cents=?,state=?,channel=?,visual_tag=?,notes=?,updated_at=?,version=version+1 WHERE id=?`,
        )
        .run(
          data.guestName,
          data.document,
          data.phone,
          data.email,
          data.fiscalData,
          data.bookedOn,
          data.pax,
          data.lodgingCents,
          data.state,
          data.channel,
          data.visualTag,
          data.notes,
          now(),
          id,
        );
      store.db.prepare('DELETE FROM assignments WHERE reservation_id=?').run(id);
      for (const a of data.assignments)
        store.db
          .prepare('INSERT INTO assignments VALUES (?,?,?,?,?)')
          .run(uid(), id, a.roomId, a.checkIn, a.checkOut);
      store.audit(
        'update',
        `Reserva actualizada${data.state === 'cancelled' && before.state !== 'cancelled' ? ' y cancelada; habitaciones liberadas' : ''}.`,
        id,
        before,
        data,
      );
    });
    return store.detail(id);
  });
  app.post<{ Params: { id: string } }>(
    '/api/reservations/:id/consumptions',
    async (request, reply) => {
      const data = consumptionSchema.parse(request.body);
      const id = request.params.id;
      command(request, () => {
        const reservation = store.reservation(id);
        if (reservation.state === 'cancelled')
          throw new AppError(409, 'No se pueden agregar consumiciones a una reserva cancelada.');
        if (
          !reservation.assignments.some(
            (a) => a.roomId === data.roomId && data.date >= a.checkIn && data.date <= a.checkOut,
          )
        )
          throw new AppError(
            400,
            'La fecha del consumo debe corresponder a la estadía en esa habitación (incluido el día de salida).',
          );
        if (data.quantity * data.unitCents > 1_000_000_000_000)
          throw new AppError(400, 'El total del consumo excede el importe permitido.');
        store.db
          .prepare('INSERT INTO consumptions VALUES (?,?,?,?,?,?,?,?,NULL,NULL,?)')
          .run(
            uid(),
            id,
            data.roomId,
            data.date,
            data.description,
            data.quantity,
            data.unitCents,
            data.notes,
            now(),
          );
        store.db
          .prepare(
            'INSERT INTO products VALUES (?,?) ON CONFLICT(description) DO UPDATE SET unit_cents=excluded.unit_cents',
          )
          .run(data.description, data.unitCents);
        store.db
          .prepare('UPDATE reservations SET version=version+1, updated_at=? WHERE id=?')
          .run(now(), id);
        store.audit(
          'consumption',
          `${data.quantity} × ${data.description}: ${money(data.quantity * data.unitCents)}. Habitación ${data.roomId}.`,
          id,
          null,
          data,
        );
      });
      return reply.code(201).send(store.detail(id));
    },
  );
  app.post<{ Params: { id: string } }>('/api/consumptions/:id/void', async (request) => {
    const { reason } = reasonSchema.parse(request.body);
    return command(request, () => {
      const item = store.db
        .prepare('SELECT * FROM consumptions WHERE id=?')
        .get(request.params.id) as Record<string, any> | undefined;
      if (!item) throw new AppError(404, 'Consumo inexistente.');
      if (item.voided_at) throw new AppError(409, 'El consumo ya fue anulado.');
      store.db
        .prepare('UPDATE consumptions SET voided_at=?, void_reason=? WHERE id=?')
        .run(now(), reason, request.params.id);
      store.db
        .prepare('UPDATE reservations SET version=version+1, updated_at=? WHERE id=?')
        .run(now(), item.reservation_id);
      store.audit(
        'void_consumption',
        `Consumo anulado: ${item.description}. Motivo: ${reason}`,
        item.reservation_id,
        item,
      );
      return store.detail(item.reservation_id);
    });
  });
  app.post<{ Params: { id: string } }>('/api/reservations/:id/payments', async (request, reply) => {
    const data = paymentSchema.parse(request.body);
    const id = request.params.id;
    command(request, () => {
      const reservation = store.reservation(id);
      store.requireOpenSession(data.date);
      const movementId = uid();
      store.db
        .prepare('INSERT INTO movements VALUES (?,?,?,?,?,?,?,?,?,?,?)')
        .run(
          movementId,
          data.date,
          'income',
          data.method,
          data.amountCents,
          `Reserva ${reservation.number} · ${reservation.guestName} · ${data.allocation === 'lodging' ? 'Alojamiento' : 'Consumiciones'}`,
          'Cobro de reserva',
          id,
          'payment',
          null,
          now(),
        );
      store.db
        .prepare(
          'INSERT INTO payments (id,reservation_id,date,amount_cents,method,allocation,notes,movement_id) VALUES (?,?,?,?,?,?,?,?)',
        )
        .run(
          uid(),
          id,
          data.date,
          data.amountCents,
          data.method,
          data.allocation,
          data.notes,
          movementId,
        );
      store.db
        .prepare('UPDATE reservations SET version=version+1, updated_at=? WHERE id=?')
        .run(now(), id);
      store.audit(
        'payment',
        `Cobro de ${money(data.amountCents)} por ${METHODS[data.method]} (${data.allocation === 'lodging' ? 'alojamiento' : 'consumiciones'}).`,
        id,
        null,
        data,
      );
    });
    return reply.code(201).send(store.detail(id));
  });
  app.post('/api/cash/open', async (request, reply) => {
    const data = openSchema.parse(request.body);
    command(request, () => {
      if (store.sessions().some((s) => !s.closedAt))
        throw new AppError(409, 'Cerrá la caja abierta antes de iniciar otra.');
      const latest = store.sessions()[0];
      if (latest && data.date <= latest.date)
        throw new AppError(409, 'La apertura debe ser posterior al último cierre registrado.');
      store.db
        .prepare('INSERT INTO cash_sessions VALUES (?,?,?,NULL,NULL,?,?)')
        .run(uid(), data.date, data.openingCents, data.notes, now());
      store.audit(
        'cash_open',
        `Caja del ${data.date} abierta con ${money(data.openingCents)}.`,
        null,
        null,
        data,
      );
    });
    return reply.code(201).send(store.sessions());
  });
  app.post<{ Params: { id: string } }>('/api/cash/:id/close', async (request) => {
    const data = closeSchema.parse(request.body);
    command(request, () => {
      const session = store.sessions().find((s) => s.id === request.params.id);
      if (!session || session.closedAt) throw new AppError(409, 'La caja no está abierta.');
      store.db
        .prepare('UPDATE cash_sessions SET counted_cents=?,closed_at=?,notes=? WHERE id=?')
        .run(data.countedCents, now(), data.notes, session.id);
      store.audit(
        'cash_close',
        `Caja del ${session.date} cerrada. Diferencia: ${money(data.countedCents - session.expectedCents)}.`,
        null,
        session,
        data,
      );
    });
    return store.sessions();
  });
  app.post('/api/movements', async (request, reply) => {
    const data = movementSchema.parse(request.body);
    command(request, () => {
      store.requireOpenSession(data.date);
      store.db
        .prepare('INSERT INTO movements VALUES (?,?,?,?,?,?,?,?,?,?,?)')
        .run(
          uid(),
          data.date,
          data.direction,
          data.method,
          data.amountCents,
          data.description,
          data.category,
          null,
          'manual',
          null,
          now(),
        );
      store.audit(
        'movement',
        `${data.direction === 'income' ? 'Ingreso' : 'Egreso'}: ${data.description} · ${money(data.amountCents)}.`,
        null,
        null,
        data,
      );
    });
    return reply.code(201).send(store.movements());
  });
  app.post<{ Params: { id: string } }>('/api/movements/:id/reverse', async (request) => {
    const data = reverseSchema.parse(request.body);
    command(request, () => {
      store.requireOpenSession(data.date);
      const movement = store.movements().find((m) => m.id === request.params.id);
      if (!movement) throw new AppError(404, 'Movimiento inexistente.');
      if (movement.reversedBy || movement.source === 'reversal')
        throw new AppError(409, 'Este movimiento ya fue corregido o es una contrapartida.');
      const reverseId = uid();
      store.db
        .prepare('INSERT INTO movements VALUES (?,?,?,?,?,?,?,?,?,?,?)')
        .run(
          reverseId,
          data.date,
          movement.direction === 'income' ? 'expense' : 'income',
          movement.method,
          movement.amountCents,
          `Reversión: ${movement.description}. ${data.reason}`,
          movement.category,
          movement.reservationId,
          'reversal',
          movement.id,
          now(),
        );
      store.db
        .prepare('UPDATE payments SET reversed_by=? WHERE movement_id=?')
        .run(reverseId, movement.id);
      if (movement.reservationId)
        store.db
          .prepare('UPDATE reservations SET version=version+1, updated_at=? WHERE id=?')
          .run(now(), movement.reservationId);
      store.audit(
        'reverse_movement',
        `Movimiento revertido por ${money(movement.amountCents)}. Motivo: ${data.reason}`,
        movement.reservationId,
        movement,
        data,
      );
    });
    return store.movements();
  });
  app.get('/api/backups', async () => ({ names: store.backups(), dataPath: store.filename }));
  app.post<{ Params: { id: string } }>('/api/payments/:id/void-initial', async (request) => {
    const { reason } = reasonSchema.parse(request.body);
    return command(request, () => {
      const item = store.db.prepare('SELECT * FROM payments WHERE id=?').get(request.params.id) as
        | Record<string, any>
        | undefined;
      if (!item || item.origin !== 'import')
        throw new AppError(400, 'Solo se pueden anular saldos iniciales desde esta opción.');
      if (item.voided_at) throw new AppError(409, 'El saldo inicial ya está anulado.');
      store.db.prepare('UPDATE payments SET voided_at=? WHERE id=?').run(now(), item.id);
      store.db
        .prepare('UPDATE reservations SET version=version+1,updated_at=? WHERE id=?')
        .run(now(), item.reservation_id);
      store.audit(
        'void_initial',
        `Saldo inicial anulado: ${money(item.amount_cents)}. Motivo: ${reason}`,
        item.reservation_id,
        item,
      );
      return store.detail(item.reservation_id);
    });
  });
  app.post('/api/backups', async (_, reply) => reply.code(201).send({ name: store.backup() }));
  app.get<{ Params: { name: string } }>('/api/backups/:name', async (request, reply) => {
    if (!store.backups().includes(request.params.name))
      throw new AppError(404, 'Copia inexistente.');
    return reply
      .header('Content-Disposition', `attachment; filename="${request.params.name}"`)
      .sendFile(request.params.name, store.backupDir);
  });
  app.post('/api/restore', async (request) => {
    const data = z
      .object({ name: z.string(), confirmation: z.literal('RESTAURAR') })
      .strict()
      .parse(request.body);
    return { previousBackup: await store.restore(data.name) };
  });
  app.get('/api/imports', async () =>
    (
      store.db
        .prepare("SELECT * FROM import_candidates WHERE status='pending' ORDER BY source_row*1")
        .all() as Record<string, any>[]
    ).map((c) => ({
      id: c.id,
      sourceFile: c.source_file,
      sourceSheet: c.source_sheet,
      sourceRow: c.source_row,
      guestName: c.guest_name,
      proposedJson: c.proposed_json,
      rawJson: c.raw_json,
      issues: JSON.parse(c.issues_json),
      status: c.status,
    })),
  );
  app.post<{ Params: { id: string } }>('/api/imports/:id/dismiss', async (request) => {
    const result = store.db
      .prepare("UPDATE import_candidates SET status='dismissed' WHERE id=? AND status='pending'")
      .run(request.params.id);
    if (!result.changes) throw new AppError(404, 'Registro no disponible.');
    return { ok: true };
  });
  function csv(rows: unknown[][]) {
    return (
      '\uFEFF' +
      rows
        .map((row) =>
          row
            .map((value) => {
              let text = value == null ? '' : String(value);
              if (/^[\s]*[=+@-]/.test(text) && typeof value !== 'number') text = `'${text}`;
              return `"${text.replaceAll('"', '""')}"`;
            })
            .join(';'),
        )
        .join('\r\n')
    );
  }
  app.get<{ Params: { kind: string } }>('/api/export/:kind', async (request, reply) => {
    const kind = request.params.kind;
    let rows: unknown[][];
    if (kind === 'reservations')
      rows = [
        [
          'Número',
          'Huésped',
          'DNI',
          'Teléfono',
          'Ingreso',
          'Salida',
          'Habitaciones',
          'Personas',
          'Estado',
          'Alojamiento ARS',
          'Consumos ARS',
          'Cobrado ARS',
          'Saldo ARS',
        ],
        ...store
          .reservations()
          .map((r) => [
            r.number,
            r.guestName,
            r.document,
            r.phone,
            r.checkIn,
            r.checkOut,
            r.assignments.map((a) => a.roomId).join(', '),
            r.pax,
            r.state,
            r.lodgingCents / 100,
            r.consumptionCents / 100,
            r.paidCents / 100,
            r.balanceCents / 100,
          ]),
      ];
    else if (kind === 'movements')
      rows = [
        [
          'Fecha',
          'Detalle',
          'Dirección',
          'Medio',
          'Importe ARS',
          'Categoría',
          'Reserva',
          'Origen',
          'ID',
          'Revierte a',
        ],
        ...store
          .movements()
          .map((m) => [
            m.date,
            m.description,
            m.direction,
            METHODS[m.method],
            m.amountCents / 100,
            m.category,
            m.reservationNumber,
            m.source,
            m.id,
            m.reversalOf,
          ]),
      ];
    else if (kind === 'consumptions')
      rows = [
        [
          'Fecha',
          'Reserva ID',
          'Habitación',
          'Descripción',
          'Cantidad',
          'Precio ARS',
          'Total ARS',
          'Anulado',
          'Motivo',
        ],
        ...store
          .consumptions()
          .map((c) => [
            c.date,
            c.reservationId,
            c.roomId,
            c.description,
            c.quantity,
            c.unitCents / 100,
            c.totalCents / 100,
            c.voidedAt,
            c.voidReason,
          ]),
      ];
    else throw new AppError(404, 'Exportación inexistente.');
    return reply
      .type('text/csv; charset=utf-8')
      .header('Content-Disposition', `attachment; filename="san-german-${kind}.csv"`)
      .send(csv(rows));
  });
  const staticDir = options.staticDir ?? resolve('dist');
  // Register even before the first build so backup downloads can use sendFile.
  await app.register(fastifyStatic, { root: staticDir, serve: existsSync(staticDir) });
  app.setNotFoundHandler((request, reply) => {
    if (
      request.method === 'GET' &&
      !request.url.startsWith('/api/') &&
      existsSync(join(staticDir, 'index.html'))
    )
      return reply.type('text/html').sendFile('index.html');
    return reply.code(404).send({ error: 'Recurso no encontrado.' });
  });
  return { app, store };
}
