const { autoUpdater } = require("electron-updater");
const { dialog } = require("electron");
const { app, BrowserWindow } = require("electron");
const path = require("path");

const UPDATE_CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000;

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: "S4 Business Thinking",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (!app.isPackaged) {
    win.loadURL("http://localhost:5173");
  } else {
    win.loadFile(path.join(__dirname, "../dist/index.html"));
  }
}

app.whenReady().then(() => {
  createWindow();
  setupAutoUpdater();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

function setupAutoUpdater() {
  if (!app.isPackaged) return;

  let updateReady = false;

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.allowDowngrade = false;

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
    updateReady = true;
    promptRestartForUpdate();
  });

  const checkForUpdates = () => {
    autoUpdater.checkForUpdates().catch((error) => {
      console.error("[S4 AutoUpdate] check failed", error);
    });
  };

  setTimeout(checkForUpdates, 5000);
  setInterval(checkForUpdates, UPDATE_CHECK_INTERVAL_MS);

  app.on("browser-window-created", () => {
    if (updateReady) {
      setTimeout(promptRestartForUpdate, 1500);
    }
  });
}

function promptRestartForUpdate() {
  dialog
    .showMessageBox({
      type: "warning",
      buttons: ["Restart now", "Later"],
      defaultId: 0,
      cancelId: 1,
      noLink: true,
      title: "S4 Business Thinking — Update Ready",
      message: "নতুন feature ব্যবহার করতে app restart করতে হবে।",
      detail:
        "The update has been downloaded. Until you restart, the app will keep running the old version and new features will not appear.\n\nClick 'Restart now' to install the update.",
    })
    .then((result) => {
      if (result.response === 0) {
        autoUpdater.quitAndInstall(false, true);
      }
    });
}
