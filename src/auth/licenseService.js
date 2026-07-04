import {
  bootOfflineSqlite,
  executeSql,
  persistOfflineDb,
  queryRows,
} from "../offline/sqliteDb";

const LICENSE_KEY_PREFIX = "S4-LIC-v1";
const LICENSE_APP_ID = "com.s4businessthinking.app";
const LICENSE_PLANS = new Set(["LIFETIME", "MONTHLY", "YEARLY", "CUSTOM"]);
const DEFAULT_TRIAL_DAYS = 15;
const CLOCK_ROLLBACK_TOLERANCE_MS = 5 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const CONFIRM_EXPIRE_TRIAL = "EXPIRE_TRIAL_FOR_TEST";
const CONFIRM_RESET_TRIAL = "RESET_TRIAL_FOR_TEST";
const CONFIRM_CLEAR_LICENSE = "CLEAR_LICENSE_FOR_TEST";

// Development public key only. Never store the private signing key in this app.
const LICENSE_PUBLIC_KEY_JWK = {
  kty: "EC",
  x: "WiSfAOqBS1xH9jSSkapz39DiY1VZSp79KIGoq1LQ24E",
  y: "85tpm-ntlp8d4-tuekifXYG5pjPtxzKQ_mpGbBvJCHo",
  crv: "P-256",
};

export const LICENSE_STATUS = {
  ACTIVE: "ACTIVE",
  EXPIRED: "EXPIRED",
  INVALID: "INVALID",
  NOT_FOUND: "NOT_FOUND",
  PENDING_ONLINE: "PENDING_ONLINE",
};

export const TRIAL_STATUS = {
  ACTIVE: "TRIAL_ACTIVE",
  EXPIRED: "TRIAL_EXPIRED",
  NOT_STARTED: "TRIAL_NOT_STARTED",
  CLOCK_ROLLBACK: "TRIAL_CLOCK_ROLLBACK",
  BYPASSED_BY_LICENSE: "TRIAL_BYPASSED_BY_LICENSE",
};

function nowIso() {
  return new Date().toISOString();
}

function getCrypto() {
  const cryptoApi = globalThis.crypto;
  if (!cryptoApi?.subtle || typeof cryptoApi.getRandomValues !== "function") {
    throw new Error("Web Crypto API is required for license verification.");
  }
  return cryptoApi;
}

function bytesToHex(bytes) {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function sha256Hex(value) {
  const digest = await getCrypto().subtle.digest(
    "SHA-256",
    new TextEncoder().encode(String(value || ""))
  );

  return bytesToHex(new Uint8Array(digest));
}

function normalizeBase64Url(value) {
  const normalized = String(value || "").replace(/-/g, "+").replace(/_/g, "/");
  const padding = normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4));
  return `${normalized}${padding}`;
}

function base64UrlToBytes(value) {
  const binary = atob(normalizeBase64Url(value));
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }

  return bytes;
}

function base64UrlToText(value) {
  return new TextDecoder().decode(base64UrlToBytes(value));
}

function readDerLength(bytes, offset) {
  const first = bytes[offset];

  if (first < 0x80) {
    return { length: first, nextOffset: offset + 1 };
  }

  const lengthBytes = first & 0x7f;
  let length = 0;

  for (let i = 0; i < lengthBytes; i += 1) {
    length = (length << 8) | bytes[offset + 1 + i];
  }

  return { length, nextOffset: offset + 1 + lengthBytes };
}

function derIntegerToFixedBytes(bytes, offset, size) {
  if (bytes[offset] !== 0x02) {
    throw new Error("Invalid DER ECDSA signature integer.");
  }

  const { length, nextOffset } = readDerLength(bytes, offset + 1);
  const integerBytes = bytes.slice(nextOffset, nextOffset + length);
  const unsignedBytes = integerBytes[0] === 0 ? integerBytes.slice(1) : integerBytes;

  if (unsignedBytes.length > size) {
    throw new Error("Invalid DER ECDSA signature integer size.");
  }

  const fixedBytes = new Uint8Array(size);
  fixedBytes.set(unsignedBytes, size - unsignedBytes.length);

  return {
    bytes: fixedBytes,
    nextOffset: nextOffset + length,
  };
}

