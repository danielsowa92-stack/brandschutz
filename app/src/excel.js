// Excel-Export (.xlsx) mit write-excel-file
import writeExcelFile from 'write-excel-file/universal';
import { STATUS, MASSNAHMEN, parseIso } from './logic.js';
import * as repo from './repo.js';

const H = (v) => ({ value: v, fontWeight: 'bold', backgroundColor: '#F4E1DC' });
const T = (v) => ({ value: v == null ? '' : String(v), type: String });
const D = (iso) => (iso ? { value: parseIso(iso), type: Date, format: 'dd.mm.yyyy' } : { value: '', type: String });
const N = (v) => ({ value: Number(v) || 0, type: Number });

function sheet(name, headers, rows, widths) {
  return {
    sheet: name,
    data: [headers.map(H), ...rows],
    columns: widths.map((w) => ({ width: w })),
    stickyRowsCount: 1,
  };
}

export async function buildExcel(objectId) {
  const doors = await repo.listDoors(objectId || null);
  const insp = await repo.allInspections(objectId || null);
  const defects = await repo.openDefects(objectId || null);
  const orders = await repo.orderList(objectId || null);
  const checklist = (i) => (i.checklist || []).map((c) => `${c.label}: ${c.ergebnis === 'ok' ? 'i.O.' : c.ergebnis === 'mangel' ? 'MANGEL' : 'entfällt'}`).join('; ');

  const sheets = [
    sheet('Türen',
      ['Tür-ID', 'Objekt', 'Position', 'Geschoss', 'Raum', 'Typ', 'Hersteller', 'Flügel', 'Feststellanlage', 'Intervall (Monate)', 'Letzte Prüfung', 'Ergebnis', 'Nächste Prüfung', 'Notiz'],
      doors.map((d) => [T(d.id), T(d.objekt), T(d.position), T(d.geschoss), T(d.raum), T(d.typ), T(d.hersteller),
        T(d.zweifluegelig ? 'zweiflüglig' : 'einflüglig'), T(d.feststellanlage ? 'ja' : 'nein'), N(d.intervall),
        D(d.last_datum), T(d.last_status ? STATUS[d.last_status] : 'nicht geprüft'), D(d.naechste), T(d.notiz)]),
      [16, 22, 9, 12, 22, 9, 16, 12, 14, 10, 13, 14, 14, 30]),
    sheet('Prüfungen',
      ['Datum', 'Tür-ID', 'Objekt', 'Position', 'Lage', 'Prüfer', 'Status', 'Checkliste', 'Mangel', 'Maßnahme', 'Material/Bestellung', 'Nächste Prüfung', 'Behoben', 'Behoben am', 'Bemerkung'],
      insp.map((i) => [D(i.datum), T(i.door_id), T(i.objekt), T(i.position), T([i.geschoss, i.raum].filter(Boolean).join(' · ')),
        T(i.pruefer), T(STATUS[i.status]), T(checklist(i)), T(i.mangel), T(MASSNAHMEN[i.massnahme] || ''), T(i.material),
        D(i.naechste), T(i.status === 'ok' ? '' : i.behoben ? 'ja' : 'nein'), D(i.behoben_datum), T(i.bemerkung)]),
      [12, 16, 22, 9, 22, 16, 13, 50, 35, 15, 25, 14, 9, 12, 25]),
    sheet('Offene Mängel',
      ['Datum', 'Tür-ID', 'Objekt', 'Position', 'Lage', 'Status', 'Mangel', 'Maßnahme', 'Material/Bestellung', 'Prüfer'],
      defects.map((i) => [D(i.datum), T(i.door_id), T(i.objekt), T(i.position), T([i.geschoss, i.raum].filter(Boolean).join(' · ')),
        T(STATUS[i.status]), T(i.mangel), T(MASSNAHMEN[i.massnahme] || ''), T(i.material), T(i.pruefer)]),
      [12, 16, 22, 9, 22, 13, 40, 15, 30, 16]),
    sheet('Bestellliste',
      ['Material/Bestellposition', 'Tür-ID', 'Objekt', 'Position', 'Lage', 'Typ', 'Mangel', 'Festgestellt am'],
      orders.map((i) => [T(i.material), T(i.door_id), T(i.objekt), T(i.position), T([i.geschoss, i.raum].filter(Boolean).join(' · ')),
        T(i.typ), T(i.mangel), D(i.datum)]),
      [35, 16, 22, 9, 22, 9, 40, 14]),
  ];
  return writeExcelFile(sheets, { fontFamily: 'Calibri', fontSize: 11 }).toBlob();
}
