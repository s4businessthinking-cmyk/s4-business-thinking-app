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

const plugins = [
  {
    module: "capgo-capacitor-updater",
    dir: "../node_modules/@capgo/capacitor-updater/android",
    pkg: "@capgo/capacitor-updater",
    classpath: "ee.forgr.capacitor_updater.CapacitorUpdaterPlugin",
  },
  {
    module: "capacitor-filesystem",
    dir: "../node_modules/@capacitor/filesystem/android",
    pkg: "@capacitor/filesystem",
    classpath: "com.capacitorjs.plugins.filesystem.FilesystemPlugin",
  },
  {
    module: "capacitor-share",
    dir: "../node_modules/@capacitor/share/android",
    pkg: "@capacitor/share",
    classpath: "com.capacitorjs.plugins.share.SharePlugin",
  },
];

let settings = fs.readFileSync(settingsPath, "utf8");
let buildGradle = fs.readFileSync(buildGradlePath, "utf8");
for (const plugin of plugins) {
  if (!settings.includes(`':${plugin.module}'`)) {
    settings = `${settings.trim()}\n\ninclude ':${plugin.module}'\nproject(':${plugin.module}').projectDir = new File('${plugin.dir}')\n`;
  }
  const depLine = `    implementation project(':${plugin.module}')`;
  if (!buildGradle.includes(depLine)) {
    buildGradle = buildGradle.replace(/dependencies \{\n/, `dependencies {\n${depLine}\n`);
  }
}
fs.writeFileSync(settingsPath, settings);
fs.writeFileSync(buildGradlePath, buildGradle);

fs.mkdirSync(path.dirname(pluginsJsonPath), { recursive: true });
fs.writeFileSync(
  pluginsJsonPath,
  `${JSON.stringify(plugins.map(({ pkg, classpath }) => ({ pkg, classpath })), null, 2)}\n`
);
console.log("[S4 Android] Capacitor native plugins synced:", plugins.map((p) => p.pkg).join(", "));
