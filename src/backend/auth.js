// Firebase-Auth-compatible client for the S4 ERP server. Exposes the same
// function names/shapes the app already uses so call sites stay unchanged.
import { API_BASE } from "./config.js";

const SESSION_KEY = "s4-erp-session-v1";
const REFRESH_MARGIN_MS = 60 * 1000;

export class AuthError extends Error {
  constructor(code, message) {
    super(message || code);
    this.name = "FirebaseError";
    this.code = code;
  }
}

async function callAuth(path, body, idToken) {
  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}) },
      body: JSON.stringify(body || {}),
    });
  } catch {
    throw new AuthError("auth/network-request-failed", "Could not reach the S4 server.");
  }
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = String(json?.error?.message || "");
    const code = message.startsWith("auth/") ? message : `auth/${json?.error?.code || "internal-error"}`;
    throw new AuthError(code, message || code);
  }
  return json;
}

function decodeJwt(token) {
  try {
    const part = String(token || "").split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(decodeURIComponent(escape(atob(part + "=".repeat((4 - (part.length % 4)) % 4)))));
  } catch {
    return null;
  }
}

function toSession(res) {
  return {
    uid: res.uid,
    email: res.email,
    idToken: res.idToken,
    refreshToken: res.refreshToken,
    expiresAt: Date.now() + Number(res.expiresIn || 3600) * 1000,
  };
}

function loadStoredSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    const s = raw ? JSON.parse(raw) : null;
    return s?.uid && s?.refreshToken ? s : null;
  } catch {
    return null;
  }
}

function createAuth({ name, persist }) {
  const listeners = new Set();
  let session = persist ? loadStoredSession() : null;
  let refreshing = null;

  const auth = { name, app: { name }, currentUser: null };

  const store = () => {
    if (!persist) return;
    try {
      if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session));
      else localStorage.removeItem(SESSION_KEY);
    } catch {}
  };

  const notify = () => {
    for (const cb of [...listeners]) {
      try {
        cb(auth.currentUser);
      } catch (error) {
        console.error("[S4 Auth] listener failed", error);
      }
    }
  };

  async function refreshToken() {
    if (!session) throw new AuthError("auth/no-current-user", "Not signed in.");
    if (!refreshing) {
      const current = session;
      refreshing = callAuth("/v1/auth/refresh", { refreshToken: current.refreshToken })
        .then((res) => {
          if (session !== current) return;
          session = { ...toSession(res), refreshToken: current.refreshToken };
          store();
        })
        .catch((error) => {
          if (error.code !== "auth/network-request-failed" && session === current) setSession(null);
          throw error;
        })
        .finally(() => {
          refreshing = null;
        });
    }
    await refreshing;
    if (!session) throw new AuthError("auth/user-token-expired", "Session expired. Sign in again.");
    return session.idToken;
  }

  async function getIdToken(force = false) {
    if (!session) throw new AuthError("auth/no-current-user", "Not signed in.");
    if (!force && session.expiresAt - REFRESH_MARGIN_MS > Date.now()) return session.idToken;
    return refreshToken();
  }

  function makeUser(s) {
    return {
      uid: s.uid,
      email: s.email,
      emailVerified: true,
      isAnonymous: false,
      displayName: null,
      photoURL: null,
      phoneNumber: null,
      providerId: "s4",
      providerData: [{ providerId: "password", uid: s.email, email: s.email }],
      metadata: {},
      getIdToken,
      async getIdTokenResult(force = false) {
        const token = await getIdToken(force);
        const claims = decodeJwt(token) || {};
        return {
          token,
          claims,
          issuedAtTime: claims.iat ? new Date(claims.iat * 1000).toUTCString() : "",
          expirationTime: claims.exp ? new Date(claims.exp * 1000).toUTCString() : "",
          signInProvider: "password",
        };
      },
      async reload() {},
      toJSON() {
        return { uid: s.uid, email: s.email, emailVerified: true };
      },
    };
  }

  function setSession(next) {
    const prevUid = session?.uid || null;
    session = next;
    store();
    if ((next?.uid || null) !== prevUid) {
      auth.currentUser = next ? makeUser(next) : null;
      notify();
    }
  }

  auth.currentUser = session ? makeUser(session) : null;
  auth._getIdToken = getIdToken;
  auth._setSession = setSession;
  auth._session = () => session;
  auth.onAuthStateChanged = (cb, onError) => {
    const fn = typeof cb === "function" ? cb : (u) => cb?.next?.(u);
    listeners.add(fn);
    Promise.resolve().then(() => {
      if (listeners.has(fn)) fn(auth.currentUser);
    });
    return () => listeners.delete(fn);
  };
  auth.authStateReady = () => Promise.resolve();
  auth.signOut = () => signOut(auth);

  if (session && (typeof navigator === "undefined" || navigator.onLine)) {
    getIdToken(false).catch((error) => console.warn("[S4 Auth] session restore", error?.code || error));
  }
  return auth;
}

export const defaultAuth = createAuth({ name: "[DEFAULT]", persist: true });

// Separate in-memory instance so the owner can create staff accounts
// without replacing their own signed-in session.
const secondaryInstances = new Map();
export function getSecondaryAuth(name) {
  if (!secondaryInstances.has(name)) secondaryInstances.set(name, createAuth({ name, persist: false }));
  return secondaryInstances.get(name);
}

export function getAuth() {
  return defaultAuth;
}

const credential = (auth) => ({ user: auth.currentUser, providerId: "password", operationType: "signIn" });

export async function signInWithEmailAndPassword(auth, email, password) {
  const res = await callAuth("/v1/auth/login", { email, password });
  auth._setSession(toSession(res));
  return credential(auth);
}

/** Mails a sign-up code. `required: false` means the server has no email set up and sign-up needs no code. */
export async function requestSignupCode(email) {
  return callAuth("/v1/auth/signup-code", { email });
}

export async function createUserWithEmailAndPassword(auth, email, password, code = "", ownerIdToken = null) {
  const res = await callAuth("/v1/auth/signup", { email, password, code }, ownerIdToken);
  auth._setSession(toSession(res));
  return credential(auth);
}

export async function signOut(auth) {
  const session = auth._session();
  auth._setSession(null);
  if (session?.refreshToken) {
    callAuth("/v1/auth/logout", { refreshToken: session.refreshToken }).catch(() => {});
  }
}

export async function changePassword(auth, currentPassword, newPassword) {
  const token = await auth._getIdToken(false);
  const res = await callAuth("/v1/auth/change-password", { password: currentPassword, newPassword }, token);
  auth._setSession(toSession(res));
}

export function onAuthStateChanged(auth, cb, onError) {
  return auth.onAuthStateChanged(cb, onError);
}

export async function setPersistence() {}

export async function sendEmailVerification() {}

export async function sendPasswordResetEmail() {
  throw new AuthError(
    "auth/password-reset-unavailable",
    "Password reset by email is not available. Ask the shop owner or S4 support to reset it."
  );
}

export const browserLocalPersistence = { type: "LOCAL" };
