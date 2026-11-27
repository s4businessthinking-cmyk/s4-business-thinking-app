/**
 * Survives SQLite wipe on reinstall (same browser/app profile): one trial record per device fingerprint.
 */
const TRIAL_SEAL_KEY = "s4-trial-device-seal-v1";

export function readTrialDeviceSeal() {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(TRIAL_SEAL_KEY);
    if (!raw) return null;
    const seal = JSON.parse(raw);
    if (!seal || typeof seal !== "object") return null;
    return seal;
  } catch {
    return null;
  }
}

export function writeTrialDeviceSeal(seal) {
  if (!seal?.deviceFingerprint || typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(TRIAL_SEAL_KEY, JSON.stringify({ v: 1, ...seal }));
  } catch {
    /* quota / private mode */
  }
}

export function clearTrialDeviceSeal() {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.removeItem(TRIAL_SEAL_KEY);
  } catch {
    /* ignore */
  }
}

export function sealMatchesFingerprint(seal, deviceFingerprint) {
  return (
    !!seal &&
    !!deviceFingerprint &&
    String(seal.deviceFingerprint || "").trim() === String(deviceFingerprint || "").trim()
  );
}

export function sealHasTrialRecord(seal) {
  return !!(seal?.firstInstalledAt && seal?.trialStartedAt && seal?.trialEndsAt);
}