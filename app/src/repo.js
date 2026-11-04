// Datenzugriff (Objekte, Türen, Prüfungen, Einstellungen)
import { all, get, run, batch } from './db.js';
import { DEFAULT_CHECKLIST, isoDate, addDays } from './logic.js';

const now = () => new Date().toISOString();

// ---------- Einstellungen ----------
export async function getSetting(key, fallback = null) {
  const r = await get('SELECT value FROM settings WHERE key = ?', [key]);
  if (!r) return fallback;
  try { return JSON.parse(r.value); } catch (e) { return fallback; }
}
export async function setSetting(key, value) {
  await run('INSERT OR REPLACE INTO settings(key, value) VALUES (?, ?)', [key, JSON.stringify(value)]);
}
export async function getChecklist() {
  return getSetting('checklist', DEFAULT_CHECKLIST);
}

// ---------- Objekte ----------
export const listObjects = () => all(`
  SELECT o.*, (SELECT COUNT(*) FROM doors d WHERE d.object_id = o.id) AS tueren
  FROM objects o ORDER BY o.name COLLATE NOCASE`);
export const getObject = (id) => get('SELECT * FROM objects WHERE id = ?', [id]);
export const getObjectByKuerzel = (k) => get('SELECT * FROM objects WHERE kuerzel = ?', [k]);

export async function saveObject(o) {
  const vals = [o.kuerzel, o.name, o.kunde || '', o.adresse || '', o.notiz || ''];
  if (o.id) {
    await run('UPDATE objects SET kuerzel=?, name=?, kunde=?, adresse=?, notiz=? WHERE id=?', [...vals, o.id]);
    return o.id;
  }
  const r = await run('INSERT INTO objects(kuerzel, name, kunde, adresse, notiz, created_at) VALUES (?,?,?,?,?,?)', [...vals, now()]);
  return r.lastId;
}

export async function deleteObject(id) {
  const doorSel = 'SELECT id FROM doors WHERE object_id = ?';
  const inspSel = `SELECT id FROM inspections WHERE door_id IN (${doorSel})`;
  const photos = await all(`SELECT path FROM photos WHERE inspection_id IN (${inspSel})`, [id]);
  await batch([
    { sql: `DELETE FROM photos WHERE inspection_id IN (${inspSel})`, params: [id] },
    { sql: `DELETE FROM inspections WHERE door_id IN (${doorSel})`, params: [id] },
    { sql: 'DELETE FROM doors WHERE object_id = ?', params: [id] },
    { sql: 'DELETE FROM objects WHERE id = ?', params: [id] },
  ]);
  return photos.map((p) => p.path);
}

// ---------- Türen ----------
// Tür inkl. Objekt und Daten der letzten Prüfung
const DOOR_SELECT = `
  SELECT d.*, o.name AS objekt, o.kuerzel AS kuerzel,
    l.id AS last_id, l.datum AS last_datum, l.status AS last_status, l.naechste AS naechste
  FROM doors d
  JOIN objects o ON o.id = d.object_id
  LEFT JOIN inspections l ON l.id = (
    SELECT i.id FROM inspections i WHERE i.door_id = d.id ORDER BY i.datum DESC, i.id DESC LIMIT 1)`;

export const listDoors = (objectId) => objectId
  ? all(`${DOOR_SELECT} WHERE d.object_id = ? ORDER BY d.position COLLATE NOCASE, d.id`, [objectId])
  : all(`${DOOR_SELECT} ORDER BY o.name COLLATE NOCASE, d.position COLLATE NOCASE, d.id`);

export const getDoor = (id) => get(`${DOOR_SELECT} WHERE d.id = ?`, [id]);

/** Tür per ID suchen – exakt, sonst ohne Groß-/Kleinschreibung */
export async function findDoor(id) {
  return (await getDoor(id)) || get(`${DOOR_SELECT} WHERE d.id = ? COLLATE NOCASE`, [id]);
}

export const allDoorIds = async () => (await all('SELECT id FROM doors')).map((r) => r.id);

export function searchDoors(q) {
  const like = `%${q}%`;
  return all(`${DOOR_SELECT}
    WHERE d.id LIKE ? OR d.position LIKE ? OR d.raum LIKE ? OR d.geschoss LIKE ? OR o.name LIKE ?
    ORDER BY o.name COLLATE NOCASE, d.position COLLATE NOCASE, d.id LIMIT 100`, [like, like, like, like, like]);
}

