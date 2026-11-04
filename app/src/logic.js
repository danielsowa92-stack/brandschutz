// Reine Logik ohne Abhängigkeiten zu DOM oder Datenbank – mit node --test testbar.

export const STATUS = {
  ok: 'in Ordnung',
  mangel: 'Mangel',
  ausser_betrieb: 'außer Betrieb',
};

export const MASSNAHMEN = {
  reparieren: 'reparieren',
  bestellen: 'bestellen',
  vor_ort: 'vor Ort erledigt',
};

export const TUERTYPEN = ['T30', 'T90', 'RS', 'sonstige'];

// Bedingungen für Checklistenpunkte
export const BEDINGUNGEN = {
  immer: 'immer',
  zweifluegelig: 'nur zweiflüglig',
  feststellanlage: 'nur mit Feststellanlage',
};

export const DEFAULT_CHECKLIST = [
  { label: 'Tür schließt selbstständig', bedingung: 'immer' },
  { label: 'Schließfolgeregelung funktioniert', bedingung: 'zweifluegelig' },
  { label: 'Dichtungen intakt', bedingung: 'immer' },
  { label: 'Beschläge/Bänder fest', bedingung: 'immer' },
  { label: 'Keine Beschädigung an Türblatt/Zarge', bedingung: 'immer' },
  { label: 'Kennzeichnungsschild vorhanden', bedingung: 'immer' },
  { label: 'Keine unzulässige Blockierung (Keil etc.)', bedingung: 'immer' },
  { label: 'Feststellanlage löst aus', bedingung: 'feststellanlage' },
];

/** Checklistenpunkte, die für eine bestimmte Tür gelten. */
export function checklistFor(door, checklist) {
  return checklist.filter((c) => {
    if (c.bedingung === 'zweifluegelig') return !!door.zweifluegelig;
    if (c.bedingung === 'feststellanlage') return !!door.feststellanlage;
    return true;
  });
}

// ---------- Datum ----------

const pad = (n) => String(n).padStart(2, '0');

/** Lokales Datum als YYYY-MM-DD */
export function isoDate(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function parseIso(s) {
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (!m) return null;
  return new Date(+m[1], +m[2] - 1, +m[3]);
}

/** Monate addieren; Monatsende wird begrenzt (31.01. + 1 → 28./29.02.) */
export function addMonths(iso, months) {
  const d = parseIso(iso);
  if (!d) return '';
  const day = d.getDate();
  const target = new Date(d.getFullYear(), d.getMonth() + Number(months || 0), 1);
  const last = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(day, last));
  return isoDate(target);
}

export function addDays(iso, days) {
  const d = parseIso(iso);
  d.setDate(d.getDate() + days);
  return isoDate(d);
}

