const GITHUB_OWNER = import.meta.env.VITE_GITHUB_OWNER || "s4businessthinking-cmyk";
const GITHUB_REPO = import.meta.env.VITE_GITHUB_REPO || "s4-business-thinking-app";
export const APP_VERSION = import.meta.env.VITE_APP_VERSION || "0.0.0";

function parseVersion(value) {
  return String(value || "0")
    .trim()
    .replace(/^v/i, "")
    .split(".")
    .map((part) => parseInt(part, 10) || 0);
}

export function compareVersions(left, right) {
  const a = parseVersion(left);
  const b = parseVersion(right);
  const length = Math.max(a.length, b.length);

  for (let index = 0; index < length; index += 1) {
    const diff = (a[index] || 0) - (b[index] || 0);
    if (diff !== 0) return diff;
  }

  return 0;
}

function pickAssetUrl(assets, platform) {
  const list = Array.isArray(assets) ? assets : [];

  if (platform === "android") {
    return (
      list.find((asset) => /\.apk$/i.test(asset?.name || ""))?.browser_download_url ||
      null
    );
  }

  return (
    list.find((asset) => /\.exe$/i.test(asset?.name || ""))?.browser_download_url ||
    null
  );
}

export function getReleasePlatform() {
  if (typeof window === "undefined") return "web";

  if (window.Capacitor?.isNativePlatform?.() === true) {
    const platform = window.Capacitor.getPlatform?.();
    return platform === "android" ? "android" : platform || "mobile";
  }

  if (typeof window.process?.versions?.electron === "string") {
    return "desktop";
  }

  return "web";
}

export async function checkGitHubUpdate(currentVersion = APP_VERSION) {
  const response = await fetch(
    `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`,
    {
      headers: {
        Accept: "application/vnd.github+json",
      },
    }
  );

  if (!response.ok) {
    throw new Error(`GitHub release check failed (${response.status})`);
  }

  const release = await response.json();
  const latestVersion = String(release.tag_name || release.name || "")
    .trim()
    .replace(/^v/i, "");

  const platform = getReleasePlatform();
  const downloadUrl = pickAssetUrl(release.assets, platform);

  return {
    ok: true,
    currentVersion,
    latestVersion,
    hasUpdate: compareVersions(latestVersion, currentVersion) > 0,
    platform,
    downloadUrl,
    releaseUrl: release.html_url || "",
    releaseNotes: release.body || "",
    publishedAt: release.published_at || "",
  };
}

export function openUpdateDownload(url) {
  if (!url) return false;

  if (typeof window !== "undefined") {
    window.open(url, "_blank", "noopener,noreferrer");
    return true;
  }

  return false;
}

export function shouldPromptAutoUpdate(latestVersion) {
  if (!latestVersion || typeof localStorage === "undefined") return true;

  const key = `s4-update-dismiss-${latestVersion}`;
  return localStorage.getItem(key) !== "1";
}

export function dismissAutoUpdatePrompt(latestVersion) {
  if (!latestVersion || typeof localStorage === "undefined") return;
  localStorage.setItem(`s4-update-dismiss-${latestVersion}`, "1");
}
