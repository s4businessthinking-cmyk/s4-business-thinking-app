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
  const allowed =
    licenseStatus?.status === "ACTIVE" && cloudFeaturesFromLicensePayload(licenseStatus?.payload);
  setCloudAccessCache(allowed);
  return allowed;
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