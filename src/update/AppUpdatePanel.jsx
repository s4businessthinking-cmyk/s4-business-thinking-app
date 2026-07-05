import { useEffect, useState } from "react";
import {
  APP_VERSION,
  checkGitHubUpdate,
  dismissAutoUpdatePrompt,
  getReleasePlatform,
  openUpdateDownload,
  shouldPromptAutoUpdate,
} from "./githubUpdateService";

export function AppUpdatePanel({ lang, th, s, toast }) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const platform = getReleasePlatform();

  const txt =
    lang === "bn"
      ? {
          title: "🔄 অ্যাপ আপডেট",
          current: "বর্তমান ভার্সন",
          latest: "GitHub latest",
          check: "আপডেট চেক করুন",
          checking: "চেক হচ্ছে...",
          available: "নতুন আপডেট পাওয়া গেছে",
          upToDate: "আপনার অ্যাপ আপ-টু-ডেট",
          download: "GitHub থেকে ডাউনলোড",
          openRelease: "Release page খুলুন",
          desktopHint:
            "Windows app GitHub release থেকে auto-update নেবে। App restart করলে update install হবে।",
          mobileHint:
            "Mobile-এ নতুন APK download করে install করুন। Settings → অ্যাপ আপডেট থেকে চেক করুন।",
          noApkHint:
            "GitHub release-এ এখনো APK আপলোড হয়নি। Release page খুলে manually APK নিন, অথবা developer-কে জানান।",
          needInternet: "Internet সংযোগ লাগবে",
          later: "পরে",
        }
      : {
          title: "🔄 App Update",
          current: "Current version",
          latest: "GitHub latest",
          check: "Check for updates",
          checking: "Checking...",
          available: "A new update is available",
          upToDate: "Your app is up to date",
          download: "Download from GitHub",
          openRelease: "Open release page",
          desktopHint:
            "The Windows app checks GitHub automatically. Restart after download to install.",
          mobileHint:
            "On mobile, download the new APK and install it from Settings → App Update.",
          noApkHint:
            "No APK is attached to the GitHub release yet. Open the release page or ask the developer to upload the APK.",
          needInternet: "Internet connection required",
          later: "Later",
        };

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
        toast(update.hasUpdate ? txt.available : txt.upToDate, update.hasUpdate ? "ok" : "ok");
      }
      return update;
    } catch (checkError) {
      const message = checkError?.message || String(checkError);
      setError(message);
      if (!silent) toast(message, "err");
      return null;
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    runCheck({ silent: true });
  }, []);

  return (
    <div style={{ ...s.card, border: `1px solid ${th.border}` }}>
      <div style={s.settingsLbl}>{txt.title}</div>

      <div style={{ fontSize: 12, color: th.txtMuted, lineHeight: 1.6, marginBottom: 12 }}>
        <div>
          {txt.current}: <strong style={{ color: th.txtPrimary }}>{APP_VERSION}</strong>
        </div>
        {result?.latestVersion && (
          <div>
            {txt.latest}: <strong style={{ color: th.txtPrimary }}>{result.latestVersion}</strong>
          </div>
        )}
      </div>

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
          {txt.noApkHint}
        </div>
      )}

      {result?.hasUpdate && !result.missingAsset && (
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
          {txt.available}
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

        {result?.hasUpdate && result.downloadUrl && (
          <button
            style={s.addCoBtn}
            onClick={() => openUpdateDownload(result.downloadUrl)}
          >
            {txt.download}
          </button>
        )}

        {result?.releaseUrl && (
          <button style={s.addCoBtn} onClick={() => openUpdateDownload(result.releaseUrl)}>
            {txt.openRelease}
          </button>
        )}
      </div>

      <div style={{ fontSize: 11, color: th.txtMuted, lineHeight: 1.6 }}>
        {platform === "desktop" ? txt.desktopHint : txt.mobileHint}
      </div>
    </div>
  );
}

export async function runStartupUpdatePrompt({ lang, toast }) {
  if (typeof navigator !== "undefined" && !navigator.onLine) return;

  try {
    const update = await checkGitHubUpdate(APP_VERSION);
    if (!update.hasUpdate || !shouldPromptAutoUpdate(update.latestVersion)) return;

    const message =
      lang === "bn"
        ? `নতুন ভার্সন ${update.latestVersion} GitHub-এ আছে। ডাউনলোড করবেন?`
        : `Version ${update.latestVersion} is available on GitHub. Download now?`;

    if (update.platform === "desktop") {
      toast(
        lang === "bn"
          ? `🔄 নতুন আপডেট ${update.latestVersion} ডাউনলোড হচ্ছে (Windows auto-update)`
          : `🔄 Update ${update.latestVersion} will download automatically on Windows`,
        "ok"
      );
      dismissAutoUpdatePrompt(update.latestVersion);
      return;
    }

    const ok = window.confirm(message);
    const targetUrl = update.downloadUrl || update.releaseUrl;
    if (ok && targetUrl) {
      openUpdateDownload(targetUrl);
    } else if (!ok) {
      dismissAutoUpdatePrompt(update.latestVersion);
    }
  } catch {
    // Silent on startup.
  }
}
