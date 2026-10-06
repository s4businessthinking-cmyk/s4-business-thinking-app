import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const SCHEMA = `
  PRAGMA journal_mode = WAL;
  PRAGMA synchronous = NORMAL;
  CREATE TABLE IF NOT EXISTS documents (
    collection TEXT NOT NULL,
    id TEXT NOT NULL,
    shop_id TEXT,
    data TEXT NOT NULL,
    version INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (collection, id)
  );
  CREATE INDEX IF NOT EXISTS idx_documents_shop ON documents (collection, shop_id);
  CREATE TABLE IF NOT EXISTS accounts (
    uid TEXT PRIMARY KEY,
    email TEXT UNIQUE,
    password_hash TEXT,
    firebase_hash TEXT,
    firebase_salt TEXT,
    disabled INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    uid TEXT NOT NULL,
    token_hash TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_sessions_uid ON sessions (uid);
`;

function toDocRow(row) {
  if (!row) return null;
  return {
    collection: row.collection,
    id: row.id,
    shopId: row.shop_id,
    data: JSON.parse(row.data),
    version: Number(row.version),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toAccount(row) {
  if (!row) return null;
  return {
    uid: row.uid,
    email: row.email,
    passwordHash: row.password_hash,
    firebaseHash: row.firebase_hash,
    firebaseSalt: row.firebase_salt,
    disabled: !!row.disabled,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function createSqliteDb(file) {
  if (file !== ":memory:") fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec(SCHEMA);

  const st = {
    getDoc: db.prepare("SELECT * FROM documents WHERE collection = ? AND id = ?"),
    listByShop: db.prepare("SELECT * FROM documents WHERE collection = ? AND shop_id = ?"),
    listAll: db.prepare("SELECT * FROM documents WHERE collection = ?"),
    putDoc: db.prepare(`
      INSERT INTO documents (collection, id, shop_id, data, version, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (collection, id) DO UPDATE SET
        shop_id = excluded.shop_id, data = excluded.data, version = excluded.version, updated_at = excluded.updated_at
    `),
    deleteDoc: db.prepare("DELETE FROM documents WHERE collection = ? AND id = ?"),
    accountByEmail: db.prepare("SELECT * FROM accounts WHERE email = ?"),
    accountByUid: db.prepare("SELECT * FROM accounts WHERE uid = ?"),
    insertAccount: db.prepare(`
      INSERT INTO accounts (uid, email, password_hash, firebase_hash, firebase_salt, disabled, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `),
    setPassword: db.prepare("UPDATE accounts SET password_hash = ?, firebase_hash = NULL, firebase_salt = NULL, updated_at = ? WHERE uid = ?"),
    insertSession: db.prepare("INSERT INTO sessions (id, uid, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?)"),
    getSession: db.prepare("SELECT * FROM sessions WHERE id = ?"),
    deleteSession: db.prepare("DELETE FROM sessions WHERE id = ?"),
    deleteSessionsForUid: db.prepare("DELETE FROM sessions WHERE uid = ?"),
  };

  const writer = {
    async putDoc(r) {
      st.putDoc.run(r.collection, r.id, r.shopId ?? null, JSON.stringify(r.data), r.version, r.createdAt, r.updatedAt);
    },
    async putDocs(rows) {
      for (const r of rows) await writer.putDoc(r);
    },
    async deleteDoc(collection, id) {
      st.deleteDoc.run(collection, id);
    },
  };

  return {
    driver: "sqlite",
    async getDoc(collection, id) {
      return toDocRow(st.getDoc.get(collection, id));
    },
    async getDocs(collection, ids) {
      return ids.map((id) => toDocRow(st.getDoc.get(collection, id))).filter(Boolean);
    },
    async listDocs(collection, shopId) {
      const rows = shopId === undefined ? st.listAll.all(collection) : st.listByShop.all(collection, shopId);
      return rows.map(toDocRow);
    },
    async tx(fn) {
      db.exec("BEGIN");
      try {
        const result = await fn(writer);
        db.exec("COMMIT");
        return result;
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
    },
    async findAccountByEmail(email) {
      return toAccount(st.accountByEmail.get(email));
    },
    async findAccountByUid(uid) {
      return toAccount(st.accountByUid.get(uid));
    },
    async insertAccount(a) {
      st.insertAccount.run(a.uid, a.email, a.passwordHash ?? null, a.firebaseHash ?? null, a.firebaseSalt ?? null, a.disabled ? 1 : 0, a.createdAt, a.updatedAt);
    },
    async setPassword(uid, passwordHash, now) {
      st.setPassword.run(passwordHash, now, uid);
    },
    async insertSession(s) {
      st.insertSession.run(s.id, s.uid, s.tokenHash, s.expiresAt, s.createdAt);
    },
    async getSession(id) {
      const row = st.getSession.get(id);
      return row ? { id: row.id, uid: row.uid, tokenHash: row.token_hash, expiresAt: row.expires_at } : null;
    },
    async deleteSession(id) {
      st.deleteSession.run(id);
    },
    async deleteSessionsForUid(uid) {
      st.deleteSessionsForUid.run(uid);
    },
    async close() {
      db.close();
    },
  };
}
