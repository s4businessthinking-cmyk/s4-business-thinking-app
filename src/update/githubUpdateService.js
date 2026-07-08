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

function pickAndroidBundleUrl(assets) {
  const list = Array.isArray(assets) ? assets : [];

  return (
    list.find((asset) => /-bundle\.zip$/i.test(asset?.name || ""))?.browser_download_url ||
    list.find((asset) => /bundle\.zip$/i.test(asset?.name || ""))?.browser_download_url ||
    null
  );
}

function pickAndroidApkUrl(assets) {
  const list = Array.isArray(assets) ? assets : [];

  return list.find((asset) => /\.apk$/i.test(asset?.name || ""))?.browser_download_url || null;
}

function pickAssetUrl(assets, platform) {
  const list = Array.isArray(assets) ? assets : [];

  if (platform === "android") {
    return pickAndroidBundleUrl(list) || pickAndroidApkUrl(list);
  }

  if (platform === "desktop") {
    return (
      list.find((asset) => /\.exe$/i.test(asset?.name || "") && !/\.blockmap$/i.test(asset?.name || ""))
        ?.browser_download_url ||
      null
    );
  }

  return null;
}

function mergeReleasesByTag(releases) {
  const grouped = new Map();

  for (const release of releases) {
    if (release?.draft || release?.prerelease) continue;

    const tag = String(release.tag_name || "").trim();
    if (!tag) continue;

    const existing = grouped.get(tag);
    if (!existing) {
      grouped.set(tag, {
        ...release,
        assets: [...(release.assets || [])],
      });
      continue;
    }

    existing.assets = [...(existing.assets || []), ...(release.assets || [])];
    if (release.published_at && (!existing.published_at || release.published_at > existing.published_at)) {
      existing.published_at = release.published_at;
      existing.html_url = release.html_url || existing.html_url;
      existing.body = release.body || existing.body;
    }
  }

  return [...grouped.values()];
}

function pickLatestRelease(releases) {
  const merged = mergeReleasesByTag(releases);
  let latest = null;

  for (const release of merged) {
    const version = String(release.tag_name || release.name || "")
      .trim()
      .replace(/^v/i, "");
    if (!version) continue;

    if (!latest || compareVersions(version, latest.latestVersion) > 0) {
      latest = {
        release,
        latestVersion: version,
      };
    }
  }

  return latest;
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
    `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases?per_page=20`,
    {
      headers: {
        Accept: "application/vnd.github+json",
      },
    }
  );

  if (!response.ok) {
    throw new Error("UPDATE_CHECK_FAILED");
  }

  const releases = await response.json();
  const picked = pickLatestRelease(releases);

  if (!picked?.release) {
    throw new Error("UPDATE_NOT_FOUND");
  }

  const { release, latestVersion } = picked;
  const platform = getReleasePlatform();
  const bundleUrl = platform === "android" ? pickAndroidBundleUrl(release.assets) : null;
  const apkUrl = platform === "android" ? pickAndroidApkUrl(release.assets) : null;
  const downloadUrl = pickAssetUrl(release.assets, platform);

  return {
    ok: true,
    currentVersion,
    latestVersion,
    hasUpdate: compareVersions(latestVersion, currentVersion) > 0,
    platform,
    downloadUrl,
    bundleUrl,
    apkUrl,
    releaseUrl: release.html_url || "",
    releaseNotes: release.body || "",
    publishedAt: release.published_at || "",
    missingAsset: platform === "android" && !bundleUrl && !apkUrl,
  };
}

export function openUpdateDownload(url) {
  if (!url || typeof window === "undefined") return false;

  const isAndroidNative =
    window.Capacitor?.isNativePlatform?.() === true &&
    window.Capacitor.getPlatform?.() === "android";

  if (isAndroidNative) {
    // WebView often blocks window.open; use a real anchor click instead.
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.target = "_blank";
    anchor.rel = "noopener noreferrer";
    anchor.style.display = "none";
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    return true;
  }

  window.open(url, "_blank", "noopener,noreferrer");
  return true;
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
