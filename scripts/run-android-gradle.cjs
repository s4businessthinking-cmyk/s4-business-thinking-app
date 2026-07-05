const { execSync } = require("child_process");
const path = require("path");

const androidDir = path.join(__dirname, "..", "android");
const isWin = process.platform === "win32";
const gradle = isWin ? "gradlew.bat" : "./gradlew";
const task = process.argv[2] || "assembleRelease";

execSync(`${gradle} ${task}`, {
  stdio: "inherit",
  cwd: androidDir,
  shell: true,
});
