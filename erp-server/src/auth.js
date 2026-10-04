import crypto from "node:crypto";
import { promisify } from "node:util";
import { fail } from "./errors.js";

const scrypt = promisify(crypto.scrypt);
const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };

const b64url = (buf) => Buffer.from(buf).toString("base64url");
const sha256 = (s) => crypto.createHash("sha256").update(s).digest("hex");

export async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(password, salt, SCRYPT.keylen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p });
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${b64url(salt)}$${b64url(key)}`;
}

export async function verifyPassword(password, stored) {
  const parts = String(stored || "").split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, N, r, p, salt, hash] = parts;
  const expected = Buffer.from(hash, "base64url");
  const key = await scrypt(password, Buffer.from(salt, "base64url"), expected.length, { N: Number(N), r: Number(r), p: Number(p) });
  return crypto.timingSafeEqual(key, expected);
}

const PUSH_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
export function newUid() {
  const bytes = crypto.randomBytes(28);
  return Array.from(bytes, (b) => PUSH_CHARS[b % PUSH_CHARS.length]).join("");
}

export function createTokens(secret) {
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const sign = (data) => crypto.createHmac("sha256", secret).update(data).digest("base64url");

  return {
    signIdToken(claims, ttlSec) {
      const now = Math.floor(Date.now() / 1000);
      const body = b64url(JSON.stringify({ ...claims, iat: now, exp: now + ttlSec }));
      return `${header}.${body}.${sign(`${header}.${body}`)}`;
    },
    verifyIdToken(token) {
      const [h, body, sig] = String(token || "").split(".");
      if (!h || !body || !sig) return null;
      const expected = Buffer.from(sign(`${h}.${body}`));
      const given = Buffer.from(sig);
      if (expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) return null;
      try {
        const claims = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
        if (!claims.sub || !(claims.exp > Math.floor(Date.now() / 1000))) return null;
        return claims;
      } catch {
        return null;
      }
    },
  };
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function createAuthService({ db, cfg }) {
  const tokens = createTokens(cfg.jwtSecret);
  const attempts = new Map();

  const throttle = (key) => {
    const now = Date.now();
    const entry = attempts.get(key);
    if (!entry || now - entry.first > 15 * 60 * 1000) {
      attempts.set(key, { first: now, count: 1 });
      return;
    }
    entry.count += 1;
    if (entry.count > 10) fail("resource-exhausted", "auth/too-many-requests");
  };

  const issue = async (account) => {
    const now = new Date();
    const sessionId = crypto.randomBytes(16).toString("hex");
    const secret = crypto.randomBytes(32).toString("base64url");
    await db.insertSession({
      id: sessionId,
      uid: account.uid,
      tokenHash: sha256(secret),
      expiresAt: new Date(now.getTime() + cfg.refreshTokenTtlSec * 1000).toISOString(),
      createdAt: now.toISOString(),
    });
    return {
      uid: account.uid,
      email: account.email,
      idToken: tokens.signIdToken({ sub: account.uid, email: account.email }, cfg.idTokenTtlSec),
      expiresIn: cfg.idTokenTtlSec,
      refreshToken: `${sessionId}.${secret}`,
    };
  };

  const normEmail = (email) => String(email || "").trim().toLowerCase();

  return {
    verifyIdToken: tokens.verifyIdToken,

    async signUp({ email, password }, ip = "") {
      const e = normEmail(email);
      if (!EMAIL_RE.test(e)) fail("invalid-argument", "auth/invalid-email");
      if (String(password || "").length < 6) fail("invalid-argument", "auth/weak-password");
      throttle(`signup:${ip}`);
      if (await db.findAccountByEmail(e)) fail("already-exists", "auth/email-already-in-use");
      const now = new Date().toISOString();
      const account = { uid: newUid(), email: e, passwordHash: await hashPassword(password), createdAt: now, updatedAt: now };
      await db.insertAccount(account);
      return issue(account);
    },

    async signIn({ email, password }, ip = "") {
      const e = normEmail(email);
      throttle(`login:${ip}:${e}`);
      const account = await db.findAccountByEmail(e);
      const ok = account && !account.disabled && account.passwordHash && (await verifyPassword(String(password || ""), account.passwordHash));
      if (!ok) fail("unauthenticated", "auth/invalid-credential");
      attempts.delete(`login:${ip}:${e}`);
      return issue(account);
    },

    async refresh({ refreshToken }) {
      const [id, secret] = String(refreshToken || "").split(".");
      const session = id && secret ? await db.getSession(id) : null;
      if (!session || session.tokenHash !== sha256(secret) || session.expiresAt < new Date().toISOString()) {
        fail("unauthenticated", "auth/session-expired");
      }
      const account = await db.findAccountByUid(session.uid);
      if (!account || account.disabled) fail("unauthenticated", "auth/user-disabled");
      return {
        uid: account.uid,
        email: account.email,
        idToken: tokens.signIdToken({ sub: account.uid, email: account.email }, cfg.idTokenTtlSec),
        expiresIn: cfg.idTokenTtlSec,
        refreshToken,
      };
    },

    async signOut({ refreshToken }) {
      const [id] = String(refreshToken || "").split(".");
      if (id) await db.deleteSession(id);
      return { ok: true };
    },

    async changePassword(uid, { password, newPassword }) {
      const account = await db.findAccountByUid(uid);
      if (!account) fail("unauthenticated", "auth/user-not-found");
      if (!(await verifyPassword(String(password || ""), account.passwordHash))) fail("unauthenticated", "auth/wrong-password");
      if (String(newPassword || "").length < 6) fail("invalid-argument", "auth/weak-password");
      await db.setPassword(uid, await hashPassword(newPassword), new Date().toISOString());
      await db.deleteSessionsForUid(uid);
      return issue(account);
    },
  };
}
