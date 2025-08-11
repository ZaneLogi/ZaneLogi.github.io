const JSZip = window.JSZip;
if (!JSZip) throw new Error('JSZip not loaded');

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

  async function storeZipFile(zipFile) {
    const arrayBuffer = await zipFile.arrayBuffer();
    const zip = await JSZip.loadAsync(arrayBuffer);

    const db = await open();

    // Open DB and start one transaction for all files
    return new Promise(async (resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);

      for (const name in zip.files) {
        const entry = zip.files[name];
        if (entry.dir) continue;

        const fileData = await entry.async("uint8array");
        store.put(fileData, name.toLowerCase());
      }

      tx.oncomplete = () => resolve();
      tx.onerror = (e) => reject(e);
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

  return { set, get, clear, storeZipFile, remove };
})();