function normalizeEcdsaP256Signature(signatureBytes) {
  if (signatureBytes.length === 64) {
    return signatureBytes;
  }

  if (signatureBytes[0] !== 0x30) {
    return signatureBytes;
  }

  const { nextOffset } = readDerLength(signatureBytes, 1);
  const r = derIntegerToFixedBytes(signatureBytes, nextOffset, 32);
  const s = derIntegerToFixedBytes(signatureBytes, r.nextOffset, 32);
  const rawSignature = new Uint8Array(64);

  rawSignature.set(r.bytes, 0);
  rawSignature.set(s.bytes, 32);

  return rawSignature;
}

function parseJson(value) {
  try {
    return value ? JSON.parse(value) : null;
  } catch {
    return null;
  }
}

function createId() {
  const cryptoApi = getCrypto();

  if (typeof cryptoApi.randomUUID === "function") {
    return cryptoApi.randomUUID();
  }

  const bytes = new Uint8Array(16);
  cryptoApi.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, "0"));
  return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex
    .slice(6, 8)
    .join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10).join("")}`;
}

function readMetaValue(key) {
  const rows = queryRows(
    `SELECT value
     FROM app_meta
     WHERE key = ?
     LIMIT 1`,
    [key]
  );

  return rows?.[0]?.value || null;
}

function writeMetaValue(key, value) {
  executeSql(
    `INSERT OR REPLACE INTO app_meta (key, value, updated_at)
     VALUES (?, ?, ?)`,
    [key, value == null ? "" : String(value), nowIso()]
  );
}

function normalizePlan(plan) {
  return String(plan || "").trim().toUpperCase();
}

function readPayloadString(payload, key) {
  return typeof payload?.[key] === "string" ? payload[key].trim() : "";
}

function readPayloadDate(payload, key) {
  const value = payload?.[key];
  if (value == null || value === "") return null;

  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : NaN;
}

function readMetaDate(key) {
  const value = readMetaValue(key);
  if (!value) return null;

  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : null;
}

function readMetaInteger(key, fallback) {
  const value = Number.parseInt(readMetaValue(key) || "", 10);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

function addDays(date, days) {
  return new Date(date.getTime() + days * DAY_MS);
}

function buildTrialResponse({
  status,
  firstInstalledAt,
  trialStartedAt,
  trialEndsAt,
  lastSeenAt,
  trialDays,
  deviceId,
  deviceFingerprint,
  reason = "TRIAL_STATUS",
}) {
  const now = Date.now();
  const endsAtMs = trialEndsAt ? new Date(trialEndsAt).getTime() : NaN;
  const daysRemaining = Number.isFinite(endsAtMs)
    ? Math.max(0, Math.ceil((endsAtMs - now) / DAY_MS))
    : null;

  return {
    ok: true,
    status,
    reason,
    firstInstalledAt,
    trialStartedAt,
    trialEndsAt,
    lastSeenAt,
    trialDays,
    daysRemaining,
    deviceId,
    deviceFingerprint,
  };
}

function requireDevConfirm(actual, expected) {
  if (actual === expected) return null;

  return {
    ok: false,
    reason: "CONFIRM_TEXT_REQUIRED",
    expected,
  };
}

function validateRequiredPayloadFields(payload) {
  if (!payload || typeof payload !== "object") {
    return { ok: false, reason: "INVALID_PAYLOAD" };
  }

  const required = [
    "licenseId",
    "customerName",
    "shopName",
    "plan",
    "status",
    "issuedAt",
    "notBefore",
    "maxDevices",
    "features",
    "appId",
    "version",
  ];

  const missing = required.filter((key) => {
    if (key === "features") return !Array.isArray(payload.features);
    return payload[key] == null || payload[key] === "";
  });

  if (missing.length > 0) {
    return { ok: false, reason: "MISSING_PAYLOAD_FIELDS", missing };
  }

  return { ok: true };
}

function validateLicensePayload(payload, { deviceId = "", deviceFingerprint = "" } = {}) {
  const required = validateRequiredPayloadFields(payload);
  if (!required.ok) return required;

  const plan = normalizePlan(payload.plan);
  if (!LICENSE_PLANS.has(plan)) {
    return { ok: false, reason: "INVALID_LICENSE_PLAN" };
  }

  if (payload.status !== LICENSE_STATUS.ACTIVE) {
    return { ok: false, reason: "LICENSE_STATUS_NOT_ACTIVE" };
  }

  if (payload.appId !== LICENSE_APP_ID) {
    return { ok: false, reason: "LICENSE_APP_MISMATCH" };
  }

  if (!Number.isInteger(Number(payload.version)) || Number(payload.version) < 1) {
    return { ok: false, reason: "INVALID_LICENSE_VERSION" };
  }

  if (!Number.isInteger(Number(payload.maxDevices)) || Number(payload.maxDevices) < 1) {
    return { ok: false, reason: "INVALID_MAX_DEVICES" };
  }

  if (!Array.isArray(payload.features) || payload.features.some((item) => typeof item !== "string")) {
    return { ok: false, reason: "INVALID_FEATURES" };
  }

  const issuedAt = readPayloadDate(payload, "issuedAt");
  const notBefore = readPayloadDate(payload, "notBefore");
  const expiresAt = readPayloadDate(payload, "expiresAt");

  if (!Number.isFinite(issuedAt) || !Number.isFinite(notBefore)) {
    return { ok: false, reason: "INVALID_LICENSE_DATES" };
  }

  if (plan !== "LIFETIME" && !Number.isFinite(expiresAt)) {
    return { ok: false, reason: "EXPIRES_AT_REQUIRED" };
  }

  if (plan === "LIFETIME" && payload.expiresAt && !Number.isFinite(expiresAt)) {
    return { ok: false, reason: "INVALID_LICENSE_DATES" };
  }

  const now = Date.now();

  if (issuedAt > now) {
    return { ok: false, reason: "LICENSE_NOT_YET_VALID" };
  }

  if (notBefore > now) {
    return { ok: false, reason: "LICENSE_NOT_BEFORE" };
  }

  if (plan !== "LIFETIME" && expiresAt <= now) {
    return { ok: false, reason: "LICENSE_EXPIRED", status: LICENSE_STATUS.EXPIRED };
  }

  const payloadDeviceId = readPayloadString(payload, "deviceId");
  const payloadDeviceFingerprint = readPayloadString(payload, "deviceFingerprint");

  if (payloadDeviceId && deviceId && payloadDeviceId !== deviceId) {
    return { ok: false, reason: "LICENSE_DEVICE_MISMATCH" };
  }

  if (
    payloadDeviceFingerprint &&
    deviceFingerprint &&
    payloadDeviceFingerprint !== deviceFingerprint
  ) {
    return { ok: false, reason: "LICENSE_DEVICE_FINGERPRINT_MISMATCH" };
  }

  return {
    ok: true,
    reason: "VALID_PAYLOAD",
    status: LICENSE_STATUS.ACTIVE,
    plan,
  };
}

async function verifySignature(signingInput, signatureBytes) {
  try {
    if (!LICENSE_PUBLIC_KEY_JWK) {
      return { ok: false, reason: "PUBLIC_KEY_NOT_CONFIGURED" };
    }

    const cryptoApi = getCrypto();
    const publicKey = await cryptoApi.subtle.importKey(
      "jwk",
      LICENSE_PUBLIC_KEY_JWK,
      {
        name: "ECDSA",
        namedCurve: "P-256",
      },
      false,
      ["verify"]
    );

    const normalizedSignature = normalizeEcdsaP256Signature(signatureBytes);
    const ok = await cryptoApi.subtle.verify(
      {
        name: "ECDSA",
        hash: "SHA-256",
      },
      publicKey,
      normalizedSignature,
      new TextEncoder().encode(signingInput)
    );

    return { ok, reason: ok ? "SIGNATURE_VALID" : "SIGNATURE_INVALID" };
  } catch (error) {
    return {
      ok: false,
      reason: "SIGNATURE_VERIFY_FAILED",
      error: error?.message || String(error),
    };
  }
}

export function normalizeLicenseKey(licenseKey) {
  return String(licenseKey || "")
    .trim()
    .replace(/\s+/g, "")
    .replace(/[â€â€‘â€’â€“â€”]/g, "-");
}

export function parseLicenseKey(licenseKey) {
  const normalizedKey = normalizeLicenseKey(licenseKey);
  const parts = normalizedKey.split(".");

  if (parts.length !== 3 || parts[0] !== LICENSE_KEY_PREFIX) {
    return {
      ok: false,
      reason: "INVALID_LICENSE_KEY_FORMAT",
      normalizedKey,
    };
  }

  try {
    const payload = JSON.parse(base64UrlToText(parts[1]));

    return {
      ok: true,
      reason: "PARSED",
      normalizedKey,
      prefix: parts[0],
      payloadPart: parts[1],
      signaturePart: parts[2],
      payload,
      signingInput: `${parts[0]}.${parts[1]}`,
    };
  } catch {
    return {
      ok: false,
      reason: "INVALID_LICENSE_PAYLOAD_ENCODING",
      normalizedKey,
    };
  }
}

export async function createLicenseFingerprint(licenseKey) {
  const normalizedKey = normalizeLicenseKey(licenseKey);
  return sha256Hex(normalizedKey);
}

export async function createDeviceFingerprint(deviceId) {
  return sha256Hex(`${LICENSE_APP_ID}:${deviceId}`);
}

export async function verifyOfflineLicensePayload(licenseKey) {
  try {
    const parsed = parseLicenseKey(licenseKey);

    if (!parsed.ok) {
      return {
        ok: false,
        status: LICENSE_STATUS.INVALID,
        reason: parsed.reason,
      };
    }

    const deviceId = await getOrCreateDeviceId();
    const deviceFingerprint = await createDeviceFingerprint(deviceId);
    const payloadValidation = validateLicensePayload(parsed.payload, {
      deviceId,
      deviceFingerprint,
    });

    if (!payloadValidation.ok) {
      return {
        ok: false,
        status: payloadValidation.status || LICENSE_STATUS.INVALID,
        reason: payloadValidation.reason,
        missing: payloadValidation.missing,
        payload: parsed.payload,
        deviceId,
        deviceFingerprint,
      };
    }

    const signatureBytes = base64UrlToBytes(parsed.signaturePart);
    const signature =
      (await verifySignature(parsed.payloadPart, signatureBytes)).ok
        ? { ok: true, reason: "SIGNATURE_VALID" }
        : await verifySignature(parsed.signingInput, signatureBytes);

    if (!signature.ok) {
      return {
        ok: false,
        status:
          signature.reason === "PUBLIC_KEY_NOT_CONFIGURED"
            ? LICENSE_STATUS.PENDING_ONLINE
            : LICENSE_STATUS.INVALID,
        reason: signature.reason,
        error: signature.error,
        payload: parsed.payload,
        deviceId,
        deviceFingerprint,
        signatureConfigured: Boolean(LICENSE_PUBLIC_KEY_JWK),
      };
    }

    return {
      ok: true,
      status: LICENSE_STATUS.ACTIVE,
      reason: "LICENSE_VALID",
      payload: parsed.payload,
      deviceId,
      deviceFingerprint,
      signatureConfigured: true,
    };
  } catch (error) {
    return {
      ok: false,
      status: LICENSE_STATUS.INVALID,
      reason: "LICENSE_VERIFY_FAILED",
      error: error?.message || String(error),
    };
  }
}

export async function getOrCreateDeviceId() {
  await bootOfflineSqlite();

  const existing = readMetaValue("device_id");
  if (existing) return existing;

  const deviceId = createId();
  writeMetaValue("device_id", deviceId);
  await persistOfflineDb();
  return deviceId;
}

export async function storeLicenseMetadata({
  status,
  payload = null,
  fingerprint = "",
  reason = "",
  deviceId = "",
  deviceFingerprint = "",
} = {}) {
  await bootOfflineSqlite();

  const localDeviceId = deviceId || (await getOrCreateDeviceId());
  const localDeviceFingerprint =
    deviceFingerprint || (await createDeviceFingerprint(localDeviceId));
  const activatedAt = nowIso();
  const boundDeviceId = payload?.deviceId || localDeviceId;
  const boundDeviceFingerprint = payload?.deviceFingerprint || localDeviceFingerprint;

  writeMetaValue("license_status", status || LICENSE_STATUS.INVALID);
  writeMetaValue("license_id", payload?.licenseId || "");
  writeMetaValue("license_key_fingerprint", fingerprint);
  writeMetaValue("license_payload_json", payload ? JSON.stringify(payload) : "");
  writeMetaValue("license_activated_at", activatedAt);
  writeMetaValue("license_expires_at", payload?.expiresAt || "");
  writeMetaValue("license_last_offline_check", activatedAt);
  writeMetaValue("license_last_error", reason);
  writeMetaValue("device_id", localDeviceId);
  writeMetaValue("device_fingerprint", localDeviceFingerprint);
  writeMetaValue("license_bound_device_id", boundDeviceId);
  writeMetaValue("license_bound_device_fingerprint", boundDeviceFingerprint);

  await persistOfflineDb();

  return {
    ok: true,
    status: status || LICENSE_STATUS.INVALID,
    payload,
    fingerprint,
    deviceId: localDeviceId,
    deviceFingerprint: localDeviceFingerprint,
    boundDeviceId,
    boundDeviceFingerprint,
  };
}

export async function activateLicenseOffline(licenseKey) {
  try {
    const fingerprint = await createLicenseFingerprint(licenseKey);
    const verification = await verifyOfflineLicensePayload(licenseKey);

    if (!verification.ok) {
      return {
        ...verification,
        fingerprint,
        stored: false,
      };
    }

    const stored = await storeLicenseMetadata({
      status: verification.status,
      payload: verification.payload,
      fingerprint,
      reason: verification.reason,
      deviceId: verification.deviceId,
      deviceFingerprint: verification.deviceFingerprint,
    });

    return {
      ...verification,
      fingerprint,
      stored: true,
      local: stored,
    };
  } catch (error) {
    return {
      ok: false,
      status: LICENSE_STATUS.INVALID,
      reason: "LICENSE_ACTIVATION_FAILED",
      error: error?.message || String(error),
      stored: false,
    };
  }
}

export async function getLocalLicenseStatus() {
  try {
    await bootOfflineSqlite();

    const payload = parseJson(readMetaValue("license_payload_json"));
    const status = readMetaValue("license_status") || LICENSE_STATUS.NOT_FOUND;
    const expiresAt = readMetaValue("license_expires_at") || payload?.expiresAt || "";
    const deviceId = readMetaValue("device_id") || "";
    const deviceFingerprint =
      readMetaValue("device_fingerprint") ||
      (deviceId ? await createDeviceFingerprint(deviceId) : "");
    const boundDeviceId = readMetaValue("license_bound_device_id") || payload?.deviceId || "";
    const boundDeviceFingerprint =
      readMetaValue("license_bound_device_fingerprint") || payload?.deviceFingerprint || "";

    const payloadValidation = payload
      ? validateLicensePayload(payload, { deviceId, deviceFingerprint })
      : null;

    const plan = normalizePlan(payload?.plan);
    const expired =
      plan !== "LIFETIME" && expiresAt ? new Date(expiresAt).getTime() <= Date.now() : false;
    const deviceMismatch =
      (boundDeviceId && deviceId && boundDeviceId !== deviceId) ||
      (boundDeviceFingerprint &&
        deviceFingerprint &&
        boundDeviceFingerprint !== deviceFingerprint);

    return {
      ok: true,
      status:
        status === LICENSE_STATUS.NOT_FOUND
          ? LICENSE_STATUS.NOT_FOUND
          : expired
            ? LICENSE_STATUS.EXPIRED
            : deviceMismatch || payloadValidation?.ok === false
              ? LICENSE_STATUS.INVALID
              : status,
      reason:
        deviceMismatch
          ? "LICENSE_DEVICE_MISMATCH"
          : payloadValidation?.ok === false
            ? payloadValidation.reason
            : "LOCAL_LICENSE_STATUS",
      licenseId: readMetaValue("license_id") || payload?.licenseId || "",
      fingerprint: readMetaValue("license_key_fingerprint") || "",
      payload,
      deviceId,
      deviceFingerprint,
      boundDeviceId,
      boundDeviceFingerprint,
      expiresAt,
      activatedAt: readMetaValue("license_activated_at") || "",
      lastOfflineCheck: readMetaValue("license_last_offline_check") || "",
      lastOnlineCheck: readMetaValue("license_last_online_check") || "",
      lastError: readMetaValue("license_last_error") || "",
    };
  } catch (error) {
    return {
      ok: false,
      status: LICENSE_STATUS.INVALID,
      reason: error?.message || String(error),
    };
  }
}

export async function getOrCreateTrialStatus() {
  await bootOfflineSqlite();

  const license = await getLocalLicenseStatus();
  const deviceId = license.deviceId || (await getOrCreateDeviceId());
  const deviceFingerprint =
    license.deviceFingerprint || (await createDeviceFingerprint(deviceId));
  const now = new Date();
  const nowValue = now.getTime();
  const trialDays = readMetaInteger("trial_days", DEFAULT_TRIAL_DAYS);

  const storedFirstInstalledAt = readMetaValue("first_installed_at");
  const storedTrialStartedAt = readMetaValue("trial_started_at");
  const storedTrialEndsAt = readMetaValue("trial_ends_at");
  const storedLastSeenAt = readMetaValue("last_seen_at");
  const storedStatus = readMetaValue("trial_status") || TRIAL_STATUS.NOT_STARTED;
  const lastSeenAtMs = readMetaDate("last_seen_at");

  if (license.status === LICENSE_STATUS.ACTIVE) {
    return buildTrialResponse({
      status: TRIAL_STATUS.BYPASSED_BY_LICENSE,
      firstInstalledAt: storedFirstInstalledAt,
      trialStartedAt: storedTrialStartedAt,
      trialEndsAt: storedTrialEndsAt,
      lastSeenAt: storedLastSeenAt,
      trialDays,
      deviceId,
      deviceFingerprint,
      reason: "LICENSE_ACTIVE",
    });
  }

  if (!storedFirstInstalledAt || !storedTrialStartedAt || !storedTrialEndsAt) {
    const firstInstalledAt = now.toISOString();
    const trialStartedAt = firstInstalledAt;
    const trialEndsAt = addDays(now, trialDays).toISOString();
    const lastSeenAt = firstInstalledAt;

    writeMetaValue("first_installed_at", firstInstalledAt);
    writeMetaValue("trial_started_at", trialStartedAt);
    writeMetaValue("trial_ends_at", trialEndsAt);
    writeMetaValue("last_seen_at", lastSeenAt);
    writeMetaValue("trial_days", String(trialDays));
    writeMetaValue("trial_status", TRIAL_STATUS.ACTIVE);
    writeMetaValue("trial_device_fingerprint", deviceFingerprint);
    await persistOfflineDb();

    return buildTrialResponse({
      status: TRIAL_STATUS.ACTIVE,
      firstInstalledAt,
      trialStartedAt,
      trialEndsAt,
      lastSeenAt,
      trialDays,
      deviceId,
      deviceFingerprint,
      reason: "TRIAL_INITIALIZED",
    });
  }

  if (
    lastSeenAtMs != null &&
    nowValue + CLOCK_ROLLBACK_TOLERANCE_MS < lastSeenAtMs
  ) {
    writeMetaValue("trial_status", TRIAL_STATUS.CLOCK_ROLLBACK);
    writeMetaValue("trial_device_fingerprint", deviceFingerprint);
    await persistOfflineDb();

    return buildTrialResponse({
      status: TRIAL_STATUS.CLOCK_ROLLBACK,
      firstInstalledAt: storedFirstInstalledAt,
      trialStartedAt: storedTrialStartedAt,
      trialEndsAt: storedTrialEndsAt,
      lastSeenAt: storedLastSeenAt,
      trialDays,
      deviceId,
      deviceFingerprint,
      reason: "CLOCK_ROLLBACK",
    });
  }

  const trialEndsAtMs = new Date(storedTrialEndsAt).getTime();
  const status =
    storedStatus === TRIAL_STATUS.CLOCK_ROLLBACK
      ? TRIAL_STATUS.CLOCK_ROLLBACK
      : Number.isFinite(trialEndsAtMs) && trialEndsAtMs <= nowValue
        ? TRIAL_STATUS.EXPIRED
        : TRIAL_STATUS.ACTIVE;
  const lastSeenAt =
    lastSeenAtMs == null || nowValue > lastSeenAtMs ? now.toISOString() : storedLastSeenAt;

  writeMetaValue("last_seen_at", lastSeenAt);
  writeMetaValue("trial_days", String(trialDays));
  writeMetaValue("trial_status", status);
  writeMetaValue("trial_device_fingerprint", deviceFingerprint);
  await persistOfflineDb();

  return buildTrialResponse({
    status,
    firstInstalledAt: storedFirstInstalledAt,
    trialStartedAt: storedTrialStartedAt,
    trialEndsAt: storedTrialEndsAt,
    lastSeenAt,
    trialDays,
    deviceId,
    deviceFingerprint,
    reason: "TRIAL_STATUS",
  });
}

export async function getLocalAccessStatus() {
  const license = await getLocalLicenseStatus();

  if (license.status === LICENSE_STATUS.ACTIVE) {
    const trial = await getOrCreateTrialStatus();
    return {
      ok: true,
      accessAllowed: true,
      accessReason: "LICENSE_ACTIVE",
      licenseStatus: license.status,
      trialStatus: trial.status,
      license,
      trial,
    };
  }

  const trial = await getOrCreateTrialStatus();

  if (trial.status === TRIAL_STATUS.ACTIVE) {
    return {
      ok: true,
      accessAllowed: true,
      accessReason: "TRIAL_ACTIVE",
      licenseStatus: license.status,
      trialStatus: trial.status,
      license,
      trial,
    };
  }

  if (trial.status === TRIAL_STATUS.EXPIRED) {
    return {
      ok: true,
      accessAllowed: false,
      accessReason: "TRIAL_EXPIRED",
      licenseStatus: license.status,
      trialStatus: trial.status,
      license,
      trial,
    };
  }

  if (trial.status === TRIAL_STATUS.CLOCK_ROLLBACK) {
    return {
      ok: true,
      accessAllowed: false,
      accessReason: "CLOCK_ROLLBACK",
      licenseStatus: license.status,
      trialStatus: trial.status,
      license,
      trial,
    };
  }

  return {
    ok: true,
    accessAllowed: true,
    accessReason: "TRIAL_ACTIVE",
    licenseStatus: license.status,
    trialStatus: trial.status,
    license,
    trial,
  };
}

export async function expireTrialForTest(confirmText) {
  try {
    const confirmError = requireDevConfirm(confirmText, CONFIRM_EXPIRE_TRIAL);
    if (confirmError) return confirmError;

    await bootOfflineSqlite();

    const now = new Date();
    const yesterday = new Date(now.getTime() - DAY_MS);
    const trialDays = readMetaInteger("trial_days", DEFAULT_TRIAL_DAYS);
    const deviceId = await getOrCreateDeviceId();
    const deviceFingerprint = await createDeviceFingerprint(deviceId);

    writeMetaValue("first_installed_at", readMetaValue("first_installed_at") || now.toISOString());
    writeMetaValue("trial_started_at", readMetaValue("trial_started_at") || addDays(now, -trialDays).toISOString());
    writeMetaValue("trial_ends_at", yesterday.toISOString());
    writeMetaValue("last_seen_at", now.toISOString());
    writeMetaValue("trial_days", String(trialDays));
    writeMetaValue("trial_status", TRIAL_STATUS.EXPIRED);
    writeMetaValue("trial_device_fingerprint", deviceFingerprint);
    await persistOfflineDb();

    return {
      ok: true,
      action: "EXPIRE_TRIAL_FOR_TEST",
      debug: await getDebugStatus(),
    };
  } catch (error) {
    return {
      ok: false,
      reason: "EXPIRE_TRIAL_FOR_TEST_FAILED",
      error: error?.message || String(error),
    };
  }
}

export async function resetTrialForTest(confirmText) {
  try {
    const confirmError = requireDevConfirm(confirmText, CONFIRM_RESET_TRIAL);
    if (confirmError) return confirmError;

    await bootOfflineSqlite();

    const now = new Date();
    const trialEndsAt = addDays(now, DEFAULT_TRIAL_DAYS);
    const deviceId = await getOrCreateDeviceId();
    const deviceFingerprint = await createDeviceFingerprint(deviceId);

    writeMetaValue("first_installed_at", now.toISOString());
    writeMetaValue("trial_started_at", now.toISOString());
    writeMetaValue("trial_ends_at", trialEndsAt.toISOString());
    writeMetaValue("last_seen_at", now.toISOString());
    writeMetaValue("trial_days", String(DEFAULT_TRIAL_DAYS));
    writeMetaValue("trial_status", TRIAL_STATUS.ACTIVE);
    writeMetaValue("trial_device_fingerprint", deviceFingerprint);
    await persistOfflineDb();

    return {
      ok: true,
      action: "RESET_TRIAL_FOR_TEST",
      debug: await getDebugStatus(),
    };
  } catch (error) {
    return {
      ok: false,
      reason: "RESET_TRIAL_FOR_TEST_FAILED",
      error: error?.message || String(error),
    };
  }
}

export async function clearLocalLicenseForTest(confirmText) {
  try {
    const confirmError = requireDevConfirm(confirmText, CONFIRM_CLEAR_LICENSE);
    if (confirmError) return confirmError;

    await bootOfflineSqlite();

    writeMetaValue("license_status", "");
    writeMetaValue("license_payload_json", "");
    writeMetaValue("license_key_fingerprint", "");
    writeMetaValue("license_expires_at", "");
    await persistOfflineDb();

    return {
      ok: true,
      action: "CLEAR_LICENSE_FOR_TEST",
      debug: await getDebugStatus(),
    };
  } catch (error) {
    return {
      ok: false,
      reason: "CLEAR_LICENSE_FOR_TEST_FAILED",
      error: error?.message || String(error),
    };
  }
}

export async function getDebugStatus() {
  try {
    const [licenseStatus, trialStatus, accessStatus] = await Promise.all([
      getLocalLicenseStatus(),
      getOrCreateTrialStatus(),
      getLocalAccessStatus(),
    ]);

    return {
      ok: true,
      licenseStatus,
      trialStatus,
      accessStatus,
    };
  } catch (error) {
    return {
      ok: false,
      reason: "DEBUG_STATUS_FAILED",
      error: error?.message || String(error),
    };
  }
}

export async function refreshLicenseOnline() {
  return {
    ok: false,
    skipped: true,
    reason: "ONLINE_LICENSE_REFRESH_NOT_CONNECTED_YET",
  };
}

export async function recordLicenseActivationOnline() {
  return {
    ok: false,
    skipped: true,
    reason: "ONLINE_LICENSE_AUDIT_NOT_CONNECTED_YET",
  };
}


