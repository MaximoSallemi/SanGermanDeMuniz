import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname, basename } from 'node:path';
import { createApp } from '../server/app.ts';
import { uid } from '../server/database.ts';
import type { Detail, Bootstrap } from '../shared/domain.ts';
import { colorFor } from '../shared/domain.ts';

const sample = (overrides: Record<string, unknown> = {}) => ({
  guestName: 'Huésped de prueba',
  document: '',
  phone: '',
  email: '',
  fiscalData: '',
  bookedOn: '2026-11-03',
  pax: 2,
  lodgingCents: 10000000,
  state: 'confirmed',
  channel: 'direct',
  visualTag: 'auto',
  notes: '',
  assignments: [{ roomId: 1, checkIn: '2026-11-03', checkOut: '2026-11-05' }],
  ...overrides,
});
test('una seña deja deuda y el pago posterior salda sin duplicar el total en caja', async (t) => {
  const f = await fixture(t);
  const r = (await f.create({ lodgingCents: 100000 })).reservation;
  await f.open('2026-11-03', 0);
  for (const [amountCents, expectedBalance] of [
    [30000, 70000],
    [70000, 0],
  ]) {
    const response = await f.request('POST', `/api/reservations/${r.id}/payments`, {
      date: '2026-11-03',
      method: 'cash',
      amountCents,
      allocation: 'lodging',
    });
    assert.equal(response.statusCode, 201, response.body);
    const account = response.json<Detail>().reservation;
    assert.equal(account.balanceCents, expectedBalance);
    assert.equal(colorFor(account).key, expectedBalance ? 'balance' : 'paid');
  }
  assert.equal(f.store.payments(r.id).length, 2);
  assert.equal(f.store.sessions()[0].expectedCents, 100000);
});
async function fixture(t: TestContext) {
  const directory = mkdtempSync(join(tmpdir(), 'san-german-test-'));
  const filename = join(directory, 'test.sqlite');
  let runtime = await createApp({
    filename,
    automaticBackup: false,
    logger: !!process.env.SG_TEST_LOG,
  });
  await runtime.app.ready();
  const request = async (method: 'GET' | 'POST' | 'PUT', url: string, body?: unknown) =>
    runtime.app.inject({ method, url, payload: body as any });
  t.after(async () => {
    await runtime.app.close();
    assert.equal(dirname(resolve(directory)), resolve(tmpdir()));
    assert.ok(basename(directory).startsWith('san-german-test-'));
    rmSync(directory, { recursive: true, force: true });
  });
  return {
    request,
    get store() {
      return runtime.store;
    },
    get app() {
      return runtime.app;
    },
    filename,
    async reopen() {
      await runtime.app.close();
      runtime = await createApp({ filename, automaticBackup: false });
      await runtime.app.ready();
    },
    async create(overrides: Record<string, unknown> = {}) {
      const response = await request('POST', '/api/reservations', sample(overrides));
      assert.equal(response.statusCode, 201, response.body);
      return response.json<Detail>();
    },
    async open(date = '2026-11-03', openingCents = 200000) {
      const response = await request('POST', '/api/cash/open', { date, openingCents, notes: '' });
      assert.equal(response.statusCode, 201, response.body);
      return response.json<Bootstrap['sessions']>()[0];
    },
  };
}

