const fs = require("fs");
const path = require("path");
const {
  RELEASE_CONFIG,
  getVersion,
  getTag,
  getGithubReleaseUrl,
} = require("./release-config.cjs");

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function copyFileSafe(from, to) {
  ensureDir(path.dirname(to));
  fs.copyFileSync(from, to);
  return to;
}

function findWindowsInstaller(releaseDir, version) {
  if (!fs.existsSync(releaseDir)) return null;

  const candidates = [
    `S4.Business.Thinking.Setup.${version}.exe`,
    `S4 Business Thinking Setup ${version}.exe`,
  ];

  for (const name of candidates) {
    const candidatePath = path.join(releaseDir, name);
    if (fs.existsSync(candidatePath)) return candidatePath;
  }

  const installers = fs
    .readdirSync(releaseDir)
    .filter((name) => /S4(\.Business\.Thinking| Business Thinking) Setup/i.test(name) && /\.exe$/i.test(name))
    .map((name) => path.join(releaseDir, name))
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);

  return installers[0] || null;
}

function resolveAndroidApk(root) {
  const candidates = [
    path.join(root, "android", "app", "build", "outputs", "apk", "release", "app-release.apk"),
    path.join(
      root,
      "android",
      "app",
      "build",
      "outputs",
      "apk",
      "release",
      "app-release-signed.apk"
    ),
    path.join(
      root,
      "android",
      "app",
      "build",
      "outputs",
      "apk",
      "release",
      "app-release-unsigned.apk"
    ),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }

  return null;
}

function resolveBundleZip(root, version) {
  const names = [
    RELEASE_CONFIG.fileNames.bundle(version),
    `S4-Business-Thinking-${version}-bundle.zip`,
  ];

  const dirs = [path.join(root, "release"), root];
  for (const dir of dirs) {
    for (const name of names) {
      const candidate = path.join(dir, name);
      if (fs.existsSync(candidate)) return candidate;
    }
  }

  return null;
}

function copyIfExists(from, to, copied) {
  if (!from || !fs.existsSync(from)) return false;
  copyFileSafe(from, to);
  copied.push({ from, to });
  return true;
}

function writeManifest(targetDir, payload) {
  const manifestPath = path.join(targetDir, RELEASE_CONFIG.fileNames.manifest);
  fs.writeFileSync(manifestPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  return manifestPath;
}

function writeInstallReadme(targetDir, version) {
  const readmePath = path.join(targetDir, RELEASE_CONFIG.fileNames.readme);
  const text = [
    "S4 Business Thinking - Customer Install Files",
    "============================================",
    "",
    `Version: ${version}`,
    `GitHub: ${getGithubReleaseUrl(version)}`,
    "",
    "Windows PC:",
    `  Install: S4 Business Thinking Setup ${version}.exe`,
    "  Uninstall not required for updates. Restart app after auto-update.",
    "",
    "Android Mobile:",
    `  Install once: ${RELEASE_CONFIG.fileNames.apk(version)}`,
    "  After v1.0.18, future updates are automatic inside the app.",
    "",
    "This folder is auto-synced from project build.",
    "Do not manually move files to other folders.",
    "",
  ].join("\r\n");
  fs.writeFileSync(readmePath, text, "utf8");
  return readmePath;
}

function syncReleaseOutputs({ requireAll = false } = {}) {
  const root = path.join(__dirname, "..");
  const version = getVersion();
  const projectReleaseDir = RELEASE_CONFIG.projectReleaseDir;
  const usbDeliveryDir = RELEASE_CONFIG.usbDeliveryDir;
  const copied = [];
  const missing = [];

  ensureDir(projectReleaseDir);
  ensureDir(usbDeliveryDir);

  const apkSource = resolveAndroidApk(root);
  const bundleSource = resolveBundleZip(root, version);
  const exeSource = findWindowsInstaller(projectReleaseDir, version);

  const apkTarget = path.join(projectReleaseDir, RELEASE_CONFIG.fileNames.apk(version));
  const bundleTarget = path.join(projectReleaseDir, RELEASE_CONFIG.fileNames.bundle(version));

  if (!copyIfExists(apkSource, apkTarget, copied)) missing.push("apk");
  if (!copyIfExists(bundleSource, bundleTarget, copied)) missing.push("bundle");
  if (!exeSource) missing.push("exe");

  for (const entry of copied) {
    const fileName = path.basename(entry.to);
    copyFileSafe(entry.to, path.join(usbDeliveryDir, fileName));
  }

  if (exeSource) {
    const exeName = path.basename(exeSource);
    copyFileSafe(exeSource, path.join(usbDeliveryDir, exeName));

    for (const extra of ["latest.yml"]) {
      const extraSource = path.join(projectReleaseDir, extra);
      if (fs.existsSync(extraSource)) {
        copyFileSafe(extraSource, path.join(usbDeliveryDir, extra));
        copyFileSafe(extraSource, path.join(projectReleaseDir, extra));
      }
    }

    const blockmaps = fs
      .readdirSync(projectReleaseDir)
      .filter((name) => name.toLowerCase().endsWith(".blockmap"));
    for (const blockmap of blockmaps) {
      copyFileSafe(
        path.join(projectReleaseDir, blockmap),
        path.join(usbDeliveryDir, blockmap)
      );
    }
  }

  const manifest = {
    app: "S4 Business Thinking",
    version,
    tag: getTag(version),
    syncedAt: new Date().toISOString(),
    paths: {
      projectReleaseDir,
      usbDeliveryDir,
      githubLatest: RELEASE_CONFIG.github.latestUrl,
      githubRelease: getGithubReleaseUrl(version),
    },
    files: {
      exe: exeSource ? path.basename(exeSource) : null,
      apk: fs.existsSync(apkTarget) ? path.basename(apkTarget) : null,
      bundle: fs.existsSync(bundleTarget) ? path.basename(bundleTarget) : null,
    },
  };

  writeManifest(projectReleaseDir, manifest);
  writeManifest(usbDeliveryDir, manifest);
  writeInstallReadme(projectReleaseDir, version);
  writeInstallReadme(usbDeliveryDir, version);

  if (requireAll && missing.length > 0) {
    throw new Error(`RELEASE_SYNC_MISSING:${missing.join(",")}`);
  }

  console.log("[S4 Release] Locked sync complete");
  console.log(`[S4 Release] Version: ${version}`);
  console.log(`[S4 Release] Project folder: ${projectReleaseDir}`);
  console.log(`[S4 Release] USB folder: ${usbDeliveryDir}`);
  console.log(`[S4 Release] GitHub: ${getGithubReleaseUrl(version)}`);
  if (missing.length > 0) {
    console.log(`[S4 Release] Missing optional outputs: ${missing.join(", ")}`);
  }

  return { version, copied, missing, manifest };
}

if (require.main === module) {
  try {
    const requireAll = process.argv.includes("--require-all");
    syncReleaseOutputs({ requireAll });
  } catch (error) {
    console.error("[S4 Release] Sync failed:", error.message || error);
    process.exit(1);
  }
}

module.exports = { syncReleaseOutputs };
