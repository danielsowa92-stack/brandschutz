import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  addMonths, dueState, nextDoorId, parseScan, suggestKuerzel, convertLegacy, checklistFor, DEFAULT_CHECKLIST, fmtDate,
} from '../src/logic.js';

test('addMonths begrenzt Monatsende', () => {
  assert.equal(addMonths('2026-01-31', 1), '2026-02-28');
  assert.equal(addMonths('2024-01-31', 1), '2024-02-29');
  assert.equal(addMonths('2026-11-04', 12), '2027-11-04');
  assert.equal(addMonths('2026-11-04', 6), '2027-05-04');
});

test('dueState', () => {
  assert.equal(dueState(null, '2026-11-04'), 'nie');
  assert.equal(dueState('2026-11-03', '2026-11-04'), 'ueberfaellig');
  assert.equal(dueState('2026-11-04', '2026-11-04'), 'bald');
  assert.equal(dueState('2026-12-04', '2026-11-04'), 'bald');
  assert.equal(dueState('2026-12-05', '2026-11-04'), 'ok');
});

test('nextDoorId', () => {
  assert.equal(nextDoorId('RM', []), 'RM-0001');
  assert.equal(nextDoorId('RM', ['RM-0001', 'RM-0009', 'X-0100', 'RMX-0050']), 'RM-0010');
});

test('parseScan versteht IDs und alte Links', () => {
  assert.equal(parseScan(' RM-0001 '), 'RM-0001');
  assert.equal(parseScan('https://x.github.io/brandschutz/pruefung.html?tuer=T-007'), 'T-007');
  assert.equal(parseScan('https://x.github.io/brandschutz/pruefung.html?tuer=T%20007'), 'T 007');
});

test('suggestKuerzel', () => {
  assert.equal(suggestKuerzel('Rathaus Musterstadt'), 'RM');
  assert.equal(suggestKuerzel('Schule'), 'SCHU');
  assert.equal(suggestKuerzel('Rathaus Musterstadt', ['RM']), 'RM2');
  assert.equal(suggestKuerzel('Büro Ölweg'), 'BO');
});

test('checklistFor filtert Bedingungen', () => {
  assert.equal(checklistFor({ zweifluegelig: 0, feststellanlage: 0 }, DEFAULT_CHECKLIST).length, 6);
  assert.equal(checklistFor({ zweifluegelig: 1, feststellanlage: 1 }, DEFAULT_CHECKLIST).length, 8);
});

test('fmtDate', () => {
  assert.equal(fmtDate('2026-03-05'), '05.03.2026');
  assert.equal(fmtDate(''), '–');
});

test('convertLegacy übernimmt Altdaten', () => {
  const t0 = new Date(2025, 2, 10, 9, 0).getTime();
  const t1 = new Date(2025, 5, 1, 9, 0).getTime();
  const r = convertLegacy({
    bs_doors: JSON.stringify([
      { id: 'T-001', name: 'Treppenhaus', standort: 'TH Nord', gebaeude: 'A', etage: 'EG', firma: 'Muster GmbH', typ: 'T30 – Feuerschutztür', baujahr: '2018' },
      { id: 'T-002', name: 'Keller', firma: '', typ: 'Fluchttür' },
    ]),
    bs_checks: JSON.stringify([
      { ts: t0, doorId: 'T-001', pruefer: 'Max', status: 'Dringend', checklist: ['Türdichtung intakt'], bemerkung: 'Schließer defekt' },
      { ts: t1, doorId: 'T-001', pruefer: '–', status: 'OK', checklist: [], bemerkung: 'alles gut' },
      { ts: t1, doorId: 'T-099', doorName: 'Gelöscht', firma: 'Muster GmbH', status: 'Mangel', bemerkung: 'x' },
    ]),
  }, [{ kuerzel: 'MG', name: 'Andere' }]);
  assert.equal(r.objects.length, 2);
  assert.equal(r.objects[0].name, 'Muster GmbH');
  assert.notEqual(r.objects[0].kuerzel, 'MG');
  assert.equal(r.doors.length, 3);
  const d1 = r.doors.find((d) => d.id === 'T-001');
  assert.equal(d1.typ, 'T30');
  assert.equal(d1.geschoss, 'A / EG');
  assert.equal(d1.raum, 'TH Nord');
  assert.equal(r.doors.find((d) => d.id === 'T-002').typ, 'sonstige');
  assert.equal(r.inspections.length, 3);
  const first = r.inspections[0];
  assert.equal(first.datum, '2025-03-10');
  assert.equal(first.status, 'mangel');
  assert.equal(first.mangel, 'DRINGEND: Schließer defekt');
  assert.equal(first.behoben, 1);
  assert.equal(first.behoben_datum, '2025-06-01');
  assert.equal(first.naechste, '2026-03-10');
  assert.equal(r.inspections[1].pruefer, '');
  assert.equal(r.inspections[1].bemerkung, 'alles gut');
  assert.equal(r.inspections[2].behoben, 0);
});

test('convertLegacy nutzt vorhandenes Objekt gleichen Namens', () => {
  const r = convertLegacy({ bs_doors: [{ id: 'A-1', firma: 'Muster GmbH' }], bs_checks: [] }, [{ kuerzel: 'MUG', name: 'Muster GmbH' }]);
  assert.equal(r.objects.length, 0);
  assert.equal(r.doors[0].kuerzel, 'MUG');
});
