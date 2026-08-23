const { autoUpdater } = require("electron-updater");
const { app, BrowserWindow } = require("electron");
const path = require("path");

const UPDATE_CHECK_INTERVAL_MS = 2 * 60 * 60 * 1000;
const SILENT_INSTALL_DELAY_MS = 2500;

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

  let installing = false;

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.allowDowngrade = false;

  autoUpdater.on("error", (error) => {
    console.error("[S4 AutoUpdate] error", error);
  });

  autoUpdater.on("update-available", (info) => {
    console.log("[S4 AutoUpdate] update available", info?.version || "");
  });

  autoUpdater.on("update-not-available", () => {
    console.log("[S4 AutoUpdate] no update available");
  });

  autoUpdater.on("download-progress", (progress) => {
    if (progress?.percent != null) {
      console.log(`[S4 AutoUpdate] download ${Math.round(progress.percent)}%`);
    }
  });

  // WhatsApp-style: no dialog, no buttons — download then restart into new version.
  autoUpdater.on("update-downloaded", (info) => {
    console.log("[S4 AutoUpdate] downloaded", info?.version || "");
    installUpdateSilently();
  });

  function installUpdateSilently() {
    if (installing) return;
    installing = true;
    console.log("[S4 AutoUpdate] silent install starting...");
    setTimeout(() => {
      try {
        autoUpdater.quitAndInstall(false, true);
      } catch (error) {
        installing = false;
        console.error("[S4 AutoUpdate] quitAndInstall failed", error);
      }
    }, SILENT_INSTALL_DELAY_MS);
  }

  const checkForUpdates = () => {
    autoUpdater.checkForUpdates().catch((error) => {
      console.error("[S4 AutoUpdate] check failed", error);
    });
  };

  setTimeout(checkForUpdates, 4000);
  setInterval(checkForUpdates, UPDATE_CHECK_INTERVAL_MS);
}
