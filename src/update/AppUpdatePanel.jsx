import { useEffect, useState } from "react";
import {
  APP_VERSION,
  checkGitHubUpdate,
  getReleasePlatform,
  openUpdateDownload,
} from "./githubUpdateService";
import {
  applyMobileOtaUpdate,
  isMobileOtaSupported,
  runMobileAutoUpdate,
} from "./mobileOtaService";

export function AppUpdatePanel({ lang, th, s, toast }) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [otaSupported, setOtaSupported] = useState(false);
  const platform = getReleasePlatform();

  const txt =
    lang === "bn"
      ? {
          title: "🔄 অ্যাপ আপডেট",
          installed: "আপনার installed version",
          latest: "GitHub-এ সর্বশেষ version",
          check: "আপডেট চেক করুন",
          checking: "চেক হচ্ছে...",
          applyNow: "এখনই আপডেট করুন",
          applying: "আপডেট হচ্ছে...",
          available: "নতুন আপডেট available",
          upToDate: "আপনার installed app আপ-টু-ডেট",
          downloadApk: "APK ডাউনলোড (backup)",
          desktopPending:
            "✅ নতুন version download হলে app নিজে থেকে restart হয়ে update হয়ে যাবে — কোনো button চাপতে হবে না।",
          desktopRestart:
            "Windows app WhatsApp-এর মতো নিজে থেকে update নেয়। Internet থাকলে download + restart automatic — uninstall লাগবে না।",
          mobileAuto:
            "✅ Mobile app WhatsApp-এর মতো নিজে থেকে auto update নেবে। Internet থাকলে app খুললেই update হবে — uninstall/APK লাগবে না।",
          mobileManualApk:
            "খুব পুরোনো app-এ OTA না থাকলে একবার APK install করুন। তারপর থেকে সব update automatic।",
          noBundleHint:
            "এই version-এর auto-update file এখনো ready নয়। কিছুক্ষণ পর আবার চেষ্টা করুন।",
          otaFailed: "Auto update apply করা যায়নি। Internet চালু রেখে আবার চেষ্টা করুন।",
          needInternet: "Internet সংযোগ লাগবে",
          checkFailed: "আপডেট check করা যায়নি। Internet চালু আছে কিনা দেখুন।",
        }
      : {
          title: "🔄 App Update",
          installed: "Your installed version",
          latest: "Latest version on GitHub",
          check: "Check for updates",
          checking: "Checking...",
          applyNow: "Update now",
          applying: "Updating...",
          available: "New update available",
          upToDate: "Your installed app is up to date",
          downloadApk: "Download APK (backup)",
          desktopPending:
            "✅ When a new version downloads, the app restarts and updates by itself — no buttons to press.",
          desktopRestart:
            "The Windows app updates itself like WhatsApp. Online = automatic download + restart. No uninstall.",
          mobileAuto:
            "✅ The mobile app updates itself like WhatsApp. When online, opening the app applies updates — no uninstall or APK.",
          mobileManualApk:
            "If the app is too old for OTA, install the APK once. After that, all updates are automatic.",
          noBundleHint:
            "The auto-update file is not ready yet. Please try again later.",
          otaFailed: "Could not apply the auto update. Stay online and try again.",
          needInternet: "Internet connection required",
          checkFailed: "Could not check for updates. Please verify your internet connection.",
        };

  useEffect(() => {
    isMobileOtaSupported().then(setOtaSupported);
  }, []);

  const runCheck = async ({ silent = false } = {}) => {
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      if (!silent) toast(txt.needInternet, "err");
      return null;
    }

    setBusy(true);
    setError("");

    try {
      const update = await checkGitHubUpdate(APP_VERSION);
      setResult(update);
      if (!silent) {
        toast(update.hasUpdate ? txt.available : txt.upToDate, "ok");
      }
      return update;
    } catch (checkError) {
      const message = txt.checkFailed;
      setError(message);
      if (!silent) toast(message, "err");
      return null;
    } finally {
      setBusy(false);
    }
  };

  const runApplyOta = async () => {
    if (!result?.bundleUrl || !result?.latestVersion) return;
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      toast(txt.needInternet, "err");
      return;
    }

    setBusy(true);
    setError("");

    try {
      toast(
        lang === "bn"
          ? `🔄 Version ${result.latestVersion} apply হচ্ছে...`
          : `🔄 Applying version ${result.latestVersion}...`,
        "ok"
      );
      await applyMobileOtaUpdate({
        version: result.latestVersion,
        bundleUrl: result.bundleUrl,
      });
    } catch (applyError) {
      setError(txt.otaFailed);
      toast(txt.otaFailed, "err");
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    runCheck({ silent: true });
  }, []);

  const isUpToDate = result && !result.hasUpdate;
  const canAutoOta = platform === "android" && otaSupported && result?.bundleUrl;

  return (
    <div style={{ ...s.card, border: `1px solid ${th.border}` }}>
      <div style={s.settingsLbl}>{txt.title}</div>

      <div style={{ fontSize: 12, color: th.txtMuted, lineHeight: 1.6, marginBottom: 12 }}>
        <div>
          {txt.installed}:{" "}
          <strong style={{ color: isUpToDate ? "#22c55e" : "#f59e0b" }}>{APP_VERSION}</strong>
        </div>
        {result?.latestVersion && (
          <div>
            {txt.latest}:{" "}
            <strong style={{ color: th.txtPrimary }}>{result.latestVersion}</strong>
          </div>
        )}
      </div>

      {canAutoOta && (
        <div
          style={{
            padding: "10px 12px",
            borderRadius: 10,
            border: "1px solid #22c55e",
            background: "rgba(34,197,94,0.08)",
            color: "#22c55e",
            fontSize: 12,
            fontWeight: 700,
            marginBottom: 12,
            lineHeight: 1.5,
          }}
        >
          {txt.mobileAuto}
        </div>
      )}

      {result?.hasUpdate && result.missingAsset && (
        <div
          style={{
            padding: "10px 12px",
            borderRadius: 10,
            border: "1px solid #f59e0b",
            background: "rgba(245,158,11,0.08)",
            color: "#f59e0b",
            fontSize: 12,
            fontWeight: 700,
            marginBottom: 12,
            lineHeight: 1.5,
          }}
        >
          {txt.noBundleHint}
        </div>
      )}

      {result?.hasUpdate && !result.missingAsset && platform === "desktop" && (
        <div
          style={{
            padding: "10px 12px",
            borderRadius: 10,
            border: "1px solid #f59e0b",
            background: "rgba(245,158,11,0.08)",
            color: "#f59e0b",
            fontSize: 12,
            fontWeight: 700,
            marginBottom: 12,
            lineHeight: 1.5,
          }}
        >
          {txt.desktopPending}
        </div>
      )}

      {isUpToDate && (
        <div
          style={{
            padding: "10px 12px",
            borderRadius: 10,
            border: "1px solid #22c55e",
            background: "rgba(34,197,94,0.08)",
            color: "#22c55e",
            fontSize: 12,
            fontWeight: 700,
            marginBottom: 12,
          }}
        >
          {txt.upToDate}
        </div>
      )}

      {error && (
        <div style={{ fontSize: 11, color: "#ef4444", marginBottom: 12, lineHeight: 1.5 }}>
          {error}
        </div>
      )}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        <button style={s.sendBtn} disabled={busy} onClick={() => runCheck()}>
          {busy ? txt.checking : txt.check}
        </button>

        {result?.hasUpdate && canAutoOta && (
          <button style={s.addCoBtn} disabled={busy} onClick={runApplyOta}>
            {busy ? txt.applying : txt.applyNow}
          </button>
        )}

        {result?.hasUpdate && result.apkUrl && platform === "android" && !otaSupported && (
          <button style={s.addCoBtn} onClick={() => openUpdateDownload(result.apkUrl)}>
            {txt.downloadApk}
          </button>
        )}
      </div>

      <div style={{ fontSize: 11, color: th.txtMuted, lineHeight: 1.6 }}>
        {platform === "desktop"
          ? txt.desktopRestart
          : otaSupported
            ? txt.mobileAuto
            : txt.mobileManualApk}
      </div>
    </div>
  );
}

export async function runStartupUpdatePrompt({ lang, toast }) {
  // Fully silent startup update (WhatsApp-style). No confirms, no "download?" prompts.
  if (typeof navigator !== "undefined" && !navigator.onLine) return;

  try {
    const update = await checkGitHubUpdate(APP_VERSION);
    if (!update.hasUpdate) return;

    // Desktop: electron-updater downloads + restarts by itself (electron/main.cjs).
    if (update.platform === "desktop") {
      return;
    }

    // Android: apply OTA bundle silently when Capgo updater is present.
    if (update.platform === "android" && update.bundleUrl) {
      await runMobileAutoUpdate({
        checkGitHubUpdate,
        APP_VERSION,
        toast,
        lang,
        silent: true,
      });
    }
  } catch {
    // Silent on startup — never block the user.
  }
}
