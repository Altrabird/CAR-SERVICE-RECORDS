// SQLite (official WASM build) persisted to the Origin Private File System.
// opfs-sahpool needs no COOP/COEP headers, so it works on any static host (GitHub Pages etc.).
import sqlite3InitModule from './vendor/sqlite/sqlite3.mjs';

const SCHEMA = `
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS cars (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, plate TEXT, make TEXT, model TEXT, year INTEGER,
  odometer INTEGER, odometer_date TEXT);
CREATE TABLE IF NOT EXISTS records (
  id TEXT PRIMARY KEY, car_id TEXT NOT NULL REFERENCES cars(id) ON DELETE CASCADE,
  date TEXT NOT NULL, odometer INTEGER, workshop TEXT, location TEXT, notes TEXT);
CREATE TABLE IF NOT EXISTS items (
  record_id TEXT NOT NULL REFERENCES records(id) ON DELETE CASCADE,
  pos INTEGER NOT NULL, type TEXT NOT NULL, note TEXT, cost REAL);
CREATE TABLE IF NOT EXISTS photos (
  record_id TEXT NOT NULL REFERENCES records(id) ON DELETE CASCADE,
  pos INTEGER NOT NULL, mime TEXT, data BLOB NOT NULL);
CREATE INDEX IF NOT EXISTS records_car ON records(car_id, date);
CREATE INDEX IF NOT EXISTS items_record ON items(record_id);
CREATE INDEX IF NOT EXISTS photos_record ON photos(record_id);`;

const FILE = '/car-service.sqlite3';
const ready = (async () => {
  const sqlite3 = await sqlite3InitModule();
  const pool = await sqlite3.installOpfsSAHPoolVfs({ name: 'car-service' });
  const db = new pool.OpfsSAHPoolDb(FILE);
  db.exec(SCHEMA);
  return { db, pool };
})();

const rows = (db, sql, bind) => db.exec({ sql, bind, rowMode: 'object', returnValue: 'resultRows' });

self.onmessage = async ({ data: { id, op, sql, bind, statements } }) => {
  try {
    const { db, pool } = await ready;
    let result;
    if (op === 'query') result = rows(db, sql, bind);
    else if (op === 'tx') db.transaction(() => statements.forEach(([s, b]) => db.exec({ sql: s, bind: b })));
    else if (op === 'export') result = pool.exportFile(FILE);
    self.postMessage({ id, result });
  } catch (err) {
    self.postMessage({ id, error: err.message || String(err) });
  }
};
