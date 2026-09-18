// ============================================================
// 🩺 AUTH/FIRESTORE DIAGNOSTICS
// ------------------------------------------------------------
// When a Firestore read comes back "permission-denied" right after a
// successful Firebase Auth sign-in, the failure is happening somewhere
// between "we have a signed-in user" and "Firestore's security rules
// accepted the credential attached to the request". That gap has three
// distinct, independently-checkable causes:
//   1. The device's ID token really does belong to a different uid than
//      the one we're trying to read (stale/corrupted persisted session).
//   2. The device clock is skewed enough that the token looks
//      expired/not-yet-valid by the time it's used.
//   3. The token was minted for a different Firebase project (aud/iss
//      mismatch) — e.g. a leftover session from a different app/config.
// This module inspects the *actual* token Firestore would use and
// reports which (if any) of these is true, instead of guessing from the
// generic "permission-denied" error alone.
// ============================================================
import { firebaseConfig } from "../firebase-config";

const DEBUG_LOG_KEY = "s4-auth-debug-log-v1";
const DEBUG_LOG_MAX_ENTRIES = 20;
const CLOCK_SKEW_THRESHOLD_SECONDS = 300; // Google's own token leeway is ~5 min.

export function decodeJwtPayload(token) {
  try {
    const part = String(token || "").split(".")[1];
    if (!part) return null;
    const base64 = part.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
    const json =
      typeof atob === "function"
        ? decodeURIComponent(
            atob(padded)
              .split("")
              .map((c) => "%" + c.charCodeAt(0).toString(16).padStart(2, "0"))
              .join("")
          )
        : Buffer.from(padded, "base64").toString("utf8");
    return JSON.parse(json);
  } catch {
    return null;
  }
}

function formatDuration(totalSeconds) {
  const seconds = Math.abs(Math.round(totalSeconds));
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const parts = [];
  if (h) parts.push(`${h}h`);
  if (m) parts.push(`${m}m`);
  if (!h && s) parts.push(`${s}s`);
  return parts.join(" ") || "0s";
}

// Inspects the ID token Firestore would actually send for `auth.currentUser`
// right now, and compares it against what the login flow expected.
export async function computeAuthDiagnostics({ auth, expectedUid } = {}) {
  const timestamp = new Date().toISOString();
  const deviceNowSeconds = Math.floor(Date.now() / 1000);
  const user = auth?.currentUser || null;

  if (!user) {
    return {
      ok: false,
      timestamp,
      verdict: "NO_CURRENT_USER",
      expectedUid: expectedUid || null,
      deviceNowSeconds,
    };
  }

  let tokenResult;
  try {
    // Not forcing a refresh here on purpose: this reads whatever token
    // Firestore's credential provider is actually holding for this
    // request, rather than minting a brand new (always-valid) one that
    // would mask the real problem.
    tokenResult = await user.getIdTokenResult(false);
  } catch (tokenError) {
    return {
      ok: false,
      timestamp,
      verdict: "TOKEN_FETCH_FAILED",
      expectedUid: expectedUid || null,
      currentUserUid: user.uid,
      error: tokenError?.message || String(tokenError),
      deviceNowSeconds,
    };
  }

  const claims = tokenResult.claims || {};
  const decoded = decodeJwtPayload(tokenResult.token) || {};

  const iat = claims.iat ?? decoded.iat ?? null;
  const exp = claims.exp ?? decoded.exp ?? null;
  const aud = claims.aud ?? decoded.aud ?? null;
  const iss = claims.iss ?? decoded.iss ?? null;
  const sub = claims.sub ?? decoded.sub ?? claims.user_id ?? user.uid;

  const expectedAud = firebaseConfig.projectId;
  const expectedIss = `https://securetoken.google.com/${firebaseConfig.projectId}`;

  const clockSkewSeconds = iat != null ? deviceNowSeconds - iat : null;
  const uidMismatch = Boolean(
    expectedUid && (sub !== expectedUid || user.uid !== expectedUid)
  );
  const projectMismatch = aud != null && aud !== expectedAud;

  let verdict = "UNKNOWN";
  if (clockSkewSeconds != null && Math.abs(clockSkewSeconds) > CLOCK_SKEW_THRESHOLD_SECONDS) {
    verdict = "CLOCK_SKEW";
  } else if (uidMismatch) {
    verdict = "UID_MISMATCH";
  } else if (projectMismatch) {
    verdict = "PROJECT_MISMATCH";
  }

  return {
    ok: true,
    timestamp,
    verdict,
    expectedUid: expectedUid || null,
    currentUserUid: user.uid,
    tokenSubject: sub,
    tokenAud: aud,
    tokenIss: iss,
    expectedAud,
    expectedIss,
    tokenIssuedAtSeconds: iat,
    tokenExpiresAtSeconds: exp,
    deviceNowSeconds,
    clockSkewSeconds,
    uidMismatch,
    projectMismatch,
  };
}

export function summarizeDiagnostic(diagnostic) {
  if (!diagnostic) return "";
  if (!diagnostic.ok) {
    if (diagnostic.verdict === "NO_CURRENT_USER") return "no active auth session on device";
    if (diagnostic.verdict === "TOKEN_FETCH_FAILED") return "could not read ID token";
    return "diagnostics unavailable";
  }
  switch (diagnostic.verdict) {
    case "CLOCK_SKEW":
      return `device clock off by ~${formatDuration(diagnostic.clockSkewSeconds)} — fix date & time`;
    case "UID_MISMATCH":
      return "signed-in session belongs to a different account — cleared, please log in again";
    case "PROJECT_MISMATCH":
      return "token issued for a different Firebase project";
    default:
      return "uid/clock/project all check out — denial is coming from Firestore rules or the profile doc itself";
  }
}

function readDebugLog() {
  try {
    if (typeof localStorage === "undefined") return [];
    const raw = localStorage.getItem(DEBUG_LOG_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function logAuthDiagnostic(event, diagnostic) {
  console.error("[S4 Auth Diagnostics]", event, diagnostic);
  try {
    if (typeof localStorage === "undefined") return;
    const log = readDebugLog();
    log.push({ ts: new Date().toISOString(), event, diagnostic });
    while (log.length > DEBUG_LOG_MAX_ENTRIES) log.shift();
    localStorage.setItem(DEBUG_LOG_KEY, JSON.stringify(log));
  } catch (storageError) {
    console.warn("[S4 Auth Diagnostics] could not persist debug log", storageError);
  }
}

export function getAuthDebugLog() {
  return readDebugLog();
}

export function clearAuthDebugLog() {
  try {
    if (typeof localStorage !== "undefined") localStorage.removeItem(DEBUG_LOG_KEY);
  } catch {}
}

if (typeof window !== "undefined") {
  // Accessible from chrome://inspect devtools on the device, or the
  // Electron/desktop devtools console, without needing a dedicated UI
  // screen — handy since these failures happen before login, i.e.
  // before any in-app settings/debug screen is reachable.
  window.S4AuthDebug = {
    getLog: getAuthDebugLog,
    clearLog: clearAuthDebugLog,
  };
}
