const { execSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const apkDir = path.join(__dirname, "..", "android", "app", "build", "outputs", "apk", "release");
const signedApk = path.join(apkDir, "app-release.apk");
const unsignedApk = path.join(apkDir, "app-release-unsigned.apk");
const keystorePath = path.join(os.homedir(), ".android", "debug.keystore");

const sdkRoot = process.env.ANDROID_SDK_ROOT || process.env.ANDROID_HOME;
if (!sdkRoot) {
  console.error("[S4 Android] ANDROID_SDK_ROOT or ANDROID_HOME is required to sign APK.");
  process.exit(1);
}

const apksignerName = process.platform === "win32" ? "apksigner.bat" : "apksigner";
const buildToolsDir = path.join(sdkRoot, "build-tools", "36.0.0");
const apksignerPath = path.join(buildToolsDir, apksignerName);

if (!fs.existsSync(apksignerPath)) {
  console.error(`[S4 Android] apksigner not found at ${apksignerPath}`);
  process.exit(1);
}

if (!fs.existsSync(keystorePath)) {
  console.error(`[S4 Android] debug.keystore not found at ${keystorePath}`);
  process.exit(1);
}

function apkIsSigned(apkPath) {
  try {
    execSync(`"${apksignerPath}" verify "${apkPath}"`, { stdio: "pipe", shell: true });
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

const sourceApk = resolveSourceApk();
if (!sourceApk) {
  console.error(`[S4 Android] No release APK found in ${apkDir}`);
  process.exit(1);
}

if (apkIsSigned(sourceApk)) {
  console.log(`[S4 Android] APK already signed: ${sourceApk}`);
  if (sourceApk !== signedApk) {
    fs.copyFileSync(sourceApk, signedApk);
    console.log(`[S4 Android] Copied signed APK to ${signedApk}`);
  }
  process.exit(0);
}

const signedOutput = path.join(apkDir, "app-release-signed.apk");
console.log(`[S4 Android] Signing unsigned APK with debug keystore...`);

const signCommand = [
  `"${apksignerPath}"`,
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

execSync(signCommand, { stdio: "inherit", shell: true });

if (!apkIsSigned(signedOutput)) {
  console.error("[S4 Android] Signed APK failed verification.");
  process.exit(1);
}

fs.copyFileSync(signedOutput, signedApk);
console.log(`[S4 Android] Signed APK ready: ${signedApk}`);