/** YYYY-MM-DD → TT.MM.JJJJ */
export function fmtDate(iso) {
  const d = parseIso(iso);
  if (!d) return '–';
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`;
}

export function daysBetween(fromIso, toIso) {
  const a = parseIso(fromIso);
  const b = parseIso(toIso);
  return Math.round((b - a) / 86400000);
}

/**
 * Fälligkeitsstatus einer Tür.
 * naechste = nächstes Prüfdatum der letzten Prüfung (oder null, falls nie geprüft)
 */
export function dueState(naechste, today = isoDate(), soonDays = 30) {
  if (!naechste) return 'nie';
  if (naechste < today) return 'ueberfaellig';
  if (naechste <= addDays(today, soonDays)) return 'bald';
  return 'ok';
}

// ---------- IDs ----------

/** Kürzel aus einem Objektnamen vorschlagen, z. B. "Rathaus Musterstadt" → "RM" */
export function suggestKuerzel(name, existing = []) {
  const clean = String(name || '')
    .toUpperCase()
    .replace(/Ä/g, 'AE').replace(/Ö/g, 'OE').replace(/Ü/g, 'UE').replace(/ß/g, 'SS')
    .replace(/[^A-Z0-9 ]/g, ' ')
    .trim();
  const words = clean.split(/\s+/).filter(Boolean);
  let base;
  if (words.length >= 2) base = words.map((w) => w[0]).join('').slice(0, 4);
  else base = (words[0] || 'OBJ').slice(0, 4);
  if (base.length < 2) base = (base + 'X').slice(0, 2);
  const taken = new Set(existing.map((e) => e.toUpperCase()));
  if (!taken.has(base)) return base;
  for (let i = 2; i < 100; i++) {
    const k = base.slice(0, 4) + i;
    if (!taken.has(k)) return k;
  }
  return base + Date.now().toString().slice(-3);
}

export function normalizeKuerzel(k) {
  return String(k || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/** Nächste freie Tür-ID KÜRZEL-0001 */
export function nextDoorId(kuerzel, existingIds) {
  const prefix = `${kuerzel}-`;
  let max = 0;
  for (const id of existingIds) {
    if (id.startsWith(prefix)) {
      const n = parseInt(id.slice(prefix.length), 10);
      if (!isNaN(n) && n > max) max = n;
    }
  }
  return `${prefix}${String(max + 1).padStart(4, '0')}`;
}

/**
 * Inhalt eines QR-Codes in eine Tür-ID umwandeln.
 * Unterstützt reine IDs und Links der alten Web-Version (…/pruefung.html?tuer=T-001).
 */
export function parseScan(text) {
  let id = String(text || '').trim();
  if (/^https?:\/\//i.test(id)) {
    try {
      const u = new URL(id);
      id = u.searchParams.get('tuer') || u.searchParams.get('door') || u.searchParams.get('id') || id;
    } catch (e) { /* kein gültiger Link → Rohtext */ }
  }
  return id.trim();
}

// ---------- Prüfung ----------

/** Gesamtstatus aus Checkliste ableiten (Vorschlag) */
export function statusFromChecklist(results) {
  return results.some((r) => r.ergebnis === 'mangel') ? 'mangel' : 'ok';
}

export function isOpenDefect(insp) {
  return insp.status !== 'ok' && !insp.behoben;
}

// ---------- Import alte Web-Version ----------

function mapLegacyTyp(t) {
  const s = String(t || '').toUpperCase();
  if (s.startsWith('T30')) return 'T30';
  if (s.startsWith('T90')) return 'T90';
  if (s.startsWith('RS')) return 'RS';
  return t ? 'sonstige' : '';
}

/**
 * Daten aus der alten Web-Version (localStorage bs_doors / bs_checks) in das neue Modell überführen.
 * Akzeptiert: { bs_doors: [...], bs_checks: [...] } (auch als JSON-Strings) oder { doors, checks }.
 * Liefert { objects, doors, inspections } ohne Datenbank-IDs; Objekte werden über "kuerzel" referenziert.
 */
export function convertLegacy(input, existingObjects = []) {
  const parse = (v) => (typeof v === 'string' ? JSON.parse(v || '[]') : v || []);
  const oldDoors = parse(input.bs_doors ?? input.doors);
  const oldChecks = parse(input.bs_checks ?? input.checks);
  if (!Array.isArray(oldDoors) || !Array.isArray(oldChecks)) throw new Error('Unbekanntes Format');

  const objects = [];
  const byFirma = new Map();
  const taken = existingObjects.map((o) => o.kuerzel);
  const objFor = (firma) => {
    const name = String(firma || '').trim() || 'Importiert (ohne Objekt)';
    if (!byFirma.has(name)) {
      const ex = existingObjects.find((o) => o.name === name);
      if (ex) { byFirma.set(name, { kuerzel: ex.kuerzel, name, existing: true }); return byFirma.get(name); }
      const kuerzel = suggestKuerzel(name, taken);
      taken.push(kuerzel);
      const o = { kuerzel, name, kunde: firma ? name : '', adresse: '', notiz: 'Aus alter Web-Version importiert' };
      byFirma.set(name, o);
      objects.push(o);
    }
    return byFirma.get(name);
  };

  const doors = [];
  const doorMap = new Map();
  const addDoor = (d) => {
    const id = String(d.id || '').trim();
    if (!id || doorMap.has(id)) return;
    const notiz = [
      d.name ? `Bezeichnung: ${d.name}` : '',
      d.gebaeude ? `Gebäude: ${d.gebaeude}` : '',
      d.baujahr ? `Baujahr: ${d.baujahr}` : '',
      d.typ && mapLegacyTyp(d.typ) === 'sonstige' ? `Typ alt: ${d.typ}` : '',
    ].filter(Boolean).join('\n');
    const door = {
      id,
      kuerzel: objFor(d.firma).kuerzel,
      position: '',
      geschoss: [d.gebaeude, d.etage].filter(Boolean).join(' / '),
      raum: d.standort || d.name || '',
      typ: mapLegacyTyp(d.typ),
      hersteller: '',
      zweifluegelig: 0,
      feststellanlage: 0,
      intervall: 12,
      notiz,
    };
    doorMap.set(id, door);
    doors.push(door);
  };
  oldDoors.forEach(addDoor);
  // Prüfungen zu Türen, die es nicht mehr gibt → Tür aus den Prüfdaten rekonstruieren
  oldChecks.forEach((c) => {
    if (c.doorId && !doorMap.has(c.doorId)) {
      addDoor({ id: c.doorId, name: c.doorName, standort: c.standort, gebaeude: c.gebaeude, etage: c.etage, firma: c.firma, typ: c.typ });
    }
  });

  const sorted = oldChecks.filter((c) => c.doorId).slice().sort((a, b) => (a.ts || 0) - (b.ts || 0));
  const inspections = sorted.map((c) => {
    const datum = isoDate(new Date(c.ts || Date.now()));
    const status = c.status === 'OK' ? 'ok' : 'mangel';
    const bem = String(c.bemerkung || '').trim();
    const checklist = (c.checklist || []).map((label) => ({ label, ergebnis: 'ok' }));
    return {
      door_id: c.doorId,
      datum,
      pruefer: c.pruefer && c.pruefer !== '–' ? c.pruefer : '',
      status,
      checklist,
      mangel: status === 'ok' ? '' : (c.status === 'Dringend' ? 'DRINGEND: ' : '') + bem,
      bemerkung: status === 'ok' ? bem : '',
      massnahme: '',
      material: '',
      naechste: addMonths(datum, 12),
      behoben: 0,
      behoben_datum: '',
      _ts: c.ts || 0,
    };
  });
  // Mangel gilt als behoben, wenn später eine OK-Prüfung derselben Tür existiert
  inspections.forEach((i) => {
    if (i.status === 'ok') return;
    const later = inspections.find((j) => j.door_id === i.door_id && j.status === 'ok' && j._ts > i._ts);
    if (later) { i.behoben = 1; i.behoben_datum = later.datum; }
  });
  inspections.forEach((i) => delete i._ts);
  return { objects: objects.filter((o) => !o.existing), doors, inspections };
}

// ---------- Excel-/CSV-Import Türliste ----------

export const IMPORT_FIELDS = [
  { key: 'id', label: 'Tür-ID', hint: 'leer = automatisch' },
  { key: 'objekt', label: 'Objekt', hint: 'leer = gewähltes Objekt' },
  { key: 'position', label: 'Positionsnummer' },
  { key: 'geschoss', label: 'Geschoss' },
  { key: 'raum', label: 'Raum / Lage' },
  { key: 'typ', label: 'Typ (T30/T90/RS)' },
  { key: 'hersteller', label: 'Hersteller' },
  { key: 'fluegel', label: 'Flügel (1/2)' },
  { key: 'feststellanlage', label: 'Feststellanlage (ja/nein)' },
  { key: 'intervall', label: 'Prüfintervall (Monate)' },
  { key: 'notiz', label: 'Notiz' },
];

const HEADER_WORDS = {
  id: ['türid', 'tuerid', 'id', 'türnummer', 'tuernummer', 'türnr', 'tuernr', 'qr', 'kennung'],
  objekt: ['objekt', 'gebäude', 'gebaeude', 'liegenschaft', 'firma', 'kunde', 'objektname'],
  position: ['position', 'pos', 'posnr', 'positionsnummer', 'lfdnr', 'nr', 'nummer'],
  geschoss: ['geschoss', 'etage', 'stockwerk', 'ebene', 'og', 'floor'],
  raum: ['raum', 'lage', 'standort', 'ort', 'bereich', 'raumnummer', 'bezeichnung'],
  typ: ['typ', 'türtyp', 'tuertyp', 'art', 'feuerwiderstand', 'klasse', 'brandschutzklasse'],
  hersteller: ['hersteller', 'fabrikat', 'marke'],
  fluegel: ['flügel', 'fluegel', 'flügelanzahl', 'anzahlflügel', 'ausführung', 'ausfuehrung'],
  feststellanlage: ['feststellanlage', 'fsa', 'feststeller', 'feststellung'],
  intervall: ['intervall', 'prüfintervall', 'pruefintervall', 'monate'],
  notiz: ['notiz', 'bemerkung', 'bemerkungen', 'hinweis', 'kommentar', 'info'],
};

const normHeader = (h) => String(h ?? '').toLowerCase().replace(/[\s._\-/()]+/g, '');

/** Spaltenzuordnung aus Kopfzeile erraten → { feld: spaltenIndex } (-1 = keine) */
export function guessMapping(headers) {
  const map = {};
  const used = new Set();
  for (const f of IMPORT_FIELDS) {
    const words = HEADER_WORDS[f.key];
    let idx = headers.findIndex((h, i) => !used.has(i) && words.includes(normHeader(h)));
    if (idx < 0) idx = headers.findIndex((h, i) => !used.has(i) && normHeader(h).length > 2 && words.some((w) => w.length > 3 && normHeader(h).includes(w)));
    map[f.key] = idx;
    if (idx >= 0) used.add(idx);
  }
  return map;
}

export function parseTyp(v) {
  const s = String(v ?? '').toUpperCase().replace(/\s/g, '');
  if (!s) return '';
  if (/T-?30|EI2?30|EI30/.test(s)) return 'T30';
  if (/T-?90|EI2?90/.test(s)) return 'T90';
  if (/^RS|RAUCH|S200|SA$/.test(s)) return 'RS';
  return 'sonstige';
}

export function parseBool(v) {
  const s = String(v ?? '').trim().toLowerCase();
  return ['ja', 'j', 'x', '1', 'true', 'wahr', 'yes', 'vorhanden', 'mit'].includes(s) ? 1 : 0;
}

export function parseFluegel(v) {
  const s = String(v ?? '').trim().toLowerCase();
  return /^2|zwei|2-?fl|doppel/.test(s) ? 1 : 0;
}

const cellStr = (v) => {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return isoDate(v);
  return String(v).trim();
};

/**
 * Zeilen → Türen. rows ohne Kopfzeile. Rückgabe { doors, errors }.
 * doors[i] = { id ('' = automatisch), objekt ('' = Standardobjekt), position, …, zeile }
 */
export function mapImportRows(rows, mapping) {
  const get = (r, k) => (mapping[k] >= 0 ? cellStr(r[mapping[k]]) : '');
  const doors = [];
  rows.forEach((r, n) => {
    if (!r || !r.some((c) => cellStr(c))) return;
    const d = {
      zeile: n + 2,
      id: get(r, 'id'),
      objekt: get(r, 'objekt'),
      position: get(r, 'position'),
      geschoss: get(r, 'geschoss'),
      raum: get(r, 'raum'),
      typ: mapping.typ >= 0 ? parseTyp(get(r, 'typ')) : '',
      hersteller: get(r, 'hersteller'),
      zweifluegelig: mapping.fluegel >= 0 ? parseFluegel(get(r, 'fluegel')) : 0,
      feststellanlage: mapping.feststellanlage >= 0 ? parseBool(get(r, 'feststellanlage')) : 0,
      intervall: Math.min(120, Math.max(1, parseInt(get(r, 'intervall'), 10) || 12)),
      notiz: get(r, 'notiz'),
    };
    const typRaw = get(r, 'typ');
    if (d.typ === 'sonstige' && typRaw) d.notiz = [d.notiz, `Typ: ${typRaw}`].filter(Boolean).join('\n');
    if (!d.id && !d.position && !d.geschoss && !d.raum) return; // Zeile ohne verwertbaren Inhalt
    doors.push(d);
  });
  return doors;
}

/** Einfacher CSV-Parser (Trennzeichen ; oder , automatisch, Anführungszeichen) */
export function parseCsv(text) {
  text = text.replace(/^﻿/, '');
  const first = text.split(/\r?\n/)[0] || '';
  const sep = (first.match(/;/g) || []).length >= (first.match(/,/g) || []).length ? ';' : ',';
  const rows = [];
  let row = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c;
    } else if (c === '"') q = true;
    else if (c === sep) { row.push(cur); cur = ''; } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cur); rows.push(row); row = []; cur = '';
    } else cur += c;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  return rows;
}
