import {
  bootOfflineSqlite,
  executeSql,
  persistOfflineDb,
  queryRows,
} from "../offline/sqliteDb";

function nowIso() {
  return new Date().toISOString();
}

function createId() {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }

  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, "0"));
  return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex
    .slice(6, 8)
    .join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10).join("")}`;
}

function safeParseJson(value, fallback) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function rowToSession(row) {
  if (!row) return null;

  const session = safeParseJson(row.session_json, {});

  return {
    id: row.id,
    userId: row.user_id,
    email: row.email || "",
    displayName: row.display_name || "",
    role: row.role || "",
    permissions: safeParseJson(row.permissions_json, null),
    session,
    loginMethod: session.loginMethod || "local",
    expiresAt: row.expires_at || session.expiresAt || null,
    isActive: Number(row.is_active || 0) === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function createOfflineSession({
  userId,
  email = "",
  displayName = "",
  role,
  permissions = null,
  session = {},
  expiresAt = null,
} = {}) {
  if (!userId) throw new Error("userId is required to create an offline session.");
  if (!role) throw new Error("role is required to create an offline session.");

  await bootOfflineSqlite();

  const id = createId();
  const now = nowIso();
  const sessionJson = JSON.stringify({
    loginMethod: "local",
    ...session,
    createdAt: session.createdAt || now,
    expiresAt,
  });

  executeSql(
    `UPDATE offline_sessions
     SET is_active = 0, updated_at = ?
     WHERE is_active = 1`,
    [now]
  );

  executeSql(
    `INSERT INTO offline_sessions
      (id, user_id, email, display_name, role, permissions_json, session_json, is_active, expires_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`,
    [
      id,
      userId,
      email,
      displayName,
      role,
      permissions ? JSON.stringify(permissions) : null,
      sessionJson,
      expiresAt,
      now,
      now,
    ]
  );

  await persistOfflineDb();
  return getActiveOfflineSession();
}

export async function getActiveOfflineSession() {
  await bootOfflineSqlite();

  const rows = queryRows(
    `SELECT *
     FROM offline_sessions
     WHERE is_active = 1
     ORDER BY updated_at DESC
     LIMIT 1`
  );

  const session = rowToSession(rows?.[0]);
  if (!session) return null;

  if (session.expiresAt && new Date(session.expiresAt).getTime() <= Date.now()) {
    await clearOfflineSessions();
    return null;
  }

  return session;
}

export async function clearOfflineSessions(userId = null) {
  await bootOfflineSqlite();

  const now = nowIso();
  if (userId) {
    executeSql(
      `UPDATE offline_sessions
       SET is_active = 0, updated_at = ?
       WHERE user_id = ?`,
      [now, userId]
    );
  } else {
    executeSql(
      `UPDATE offline_sessions
       SET is_active = 0, updated_at = ?
       WHERE is_active = 1`,
      [now]
    );
  }

  await persistOfflineDb();
  return { ok: true };
}
