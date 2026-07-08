const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const distDir = path.join(root, "dist");
const assetsDir = path.join(root, "android", "app", "src", "main", "assets");
const publicDir = path.join(assetsDir, "public");

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(from, to);
    else fs.copyFileSync(from, to);
  }
}

if (!fs.existsSync(distDir)) {
  console.error("[S4 Android] dist/ not found. Run npm run build first.");
  process.exit(1);
}

if (fs.existsSync(publicDir)) fs.rmSync(publicDir, { recursive: true, force: true });
copyDir(distDir, publicDir);

fs.writeFileSync(
  path.join(assetsDir, "capacitor.config.json"),
  JSON.stringify(
    {
      appId: "com.s4businessthinking.app",
      appName: "S4 Business Thinking",
      webDir: "public",
      server: {
        androidScheme: "https",
        allowNavigation: [
          "github.com",
          "*.github.com",
          "*.githubusercontent.com",
        ],
      },
      plugins: {
        CapacitorUpdater: {
          autoUpdate: false,
          resetWhenUpdate: false,
        },
      },
    },
    null,
    2
  )
);

require("./sync-capacitor-updater-android.cjs");
console.log("[S4 Android] Synced dist -> android/app/src/main/assets/public");
