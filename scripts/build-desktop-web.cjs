const { execSync } = require("child_process");
const path = require("path");

process.env.DISABLE_PWA = "1";

execSync("npx vite build", {
  stdio: "inherit",
  cwd: path.join(__dirname, ".."),
  env: process.env,
  shell: true,
});

const fs = require("fs");
const wasmFrom = path.join(__dirname, "..", "node_modules", "sql.js", "dist", "sql-wasm.wasm");
const wasmTo = path.join(__dirname, "..", "dist", "sql-wasm.wasm");
if (fs.existsSync(wasmFrom)) {
  fs.copyFileSync(wasmFrom, wasmTo);
  console.log("[S4] Copied sql-wasm.wasm to dist/");
}
