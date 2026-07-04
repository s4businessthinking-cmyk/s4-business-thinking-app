const fs = require("fs");

const file = "electron/main.cjs";
let text = fs.readFileSync(file, "utf8");

if (!text.includes("setupAutoUpdater();")) {
  if (text.includes("app.whenReady().then(createWindow);")) {
    text = text.replace(
      "app.whenReady().then(createWindow);",
      "app.whenReady().then(() => {\n  createWindow();\n  setupAutoUpdater();\n});"
    );
  } else if (text.includes("createWindow();")) {
    text = text.replace(/createWindow\(\);\s*/, (match) => `${match}\n  setupAutoUpdater();\n`);
  } else {
    console.error("Could not find app startup createWindow call. Please inspect electron/main.cjs");
    process.exit(1);
  }
}

fs.writeFileSync(file, text, "utf8");
console.log("setupAutoUpdater call checked/added");