test('reserva persistente y nueve habitaciones reales', async (t) => {
  const f = await fixture(t);
  const detail = await f.create();
  assert.equal(detail.reservation.number, 1);
  assert.equal(detail.reservation.balanceCents, 10000000);
  await f.reopen();
  const boot = (await f.request('GET', '/api/bootstrap')).json<Bootstrap>();
  assert.equal(boot.rooms.length, 9);
  assert.equal(boot.reservations[0].guestName, 'Huésped de prueba');
  assert.equal(boot.reservations[0].assignments[0].roomId, 1);
});
test('rechaza superposición y permite ingreso el día de salida', async (t) => {
  const f = await fixture(t);
  await f.create();
  const response = await f.request(
    'POST',
    '/api/reservations',
    sample({ assignments: [{ roomId: 1, checkIn: '2026-11-04', checkOut: '2026-11-06' }] }),
  );
  assert.equal(response.statusCode, 409);
  assert.equal(f.store.reservations().length, 1);
  const next = await f.create({
    assignments: [{ roomId: 1, checkIn: '2026-11-05', checkOut: '2026-11-06' }],
  });
  assert.equal(next.reservation.number, 2);
});
test('reserva multihabitación: rechaza tramos internos superpuestos y admite cambios', async (t) => {
  const f = await fixture(t);
  assert.equal(
    (
      await f.request(
        'POST',
        '/api/reservations',
        sample({
          assignments: [
            { roomId: 1, checkIn: '2026-11-03', checkOut: '2026-11-05' },
            { roomId: 1, checkIn: '2026-11-04', checkOut: '2026-11-06' },
          ],
        }),
      )
    ).statusCode,
    409,
  );
  await f.create({
    assignments: [
      { roomId: 1, checkIn: '2026-11-03', checkOut: '2026-11-04' },
      { roomId: 2, checkIn: '2026-11-04', checkOut: '2026-11-06' },
    ],
  });
});
test('valida fechas reales, salida posterior, personas y centavos enteros', async (t) => {
  const f = await fixture(t);
  for (const overrides of [
    { bookedOn: '2026-02-30' },
    { pax: 0 },
    { lodgingCents: 1.5 },
    { assignments: [] },
    { assignments: [{ roomId: 1, checkIn: '2026-11-05', checkOut: '2026-11-04' }] },
  ])
    assert.equal((await f.request('POST', '/api/reservations', sample(overrides))).statusCode, 400);
  assert.equal(f.store.reservations().length, 0);
});
test('crear reserva y cargar consumos no genera dinero en caja', async (t) => {
  const f = await fixture(t);
  const r = (await f.create()).reservation;
  const response = await f.request('POST', `/api/reservations/${r.id}/consumptions`, {
    roomId: 1,
    date: '2026-11-04',
    description: 'Agua',
    quantity: 2,
    unitCents: 12345,
    notes: '',
  });
  assert.equal(response.statusCode, 201, response.body);
  assert.equal(response.json<Detail>().reservation.consumptionCents, 24690);
  assert.equal(f.store.movements().length, 0);
});
test('un cobro requiere caja abierta y falla sin dejar registros parciales', async (t) => {
  const f = await fixture(t);
  const r = (await f.create()).reservation;
  const response = await f.request('POST', `/api/reservations/${r.id}/payments`, {
    date: '2026-11-03',
    method: 'cash',
    amountCents: 300000,
    allocation: 'lodging',
  });
  assert.equal(response.statusCode, 409);
  assert.equal(f.store.payments(r.id).length, 0);
  assert.equal(f.store.movements().length, 0);
});
test('cobros por medio, consumiciones y egresos reconcilian cuenta y efectivo', async (t) => {
  const f = await fixture(t);
  const r = (await f.create()).reservation;
  await f.open();
  await f.request('POST', `/api/reservations/${r.id}/consumptions`, {
    roomId: 1,
    date: '2026-11-03',
    description: 'Gaseosa',
    quantity: 2,
    unitCents: 150000,
  });
  for (const [method, allocation, amountCents] of [
    ['cash', 'lodging', 1000000],
    ['transfer', 'consumption', 200000],
    ['card', 'lodging', 300000],
  ] as const) {
    const p = await f.request('POST', `/api/reservations/${r.id}/payments`, {
      date: '2026-11-03',
      method,
      allocation,
      amountCents,
    });
    assert.equal(p.statusCode, 201, p.body);
  }
  const expense = await f.request('POST', '/api/movements', {
    date: '2026-11-03',
    direction: 'expense',
    method: 'cash',
    amountCents: 25000,
    description: 'Limpieza',
    category: 'Insumos',
  });
  assert.equal(expense.statusCode, 201, expense.body);
  const account = f.store.reservation(r.id);
  assert.equal(account.balanceCents, 8800000);
  assert.equal(account.lodgingPaidCents, 1300000);
  assert.equal(account.consumptionPaidCents, 200000);
  assert.equal(f.store.sessions()[0].expectedCents, 1175000);
  assert.equal(f.store.movements().length, 4);
});
test('cierre congela su fecha y una devolución posterior conserva el historial', async (t) => {
  const f = await fixture(t);
  const r = (await f.create()).reservation;
  const session = await f.open();
  assert.equal(
    (
      await f.request('POST', `/api/reservations/${r.id}/payments`, {
        date: session.date,
        method: 'cash',
        allocation: 'lodging',
        amountCents: 50000,
      })
    ).statusCode,
    201,
  );
  const movement = f.store.movements()[0];
  assert.equal(
    (
      await f.request('POST', `/api/cash/${session.id}/close`, {
        countedCents: 245000,
        notes: 'Faltante revisado',
      })
    ).statusCode,
    200,
  );
  assert.equal(f.store.sessions()[0].differenceCents, -5000);
  assert.equal(
    (
      await f.request('POST', '/api/movements', {
        date: session.date,
        direction: 'income',
        method: 'cash',
        amountCents: 100,
        description: 'Tardío',
        category: 'Otros',
      })
    ).statusCode,
    409,
  );
  await f.open('2026-11-04', 245000);
  const reverse = await f.request('POST', `/api/movements/${movement.id}/reverse`, {
    date: '2026-11-04',
    reason: 'Devolución por corrección',
  });
  assert.equal(reverse.statusCode, 200, reverse.body);
  assert.equal(f.store.reservation(r.id).paidCents, 0);
  assert.equal(f.store.sessions().find((s) => s.date === session.date)!.expectedCents, 250000);
  assert.equal(f.store.sessions()[0].expectedCents, 195000);
  assert.equal(
    (
      await f.request('POST', `/api/movements/${movement.id}/reverse`, {
        date: '2026-11-04',
        reason: 'Otra vez',
      })
    ).statusCode,
    409,
  );
});
test('una única caja abierta y aperturas ordenadas por fecha', async (t) => {
  const f = await fixture(t);
  const s = await f.open();
  assert.equal(
    (await f.request('POST', '/api/cash/open', { date: '2026-11-04', openingCents: 0 })).statusCode,
    409,
  );
  await f.request('POST', `/api/cash/${s.id}/close`, { countedCents: 200000 });
  assert.equal(
    (await f.request('POST', '/api/cash/open', { date: '2026-11-02', openingCents: 0 })).statusCode,
    409,
  );
});
test('consumos vinculados a habitación y estadía, incluido el día de salida', async (t) => {
  const f = await fixture(t);
  const r = (await f.create()).reservation;
  for (const data of [
    { roomId: 2, date: '2026-11-04' },
    { roomId: 1, date: '2026-11-06' },
  ])
    assert.equal(
      (
        await f.request('POST', `/api/reservations/${r.id}/consumptions`, {
          ...data,
          description: 'Agua',
          quantity: 1,
          unitCents: 100,
        })
      ).statusCode,
      400,
    );
  assert.equal(
    (
      await f.request('POST', `/api/reservations/${r.id}/consumptions`, {
        roomId: 1,
        date: '2026-11-05',
        description: 'Agua de cortesía',
        quantity: 1,
        unitCents: 0,
      })
    ).statusCode,
    201,
  );
});
test('anulación de consumo deja crédito si ya estaba pagado y exige motivo', async (t) => {
  const f = await fixture(t);
  const r = (await f.create({ lodgingCents: 0 })).reservation;
  await f.open();
  const add = await f.request('POST', `/api/reservations/${r.id}/consumptions`, {
    roomId: 1,
    date: '2026-11-04',
    description: 'Agua',
    quantity: 1,
    unitCents: 10000,
  });
  const c = add.json<Detail>().consumptions[0];
  await f.request('POST', `/api/reservations/${r.id}/payments`, {
    date: '2026-11-03',
    method: 'cash',
    allocation: 'consumption',
    amountCents: 10000,
  });
  assert.equal(
    (await f.request('POST', `/api/consumptions/${c.id}/void`, { reason: '' })).statusCode,
    400,
  );
  assert.equal(
    (await f.request('POST', `/api/consumptions/${c.id}/void`, { reason: 'Consumo duplicado' }))
      .statusCode,
    200,
  );
  assert.equal(f.store.reservation(r.id).balanceCents, -10000);
  assert.equal(f.store.movements().length, 1);
  assert.ok(f.store.consumptions(r.id)[0].voidedAt);
});
test('control de versión evita sobrescribir una cuenta modificada', async (t) => {
  const f = await fixture(t);
  const r = (await f.create()).reservation;
  await f.request('POST', `/api/reservations/${r.id}/consumptions`, {
    roomId: 1,
    date: '2026-11-04',
    description: 'Agua',
    quantity: 1,
    unitCents: 100,
  });
  const response = await f.request('PUT', `/api/reservations/${r.id}`, {
    ...sample(),
    version: r.version,
    guestName: 'Cambio atrasado',
  });
  assert.equal(response.statusCode, 409);
  assert.equal(f.store.reservation(r.id).guestName, 'Huésped de prueba');
});
test('cancelar libera la habitación conservando reserva e historial', async (t) => {
  const f = await fixture(t);
  const r = (await f.create()).reservation;
  const response = await f.request('PUT', `/api/reservations/${r.id}`, {
    ...sample(),
    version: r.version,
    state: 'cancelled',
  });
  assert.equal(response.statusCode, 200, response.body);
  await f.create();
  assert.equal(f.store.reservations().length, 2);
  assert.ok(f.store.detail(r.id).history.length >= 2);
});
test('backup, descarga y restauración recuperan datos y respaldan el estado anterior', async (t) => {
  const f = await fixture(t);
  const r = (await f.create()).reservation;
  const backup = (await f.request('POST', '/api/backups')).json<{ name: string }>().name;
  const download = await f.request('GET', `/api/backups/${backup}`);
  assert.equal(download.statusCode, 200, download.body);
  assert.ok(download.rawPayload.byteLength > 1000);
  await f.request('PUT', `/api/reservations/${r.id}`, {
    ...sample(),
    version: r.version,
    guestName: 'Cambio posterior',
  });
  assert.equal(
    (await f.request('POST', '/api/restore', { name: backup, confirmation: 'NO' })).statusCode,
    400,
  );
  const restore = await f.request('POST', '/api/restore', {
    name: backup,
    confirmation: 'RESTAURAR',
  });
  assert.equal(restore.statusCode, 200, restore.body);
  assert.equal(f.store.reservation(r.id).guestName, 'Huésped de prueba');
  assert.ok(f.store.backups().includes(restore.json().previousBackup));
  assert.equal((await f.request('GET', '/api/backups/no-existe.sqlite')).statusCode, 404);
});
test('saldos iniciales de Excel requieren revisión y no generan caja ni duplicados', async (t) => {
  const f = await fixture(t);
  const id = uid();
  f.store.db
    .prepare(
      'INSERT INTO import_candidates(id,source_key,source_file,source_sheet,source_row,guest_name,proposed_json,raw_json,issues_json) VALUES (?,?,?,?,?,?,?,?,?)',
    )
    .run(id, 'test:1', 'test.xlsx', 'RESERVAS', '4', 'Huésped de prueba', '{}', '{}', '[]');
  const body = {
    ...sample(),
    importId: id,
    historicalPayments: [{ method: 'transfer', amountCents: 3000000, allocation: 'lodging' }],
  };
  const response = await f.request('POST', '/api/reservations', body);
  assert.equal(response.statusCode, 201, response.body);
  assert.equal(response.json<Detail>().reservation.paidCents, 3000000);
  assert.equal(f.store.movements().length, 0);
  assert.equal((await f.request('POST', '/api/reservations', body)).statusCode, 409);
  assert.equal(
    (
      await f.request('POST', '/api/reservations', {
        ...sample({ assignments: [{ roomId: 2, checkIn: '2026-11-03', checkOut: '2026-11-05' }] }),
        historicalPayments: body.historicalPayments,
      })
    ).statusCode,
    400,
  );
});
test('rechaza orígenes y hosts externos y exporta CSV neutralizando fórmulas', async (t) => {
  const f = await fixture(t);
  assert.equal(
    (
      await f.app.inject({
        method: 'GET',
        url: '/api/bootstrap',
        headers: { origin: 'https://otro-sitio.example' },
      })
    ).statusCode,
    403,
  );
  assert.equal(
    (
      await f.app.inject({
        method: 'GET',
        url: '/api/bootstrap',
        headers: { host: 'evil.example:3001' },
      })
    ).statusCode,
    403,
  );
  await f.create({ guestName: '=SUM(1+1)' });
  const response = await f.request('GET', '/api/export/reservations');
  assert.equal(response.statusCode, 200);
  assert.ok(response.body.includes("'=SUM(1+1)"));
  assert.equal(response.headers['content-type'], 'text/csv; charset=utf-8');
});
test('copia automática se crea una sola vez por fecha local', async (t) => {
  const f = await fixture(t);
  f.store.dailyBackup();
  f.store.dailyBackup();
  assert.equal(f.store.backups().length, 1);
});
test('reintentos concurrentes de un cobro no duplican pagos ni movimientos', async (t) => {
  const f = await fixture(t);
  const r = (await f.create()).reservation;
  await f.open();
  const payload = {
    date: '2026-11-03',
    method: 'cash',
    amountCents: 100000,
    allocation: 'lodging',
  };
  const responses = await Promise.all(
    Array.from({ length: 5 }, () =>
      f.app.inject({
        method: 'POST',
        url: `/api/reservations/${r.id}/payments`,
        headers: { 'idempotency-key': 'payment-retry-test-0001' },
        payload,
      }),
    ),
  );
  assert.ok(
    responses.every((r) => r.statusCode === 201),
    responses.map((r) => r.body).join('\n'),
  );
  assert.equal(f.store.payments(r.id).length, 1);
  assert.equal(f.store.movements().length, 1);
  assert.equal(f.store.reservation(r.id).paidCents, 100000);
  assert.equal(f.store.sessions()[0].expectedCents, 300000);
});
test('reintento de reserva y consumo conserva una sola operación', async (t) => {
  const f = await fixture(t);
  const payload = sample();
  for (let i = 0; i < 2; i++)
    assert.equal(
      (
        await f.app.inject({
          method: 'POST',
          url: '/api/reservations',
          headers: { 'idempotency-key': 'reservation-retry-001' },
          payload,
        })
      ).statusCode,
      201,
    );
  assert.equal(f.store.reservations().length, 1);
  const id = f.store.reservations()[0].id;
  const body = { roomId: 1, date: '2026-11-03', description: 'Agua', quantity: 1, unitCents: 100 };
  for (let i = 0; i < 2; i++)
    assert.equal(
      (
        await f.app.inject({
          method: 'POST',
          url: `/api/reservations/${id}/consumptions`,
          headers: { 'idempotency-key': 'consumption-retry-001' },
          payload: body,
        })
      ).statusCode,
      201,
    );
  assert.equal(f.store.consumptions().length, 1);
  const changed = await f.app.inject({
    method: 'POST',
    url: `/api/reservations/${id}/consumptions`,
    headers: { 'idempotency-key': 'consumption-retry-001' },
    payload: { ...body, quantity: 2 },
  });
  assert.equal(changed.statusCode, 409);
});
test('un saldo inicial erróneo se anula con motivo sin modificar caja', async (t) => {
  const f = await fixture(t);
  const id = uid();
  f.store.db
    .prepare(
      'INSERT INTO import_candidates(id,source_key,source_file,source_sheet,source_row,guest_name,proposed_json,raw_json,issues_json) VALUES (?,?,?,?,?,?,?,?,?)',
    )
    .run(id, 'test:2', 'test.xlsx', 'RESERVAS', '5', 'Huésped', '{}', '{}', '[]');
  const r = (
    await f.request('POST', '/api/reservations', {
      ...sample(),
      importId: id,
      historicalPayments: [{ method: 'cash', amountCents: 5000, allocation: 'lodging' }],
    })
  ).json<Detail>();
  assert.equal(r.reservation.paidByMethod.cash, 5000);
  const p = r.payments[0];
  const response = await f.request('POST', `/api/payments/${p.id}/void-initial`, {
    reason: 'Importe original mal interpretado',
  });
  assert.equal(response.statusCode, 200, response.body);
  assert.equal(f.store.reservation(r.reservation.id).paidCents, 0);
  assert.equal(f.store.reservation(r.reservation.id).paidByMethod.cash, 0);
  assert.equal(f.store.movements().length, 0);
  assert.ok(f.store.payments(r.reservation.id)[0].voidedAt);
});
test('migración conserva reservas de una base de la primera versión', async (t) => {
  const f = await fixture(t);
  const r = (await f.create()).reservation;
  f.store.db.exec(
    'DROP TABLE commands; ALTER TABLE payments DROP COLUMN voided_at; PRAGMA user_version=1;',
  );
  await f.reopen();
  assert.equal(f.store.reservation(r.id).guestName, r.guestName);
  assert.equal(
    (f.store.db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version,
    2,
  );
});
