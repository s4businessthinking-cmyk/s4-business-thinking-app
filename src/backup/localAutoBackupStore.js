// Web/PWA: keeps recent gzip backups in IndexedDB when there is no desktop backup folder.
const DB_NAME = "s4-local-auto-backups";
const DB_VERSION = 1;
const STORE = "files";
const MAX_PER_SHOP = 8;

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: "id" });
        store.createIndex("shopAt", ["shopId", "at"], { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error("indexedDB open failed"));
  });
}

export async function saveWebAutoBackupBlob(shopId, fileName, bytes) {
  if (typeof indexedDB === "undefined") return { ok: false, reason: "NO_INDEXEDDB" };
  const db = await openDb();
  const at = new Date().toISOString();
  const id = `${shopId}::${fileName}`;
  await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.objectStore(STORE).put({ id, shopId: String(shopId || ""), fileName, bytes, at });
  });
  const store = db.transaction(STORE, "readonly").objectStore(STORE);
  const prefix = `${shopId}::`;
  const rows = await new Promise((resolve, reject) => {
    const out = [];
    const req = store.openCursor(IDBKeyRange.bound(prefix, `${prefix}\uffff`));
    req.onsuccess = () => {
      const cur = req.result;
      if (!cur) return resolve(out);
      out.push(cur.value);
      cur.continue();
    };
    req.onerror = () => reject(req.error);
  });
  rows.sort((a, b) => String(a.at).localeCompare(String(b.at)));
  const stale = rows.slice(0, Math.max(0, rows.length - MAX_PER_SHOP));
  if (stale.length) {
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      const store = tx.objectStore(STORE);
      for (const row of stale) store.delete(row.id);
    });
  }
  db.close();
  return { ok: true, at, savedTo: `indexeddb://${id}` };
}