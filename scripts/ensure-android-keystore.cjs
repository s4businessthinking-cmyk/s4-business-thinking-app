const { execSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const androidDir = path.join(os.homedir(), ".android");
const keystorePath = path.join(androidDir, "debug.keystore");

if (fs.existsSync(keystorePath)) {
  console.log("[S4 Android] debug.keystore already exists");
  process.exit(0);
}

fs.mkdirSync(androidDir, { recursive: true });

const keytoolCandidates = [
  process.env.JAVA_HOME
    ? path.join(process.env.JAVA_HOME, "bin", "keytool.exe")
    : null,
  "C:\\Program Files\\Android\\Android Studio\\jbr\\bin\\keytool.exe",
  path.join(
    process.env.LOCALAPPDATA || "",
    "Programs",
    "Android Studio",
    "jbr",
    "bin",
    "keytool.exe"
  ),
  "keytool",
].filter(Boolean);

let keytool = null;
for (const candidate of keytoolCandidates) {
  if (candidate === "keytool") {
    keytool = candidate;
    break;
  }
  if (fs.existsSync(candidate)) {
    keytool = candidate;
    break;
  }
}

if (!keytool) {
  console.error("[S4 Android] keytool not found. Install Java/Android Studio first.");
  process.exit(1);
}

const command = [
  `"${keytool}"`,
  "-genkeypair",
  "-v",
  "-storetype",
  "PKCS12",
  "-keystore",
  `"${keystorePath}"`,
  "-alias",
  "androiddebugkey",
  "-keyalg",
  "RSA",
  "-keysize",
  "2048",
  "-validity",
  "10000",
  "-storepass",
  "android",
  "-keypass",
  "android",
  '-dname',
  '"CN=Android Debug,O=Android,C=US"',
].join(" ");

console.log("[S4 Android] Creating debug.keystore for signed release APK...");
execSync(command, { stdio: "inherit", shell: true });
console.log("[S4 Android] debug.keystore ready");
