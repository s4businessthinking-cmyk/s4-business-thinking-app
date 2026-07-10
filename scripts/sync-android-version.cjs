const fs = require("fs");
const path = require("path");
const { getVersion } = require("./release-config.cjs");

function toVersionCode(version) {
  const parts = String(version)
    .trim()
    .split(".")
    .map((part) => parseInt(part, 10) || 0);

  const [major = 0, minor = 0, patch = 0] = parts;
  return major * 10000 + minor * 100 + patch;
}

function syncAndroidVersion() {
  const version = getVersion();
  const versionCode = toVersionCode(version);
  const gradlePath = path.join(__dirname, "..", "android", "app", "build.gradle");

  if (!fs.existsSync(gradlePath)) {
    throw new Error("ANDROID_BUILD_GRADLE_NOT_FOUND");
  }

  let content = fs.readFileSync(gradlePath, "utf8");
  content = content.replace(/versionCode\s+\d+/, `versionCode ${versionCode}`);
  content = content.replace(/versionName\s+"[^"]*"/, `versionName "${version}"`);
  fs.writeFileSync(gradlePath, content);

  console.log(`[S4 Release] Android version synced: ${version} (${versionCode})`);
  return { version, versionCode };
}

if (require.main === module) {
  try {
    syncAndroidVersion();
  } catch (error) {
    console.error("[S4 Release] Android version sync failed:", error.message || error);
    process.exit(1);
  }
}

module.exports = { syncAndroidVersion };
