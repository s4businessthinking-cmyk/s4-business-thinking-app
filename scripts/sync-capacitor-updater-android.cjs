const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const settingsPath = path.join(root, "android", "capacitor.settings.gradle");
const buildGradlePath = path.join(root, "android", "app", "capacitor.build.gradle");
const pluginsJsonPath = path.join(
  root,
  "android",
  "app",
  "src",
  "main",
  "assets",
  "capacitor.plugins.json"
);

const updaterModule = `include ':capgo-capacitor-updater'
project(':capgo-capacitor-updater').projectDir = new File('../node_modules/@capgo/capacitor-updater/android')`;

let settings = fs.readFileSync(settingsPath, "utf8");
if (!settings.includes("capgo-capacitor-updater")) {
  fs.writeFileSync(settingsPath, `${settings.trim()}\n${updaterModule}\n`);
}

let buildGradle = fs.readFileSync(buildGradlePath, "utf8");
const depLine = "    implementation project(':capgo-capacitor-updater')";
if (!buildGradle.includes("capgo-capacitor-updater")) {
  buildGradle = buildGradle.replace(
    /dependencies \{\s*\n\s*\n\s*\}/,
    `dependencies {\n${depLine}\n\n}`
  );
  fs.writeFileSync(buildGradlePath, buildGradle);
}

const plugins = [
  {
    pkg: "@capgo/capacitor-updater",
    classpath: "ee.forgr.capacitor_updater.CapacitorUpdaterPlugin",
  },
];

fs.mkdirSync(path.dirname(pluginsJsonPath), { recursive: true });
fs.writeFileSync(pluginsJsonPath, `${JSON.stringify(plugins, null, 2)}\n`);
console.log("[S4 Android] Capacitor Updater native plugin synced");
