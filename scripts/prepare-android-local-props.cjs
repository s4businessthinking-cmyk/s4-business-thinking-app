const fs = require("fs");
const path = require("path");

const sdkDir = process.env.ANDROID_SDK_ROOT || process.env.ANDROID_HOME || "";
const localPropsPath = path.join(__dirname, "..", "android", "local.properties");

if (!sdkDir) {
  console.warn("[S4 Android] ANDROID_SDK_ROOT/ANDROID_HOME not set; skipping local.properties");
  process.exit(0);
}

const normalized = sdkDir.replace(/\\/g, "/");
fs.writeFileSync(localPropsPath, `sdk.dir=${normalized}\n`);
console.log(`[S4 Android] Wrote local.properties -> ${normalized}`);
