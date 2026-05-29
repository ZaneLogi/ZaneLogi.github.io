// Client-side store for user-supplied U6 data files (IndexedDB). This is the
// bring-your-own-data path: the user drops their own legally-owned U6 files, we
// keep them in the browser only. NOTHING is ever committed or served by the repo
// (see ../CLAUDE.md "Game-data legal pattern"). Copied-then-owned from
// ../ultima6/u6db.js; distinct DB name so it never collides with the legacy viewers.

export const U6DB = (() => {
  const DB_NAME = 'u6clone';
  const STORE = 'files';
  let db = null;

  function open() {
    if (db) return Promise.resolve(db);
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = (e) => e.target.result.createObjectStore(STORE);
      req.onsuccess = (e) => { db = e.target.result; resolve(db); };
      req.onerror = (e) => reject(e);
    });
  }

  async function set(filename, uint8array) {
    const d = await open();
    return new Promise((resolve, reject) => {
      const tx = d.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(uint8array, filename.toLowerCase());
      tx.oncomplete = () => resolve();
      tx.onerror = (e) => reject(e);
    });
  }

  async function get(filename) {
    const d = await open();
    return new Promise((resolve, reject) => {
      const tx = d.transaction(STORE, 'readonly');
      const r = tx.objectStore(STORE).get(filename.toLowerCase());
      r.onsuccess = () => resolve(r.result || null);
      r.onerror = (e) => reject(e);
    });
  }

  async function has(filename) { return (await get(filename)) != null; }

  async function clear() {
    const d = await open();
    return new Promise((resolve, reject) => {
      const tx = d.transaction(STORE, 'readwrite');
      const r = tx.objectStore(STORE).clear();
      r.onsuccess = () => resolve();
      r.onerror = (e) => reject(e);
    });
  }

  return { set, get, has, clear };
})();