export async function saveDoor(d, isNew) {
  const vals = [d.object_id, d.position || '', d.geschoss || '', d.raum || '', d.typ || '', d.hersteller || '',
    d.zweifluegelig ? 1 : 0, d.feststellanlage ? 1 : 0, Number(d.intervall) || 12, d.notiz || ''];
  if (isNew) {
    await run(`INSERT INTO doors(object_id, position, geschoss, raum, typ, hersteller, zweifluegelig, feststellanlage, intervall, notiz, id, created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`, [...vals, d.id, now()]);
  } else {
    await run(`UPDATE doors SET object_id=?, position=?, geschoss=?, raum=?, typ=?, hersteller=?, zweifluegelig=?, feststellanlage=?, intervall=?, notiz=?
      WHERE id=?`, [...vals, d.id]);
  }
}

export async function deleteDoor(id) {
  const photos = await all('SELECT path FROM photos WHERE inspection_id IN (SELECT id FROM inspections WHERE door_id = ?)', [id]);
  await batch([
    { sql: 'DELETE FROM photos WHERE inspection_id IN (SELECT id FROM inspections WHERE door_id = ?)', params: [id] },
    { sql: 'DELETE FROM inspections WHERE door_id = ?', params: [id] },
    { sql: 'DELETE FROM doors WHERE id = ?', params: [id] },
  ]);
  return photos.map((p) => p.path);
}

// ---------- Prüfungen ----------
const parseInsp = (r) => r && { ...r, checklist: safeJson(r.checklist, []) };
function safeJson(s, fb) { try { return JSON.parse(s || ''); } catch (e) { return fb; } }

export const listInspections = async (doorId) =>
  (await all('SELECT * FROM inspections WHERE door_id = ? ORDER BY datum DESC, id DESC', [doorId])).map(parseInsp);

export const getInspection = async (id) => parseInsp(await get('SELECT * FROM inspections WHERE id = ?', [id]));

export async function saveInspection(i) {
  const vals = [i.door_id, i.datum, i.pruefer || '', i.status, JSON.stringify(i.checklist || []), i.mangel || '',
    i.massnahme || '', i.material || '', i.naechste || '', i.behoben ? 1 : 0, i.behoben_datum || '', i.bemerkung || ''];
  if (i.id) {
    await run(`UPDATE inspections SET door_id=?, datum=?, pruefer=?, status=?, checklist=?, mangel=?, massnahme=?, material=?,
      naechste=?, behoben=?, behoben_datum=?, bemerkung=? WHERE id=?`, [...vals, i.id]);
    return i.id;
  }
  const r = await run(`INSERT INTO inspections(door_id, datum, pruefer, status, checklist, mangel, massnahme, material, naechste,
    behoben, behoben_datum, bemerkung, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`, [...vals, now()]);
  return r.lastId;
}

export async function deleteInspection(id) {
  const photos = await all('SELECT path FROM photos WHERE inspection_id = ?', [id]);
  await batch([
    { sql: 'DELETE FROM photos WHERE inspection_id = ?', params: [id] },
    { sql: 'DELETE FROM inspections WHERE id = ?', params: [id] },
  ]);
  return photos.map((p) => p.path);
}

export async function markFixed(ids, datum) {
  await batch(ids.map((id) => ({ sql: 'UPDATE inspections SET behoben = 1, behoben_datum = ? WHERE id = ?', params: [datum, id] })));
}

// ---------- Übersichten ----------
const INSP_JOIN = `
  SELECT i.*, d.position, d.geschoss, d.raum, d.typ, o.name AS objekt, o.id AS object_id
  FROM inspections i JOIN doors d ON d.id = i.door_id JOIN objects o ON o.id = d.object_id`;

export async function openDefects(objectId) {
  const rows = await all(`${INSP_JOIN} WHERE i.status != 'ok' AND i.behoben = 0 ${objectId ? 'AND o.id = ?' : ''}
    ORDER BY i.datum DESC, i.id DESC`, objectId ? [objectId] : []);
  return rows.map(parseInsp);
}

export async function orderList(objectId) {
  return (await openDefects(objectId)).filter((i) => i.massnahme === 'bestellen' || (i.material && i.material.trim()));
}

export async function allInspections(objectId) {
  const rows = await all(`${INSP_JOIN} ${objectId ? 'WHERE o.id = ?' : ''} ORDER BY o.name COLLATE NOCASE, i.door_id, i.datum DESC, i.id DESC`,
    objectId ? [objectId] : []);
  return rows.map(parseInsp);
}

export async function dueLists(today = isoDate()) {
  const doors = await listDoors();
  const soon = addDays(today, 30);
  return {
    doors,
    ueberfaellig: doors.filter((d) => d.naechste && d.naechste < today).sort((a, b) => a.naechste.localeCompare(b.naechste)),
    bald: doors.filter((d) => d.naechste && d.naechste >= today && d.naechste <= soon).sort((a, b) => a.naechste.localeCompare(b.naechste)),
    nie: doors.filter((d) => !d.last_id),
  };
}

