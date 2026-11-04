// Datenbankschicht: auf Android SQLite über @capacitor-community/sqlite,
// im Browser (nur Entwicklung/Test) sql.js mit Speicherung in localStorage.
import { Capacitor } from '@capacitor/core';

const DB_NAME = 'brandschutz';
let impl = null;

const MIGRATIONS = [
  // Version 1
  `
  CREATE TABLE IF NOT EXISTS objects(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    kuerzel TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    kunde TEXT DEFAULT '',
    adresse TEXT DEFAULT '',
    notiz TEXT DEFAULT '',
    created_at TEXT
  );
  CREATE TABLE IF NOT EXISTS doors(
    id TEXT PRIMARY KEY,
    object_id INTEGER NOT NULL,
    position TEXT DEFAULT '',
    geschoss TEXT DEFAULT '',
    raum TEXT DEFAULT '',
    typ TEXT DEFAULT '',
    hersteller TEXT DEFAULT '',
    zweifluegelig INTEGER DEFAULT 0,
    feststellanlage INTEGER DEFAULT 0,
    intervall INTEGER DEFAULT 12,
    notiz TEXT DEFAULT '',
    created_at TEXT
  );
  CREATE TABLE IF NOT EXISTS inspections(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    door_id TEXT NOT NULL,
    datum TEXT NOT NULL,
    pruefer TEXT DEFAULT '',
    status TEXT NOT NULL,
    checklist TEXT DEFAULT '[]',
    mangel TEXT DEFAULT '',
    massnahme TEXT DEFAULT '',
    material TEXT DEFAULT '',
    naechste TEXT DEFAULT '',
    behoben INTEGER DEFAULT 0,
    behoben_datum TEXT DEFAULT '',
    bemerkung TEXT DEFAULT '',
    created_at TEXT
  );
  CREATE TABLE IF NOT EXISTS photos(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    inspection_id INTEGER NOT NULL,
    path TEXT NOT NULL,
    created_at TEXT
  );
  CREATE TABLE IF NOT EXISTS settings(
    key TEXT PRIMARY KEY,
    value TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_doors_object ON doors(object_id);
  CREATE INDEX IF NOT EXISTS idx_insp_door ON inspections(door_id, datum);
  CREATE INDEX IF NOT EXISTS idx_photos_insp ON photos(inspection_id);
  `,
];

// ---------- Native (Android) ----------
async function nativeImpl() {
  const { CapacitorSQLite, SQLiteConnection } = await import('@capacitor-community/sqlite');
  const sqlite = new SQLiteConnection(CapacitorSQLite);
  const consistent = (await sqlite.checkConnectionsConsistency()).result;
  const isConn = (await sqlite.isConnection(DB_NAME, false)).result;
  const db = consistent && isConn
    ? await sqlite.retrieveConnection(DB_NAME, false)
    : await sqlite.createConnection(DB_NAME, false, 'no-encryption', 1, false);
  await db.open();
  return {
    async all(sql, params = []) {
      const r = await db.query(sql, params);
      return r.values || [];
    },
    async run(sql, params = []) {
      const r = await db.run(sql, params, true);
      return { lastId: r.changes?.lastId, changes: r.changes?.changes };
    },
    async exec(sql) {
      await db.execute(sql, true);
    },
    async batch(list) {
      if (!list.length) return;
      await db.executeSet(list.map((s) => ({ statement: s.sql, values: s.params || [] })), true);
    },
  };
}

// ---------- Web (sql.js) ----------
async function webImpl() {
  const initSqlJs = (await import('sql.js/dist/sql-wasm.js')).default;
  const wasmUrl = (await import('sql.js/dist/sql-wasm.wasm?url')).default;
  const SQL = await initSqlJs({ locateFile: () => wasmUrl });
  const KEY = 'bs_app_sqlite';
  let db;
  try {
    const saved = localStorage.getItem(KEY);
    db = saved ? new SQL.Database(Uint8Array.from(atob(saved), (c) => c.charCodeAt(0))) : new SQL.Database();
  } catch (e) {
    db = new SQL.Database();
  }
  let timer = null;
  const persist = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      const bytes = db.export();
      let s = '';
      for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
      try { localStorage.setItem(KEY, btoa(s)); } catch (e) { console.warn('Speichern fehlgeschlagen', e); }
    }, 200);
  };
  const all = (sql, params = []) => {
    const st = db.prepare(sql);
    st.bind(params.map((p) => (p === undefined ? null : p)));
    const rows = [];
    while (st.step()) rows.push(st.getAsObject());
    st.free();
    return rows;
  };
  const run = (sql, params = []) => {
    db.run(sql, params.map((p) => (p === undefined ? null : p)));
    const lastId = db.exec('SELECT last_insert_rowid() AS id')[0].values[0][0];
    return { lastId, changes: db.getRowsModified() };
  };
  return {
    async all(sql, params) { return all(sql, params); },
    async run(sql, params) { const r = run(sql, params); persist(); return r; },
    async exec(sql) { db.exec(sql); persist(); },
    async batch(list) {
      db.exec('BEGIN');
      try {
        list.forEach((s) => run(s.sql, s.params || []));
        db.exec('COMMIT');
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      }
      persist();
    },
  };
}

export async function initDb() {
  impl = Capacitor.isNativePlatform() ? await nativeImpl() : await webImpl();
  const v = (await impl.all('PRAGMA user_version'))[0]?.user_version || 0;
  for (let i = v; i < MIGRATIONS.length; i++) {
    await impl.exec(MIGRATIONS[i]);
    await impl.exec(`PRAGMA user_version = ${i + 1}`);
  }
}

export const all = (sql, params) => impl.all(sql, params);
export const get = async (sql, params) => (await impl.all(sql, params))[0] || null;
export const run = (sql, params) => impl.run(sql, params);
export const batch = (list) => impl.batch(list);
