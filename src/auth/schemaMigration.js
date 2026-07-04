export const LOCAL_AUTH_SCHEMA_VERSION = 2;

function nowIso() {
  return new Date().toISOString();
}

function readMeta(queryRows, key) {
  const rows = queryRows(
    `SELECT value
     FROM app_meta
     WHERE key = ?`,
    [key]
  );

  return rows?.[0]?.value || null;
}

function writeMeta(executeSql, key, value) {
  executeSql(
    `INSERT OR REPLACE INTO app_meta (key, value, updated_at)
     VALUES (?, ?, ?)`,
    [key, String(value), nowIso()]
  );
}

function tableColumns(queryRows, tableName) {
  return queryRows(`PRAGMA table_info(${tableName})`).map((row) => row.name);
}

function addColumnIfMissing(executeSql, existingColumns, tableName, columnName, definition) {
  if (existingColumns.includes(columnName)) return;

  executeSql(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
  existingColumns.push(columnName);
}

function migrateToLocalAuthV2({ executeSql, queryRows }) {
  executeSql(`
    CREATE TABLE IF NOT EXISTS local_users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL COLLATE NOCASE,
      password_hash TEXT NOT NULL,
      password_salt TEXT NOT NULL,
      password_algo TEXT NOT NULL DEFAULT 'pbkdf2-sha256',
      password_iterations INTEGER NOT NULL DEFAULT 150000,
      role TEXT NOT NULL,
      person_name TEXT,
      email TEXT,
      firebase_uid TEXT,
      shop_id TEXT,
      permissions_json TEXT,
      must_change_password INTEGER NOT NULL DEFAULT 0,
      is_emergency_bootstrap INTEGER NOT NULL DEFAULT 0,
      failed_login_count INTEGER NOT NULL DEFAULT 0,
      locked_until TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(username)
    )
  `);

  executeSql(`
    CREATE INDEX IF NOT EXISTS idx_local_users_username
      ON local_users(username)
  `);

  executeSql(`
    CREATE INDEX IF NOT EXISTS idx_local_users_firebase_uid
      ON local_users(firebase_uid)
  `);

  executeSql(`
    CREATE INDEX IF NOT EXISTS idx_local_users_shop_id
      ON local_users(shop_id)
  `);

  executeSql(`
    CREATE INDEX IF NOT EXISTS idx_offline_sessions_active
      ON offline_sessions(is_active)
  `);

  executeSql(`
    CREATE INDEX IF NOT EXISTS idx_offline_sessions_user_id
      ON offline_sessions(user_id)
  `);

  const sessionColumns = tableColumns(queryRows, "offline_sessions");
  addColumnIfMissing(
    executeSql,
    sessionColumns,
    "offline_sessions",
    "expires_at",
    "TEXT"
  );
}

export function migrateLocalAuthSchema({ executeSql, queryRows }) {
  const currentVersion = Number(readMeta(queryRows, "schema_version") || 1);

  if (currentVersion < 2) {
    migrateToLocalAuthV2({ executeSql, queryRows });
    writeMeta(executeSql, "schema_version", LOCAL_AUTH_SCHEMA_VERSION);
    return { ok: true, migrated: true, schemaVersion: LOCAL_AUTH_SCHEMA_VERSION };
  }

  if (currentVersion < LOCAL_AUTH_SCHEMA_VERSION) {
    writeMeta(executeSql, "schema_version", LOCAL_AUTH_SCHEMA_VERSION);
  }

  return {
    ok: true,
    migrated: false,
    schemaVersion: Math.max(currentVersion, LOCAL_AUTH_SCHEMA_VERSION),
  };
}
