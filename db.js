// Minimal promise wrapper over IndexedDB (stores photos as Blobs, which localStorage can't hold).
const conn = new Promise((resolve, reject) => {
  const req = indexedDB.open('car-service-records', 1);
  req.onupgradeneeded = () => {
    req.result.createObjectStore('cars', { keyPath: 'id' });
    req.result.createObjectStore('records', { keyPath: 'id' });
  };
  req.onsuccess = () => resolve(req.result);
  req.onerror = () => reject(req.error);
});

function tx(store, mode, fn) {
  return conn.then(db => new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const req = fn(t.objectStore(store));
    t.oncomplete = () => resolve(req?.result);
    t.onerror = t.onabort = () => reject(t.error);
  }));
}

export const all = store => tx(store, 'readonly', s => s.getAll());
export const put = (store, value) => tx(store, 'readwrite', s => s.put(value));
export const del = (store, id) => tx(store, 'readwrite', s => s.delete(id));
