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

export async function applyMobileOtaUpdate({ version, bundleUrl }) {
  const updater = await getCapacitorUpdater();
  if (!updater) {
    throw new Error("MOBILE_OTA_UNSUPPORTED");
  }
  if (!bundleUrl || !version) {
    throw new Error("MOBILE_OTA_INVALID");
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

    await applyMobileOtaUpdate({
      version: update.latestVersion,
      bundleUrl: update.bundleUrl,
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
