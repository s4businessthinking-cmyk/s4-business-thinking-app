const fs = require("fs");

const file = "electron/main.cjs";
let text = fs.readFileSync(file, "utf8");

if (!text.includes('electron-updater')) {
  text = `const { autoUpdater } = require("electron-updater");\nconst { dialog } = require("electron");\n` + text;
}

if (!text.includes("function setupAutoUpdater")) {
  const updaterCode = `

function setupAutoUpdater() {
  if (!app.isPackaged) return;

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on("error", (error) => {
    console.error("[S4 AutoUpdate] error", error);
  });

  autoUpdater.on("update-available", () => {
    console.log("[S4 AutoUpdate] update available");
  });

  autoUpdater.on("update-not-available", () => {
    console.log("[S4 AutoUpdate] no update available");
  });

  autoUpdater.on("update-downloaded", () => {
    dialog.showMessageBox({
      type: "info",
      buttons: ["Restart now", "Later"],
      defaultId: 0,
      cancelId: 1,
      title: "S4 Business Thinking Update",
      message: "A new update has been downloaded. Restart the app to install it."
    }).then((result) => {
      if (result.response === 0) {
        autoUpdater.quitAndInstall();
      }
    });
  });

  setTimeout(() => {
    autoUpdater.checkForUpdates().catch((error) => {
      console.error("[S4 AutoUpdate] check failed", error);
    });
  }, 5000);
}
`;
  text += updaterCode;
}

if (!text.includes("setupAutoUpdater();")) {
  text = text.replace(/createWindow\(\);\s*/, (match) => `${match}\n  setupAutoUpdater();\n`);
}

fs.writeFileSync(file, text, "utf8");
console.log("electron/main.cjs updated with auto updater");
