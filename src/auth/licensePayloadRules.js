const LICENSE_APP_ID = "com.s4businessthinking.app";
const LICENSE_PLANS = new Set(["LIFETIME", "MONTHLY", "YEARLY", "CUSTOM"]);
const LICENSE_STATUS = { ACTIVE: "ACTIVE", EXPIRED: "EXPIRED" };

function readPayloadString(payload, key) {
  return typeof payload?.[key] === "string" ? payload[key].trim() : "";
}

function readPayloadPhone(payload) {
  return readPayloadString(payload, "phone")
    || readPayloadString(payload, "mobileNumber")
    || readPayloadString(payload, "mobile");
}

function readPayloadDate(payload, key) {
  const value = payload?.[key];
  if (value == null || value === "") return null;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : NaN;
}

function normalizePlan(plan) {
  return String(plan || "").trim().toUpperCase();
}

function normalizePartyName(value) {
  return String(value || "").replace(/\s+/g, " ").trim().toLowerCase();
}

function normalizePhoneDigits(value) {
  return String(value || "").replace(/\D/g, "");
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
    "deviceId",
    "deviceFingerprint",
  ];

  const missing = required.filter((key) => {
    if (key === "features") return !Array.isArray(payload.features);
    return payload[key] == null || payload[key] === "";
  });

  if (!readPayloadPhone(payload)) {
    missing.push("phone");
  }

  if (missing.length > 0) {
    return { ok: false, reason: "MISSING_PAYLOAD_FIELDS", missing };
  }

  return { ok: true };
}

export function licenseActivationErrorText(reason, lang = "en") {
  const bn = lang === "bn";
  const map = {
    MISSING_PAYLOAD_FIELDS: bn
      ? "লাইসেন্সে প্রয়োজনীয় তথ্য নেই (কোম্পানি, মোবাইল, Device ID, Fingerprint)"
      : "License is missing required fields (company, mobile, device ID, fingerprint)",
    MISSING_DEVICE_ID_IN_LICENSE: bn ? "কীতে Device ID নেই — নতুন কী বানান" : "Key has no device ID — generate a new key",
    MISSING_DEVICE_FINGERPRINT_IN_LICENSE: bn ? "কীতে Device fingerprint নেই — নতুন কী বানান" : "Key has no device fingerprint — generate a new key",
    LICENSE_DEVICE_MISMATCH: bn ? "এই কী অন্য ডিভাইসের — এই ডিভাইসের ID দিয়ে নতুন কী নিন" : "This key is for another device — issue a key for this device ID",
    LICENSE_DEVICE_FINGERPRINT_MISMATCH: bn ? "Device fingerprint মিলছে না" : "Device fingerprint does not match",
    LICENSE_SHOP_MISMATCH: bn ? "দোকানের নাম (Company Name) কীর সাথে মিলছে না" : "Company name does not match the key",
    LICENSE_PHONE_MISMATCH: bn ? "মোবাইল নম্বর কীর সাথে মিলছে না" : "Mobile number does not match the key",
    SHOP_OR_PHONE_NOT_SET_ON_DEVICE: bn
      ? "আগে Settings → Account & Company-এ Company Name ও মোবাইল নম্বর সেভ করুন"
      : "Save Company Name and mobile in Settings → Account & Company first",
    MISSING_PARTY_FIELDS_IN_LICENSE: bn ? "কীতে কোম্পানি বা মোবাইল নেই" : "Key is missing company or mobile",
    SIGNATURE_INVALID: bn ? "লাইসেন্স সিগনেচার মিলছে না — কী আবার কপি করুন বা নতুন কী নিন" : "License signature invalid — copy the key again or request a new one",
    INVALID_LICENSE_KEY_FORMAT: bn ? "লাইসেন্স কী ফরম্যাট ভুল" : "Invalid license key format",
  };
  return map[reason] || reason || (bn ? "লাইসেন্স অ্যাক্টিভ হয়নি" : "License not activated");
}

function validateLicensePartyMatch(payload, { shopName = "", phone = "", required = true } = {}) {
  const licShop = readPayloadString(payload, "shopName");
  const licPhone = readPayloadPhone(payload);
  if (!licShop || !licPhone) {
    return { ok: false, reason: "MISSING_PARTY_FIELDS_IN_LICENSE" };
  }
  if (!required) return { ok: true };

  const expectedShop = normalizePartyName(shopName);
  const expectedPhone = normalizePhoneDigits(phone);
  if (!expectedShop || !expectedPhone) {
    return { ok: false, reason: "SHOP_OR_PHONE_NOT_SET_ON_DEVICE" };
  }
  if (normalizePartyName(licShop) !== expectedShop) {
    return { ok: false, reason: "LICENSE_SHOP_MISMATCH" };
  }
  if (normalizePhoneDigits(licPhone) !== expectedPhone) {
    return { ok: false, reason: "LICENSE_PHONE_MISMATCH" };
  }
  return { ok: true };
}

export function validateLicensePayload(payload, {
  deviceId = "",
  deviceFingerprint = "",
  shopName = "",
  phone = "",
} = {}) {
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

  if (!payloadDeviceId) {
    return { ok: false, reason: "MISSING_DEVICE_ID_IN_LICENSE" };
  }
  if (!payloadDeviceFingerprint) {
    return { ok: false, reason: "MISSING_DEVICE_FINGERPRINT_IN_LICENSE" };
  }
  if (!deviceId) {
    return { ok: false, reason: "LOCAL_DEVICE_ID_UNAVAILABLE" };
  }
  if (!deviceFingerprint) {
    return { ok: false, reason: "LOCAL_DEVICE_FINGERPRINT_UNAVAILABLE" };
  }
  if (payloadDeviceId !== deviceId) {
    return { ok: false, reason: "LICENSE_DEVICE_MISMATCH" };
  }
  if (payloadDeviceFingerprint !== deviceFingerprint) {
    return { ok: false, reason: "LICENSE_DEVICE_FINGERPRINT_MISMATCH" };
  }

  const party = validateLicensePartyMatch(payload, { shopName, phone, required: true });
  if (!party.ok) return party;

  return {
    ok: true,
    reason: "VALID_PAYLOAD",
    status: LICENSE_STATUS.ACTIVE,
    plan,
  };
}