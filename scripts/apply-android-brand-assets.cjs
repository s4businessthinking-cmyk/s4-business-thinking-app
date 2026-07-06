const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const sourceLogo = path.join(root, "public", "s4-logo.png");
const resDir = path.join(root, "android", "app", "src", "main", "res");

const densityDirs = [
  "mipmap-mdpi",
  "mipmap-hdpi",
  "mipmap-xhdpi",
  "mipmap-xxhdpi",
  "mipmap-xxxhdpi",
];

const iconNames = ["ic_launcher.png", "ic_launcher_round.png", "ic_launcher_foreground.png"];

if (!fs.existsSync(sourceLogo)) {
  console.error("[S4 Android] Missing public/s4-logo.png");
  process.exit(1);
}

for (const densityDir of densityDirs) {
  const targetDir = path.join(resDir, densityDir);
  fs.mkdirSync(targetDir, { recursive: true });
  for (const iconName of iconNames) {
    fs.copyFileSync(sourceLogo, path.join(targetDir, iconName));
  }
}

const splashTargets = [
  path.join(resDir, "drawable", "splash.png"),
  path.join(resDir, "drawable-port-hdpi", "splash.png"),
  path.join(resDir, "drawable-port-mdpi", "splash.png"),
  path.join(resDir, "drawable-port-xhdpi", "splash.png"),
  path.join(resDir, "drawable-port-xxhdpi", "splash.png"),
  path.join(resDir, "drawable-port-xxxhdpi", "splash.png"),
  path.join(resDir, "drawable-land-hdpi", "splash.png"),
  path.join(resDir, "drawable-land-mdpi", "splash.png"),
  path.join(resDir, "drawable-land-xhdpi", "splash.png"),
  path.join(resDir, "drawable-land-xxhdpi", "splash.png"),
  path.join(resDir, "drawable-land-xxxhdpi", "splash.png"),
];

for (const splashPath of splashTargets) {
  const dir = path.dirname(splashPath);
  if (!fs.existsSync(dir)) continue;
  fs.copyFileSync(sourceLogo, splashPath);
}

const launcherBackground = path.join(resDir, "values", "ic_launcher_background.xml");
fs.writeFileSync(
  launcherBackground,
  `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="ic_launcher_background">#071427</color>
</resources>
`
);

console.log("[S4 Android] Applied S4 logo to launcher icons and splash screens.");
