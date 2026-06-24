import initSqlJs from "sql.js";
import { v4 as uuidv4 } from "uuid";

const DB_NAME = "s4_business_thinking_offline_sqlite_v1";
const DB_STORE = "sqlite";
const DB_KEY = "main_db";

let SQL = null;
let db = null;
let bootPromise = null;

function getWasmPath() {
  const base = import.meta?.env?.BASE_URL || "./";
  return `${base}sql-wasm.wasm`;
}

function openIndexedDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);

    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(DB_STORE)) {
        database.createObjectStore(DB_STORE);
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function readDbBytes() {
  const database = await openIndexedDb();

  return new Promise((resolve, reject) => {
    const tx = database.transaction(DB_STORE, "readonly");
    const store = tx.objectStore(DB_STORE);
    const req = store.get(DB_KEY);

    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

async function writeDbBytes(bytes) {
  const database = await openIndexedDb();

  return new Promise((resolve, reject) => {
    const tx = database.transaction(DB_STORE, "readwrite");
    const store = tx.objectStore(DB_STORE);
    const req = store.put(bytes, DB_KEY);

    req.onsuccess = () => resolve(true);
    req.onerror = () => reject(req.error);
  });
}

function exec(sql, params = []) {
  if (!db) throw new Error("Offline SQLite database is not ready.");

  const stmt = db.prepare(sql);
  try {
    stmt.bind(params);
    while (stmt.step()) {
      // execute all rows if any
    }
  } finally {
    stmt.free();
  }
}

function query(sql, params = []) {
  if (!db) throw new Error("Offline SQLite database is not ready.");

  const stmt = db.prepare(sql);
  const rows = [];

  try {
    stmt.bind(params);
    while (stmt.step()) {
      rows.push(stmt.getAsObject());
    }
  } finally {
    stmt.free();
  }

  return rows;
}

async function persist() {
  if (!db) return false;
  const bytes = db.export();
  await writeDbBytes(bytes);
  return true;
}

function initSchema() {
  db.run(`
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS app_meta (
      key TEXT PRIMARY KEY,
      value TEXT,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS local_records (
      id TEXT PRIMARY KEY,
      collection_name TEXT NOT NULL,
      document_id TEXT NOT NULL,
      data_json TEXT NOT NULL,
      deleted INTEGER NOT NULL DEFAULT 0,
      dirty INTEGER NOT NULL DEFAULT 1,
      version INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(collection_name, document_id)
    );

    CREATE TABLE IF NOT EXISTS sync_queue (
      id TEXT PRIMARY KEY,
      collection_name TEXT NOT NULL,
      document_id TEXT NOT NULL,
      operation TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'PENDING',
      retry_count INTEGER NOT NULL DEFAULT 0,
      last_error TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS offline_sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      email TEXT,
      display_name TEXT,
      role TEXT,
      permissions_json TEXT,
      session_json TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_local_records_collection
      ON local_records(collection_name);

    CREATE INDEX IF NOT EXISTS idx_local_records_dirty
      ON local_records(dirty);

    CREATE INDEX IF NOT EXISTS idx_sync_queue_status
      ON sync_queue(status);

    CREATE INDEX IF NOT EXISTS idx_sync_queue_collection_doc
      ON sync_queue(collection_name, document_id);
  `);
}

export async function bootOfflineSqlite() {
  if (bootPromise) return bootPromise;

  bootPromise = (async () => {
    SQL = await initSqlJs({
      locateFile: () => getWasmPath(),
    });

    const savedBytes = await readDbBytes();
    db = savedBytes ? new SQL.Database(new Uint8Array(savedBytes)) : new SQL.Database();

    initSchema();

    const now = new Date().toISOString();
    db.run(
      `INSERT OR REPLACE INTO app_meta (key, value, updated_at)
       VALUES ('offline_engine_status', 'READY', ?)`,
      [now]
    );

    await persist();

    return {
      ok: true,
      engine: "SQLite",
      mode: "offline-primary-ready",
      database: DB_NAME,
    };
  })();

  return bootPromise;
}

export async function saveLocalRecord(collectionName, documentId, data) {
  await bootOfflineSqlite();

  const now = new Date().toISOString();
  const id = `${collectionName}:${documentId}`;
  const dataJson = JSON.stringify(data || {});

  db.run(
    `INSERT INTO local_records
      (id, collection_name, document_id, data_json, deleted, dirty, version, created_at, updated_at)
     VALUES (?, ?, ?, ?, 0, 1, 1, ?, ?)
     ON CONFLICT(collection_name, document_id)
     DO UPDATE SET
      data_json = excluded.data_json,
      deleted = 0,
      dirty = 1,
      version = local_records.version + 1,
      updated_at = excluded.updated_at`,
    [id, collectionName, documentId, dataJson, now, now]
  );

  await persist();

  return { ok: true, id, collectionName, documentId };
}

export async function deleteLocalRecord(collectionName, documentId) {
  await bootOfflineSqlite();

  const now = new Date().toISOString();
  const id = `${collectionName}:${documentId}`;

  db.run(
    `UPDATE local_records
     SET deleted = 1, dirty = 1, updated_at = ?
     WHERE collection_name = ? AND document_id = ?`,
    [now, collectionName, documentId]
  );

  await persist();

  return { ok: true, id, collectionName, documentId };
}

export async function getLocalRecords(collectionName) {
  await bootOfflineSqlite();

  const rows = query(
    `SELECT *
     FROM local_records
     WHERE collection_name = ? AND deleted = 0
     ORDER BY updated_at DESC`,
    [collectionName]
  );

  return rows.map((row) => ({
    ...row,
    data: JSON.parse(row.data_json || "{}"),
  }));
}

export async function enqueueSync(collectionName, documentId, operation, payload) {
  await bootOfflineSqlite();

  const now = new Date().toISOString();
  const id = uuidv4();

  db.run(
    `INSERT INTO sync_queue
      (id, collection_name, document_id, operation, payload_json, status, retry_count, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'PENDING', 0, ?, ?)`,
    [
      id,
      collectionName,
      documentId,
      operation,
      JSON.stringify(payload || {}),
      now,
      now,
    ]
  );

  await persist();

  return { ok: true, queueId: id };
}

export async function getPendingSyncQueue() {
  await bootOfflineSqlite();

  const rows = query(
    `SELECT *
     FROM sync_queue
     WHERE status = 'PENDING'
     ORDER BY created_at ASC`
  );

  return rows.map((row) => ({
    ...row,
    payload: JSON.parse(row.payload_json || "{}"),
  }));
}

export async function markSyncDone(queueId) {
  await bootOfflineSqlite();

  const now = new Date().toISOString();

  db.run(
    `UPDATE sync_queue
     SET status = 'DONE', updated_at = ?
     WHERE id = ?`,
    [now, queueId]
  );

  await persist();

  return { ok: true };
}

export async function markSyncFailed(queueId, errorMessage) {
  await bootOfflineSqlite();

  const now = new Date().toISOString();

  db.run(
    `UPDATE sync_queue
     SET status = 'FAILED',
         retry_count = retry_count + 1,
         last_error = ?,
         updated_at = ?
     WHERE id = ?`,
    [String(errorMessage || "Unknown sync error"), now, queueId]
  );

  await persist();

  return { ok: true };
}

export async function getOfflineStatus() {
  await bootOfflineSqlite();

  const pending = query(
    `SELECT COUNT(*) AS count
     FROM sync_queue
     WHERE status = 'PENDING'`
  );

  const local = query(
    `SELECT COUNT(*) AS count
     FROM local_records
     WHERE deleted = 0`
  );

  return {
    ok: true,
    engine: "SQLite",
    pendingSync: Number(pending?.[0]?.count || 0),
    localRecords: Number(local?.[0]?.count || 0),
    online: navigator.onLine,
  };
}