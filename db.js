// Main-thread API over the SQLite worker. Records come back in the shape the views use:
// { id, carId, date, odometer, workshop, location, notes, items: [{type, note, cost}], photoCount }.
const worker = new Worker(new URL('./db-worker.js', import.meta.url), { type: 'module' });
const pending = new Map();
let seq = 0;
worker.onmessage = ({ data: { id, result, error } }) => {
  const p = pending.get(id);
  pending.delete(id);
  error ? p.reject(new Error(error)) : p.resolve(result);
};
worker.onerror = e => { for (const p of pending.values()) p.reject(new Error(e.message || 'Database worker failed')); pending.clear(); };
const call = msg => new Promise((resolve, reject) => { const id = ++seq; pending.set(id, { resolve, reject }); worker.postMessage({ id, ...msg }); });

export const query = (sql, bind) => call({ op: 'query', sql, bind });
const tx = statements => call({ op: 'tx', statements });
const n = v => v === '' || v === undefined || v === null || isNaN(+v) ? null : +v;

export const cars = () => query(`SELECT id, name, plate, make, model, year, odometer, odometer_date AS odometerDate FROM cars ORDER BY name COLLATE NOCASE`);

export async function records() {
  const [recs, items] = await Promise.all([
    query(`SELECT r.id, r.car_id AS carId, r.date, r.odometer, r.workshop, r.location, r.notes,
             (SELECT count(*) FROM photos p WHERE p.record_id = r.id) AS photoCount
           FROM records r ORDER BY r.date DESC`),
    query('SELECT record_id AS recordId, type, note, cost FROM items ORDER BY record_id, pos'),
  ]);
  const byRecord = {};
  for (const { recordId, ...it } of items) (byRecord[recordId] ||= []).push(it);
  return recs.map(r => ({ ...r, items: byRecord[r.id] || [] }));
}

export const photos = async recordId =>
  (await query('SELECT mime, data FROM photos WHERE record_id = ? ORDER BY pos', [recordId])).map(p => new Blob([p.data], { type: p.mime }));

export const saveCar = c => tx([[
  `INSERT INTO cars (id, name, plate, make, model, year, odometer, odometer_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
   ON CONFLICT(id) DO UPDATE SET name = excluded.name, plate = excluded.plate, make = excluded.make, model = excluded.model,
     year = excluded.year, odometer = excluded.odometer, odometer_date = excluded.odometer_date`,
  [c.id, c.name, c.plate || null, c.make || null, c.model || null, n(c.year), n(c.odometer), c.odometerDate || null]]]);

// Upsert (not INSERT OR REPLACE): REPLACE deletes the row first, which would cascade-delete its items/photos.
export async function saveRecord(r, photoBlobs) {
  const pics = await Promise.all(photoBlobs.map(async b => [b.type || 'image/jpeg', new Uint8Array(await b.arrayBuffer())]));
  return tx([
    [`INSERT INTO records (id, car_id, date, odometer, workshop, location, notes) VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET car_id = excluded.car_id, date = excluded.date, odometer = excluded.odometer,
        workshop = excluded.workshop, location = excluded.location, notes = excluded.notes`,
     [r.id, r.carId, r.date, n(r.odometer), r.workshop || null, r.location || null, r.notes || null]],
    ['DELETE FROM items WHERE record_id = ?', [r.id]],
    ...r.items.map((it, i) => ['INSERT INTO items (record_id, pos, type, note, cost) VALUES (?, ?, ?, ?, ?)', [r.id, i, it.type, it.note || null, n(it.cost)]]),
    ['DELETE FROM photos WHERE record_id = ?', [r.id]],
    ...pics.map(([mime, data], i) => ['INSERT INTO photos (record_id, pos, mime, data) VALUES (?, ?, ?, ?)', [r.id, i, mime, data]]),
  ]);
}

export const deleteCar = id => tx([['DELETE FROM cars WHERE id = ?', [id]]]);
export const deleteRecord = id => tx([['DELETE FROM records WHERE id = ?', [id]]]);
export const exportFile = () => call({ op: 'export' });
