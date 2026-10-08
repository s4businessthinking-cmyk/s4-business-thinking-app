export function isAndroidNative() {
  return (
    typeof window !== "undefined" &&
    window.Capacitor?.isNativePlatform?.() === true &&
    window.Capacitor.getPlatform?.() === "android"
  );
}

let updaterModulePromise = null;

async function getCapacitorUpdater() {
  if (!isAndroidNative()) return null;

  if (!updaterModulePromise) {
    updaterModulePromise = import("@capgo/capacitor-updater")
      .then((mod) => mod.CapacitorUpdater)
      .catch(() => null);
  }

  return updaterModulePromise;
}

export async function isMobileOtaSupported() {
  const updater = await getCapacitorUpdater();
  return Boolean(updater);
}

export async function notifyMobileAppReady() {
  const updater = await getCapacitorUpdater();
  if (!updater) return false;

  try {
    await updater.notifyAppReady();
    return true;
  } catch (error) {
    console.warn("[S4 OTA] notifyAppReady failed", error);
    return false;
  }
}

async function sha256HexFromUrl(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error("MOBILE_OTA_FETCH_FAILED");
  const buf = await res.arrayBuffer();
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function verifyBundleDigest(bundleUrl, sha256Url, sha256Hex = null) {
  if (!sha256Url && !sha256Hex) return false;
  const [expectedRaw, actual] = await Promise.all([
    sha256Hex ? Promise.resolve(sha256Hex) : fetch(sha256Url).then((r) => r.text()),
    sha256HexFromUrl(bundleUrl),
  ]);
  const expected = String(expectedRaw || "").trim().toLowerCase().replace(/^sha256[:\s]*/i, "").split(/\s+/)[0];
  return expected.length === 64 && expected === actual;
}

export async function applyMobileOtaUpdate({ version, bundleUrl, bundleSha256Url = null, bundleSha256 = null }) {
  const updater = await getCapacitorUpdater();
  if (!updater) {
    throw new Error("MOBILE_OTA_UNSUPPORTED");
  }
  if (!bundleUrl || !version) {
    throw new Error("MOBILE_OTA_INVALID");
  }
  if (!(await verifyBundleDigest(bundleUrl, bundleSha256Url, bundleSha256))) {
    throw new Error("MOBILE_OTA_DIGEST_MISMATCH");
  }

  const downloaded = await updater.download({
    version: String(version).replace(/^v/i, ""),
    url: bundleUrl,
  });

  if (!downloaded?.id) {
    throw new Error("MOBILE_OTA_DOWNLOAD_INVALID");
  }

  await updater.set({ id: downloaded.id });

  try {
    await updater.reload();
  } catch (reloadError) {
    console.warn("[S4 OTA] reload after set failed", reloadError);
  }

  return downloaded;
}

export async function runMobileAutoUpdate({
  checkGitHubUpdate,
  APP_VERSION,
  toast,
  lang,
  silent = true,
}) {
  if (!isAndroidNative()) return { ok: false, reason: "NOT_ANDROID" };
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return { ok: false, reason: "OFFLINE" };
  }

  const updater = await getCapacitorUpdater();
  if (!updater) {
    return { ok: false, reason: "UNSUPPORTED" };
  }

  try {
    const update = await checkGitHubUpdate(APP_VERSION);
    if (!update.hasUpdate || !update.bundleUrl) {
      return { ok: true, applied: false, update };
    }

    if (!silent && toast) {
      toast(
        lang === "bn"
          ? `🔄 Version ${update.latestVersion} download হচ্ছে...`
          : `🔄 Downloading version ${update.latestVersion}...`,
        "ok"
      );
    }

    if (!update.bundleSha256Url && !update.bundleSha256) {
      console.warn("[S4 OTA] skipped — release has no bundle checksum");
      return { ok: true, applied: false, update, reason: "NO_DIGEST" };
    }

    await applyMobileOtaUpdate({
      version: update.latestVersion,
      bundleUrl: update.bundleUrl,
      bundleSha256Url: update.bundleSha256Url,
      bundleSha256: update.bundleSha256,
    });

    if (!silent && toast) {
      toast(
        lang === "bn"
          ? `✅ Version ${update.latestVersion} apply হয়েছে। App reload হচ্ছে...`
          : `✅ Version ${update.latestVersion} applied. Reloading app...`,
        "ok"
      );
    }

    return { ok: true, applied: true, update };
  } catch (error) {
    console.warn("[S4 OTA] auto update failed", error);
    return { ok: false, reason: "FAILED", error };
  }
}