// ---------- Fotos ----------
export const listPhotos = (inspectionId) => all('SELECT * FROM photos WHERE inspection_id = ? ORDER BY id', [inspectionId]);
export const addPhoto = (inspectionId, path) =>
  run('INSERT INTO photos(inspection_id, path, created_at) VALUES (?,?,?)', [inspectionId, path, now()]);
export const deletePhoto = (id) => run('DELETE FROM photos WHERE id = ?', [id]);
export const allPhotos = () => all('SELECT * FROM photos ORDER BY id');

// ---------- Rohdaten für Backup ----------
export async function dumpAll() {
  return {
    objects: await all('SELECT * FROM objects ORDER BY id'),
    doors: await all('SELECT * FROM doors ORDER BY id'),
    inspections: await all('SELECT * FROM inspections ORDER BY id'),
    photos: await all('SELECT * FROM photos ORDER BY id'),
    settings: await all('SELECT * FROM settings'),
  };
}

const COLS = {
  objects: ['id', 'kuerzel', 'name', 'kunde', 'adresse', 'notiz', 'created_at'],
  doors: ['id', 'object_id', 'position', 'geschoss', 'raum', 'typ', 'hersteller', 'zweifluegelig', 'feststellanlage', 'intervall', 'notiz', 'created_at'],
  inspections: ['id', 'door_id', 'datum', 'pruefer', 'status', 'checklist', 'mangel', 'massnahme', 'material', 'naechste', 'behoben', 'behoben_datum', 'bemerkung', 'created_at'],
  photos: ['id', 'inspection_id', 'path', 'created_at'],
  settings: ['key', 'value'],
};

/** Alle Daten ersetzen (Wiederherstellung). */
export async function replaceAll(data) {
  const list = Object.keys(COLS).map((t) => ({ sql: `DELETE FROM ${t}` }));
  for (const [table, cols] of Object.entries(COLS)) {
    for (const row of data[table] || []) {
      const vals = cols.map((c) => {
        const v = row[c];
        if (v === undefined || v === null) return c === 'id' || c === 'object_id' || c === 'inspection_id' ? null : '';
        if (typeof v === 'object') return JSON.stringify(v);
        return v;
      });
      list.push({ sql: `INSERT INTO ${table}(${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`, params: vals });
    }
  }
  await batch(list);
}

/** Konvertierte Altdaten hinzufügen (vorhandene Tür-IDs werden übersprungen). */
export async function importLegacy({ objects, doors, inspections }) {
  const existing = new Set(await allDoorIds());
  const newDoors = doors.filter((d) => !existing.has(d.id));
  const newIds = new Set(newDoors.map((d) => d.id));
  const usedKuerzel = new Set(newDoors.map((d) => d.kuerzel));
  const list = [];
  const newObjects = objects.filter((x) => usedKuerzel.has(x.kuerzel));
  for (const o of newObjects) {
    list.push({ sql: 'INSERT INTO objects(kuerzel, name, kunde, adresse, notiz, created_at) VALUES (?,?,?,?,?,?)',
      params: [o.kuerzel, o.name, o.kunde, o.adresse, o.notiz, now()] });
  }
  for (const d of newDoors) {
    list.push({ sql: `INSERT INTO doors(id, object_id, position, geschoss, raum, typ, hersteller, zweifluegelig, feststellanlage, intervall, notiz, created_at)
      VALUES (?, (SELECT id FROM objects WHERE kuerzel = ?), ?,?,?,?,?,?,?,?,?,?)`,
      params: [d.id, d.kuerzel, d.position, d.geschoss, d.raum, d.typ, d.hersteller, d.zweifluegelig, d.feststellanlage, d.intervall, d.notiz, now()] });
  }
  const newInsp = inspections.filter((i) => newIds.has(i.door_id));
  for (const i of newInsp) {
    list.push({ sql: `INSERT INTO inspections(door_id, datum, pruefer, status, checklist, mangel, massnahme, material, naechste, behoben, behoben_datum, bemerkung, created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      params: [i.door_id, i.datum, i.pruefer, i.status, JSON.stringify(i.checklist), i.mangel, i.massnahme, i.material, i.naechste, i.behoben, i.behoben_datum, i.bemerkung, now()] });
  }
  await batch(list);
  return { objekte: newObjects.length, tueren: newDoors.length, pruefungen: newInsp.length, uebersprungen: doors.length - newDoors.length };
}
