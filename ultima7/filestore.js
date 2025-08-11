export const fileStore = (() => {
  const DB_NAME = "u7";
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

  async function set(fileList) {
    console.log(fileList);
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      for (const entry of fileList) {
        store.put(entry.uint8, entry.filename.toLowerCase());
      }
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

  async function remove(filename) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const req = store.delete(filename.toLowerCase());
      req.onsuccess = () => resolve();
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

  return { set, get, remove, clear };
})();
