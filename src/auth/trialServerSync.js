import { API_BASE } from "../backend/config.js";

const CACHE_SUCCESS_MS = 10 * 60 * 1000;
const CACHE_FAILURE_MS = 90 * 1000;

/** @type {Map<string, { at: number, response: object }>} */
const resolveCache = new Map();
/** @type {Map<string, Promise<object>>} */
const resolveInflight = new Map();

function cacheKey({ deviceId, deviceFingerprint, trialDays } = {}) {
  return `${String(deviceId || "")}|${String(deviceFingerprint || "")}|${Number(trialDays) || 15}`;
}

export function clearTrialServerResolveCache() {
  resolveCache.clear();
  resolveInflight.clear();
}

async function fetchTrialResolve({ deviceId, deviceFingerprint, trialDays = 15 } = {}) {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return { ok: false, skipped: true, reason: "OFFLINE" };
  }

  try {
    const res = await fetch(`${API_BASE}/v1/trial/resolve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deviceId, deviceFingerprint, trialDays }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json?.ok) {
      return {
        ok: false,
        skipped: true,
        reason: json?.reason || json?.error?.code || `HTTP_${res.status}`,
      };
    }
    return json;
  } catch (error) {
    return {
      ok: false,
      skipped: true,
      reason: error?.message || String(error),
    };
  }
}

export async function resolveTrialOnServer({ deviceId, deviceFingerprint, trialDays = 15, force = false } = {}) {
  const key = cacheKey({ deviceId, deviceFingerprint, trialDays });
  const now = Date.now();

  if (!force) {
    const hit = resolveCache.get(key);
    if (hit) {
      const ttl = hit.response?.ok ? CACHE_SUCCESS_MS : CACHE_FAILURE_MS;
      if (now - hit.at < ttl) {
        return hit.response;
      }
    }
  }

  const inflight = resolveInflight.get(key);
  if (inflight && !force) {
    return inflight;
  }

  const task = (async () => {
    const response = await fetchTrialResolve({ deviceId, deviceFingerprint, trialDays });
    resolveCache.set(key, { at: Date.now(), response });
    resolveInflight.delete(key);
    return response;
  })();

  resolveInflight.set(key, task);

  try {
    return await task;
  } catch (error) {
    resolveInflight.delete(key);
    return {
      ok: false,
      skipped: true,
      reason: error?.message || String(error),
    };
  }
}

export function serverTrialStatus(response) {
  if (response?.status === "TRIAL_EXPIRED") return "TRIAL_EXPIRED";
  if (response?.status === "TRIAL_ACTIVE") return "TRIAL_ACTIVE";
  return "";
}