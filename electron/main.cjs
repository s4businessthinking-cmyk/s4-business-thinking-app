const { autoUpdater } = require("electron-updater");
const { app, BrowserWindow, dialog, ipcMain, shell } = require("electron");
const fs = require("fs");
const path = require("path");

const UPDATE_CHECK_INTERVAL_MS = 2 * 60 * 60 * 1000;
const SILENT_INSTALL_DELAY_MS = 2500;
const BACKUP_KEEP_PER_SHOP = 30;
const BACKUP_FILE_RE = /^(S4-backup-[\w-]+)-\d{8}-\d{4}\.s4backup$/;

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
      preload: path.join(__dirname, "preload.cjs"),
    },
  });
  // The default menu bar grabs F10 on Windows, which the invoice screen needs for product search.
  win.removeMenu();

  if (!app.isPackaged) {
    win.loadURL(process.env.S4_DEV_URL || "http://localhost:5173");
  } else {
    win.loadFile(path.join(__dirname, "../dist/index.html"));
  }
}

app.whenReady().then(() => {
  setupBackupIpc();
  setupPrintIpc();
  createWindow();
  setupAutoUpdater();
});

function setupBackupIpc() {
  const settingsFile = () => path.join(app.getPath("userData"), "backup-settings.json");
  const backupFolder = () => {
    try {
      const folder = JSON.parse(fs.readFileSync(settingsFile(), "utf8")).folder;
      if (folder) return folder;
    } catch {}
    return path.join(app.getPath("documents"), "S4 Business Thinking Backups");
  };

  ipcMain.handle("s4-backup:get-folder", () => backupFolder());

  ipcMain.handle("s4-backup:choose-folder", async (event) => {
    const result = await dialog.showOpenDialog(BrowserWindow.fromWebContents(event.sender), {
      title: "Backup folder",
      defaultPath: backupFolder(),
      properties: ["openDirectory", "createDirectory"],
    });
    if (result.canceled || !result.filePaths[0]) return null;
    fs.writeFileSync(settingsFile(), JSON.stringify({ folder: result.filePaths[0] }));
    return result.filePaths[0];
  });

  ipcMain.handle("s4-backup:save", async (_event, fileName, bytes) => {
    const match = BACKUP_FILE_RE.exec(String(fileName));
    if (!match) throw new Error("invalid backup file name");
    const folder = backupFolder();
    await fs.promises.mkdir(folder, { recursive: true });
    const target = path.join(folder, match[0]);
    await fs.promises.writeFile(target, Buffer.from(bytes));
    const sameShop = (await fs.promises.readdir(folder))
      .filter((name) => BACKUP_FILE_RE.exec(name)?.[1] === match[1])
      .sort();
    for (const old of sameShop.slice(0, Math.max(0, sameShop.length - BACKUP_KEEP_PER_SHOP))) {
      await fs.promises.unlink(path.join(folder, old)).catch(() => {});
    }
    return target;
  });

  ipcMain.handle("s4-backup:open-folder", async () => {
    const folder = backupFolder();
    await fs.promises.mkdir(folder, { recursive: true });
    return shell.openPath(folder);
  });
}

const PRINT_HTML_MAX_BYTES = 8 * 1024 * 1024;

function setupPrintIpc() {
  ipcMain.handle("s4-print:list", async (event) => {
    const printers = await event.sender.getPrintersAsync();
    return printers.map((p) => ({ name: p.name, displayName: p.displayName || p.name, isDefault: !!p.isDefault }));
  });

  // Prints an HTML document straight to the chosen printer, without a dialog.
  ipcMain.handle("s4-print:html", async (_event, html, options = {}) => {
    if (typeof html !== "string" || !html || Buffer.byteLength(html, "utf8") > PRINT_HTML_MAX_BYTES) {
      throw new Error("invalid print document");
    }
    const deviceName = typeof options.deviceName === "string" ? options.deviceName : "";
    const file = path.join(app.getPath("temp"), `s4-print-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.html`);
    await fs.promises.writeFile(file, html, "utf8");
    const win = new BrowserWindow({
      show: false,
      webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, javascript: false },
    });
    try {
      await win.loadFile(file);
      await new Promise((resolve) => setTimeout(resolve, 300));
      return await new Promise((resolve) => {
        win.webContents.print({ silent: true, printBackground: true, deviceName }, (ok, reason) => {
          resolve({ ok, error: ok ? "" : String(reason || "print failed") });
        });
      });
    } finally {
      win.destroy();
      fs.promises.unlink(file).catch(() => {});
    }
  });
}

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
