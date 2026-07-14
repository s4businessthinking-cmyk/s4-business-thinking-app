const { execSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const root = path.join(__dirname, "..");
const apkDir = path.join(
  root,
  "android",
  "app",
  "build",
  "outputs",
  "apk",
  "release"
);

const signedApk = path.join(apkDir, "app-release.apk");
const unsignedApk = path.join(apkDir, "app-release-unsigned.apk");
const keystorePath = path.join(os.homedir(), ".android", "debug.keystore");
const diagnoseOnly = process.argv.includes("--diagnose");

function normalizeSdkPath(value) {
  if (!value) {
    return null;
  }

  const decoded = String(value)
    .trim()
    .replace(/\\:/g, ":")
    .replace(/\\\\/g, "\\");

  return path.normalize(decoded.replace(/\//g, path.sep));
}

function readSdkFromLocalProperties() {
  const localPropertiesPath = path.join(root, "android", "local.properties");

  if (!fs.existsSync(localPropertiesPath)) {
    return null;
  }

  const content = fs.readFileSync(localPropertiesPath, "utf8");
  const sdkLine = content
    .split(/\r?\n/)
    .find((line) => /^\s*sdk\.dir\s*=/.test(line));

  if (!sdkLine) {
    return null;
  }

  const separatorIndex = sdkLine.indexOf("=");

  if (separatorIndex < 0) {
    return null;
  }

  return normalizeSdkPath(sdkLine.slice(separatorIndex + 1));
}

function resolveSdkRoot() {
  const candidates = [
    normalizeSdkPath(process.env.ANDROID_SDK_ROOT),
    normalizeSdkPath(process.env.ANDROID_HOME),
    readSdkFromLocalProperties(),
    process.env.LOCALAPPDATA
      ? path.join(process.env.LOCALAPPDATA, "Android", "Sdk")
      : null,
    process.platform === "darwin"
      ? path.join(os.homedir(), "Library", "Android", "sdk")
      : null,
    process.platform !== "win32" && process.platform !== "darwin"
      ? path.join(os.homedir(), "Android", "Sdk")
      : null,
  ].filter(Boolean);

  const uniqueCandidates = [...new Set(candidates)];

  for (const candidate of uniqueCandidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  console.error("[S4 Android] Android SDK could not be located.");
  console.error(
    "[S4 Android] Set ANDROID_SDK_ROOT/ANDROID_HOME or create android/local.properties."
  );
  process.exit(1);
}

function resolveApkSigner(sdkRoot) {
  const signerName =
    process.platform === "win32" ? "apksigner.bat" : "apksigner";

  const buildToolsRoot = path.join(sdkRoot, "build-tools");

  if (!fs.existsSync(buildToolsRoot)) {
    console.error(
      `[S4 Android] Android build-tools folder not found: ${buildToolsRoot}`
    );
    process.exit(1);
  }

  const candidates = fs
    .readdirSync(buildToolsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => ({
      version: entry.name,
      signerPath: path.join(buildToolsRoot, entry.name, signerName),
    }))
    .filter((entry) => fs.existsSync(entry.signerPath))
    .sort((left, right) =>
      right.version.localeCompare(left.version, undefined, {
        numeric: true,
        sensitivity: "base",
      })
    );

  if (candidates.length === 0) {
    console.error(
      `[S4 Android] apksigner was not found under ${buildToolsRoot}`
    );
    process.exit(1);
  }

  return candidates[0];
}

function apkIsSigned(apksignerPath, apkPath) {
  try {
    execSync(`"${apksignerPath}" verify "${apkPath}"`, {
      stdio: "pipe",
      shell: true,
    });

    return true;
  } catch {
    return false;
  }
}

function resolveSourceApk() {
  if (fs.existsSync(signedApk)) {
    return signedApk;
  }

  if (fs.existsSync(unsignedApk)) {
    return unsignedApk;
  }

  return null;
}

const sdkRoot = resolveSdkRoot();
const signer = resolveApkSigner(sdkRoot);

console.log(`[S4 Android] SDK: ${sdkRoot}`);
console.log(
  `[S4 Android] apksigner: ${signer.signerPath} (${signer.version})`
);
console.log(`[S4 Android] keystore: ${keystorePath}`);

if (!fs.existsSync(keystorePath)) {
  console.error(
    `[S4 Android] debug.keystore not found at ${keystorePath}`
  );
  process.exit(1);
}

if (diagnoseOnly) {
  console.log("[S4 Android] Signing prerequisites are ready.");
  process.exit(0);
}

const sourceApk = resolveSourceApk();

if (!sourceApk) {
  console.error(`[S4 Android] No release APK found in ${apkDir}`);
  process.exit(1);
}

if (apkIsSigned(signer.signerPath, sourceApk)) {
  console.log(`[S4 Android] APK already signed: ${sourceApk}`);

  if (sourceApk !== signedApk) {
    fs.copyFileSync(sourceApk, signedApk);
    console.log(`[S4 Android] Copied signed APK to ${signedApk}`);
  }

  process.exit(0);
}

const signedOutput = path.join(apkDir, "app-release-signed.apk");

console.log("[S4 Android] Signing APK with debug keystore...");

const signCommand = [
  `"${signer.signerPath}"`,
  "sign",
  "--ks",
  `"${keystorePath}"`,
  "--ks-pass",
  "pass:android",
  "--key-pass",
  "pass:android",
  "--ks-key-alias",
  "androiddebugkey",
  "--out",
  `"${signedOutput}"`,
  `"${sourceApk}"`,
].join(" ");

execSync(signCommand, {
  stdio: "inherit",
  shell: true,
});

if (!apkIsSigned(signer.signerPath, signedOutput)) {
  console.error("[S4 Android] Signed APK failed verification.");
  process.exit(1);
}

fs.copyFileSync(signedOutput, signedApk);

console.log(`[S4 Android] Signed APK ready: ${signedApk}`);