export const U6DB = (() => {
  const DB_NAME = "u6viewer";
  const STORE_NAME = "files";
  let db = null;

  async function open() {
    if (db) return db;
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = (event) => {
        event.target.result.createObjectStore(STORE_NAME);
      };
      request.onsuccess = (event) => {
        db = event.target.result;
        resolve(db);
      };
      request.onerror = (e) => reject(e);
    });
  }

  async function set(filename, uint8array) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      store.put(uint8array, filename.toLowerCase());
      tx.oncomplete = () => resolve();
      tx.onerror = (e) => reject(e);
    });
  }

  async function get(filename) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(filename.toLowerCase());
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = (e) => reject(e);
    });
  }

  async function clear() {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const req = store.clear();
      req.onsuccess = () => resolve();
      req.onerror = (e) => reject(e);
    });
  }

  return { set, get, clear };
})();
