import {
  bootOfflineSqlite,
  executeSql,
  persistOfflineDb,
  queryRows,
} from "../offline/sqliteDb";
import { createOfflineSession } from "./authSession";
import { hashPassword, verifyPassword } from "./passwordService";

const MAX_FAILED_LOGIN_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000;

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

function normalizeUsername(username) {
  return String(username || "").trim().toLowerCase();
}

function safeParseJson(value, fallback) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function rowToPublicUser(row) {
  if (!row) return null;

  return {
    id: row.id,
    username: row.username,
    role: row.role,
    personName: row.person_name || "",
    email: row.email || "",
    firebaseUid: row.firebase_uid || "",
    shopId: row.shop_id || "",
    permissions: safeParseJson(row.permissions_json, null),
    mustChangePassword: Number(row.must_change_password || 0) === 1,
    isEmergencyBootstrap: Number(row.is_emergency_bootstrap || 0) === 1,
    failedLoginCount: Number(row.failed_login_count || 0),
    lockedUntil: row.locked_until || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToPasswordRecord(row) {
  return {
    passwordHash: row.password_hash,
    passwordSalt: row.password_salt,
    passwordAlgo: row.password_algo,
    passwordIterations: Number(row.password_iterations || 0),
  };
}

async function getLocalUserCredentialRowByUsername(username) {
  await bootOfflineSqlite();

  const rows = queryRows(
    `SELECT *
     FROM local_users
     WHERE username = ?
     LIMIT 1`,
    [normalizeUsername(username)]
  );

  return rows?.[0] || null;
}

function isLocked(row) {
  if (!row?.locked_until) return false;
  return new Date(row.locked_until).getTime() > Date.now();
}

async function recordFailedLogin(row) {
  const now = nowIso();
  const failedCount = Number(row.failed_login_count || 0) + 1;
  const lockedUntil =
    failedCount >= MAX_FAILED_LOGIN_ATTEMPTS
      ? new Date(Date.now() + LOCKOUT_MS).toISOString()
      : null;

  executeSql(
    `UPDATE local_users
     SET failed_login_count = ?,
         locked_until = ?,
         updated_at = ?
     WHERE id = ?`,
    [failedCount, lockedUntil, now, row.id]
  );

  await persistOfflineDb();

  return {
    failedLoginCount: failedCount,
    lockedUntil,
  };
}

async function recordSuccessfulLogin(row) {
  const now = nowIso();
  executeSql(
    `UPDATE local_users
     SET failed_login_count = 0,
         locked_until = NULL,
         updated_at = ?
     WHERE id = ?`,
    [now, row.id]
  );

  await persistOfflineDb();
}

export async function createLocalUser({
  username,
  password,
  role,
  personName = "",
  email = "",
  firebaseUid = "",
  shopId = "",
  permissions = null,
  mustChangePassword = false,
  isEmergencyBootstrap = false,
} = {}) {
  const normalizedUsername = normalizeUsername(username);

  if (!normalizedUsername) throw new Error("Username is required.");
  if (!password) throw new Error("Password is required.");
  if (!role) throw new Error("Role is required.");

  await bootOfflineSqlite();

  const existing = await getLocalUserCredentialRowByUsername(normalizedUsername);
  if (existing) throw new Error("A local user with this username already exists.");

  const passwordRecord = await hashPassword(password);
  const id = createId();
  const now = nowIso();

  executeSql(
    `INSERT INTO local_users
      (id, username, password_hash, password_salt, password_algo, password_iterations,
       role, person_name, email, firebase_uid, shop_id, permissions_json,
       must_change_password, is_emergency_bootstrap, failed_login_count,
       locked_until, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, NULL, ?, ?)`,
    [
      id,
      normalizedUsername,
      passwordRecord.passwordHash,
      passwordRecord.passwordSalt,
      passwordRecord.passwordAlgo,
      passwordRecord.passwordIterations,
      role,
      personName,
      email,
      firebaseUid,
      shopId,
      permissions ? JSON.stringify(permissions) : null,
      mustChangePassword ? 1 : 0,
      isEmergencyBootstrap ? 1 : 0,
      now,
      now,
    ]
  );

  await persistOfflineDb();
  return getLocalUserById(id);
}

export async function getLocalUserById(id) {
  await bootOfflineSqlite();

  const rows = queryRows(
    `SELECT *
     FROM local_users
     WHERE id = ?
     LIMIT 1`,
    [id]
  );

  return rowToPublicUser(rows?.[0]);
}

export async function getLocalUserByUsername(username) {
  const row = await getLocalUserCredentialRowByUsername(username);
  return rowToPublicUser(row);
}

export async function getLocalUserByEmail(email) {
  await bootOfflineSqlite();

  const normalizedEmail = String(email || "").trim().toLowerCase();
  if (!normalizedEmail) return null;

  const rows = queryRows(
    `SELECT *
     FROM local_users
     WHERE LOWER(email) = ?
     LIMIT 1`,
    [normalizedEmail]
  );

  return rowToPublicUser(rows?.[0]);
}

export async function getLocalUserByFirebaseUid(firebaseUid) {
  await bootOfflineSqlite();

  const uid = String(firebaseUid || "").trim();
  if (!uid) return null;

  const rows = queryRows(
    `SELECT *
     FROM local_users
     WHERE firebase_uid = ?
     LIMIT 1`,
    [uid]
  );

  return rowToPublicUser(rows?.[0]);
}

export async function listLocalUsers() {
  await bootOfflineSqlite();

  const rows = queryRows(
    `SELECT *
     FROM local_users
     ORDER BY created_at ASC`
  );

  return rows.map(rowToPublicUser);
}

export async function countLocalUsers() {
  await bootOfflineSqlite();

  const rows = queryRows(`SELECT COUNT(*) AS count FROM local_users`);
  return Number(rows?.[0]?.count || 0);
}

export async function updateLocalUserPassword(
  userId,
  newPassword,
  { mustChangePassword = false, clearEmergencyBootstrap = false } = {}
) {
  if (!userId) throw new Error("userId is required.");
  if (!newPassword) throw new Error("newPassword is required.");

  await bootOfflineSqlite();

  const passwordRecord = await hashPassword(newPassword);
  const now = nowIso();

  executeSql(
    `UPDATE local_users
     SET password_hash = ?,
         password_salt = ?,
         password_algo = ?,
         password_iterations = ?,
         must_change_password = ?,
         is_emergency_bootstrap = CASE WHEN ? = 1 THEN 0 ELSE is_emergency_bootstrap END,
         failed_login_count = 0,
         locked_until = NULL,
         updated_at = ?
     WHERE id = ?`,
    [
      passwordRecord.passwordHash,
      passwordRecord.passwordSalt,
      passwordRecord.passwordAlgo,
      passwordRecord.passwordIterations,
      mustChangePassword ? 1 : 0,
      clearEmergencyBootstrap ? 1 : 0,
      now,
      userId,
    ]
  );

  await persistOfflineDb();
  return getLocalUserById(userId);
}

export async function verifyLocalUserPassword(
  username,
  password,
  { createSession = false, session = {} } = {}
) {
  const row = await getLocalUserCredentialRowByUsername(username);

  if (!row) {
    return { ok: false, reason: "USER_NOT_FOUND" };
  }

  if (isLocked(row)) {
    return {
      ok: false,
      reason: "LOCKED",
      lockedUntil: row.locked_until,
      user: rowToPublicUser(row),
    };
  }

  const verified = await verifyPassword(password, rowToPasswordRecord(row));

  if (!verified.ok) {
    const failed = await recordFailedLogin(row);
    return {
      ok: false,
      reason: failed.lockedUntil ? "LOCKED" : "INVALID_PASSWORD",
      failedLoginCount: failed.failedLoginCount,
      lockedUntil: failed.lockedUntil,
      user: rowToPublicUser({
        ...row,
        failed_login_count: failed.failedLoginCount,
        locked_until: failed.lockedUntil,
      }),
    };
  }

  await recordSuccessfulLogin(row);

  const user = rowToPublicUser({
    ...row,
    failed_login_count: 0,
    locked_until: null,
  });

  const offlineSession = createSession
    ? await createOfflineSession({
        userId: user.id,
        email: user.email,
        displayName: user.personName,
        role: user.role,
        permissions: user.permissions,
        session,
      })
    : null;

  return {
    ok: true,
    reason: "MATCH",
    user,
    session: offlineSession,
  };
}

export async function updateLocalUserProfile(userId, updates = {}) {
  if (!userId) throw new Error("userId is required.");

  await bootOfflineSqlite();

  const allowed = {
    username: "username",
    role: "role",
    personName: "person_name",
    email: "email",
    firebaseUid: "firebase_uid",
    shopId: "shop_id",
    permissions: "permissions_json",
    mustChangePassword: "must_change_password",
    isEmergencyBootstrap: "is_emergency_bootstrap",
  };

  const assignments = [];
  const values = [];

  for (const [key, column] of Object.entries(allowed)) {
    if (!(key in updates)) continue;

    assignments.push(`${column} = ?`);
    if (key === "username") values.push(normalizeUsername(updates[key]));
    else if (key === "permissions") values.push(updates[key] ? JSON.stringify(updates[key]) : null);
    else if (key === "mustChangePassword" || key === "isEmergencyBootstrap") values.push(updates[key] ? 1 : 0);
    else values.push(updates[key] || "");
  }

  if (assignments.length === 0) return getLocalUserById(userId);

  values.push(nowIso(), userId);
  executeSql(
    `UPDATE local_users
     SET ${assignments.join(", ")},
         updated_at = ?
     WHERE id = ?`,
    values
  );

  await persistOfflineDb();
  return getLocalUserById(userId);
}
