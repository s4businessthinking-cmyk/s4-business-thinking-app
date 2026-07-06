const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

const root = path.join(__dirname, "..");
const sourceLogo = path.join(root, "public", "s4-logo.png");
const resDir = path.join(root, "android", "app", "src", "main", "res");
const appLogoOut = path.join(root, "src", "assets", "s4-logo.png");

const BRAND_BG = { r: 7, g: 20, b: 39, alpha: 1 };

const launcherSizes = {
  "mipmap-mdpi": 48,
  "mipmap-hdpi": 72,
  "mipmap-xhdpi": 96,
  "mipmap-xxhdpi": 144,
  "mipmap-xxxhdpi": 192,
};

const foregroundSizes = {
  "mipmap-mdpi": 108,
  "mipmap-hdpi": 162,
  "mipmap-xhdpi": 216,
  "mipmap-xxhdpi": 324,
  "mipmap-xxxhdpi": 432,
};

const splashPortrait = {
  "drawable-port-mdpi": { width: 320, height: 480 },
  "drawable-port-hdpi": { width: 480, height: 800 },
  "drawable-port-xhdpi": { width: 720, height: 1280 },
  "drawable-port-xxhdpi": { width: 960, height: 1600 },
  "drawable-port-xxxhdpi": { width: 1280, height: 1920 },
};

const splashLandscape = {
  "drawable-land-mdpi": { width: 480, height: 320 },
  "drawable-land-hdpi": { width: 800, height: 480 },
  "drawable-land-xhdpi": { width: 1280, height: 720 },
  "drawable-land-xxhdpi": { width: 1600, height: 960 },
  "drawable-land-xxxhdpi": { width: 1920, height: 1280 },
};

async function writeSquareIcon(input, outputPath, size) {
  await sharp(input)
    .resize(size, size, {
      fit: "contain",
      background: BRAND_BG,
    })
    .png({ compressionLevel: 9 })
    .toFile(outputPath);
}

async function writeSplash(input, outputPath, width, height) {
  const logoWidth = Math.round(Math.min(width, height) * 0.62);
  const logo = await sharp(input)
    .resize(logoWidth, logoWidth, {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer();

  await sharp({
    create: {
      width,
      height,
      channels: 4,
      background: BRAND_BG,
    },
  })
    .composite([{ input: logo, gravity: "center" }])
    .png({ compressionLevel: 9 })
    .toFile(outputPath);
}

async function main() {
  if (!fs.existsSync(sourceLogo)) {
    console.error("[S4 Android] Missing public/s4-logo.png");
    process.exit(1);
  }

  fs.mkdirSync(path.dirname(appLogoOut), { recursive: true });
  await sharp(sourceLogo)
    .resize(256, 256, { fit: "contain", background: BRAND_BG })
    .png({ compressionLevel: 9 })
    .toFile(appLogoOut);

  for (const [folder, size] of Object.entries(launcherSizes)) {
    const targetDir = path.join(resDir, folder);
    fs.mkdirSync(targetDir, { recursive: true });

    const launcherPath = path.join(targetDir, "ic_launcher.png");
    const roundPath = path.join(targetDir, "ic_launcher_round.png");
    const foregroundPath = path.join(targetDir, "ic_launcher_foreground.png");

    await writeSquareIcon(sourceLogo, launcherPath, size);
    await writeSquareIcon(sourceLogo, roundPath, size);
    await writeSquareIcon(sourceLogo, foregroundPath, foregroundSizes[folder]);
  }

  const defaultSplash = path.join(resDir, "drawable", "splash.png");
  fs.mkdirSync(path.dirname(defaultSplash), { recursive: true });
  await writeSplash(sourceLogo, defaultSplash, 1280, 1920);

  for (const [folder, size] of Object.entries(splashPortrait)) {
    const target = path.join(resDir, folder, "splash.png");
    if (!fs.existsSync(path.dirname(target))) continue;
    await writeSplash(sourceLogo, target, size.width, size.height);
  }

  for (const [folder, size] of Object.entries(splashLandscape)) {
    const target = path.join(resDir, folder, "splash.png");
    if (!fs.existsSync(path.dirname(target))) continue;
    await writeSplash(sourceLogo, target, size.width, size.height);
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

  const stats = fs.statSync(appLogoOut);
  console.log(
    `[S4 Android] Generated resized launcher icons, splash screens, and app logo (${Math.round(stats.size / 1024)} KB).`
  );
}

main().catch((error) => {
  console.error("[S4 Android] Brand asset generation failed:", error);
  process.exit(1);
});
