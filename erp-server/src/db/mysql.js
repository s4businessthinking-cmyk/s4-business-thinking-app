import mysql from "mysql2/promise";

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS documents (
    collection VARCHAR(64) NOT NULL,
    id VARCHAR(191) NOT NULL,
    shop_id VARCHAR(191) NULL,
    data LONGTEXT NOT NULL,
    version BIGINT NOT NULL,
    created_at VARCHAR(32) NOT NULL,
    updated_at VARCHAR(32) NOT NULL,
    PRIMARY KEY (collection, id),
    KEY idx_documents_shop (collection, shop_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin`,
  `CREATE TABLE IF NOT EXISTS accounts (
    uid VARCHAR(128) NOT NULL PRIMARY KEY,
    email VARCHAR(191) NULL UNIQUE,
    password_hash VARCHAR(255) NULL,
    firebase_hash VARCHAR(255) NULL,
    firebase_salt VARCHAR(255) NULL,
    disabled TINYINT NOT NULL DEFAULT 0,
    created_at VARCHAR(32) NOT NULL,
    updated_at VARCHAR(32) NOT NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin`,
  `CREATE TABLE IF NOT EXISTS sessions (
    id VARCHAR(64) NOT NULL PRIMARY KEY,
    uid VARCHAR(128) NOT NULL,
    token_hash VARCHAR(128) NOT NULL,
    expires_at VARCHAR(32) NOT NULL,
    created_at VARCHAR(32) NOT NULL,
    KEY idx_sessions_uid (uid)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin`,
];

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

const PUT_DOC = `
  INSERT INTO documents (collection, id, shop_id, data, version, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?)
  ON DUPLICATE KEY UPDATE shop_id = VALUES(shop_id), data = VALUES(data), version = VALUES(version), updated_at = VALUES(updated_at)
`;

export async function createMysqlDb(options) {
  const pool = mysql.createPool({
    ...options,
    connectionLimit: 6,
    charset: "utf8mb4",
    supportBigNumbers: true,
  });
  for (const sql of SCHEMA) await pool.query(sql);

  const one = async (sql, params) => (await pool.query(sql, params))[0][0] || null;

  return {
    driver: "mysql",
    async getDoc(collection, id) {
      return toDocRow(await one("SELECT * FROM documents WHERE collection = ? AND id = ?", [collection, id]));
    },
    async listDocs(collection, shopId) {
      const [rows] = shopId === undefined
        ? await pool.query("SELECT * FROM documents WHERE collection = ?", [collection])
        : await pool.query("SELECT * FROM documents WHERE collection = ? AND shop_id = ?", [collection, shopId]);
      return rows.map(toDocRow);
    },
    async tx(fn) {
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        const result = await fn({
          async putDoc(r) {
            await conn.query(PUT_DOC, [r.collection, r.id, r.shopId ?? null, JSON.stringify(r.data), r.version, r.createdAt, r.updatedAt]);
          },
          async deleteDoc(collection, id) {
            await conn.query("DELETE FROM documents WHERE collection = ? AND id = ?", [collection, id]);
          },
        });
        await conn.commit();
        return result;
      } catch (error) {
        await conn.rollback().catch(() => {});
        throw error;
      } finally {
        conn.release();
      }
    },
    async findAccountByEmail(email) {
      return toAccount(await one("SELECT * FROM accounts WHERE email = ?", [email]));
    },
    async findAccountByUid(uid) {
      return toAccount(await one("SELECT * FROM accounts WHERE uid = ?", [uid]));
    },
    async insertAccount(a) {
      await pool.query(
        "INSERT INTO accounts (uid, email, password_hash, firebase_hash, firebase_salt, disabled, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        [a.uid, a.email, a.passwordHash ?? null, a.firebaseHash ?? null, a.firebaseSalt ?? null, a.disabled ? 1 : 0, a.createdAt, a.updatedAt]
      );
    },
    async setPassword(uid, passwordHash, now) {
      await pool.query("UPDATE accounts SET password_hash = ?, firebase_hash = NULL, firebase_salt = NULL, updated_at = ? WHERE uid = ?", [passwordHash, now, uid]);
    },
    async insertSession(s) {
      await pool.query("INSERT INTO sessions (id, uid, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?)", [s.id, s.uid, s.tokenHash, s.expiresAt, s.createdAt]);
    },
    async getSession(id) {
      const row = await one("SELECT * FROM sessions WHERE id = ?", [id]);
      return row ? { id: row.id, uid: row.uid, tokenHash: row.token_hash, expiresAt: row.expires_at } : null;
    },
    async deleteSession(id) {
      await pool.query("DELETE FROM sessions WHERE id = ?", [id]);
    },
    async deleteSessionsForUid(uid) {
      await pool.query("DELETE FROM sessions WHERE uid = ?", [uid]);
    },
    async close() {
      await pool.end();
    },
  };
}
