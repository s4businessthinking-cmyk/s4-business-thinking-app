const { execSync } = require("child_process");
const path = require("path");

process.env.DISABLE_PWA = "1";

execSync("npx vite build", {
  stdio: "inherit",
  cwd: path.join(__dirname, ".."),
  env: process.env,
  shell: true,
});
