const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const androidDir = path.join(__dirname, "..", "android");
const isWin = process.platform === "win32";
const gradle = isWin ? "gradlew.bat" : "./gradlew";
const taskParts = process.argv.slice(2);
const stacktrace = taskParts.includes("--stacktrace");
const task = taskParts.find((part) => !part.startsWith("--")) || "assembleRelease";

if (!isWin) {
  const gradlewPath = path.join(androidDir, "gradlew");
  try {
    fs.chmodSync(gradlewPath, 0o755);
  } catch (error) {
    console.warn("[S4 Android] Could not chmod gradlew", error.message);
  }
}

execSync(`${gradle} ${task}${stacktrace ? " --stacktrace" : ""}`, {
  stdio: "inherit",
  cwd: androidDir,
  shell: true,
});
