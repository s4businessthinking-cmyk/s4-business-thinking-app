const CLOUD_CACHE_KEY = "s4-cloud-access-allowed";
const CLOUD_FEATURE_TOKENS = new Set(["cloud-sync", "firebase-sync", "online-sync"]);

export function setCloudAccessCache(allowed) {
  try {
    localStorage.setItem(CLOUD_CACHE_KEY, allowed ? "1" : "0");
  } catch {
    /* ignore */
  }
}

export function cloudFeaturesFromLicensePayload(payload) {
  const features = Array.isArray(payload?.features) ? payload.features : [];
  return features.some((item) => CLOUD_FEATURE_TOKENS.has(String(item || "").trim().toLowerCase()));
}

export function syncCloudAccessCacheFromLicense(licenseStatus) {
  if (licenseStatus?.status !== "ACTIVE") {
    return isCloudAccessAllowedSync();
  }
  const allowed = cloudFeaturesFromLicensePayload(licenseStatus?.payload);
  setCloudAccessCache(allowed);
  return allowed;
}

const TRIAL_ACTIVE = "TRIAL_ACTIVE";
const LICENSE_ACTIVE = "ACTIVE";

/**
 * Trial = 15-day online demo (email login + cloud). Paid license Y/N sets cloud via payload features.
 */
export function applyCloudAccessPolicy(accessStatus) {
  if (import.meta.env?.VITE_S4_CLOUD_ALWAYS === "1") {
    setCloudAccessCache(true);
    return true;
  }

  const license = accessStatus?.license;
  const trialStatus =
    accessStatus?.trialStatus || accessStatus?.trial?.status || "";

  if (license?.status === LICENSE_ACTIVE) {
    return syncCloudAccessCacheFromLicense({
      status: license.status,
      payload: license.payload,
    });
  }

  if (trialStatus === TRIAL_ACTIVE) {
    setCloudAccessCache(true);
    return true;
  }

  setCloudAccessCache(false);
  return false;
}

export function isCloudAccessAllowedSync() {
  if (import.meta.env?.VITE_S4_CLOUD_ALWAYS === "1") return true;
  try {
    return localStorage.getItem(CLOUD_CACHE_KEY) === "1";
  } catch {
    return false;
  }
}

export const CLOUD_NOT_LICENSED = "CLOUD_NOT_LICENSED";