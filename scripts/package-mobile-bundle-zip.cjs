const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const distDir = path.join(root, "dist");
const version = require(path.join(root, "package.json")).version;
const releaseDir = path.join(root, "release");
const zipName = `S4-Business-Thinking-${version}-bundle.zip`;
const zipPath = path.join(releaseDir, zipName);

if (!fs.existsSync(distDir)) {
  console.error("[S4 OTA] dist/ not found. Run npm run build:android-web first.");
  process.exit(1);
}

fs.mkdirSync(releaseDir, { recursive: true });

if (fs.existsSync(zipPath)) {
  fs.unlinkSync(zipPath);
}

execSync(`tar -a -c -f "${zipPath}" -C "${distDir}" .`, {
  cwd: root,
  stdio: "inherit",
  shell: true,
});

const stats = fs.statSync(zipPath);
console.log(`[S4 OTA] Created ${zipName} (${Math.round(stats.size / 1024)} KB)`);
