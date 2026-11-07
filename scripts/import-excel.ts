import ExcelJS from 'exceljs';
import { basename, resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { Store, uid } from '../server/database.ts';
import { type Assignment, type Method, type ReservationInput } from '../shared/domain.ts';
import { readCalendarNotes } from './xlsx-notes.ts';

// Import is deliberately a staging operation. Only the review screen creates live records.
function value(cell: ExcelJS.Cell): unknown {
  const v = cell.value;
  if (v && typeof v === 'object' && 'result' in v) return v.result;
  if (v && typeof v === 'object' && 'richText' in v) return v.richText.map((t) => t.text).join('');
  if (v && typeof v === 'object' && 'text' in v) return v.text;
  return v;
}
function text(cell: ExcelJS.Cell) {
  const v = value(cell);
  return v == null ? '' : String(v).trim();
}
function numeric(cell: ExcelJS.Cell) {
  const v = value(cell);
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}
function dateValue(cell: ExcelJS.Cell) {
  const v = value(cell);
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v.toISOString().slice(0, 10);
  if (typeof v === 'number' && v > 1 && v < 150000)
    return new Date(Date.UTC(1899, 11, 30) + Math.round(v * 86400000)).toISOString().slice(0, 10);
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  return '';
}
function normalize(v: string) {
  return v
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}
function commentField(note: string, pattern: string) {
  return (
    note
      .match(
        new RegExp(`(?:^|\\n)[ \\t]*\\*?[ \\t]*${pattern}[ \\t]*[:：][ \\t]*([^\\r\\n]*)`, 'i'),
      )?.[1]
      ?.replace(/^\*+/, '')
      .trim() ?? ''
  );
}
function commentDate(value: string) {
  const m = value.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})/);
  if (!m) return '';
  const y = m[3].length === 2 ? `20${m[3]}` : m[3];
  return `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
}
function pesos(value: string) {
  const cleaned = value.replace(/^\$\s*/, '').trim();
  if (!/^[\d.,\s]+$/.test(cleaned)) return null;
  let s = cleaned.replace(/\s/g, '');
  if (!s) return null;
  const dot = s.lastIndexOf('.'),
    comma = s.lastIndexOf(',');
  if (dot >= 0 && comma >= 0) {
    const decimal = dot > comma ? '.' : ',';
    s = s.replaceAll(decimal === '.' ? ',' : '.', '');
    if (decimal === ',') s = s.replace(',', '.');
  } else if (/[.,]/.test(s)) {
    const separator = s.includes('.') ? '.' : ',';
    const parts = s.split(separator);
    if (parts.length > 2 || parts.at(-1)!.length === 3) s = parts.join('');
    else s = s.replace(',', '.');
  }
  const result = Number(s);
  return Number.isFinite(result) && result >= 0 ? Math.round(result * 100) : null;
}
type CalendarNote = {
  name: string;
  roomId: number;
  checkIn: string;
  checkOut: string;
  note: string;
  sheet: string;
  cell: string;
};
async function calendarNotes(filename: string) {
  const notes: CalendarNote[] = [];
  for (const raw of await readCalendarNotes(filename)) {
    const name = commentField(raw.note, 'Nombre(?: y apellido)?');
    if (!name) continue;
    notes.push({
      ...raw,
      name,
      checkIn: commentDate(commentField(raw.note, 'Fecha de ingreso')),
      checkOut: commentDate(commentField(raw.note, 'Fecha de salida')),
    });
  }
  return notes;
}
export async function stageWorkbook(
  filename: string,
  calendarFilename?: string,
  dbFilename?: string,
) {
  const book = new ExcelJS.Workbook();
  await book.xlsx.readFile(filename);
  const sheet = book.getWorksheet('RESERVAS');
  if (!sheet) throw new Error('No se encontró la hoja RESERVAS.');
  const notes = calendarFilename ? await calendarNotes(calendarFilename) : [];
  const store = new Store(
    dbFilename ?? process.env.SG_DATABASE ?? resolve('data/san-german.sqlite'),
  );
  try {
    store.backup('antes-de-importar');
    let staged = 0;
    let existing = 0;
    store.transaction(() => {
      sheet.eachRow((row, rowNumber) => {
        if (rowNumber <= 3) return;
        const guestName = text(row.getCell(4));
        if (!guestName) return;
        const originalNumber = text(row.getCell(2));
        const checkIn = dateValue(row.getCell(7));
        const checkOut = dateValue(row.getCell(10));
        const bookedOn = dateValue(row.getCell(3));
        const matches = notes.filter(
          (n) =>
            normalize(n.name) === normalize(guestName) &&
            n.checkIn === checkIn &&
            n.checkOut === checkOut &&
            checkIn &&
            checkOut,
        );
        const representative = matches[0];
        const issues: string[] = [];
        const roomText = text(row.getCell(5));
        const numericRooms =
          roomText
            .match(/\d+/g)
            ?.map(Number)
            .filter((n) => n >= 1 && n <= 9) ?? [];
        const roomIds = [
          ...new Set(numericRooms.length ? numericRooms : matches.map((n) => n.roomId)),
        ];
        if (!roomIds.length) issues.push('Falta asignar habitación.');
        if (!numericRooms.length && roomIds.length)
          issues.push(
            'Habitación propuesta por coincidencia de nombre y fechas en un comentario del almanaque. Revisala.',
          );
        if (!checkIn || !checkOut) issues.push('Falta una fecha de ingreso o salida válida.');
        if (!bookedOn) issues.push('Falta la fecha en que se tomó la reserva.');
        const tariffText = representative ? commentField(representative.note, 'Tarifa total') : '';
        const tariff = tariffText ? pesos(tariffText) : null;
        if (tariff === null)
          issues.push(
            'La hoja informa TOTAL COBRADO, no la tarifa. Completá el total de alojamiento.',
          );
        else
          issues.push('Tarifa propuesta desde un comentario del almanaque. Confirmá su importe.');
        const pax =
          numeric(row.getCell(6)) ??
          (representative
            ? Number(commentField(representative.note, 'Cantidad de hu[eé]spedes'))
            : 0);
        if (!pax || !Number.isInteger(pax))
          issues.push('Falta confirmar la cantidad de huéspedes.');
        const historicalPayments = (
          [
            ['cash', 11, 14],
            ['transfer', 12, 15],
            ['card', 13, 16],
          ] as const
        )
          .map(([method, a, b]) => ({
            method: method as Method,
            amountCents: Math.round(
              ((numeric(row.getCell(a)) ?? 0) + (numeric(row.getCell(b)) ?? 0)) * 100,
            ),
            allocation: 'lodging' as const,
          }))
          .filter((p) => p.amountCents > 0);
        if (historicalPayments.length)
          issues.push(
            'Revisá los cobros históricos y decidí si incorporarlos como saldo inicial (sin movimientos de caja).',
          );
        const proposed: ReservationInput & { historicalPayments: typeof historicalPayments } = {
          guestName,
          document: representative ? commentField(representative.note, 'DNI') : '',
          phone: representative ? commentField(representative.note, 'Celular') : '',
          email: representative ? commentField(representative.note, 'Mail') : '',
          fiscalData: representative
            ? commentField(representative.note, 'CUIL/Condici[oó]n fiscal/Domicilio')
            : '',
          bookedOn,
          pax: pax || 0,
          lodgingCents: tariff ?? 0,
          state: 'confirmed',
          channel: 'direct',
          visualTag: 'auto',
          notes: `Origen: ${basename(filename)} · RESERVAS · fila ${rowNumber} · reserva original ${originalNumber || 'sin número'}.${representative ? `\nReferencia del almanaque: ${representative.sheet}!${representative.cell}.\n${representative.note}` : ''}`,
          assignments: (roomIds.length ? roomIds : [0]).map(
            (roomId) => ({ roomId, checkIn, checkOut }) satisfies Assignment,
          ),
          historicalPayments,
        };
        const raw = Object.fromEntries(
          Array.from({ length: 16 }, (_, i) => [
            String.fromCharCode(66 + i),
            value(row.getCell(i + 2)),
          ]),
        );
        const sourceKey = `${basename(filename)}:RESERVAS:${originalNumber || `fila-${rowNumber}`}`;
        const known = store.db
          .prepare('SELECT id,status FROM import_candidates WHERE source_key=?')
          .get(sourceKey) as { id: string; status: string } | undefined;
        if (known) {
          if (known.status === 'pending')
            store.db
              .prepare(
                'UPDATE import_candidates SET guest_name=?,proposed_json=?,raw_json=?,issues_json=? WHERE id=?',
              )
              .run(
                guestName,
                JSON.stringify(proposed),
                JSON.stringify({ ...raw, calendarNotes: matches }),
                JSON.stringify(issues),
                known.id,
              );
          existing++;
          return;
        }
        store.db
          .prepare(
            `INSERT INTO import_candidates (id,source_key,source_file,source_sheet,source_row,guest_name,proposed_json,raw_json,issues_json) VALUES (?,?,?,?,?,?,?,?,?)`,
          )
          .run(
            uid(),
            sourceKey,
            basename(filename),
            'RESERVAS',
            String(rowNumber),
            guestName,
            JSON.stringify(proposed),
            JSON.stringify({ ...raw, calendarNotes: matches }),
            JSON.stringify(issues),
          );
        staged++;
      });
      store.audit(
        'stage_import',
        `${staged} reservas preparadas para revisión desde ${basename(filename)}. Ninguna reserva ni movimiento creado.`,
      );
    });
    return { staged, existing };
  } finally {
    store.close();
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [filename, calendarFilename] = process.argv.slice(2);
  if (!filename || !existsSync(filename)) {
    console.error(
      'Uso: npm run import:excel -- "ruta/Reservas y Caja.xlsx" ["ruta/Almanaque.xlsx"]',
    );
    process.exitCode = 1;
  } else {
    try {
      const result = await stageWorkbook(
        resolve(filename),
        calendarFilename ? resolve(calendarFilename) : undefined,
      );
      console.log(
        `${result.staged} registros preparados; ${result.existing} ya estaban cargados. Revisalos en Datos y respaldos. No se crearon reservas ni movimientos de caja.`,
      );
    } catch (e) {
      console.error(e instanceof Error ? e.message : e);
      process.exitCode = 1;
    }
  }
}
