import { readFile } from 'node:fs/promises';
import { posix } from 'node:path';
import { strFromU8, unzipSync } from 'fflate';
import { XMLParser } from 'fast-xml-parser';

type Xml = Record<string, any>;
const array = <T>(value: T | T[] | undefined): T[] =>
  value === undefined ? [] : Array.isArray(value) ? value : [value];

function content(node: any): string {
  if (node === undefined || node === null) return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(content).join('');
  if ('t' in node) return content(node.t);
  if ('r' in node) return content(node.r);
  if ('#text' in node) return String(node['#text']);
  return '';
}

/** Read both plain <text><t> and rich-text comments, including empty colored cells. */
export async function readCalendarNotes(filename: string) {
  const bytes = await readFile(filename);
  if (bytes.length > 30 * 1024 * 1024) throw new Error('El almanaque supera el límite de 30 MB.');
  let expanded = 0;
  const archive = unzipSync(bytes, {
    filter(entry) {
      if (!entry.name.endsWith('.xml') && !entry.name.endsWith('.rels')) return false;
      expanded += entry.originalSize;
      if (expanded > 100 * 1024 * 1024)
        throw new Error('El contenido del Excel supera el límite de lectura.');
      return true;
    },
  });
  const parser = new XMLParser({
    ignoreAttributes: false,
    removeNSPrefix: true,
    parseTagValue: false,
    parseAttributeValue: false,
    trimValues: false,
  });
  function xml(path: string): Xml {
    const data = archive[path];
    if (!data) return {};
    const source = strFromU8(data);
    if (/<!DOCTYPE/i.test(source))
      throw new Error('No se admiten declaraciones externas en los XML del Excel.');
    return parser.parse(source) as Xml;
  }
  function target(base: string, relative: string) {
    return relative.startsWith('/')
      ? relative.slice(1)
      : posix.normalize(posix.join(posix.dirname(base), relative));
  }
  function relationships(path: string): Xml[] {
    const filename = posix.join(posix.dirname(path), '_rels', `${posix.basename(path)}.rels`);
    return array(xml(filename).Relationships?.Relationship);
  }
  const strings = array<any>(xml('xl/sharedStrings.xml').sst?.si).map(content);
  const sheets = array<Xml>(xml('xl/workbook.xml').workbook?.sheets?.sheet);
  const workbookRels = relationships('xl/workbook.xml');
  const notes: { sheet: string; cell: string; roomId: number; note: string }[] = [];
  for (const sheet of sheets) {
    const relationship = workbookRels.find((r) => r['@_Id'] === (sheet['@_id'] ?? sheet['@_r:id']));
    if (!relationship) continue;
    const sheetPath = target('xl/workbook.xml', relationship['@_Target']);
    const roomByRow = new Map<number, number>();
    for (const row of array<Xml>(xml(sheetPath).worksheet?.sheetData?.row)) {
      for (const cell of array<Xml>(row.c)) {
        if (!/^A\d+$/.test(cell['@_r'] ?? '')) continue;
        const label =
          cell['@_t'] === 's'
            ? strings[Number(cell.v)]
            : cell['@_t'] === 'inlineStr'
              ? content(cell.is)
              : String(cell.v ?? '');
        const match = label?.match(/^(?:PB|PA)\s+(\d+)/i);
        if (match) roomByRow.set(Number(row['@_r']), Number(match[1]));
      }
    }
    for (const rel of relationships(sheetPath).filter((r) =>
      String(r['@_Type']).endsWith('/comments'),
    )) {
      const part = xml(target(sheetPath, rel['@_Target']));
      for (const comment of array<Xml>(part.comments?.commentList?.comment)) {
        const cell = String(comment['@_ref'] ?? '');
        const roomId = roomByRow.get(Number(cell.match(/\d+/)?.[0]));
        if (!roomId) continue;
        notes.push({ sheet: String(sheet['@_name']), cell, roomId, note: content(comment.text) });
      }
    }
  }
  return notes;
}
