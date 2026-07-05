const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const androidDir = path.join(__dirname, "..", "android");
const isWin = process.platform === "win32";
const gradle = isWin ? "gradlew.bat" : "./gradlew";
const task = process.argv[2] || "assembleRelease";

if (!isWin) {
  const gradlewPath = path.join(androidDir, "gradlew");
  try {
    fs.chmodSync(gradlewPath, 0o755);
  } catch (error) {
    console.warn("[S4 Android] Could not chmod gradlew", error.message);
  }
}

execSync(`${gradle} ${task}`, {
  stdio: "inherit",
  cwd: androidDir,
  shell: true,
});
