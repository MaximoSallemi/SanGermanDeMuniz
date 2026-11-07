import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve, basename } from 'node:path';
import ExcelJS from 'exceljs';
import { stageWorkbook } from '../scripts/import-excel.ts';
import { Store } from '../server/database.ts';
import { readFileSync, writeFileSync } from 'node:fs';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';

test('importa a revisión, cruza comentarios por nombre y fechas, y no crea caja', async (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'san-german-import-'));
  const filename = join(directory, 'Reservas y Caja.xlsx');
  const calendar = join(directory, 'Almanaque.xlsx');
  const dbFile = join(directory, 'app.sqlite');
  t.after(() => {
    assert.equal(dirname(resolve(directory)), resolve(tmpdir()));
    assert.ok(basename(directory).startsWith('san-german-import-'));
    rmSync(directory, { recursive: true, force: true });
  });
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet('RESERVAS');
  sheet.getCell('B4').value = 20260001;
  sheet.getCell('C4').value = new Date('2026-11-01T00:00:00Z');
  sheet.getCell('D4').value = 'Pérez, Ana';
  sheet.getCell('G4').value = new Date('2026-11-03T00:00:00Z');
  sheet.getCell('H4').value = 2;
  const serial = (Date.parse('2026-11-05T00:00:00Z') - Date.UTC(1899, 11, 30)) / 86400000;
  sheet.getCell('J4').value = { formula: 'G4+H4', result: serial };
  sheet.getCell('J4').numFmt = 'dd/mm/yyyy';
  sheet.getCell('K4').value = 10000;
  sheet.getCell('N4').value = 20000;
  sheet.getCell('Q4').value = { formula: 'SUM(K4:P4)', result: 30000 };
  await book.xlsx.writeFile(filename);
  const cal = new ExcelJS.Workbook();
  const tab = cal.addWorksheet('NOVIEMBRE 26');
  tab.getCell('A3').value = 'PB 2 Farias';
  tab.getCell('D3').value = '';
  tab.getCell('D3').note =
    '*Nombre y apellido: Pérez Ana\n*Cantidad de huéspedes: 2\n*Fecha de ingreso: 3/11/26\n*Fecha de salida: 5/11/26\n*Tarifa total: $100.000\n*Celular: 1100000000';
  await cal.xlsx.writeFile(calendar);
  // The user's workbook stores plain <t> text, which ExcelJS's reader drops.
  const zip = unzipSync(readFileSync(calendar));
  for (const part of Object.keys(zip).filter((name) => /comments\d+\.xml$/.test(name))) {
    zip[part] = strToU8(
      strFromU8(zip[part]).replace(
        /<text>[\s\S]*?<\/text>/,
        '<text><t>*Nombre y apellido: Pérez Ana\n*Cantidad de huéspedes: 2\n*Fecha de ingreso: 3/11/26\n*Fecha de salida: 5/11/26\n*Tarifa total: $100.000\n*Celular: 1100000000</t></text>',
      ),
    );
  }
  writeFileSync(calendar, zipSync(zip));
  assert.deepEqual(await stageWorkbook(filename, calendar, dbFile), { staged: 1, existing: 0 });
  assert.deepEqual(await stageWorkbook(filename, calendar, dbFile), { staged: 0, existing: 1 });
  const store = new Store(dbFile);
  try {
    const candidate = store.db.prepare('SELECT * FROM import_candidates').get() as Record<
      string,
      any
    >;
    const proposed = JSON.parse(candidate.proposed_json);
    assert.equal(store.reservations().length, 0);
    assert.equal(store.movements().length, 0);
    assert.equal(proposed.lodgingCents, 10000000);
    assert.equal(proposed.historicalPayments[0].amountCents, 3000000);
    assert.equal(proposed.pax, 2);
    assert.equal(proposed.assignments[0].roomId, 2);
    assert.equal(proposed.assignments[0].checkOut, '2026-11-05');
    assert.ok(JSON.parse(candidate.issues_json).length > 0);
  } finally {
    store.close();
  }
});
test('TOTAL COBRADO no se interpreta como tarifa y los datos faltantes quedan visibles', async (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'san-german-import-'));
  const filename = join(directory, 'reservas.xlsx');
  const dbFile = join(directory, 'app.sqlite');
  t.after(() => {
    assert.equal(dirname(resolve(directory)), resolve(tmpdir()));
    assert.ok(basename(directory).startsWith('san-german-import-'));
    rmSync(directory, { recursive: true, force: true });
  });
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet('RESERVAS');
  sheet.getCell('D4').value = 'Huésped sin tarifa';
  sheet.getCell('L4').value = 80000;
  sheet.getCell('Q4').value = 80000;
  await book.xlsx.writeFile(filename);
  await stageWorkbook(filename, undefined, dbFile);
  const store = new Store(dbFile);
  try {
    const candidate = store.db.prepare('SELECT * FROM import_candidates').get() as Record<
      string,
      any
    >;
    const proposed = JSON.parse(candidate.proposed_json);
    assert.equal(proposed.lodgingCents, 0);
    assert.equal(proposed.assignments[0].roomId, 0);
    assert.equal(proposed.assignments[0].checkIn, '');
    assert.equal(proposed.pax, 0);
    assert.equal(proposed.historicalPayments[0].amountCents, 8000000);
    assert.ok(JSON.parse(candidate.issues_json).some((issue: string) => issue.includes('tarifa')));
  } finally {
    store.close();
  }
});
