const { requestText } = require("./requestText.cjs");
const { autoUpdater } = require("electron-updater");
const { app, BrowserWindow, dialog, ipcMain, shell } = require("electron");
const fs = require("fs");
const path = require("path");
const http = require("http");

const UPDATE_CHECK_INTERVAL_MS = 2 * 60 * 60 * 1000;
const SILENT_INSTALL_DELAY_MS = 2500;
const BACKUP_KEEP_PER_SHOP = 30;
const BACKUP_FILE_RE = /^(S4-backup-[\w-]+)-\d{8}-\d{4}\.s4backup$/;

// Closing the window asks the page first (the owner is offered a data backup); the page then sends
// s4-app:close-now. Quitting the app (auto-update install, app.quit) never asks.
// Unpackaged `npx electron .` must not share the installed app's profile — two Chromiums on
// the same userData lock IndexedDB and the window stays on the loading spinner forever.
if (!app.isPackaged) {
  app.setPath("userData", path.join(app.getPath("appData"), "s4-business-thinking-dev"));
}

let closeAllowed = false;
app.on("before-quit", () => { closeAllowed = true; });

const STATIC_MIME = {
  ".html": "text/html; charset=utf-8", ".js": "application/javascript; charset=utf-8", ".mjs": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8", ".wasm": "application/wasm",
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".svg": "image/svg+xml", ".ico": "image/x-icon",
  ".woff": "font/woff", ".woff2": "font/woff2", ".webmanifest": "application/manifest+json", ".gz": "application/gzip", ".map": "application/json",
};

// Fixed port so Chromium keeps the same origin (localStorage / IndexedDB) across launches.
// listen(0) used a random port every start → printer + print settings looked "unset" after close.
const LOCAL_UI_PORT = 18713;

// The packaged app's UI reads files over file://, and Chromium refuses to create Workers (OCR,
// PDF parsing) or fetch WASM from that scheme — it works on the web build only because that one
// is served over http(s). Serving the same built files from a local HTTP server removes that gap.
function startLocalServer(rootDir, port = LOCAL_UI_PORT) {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      let reqPath;
      try { reqPath = decodeURIComponent(new URL(req.url, "http://127.0.0.1").pathname); } catch { reqPath = "/"; }
      if (reqPath === "/" || reqPath === "") reqPath = "/index.html";
      const filePath = path.normalize(path.join(rootDir, reqPath));
      if (!filePath.startsWith(rootDir)) { res.writeHead(403); res.end(); return; }
      fs.readFile(filePath, (err, data) => {
        if (err) { res.writeHead(404); res.end(); return; }
        res.setHeader("Content-Type", STATIC_MIME[path.extname(filePath).toLowerCase()] || "application/octet-stream");
        res.setHeader("Access-Control-Allow-Origin", "*");
        res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
        res.end(data);
      });
    });
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => resolve(server));
  });
}

async function ensureLocalUiServer(rootDir) {
  try {
    return await startLocalServer(rootDir, LOCAL_UI_PORT);
  } catch (error) {
    // Another S4 window already holds the port — reuse the same origin so settings stay shared.
    if (error && error.code === "EADDRINUSE") {
      return { address: () => ({ port: LOCAL_UI_PORT }), close: () => {} };
    }
    throw error;
  }
}

async function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    show: false,
    backgroundColor: "#eef6ff",
    title: "S4 Business Thinking",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, "preload.cjs"),
    },
  });
  // Open to the work area (same as the Windows maximize button) so the app matches the PC screen.
  win.maximize();
  win.once("ready-to-show", () => win.show());
  // The default menu bar grabs F10 on Windows, which the invoice screen needs for product search.
  win.removeMenu();
  // On Windows the page can lose keyboard focus while the window stays active, so text boxes stop taking input.
  win.on("focus", () => win.webContents.focus());
  let closeAsked = 0;
  let closeAcked = false;
  win.on("close", (event) => {
    if (closeAllowed || win.webContents.isDestroyed() || win.webContents.isCrashed()) return;
    // Pressing close again 20 s after asking (e.g. a backup that hangs) closes anyway.
    if (closeAsked && Date.now() - closeAsked > 20000) return;
    event.preventDefault();
    if (closeAsked) return;
    closeAsked = Date.now();
    closeAcked = false;
    win.webContents.send("s4-app:close-requested");
    // A page that does not handle the request (login screen, staff, old bundle) closes as before.
    setTimeout(() => {
      if (closeAcked || win.isDestroyed()) return;
      closeAllowed = true;
      win.close();
    }, 1500);
  });
  ipcMain.on("s4-app:close-ack", (event) => { if (event.sender === win.webContents) closeAcked = true; });
  ipcMain.on("s4-app:close-cancel", (event) => { if (event.sender === win.webContents) closeAsked = 0; });
  ipcMain.on("s4-app:close-now", (event) => {
    if (event.sender !== win.webContents || win.isDestroyed()) return;
    closeAllowed = true;
    win.close();
  });
  ipcMain.on("s4-app:hide", (event) => {
    if (event.sender === win.webContents && !win.isDestroyed()) win.hide();
  });
  ipcMain.on("s4-app:show", (event) => {
    if (event.sender !== win.webContents || win.isDestroyed()) return;
    win.show();
    win.focus();
  });
  // Websites (tax portal, WhatsApp) open in the user's own browser where their logins are saved; print previews stay in-app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    // WhatsApp links (whatsapp://, wa.me) always go to Windows, which opens WhatsApp Desktop or the browser.
    if (/^whatsapp:/i.test(url)) {
      shell.openExternal(url).catch((err) => console.warn("[S4 Share] whatsapp link failed", err?.message || err));
      return { action: "deny" };
    }
    if (/^https?:\/\//i.test(url) && !/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//i.test(url)) {
      shell.openExternal(url);
      return { action: "deny" };
    }
    return { action: "allow" };
  });

  if (!app.isPackaged) {
    win.loadURL(process.env.S4_DEV_URL || "http://localhost:5173");
  } else {
    const distDir = path.join(__dirname, "../dist");
    try {
      const server = await ensureLocalUiServer(distDir);
      win.on("closed", () => server.close());
      win.loadURL(`http://127.0.0.1:${LOCAL_UI_PORT}/index.html`);
    } catch (error) {
      console.error("[S4] local server failed, falling back to file://", error);
      win.loadFile(path.join(distDir, "index.html"));
    }
  }
}

app.whenReady().then(() => {
  setupDialogIpc();
  setupBackupIpc();
  setupPrintIpc();
  setupScanIpc();
  setupShareIpc();
  setupAspIpc();
  createWindow();
  setupAutoUpdater();
});

// The renderer's built-in alert()/confirm() leave text boxes unable to take keyboard input on Windows,
// so they are routed here and focus is handed back to the page once the box closes.
function setupDialogIpc() {
  ipcMain.on("s4-dialog:show", (event, kind, message) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const isConfirm = kind === "confirm";
    const options = {
      type: isConfirm ? "question" : "info",
      title: "S4 Business Thinking",
      message: String(message ?? ""),
      buttons: isConfirm ? ["Yes", "No"] : ["OK"],
      defaultId: 0,
      cancelId: isConfirm ? 1 : 0,
      noLink: true,
    };
    let choice = isConfirm ? 1 : 0;
    try {
      choice = win ? dialog.showMessageBoxSync(win, options) : dialog.showMessageBoxSync(options);
    } finally {
      event.returnValue = isConfirm ? choice === 0 : true;
      setTimeout(() => {
        if (!win || win.isDestroyed()) return;
        win.focus();
        win.webContents.focus();
      }, 0);
    }
  });

  // Native message box with custom buttons; returns the index of the pressed button (cancelId on Esc).
  ipcMain.on("s4-dialog:choose", (event, message, buttons, cancelId) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const labels = Array.isArray(buttons) && buttons.length ? buttons.slice(0, 4).map((b) => String(b)) : ["OK"];
    const cancel = Number.isInteger(cancelId) && cancelId >= 0 && cancelId < labels.length ? cancelId : labels.length - 1;
    const options = { type: "question", title: "S4 Business Thinking", message: String(message ?? ""), buttons: labels, defaultId: 0, cancelId: cancel, noLink: true };
    let choice = cancel;
    try {
      choice = win ? dialog.showMessageBoxSync(win, options) : dialog.showMessageBoxSync(options);
    } finally {
      event.returnValue = choice;
      setTimeout(() => {
        if (!win || win.isDestroyed()) return;
        win.focus();
        win.webContents.focus();
      }, 0);
    }
  });
}

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

const { execFile, spawn } = require("child_process");
const { promisify } = require("util");
const execFileAsync = promisify(execFile);

const PRINT_HTML_MAX_BYTES = 8 * 1024 * 1024;

function setupPrintIpc() {
  const printSettingsFile = () => path.join(app.getPath("userData"), "print-settings.json");
  ipcMain.handle("s4-print-settings:load", async () => {
    try {
      const raw = JSON.parse(await fs.promises.readFile(printSettingsFile(), "utf8"));
      return raw && typeof raw === "object" ? raw : null;
    } catch { return null; }
  });
  ipcMain.handle("s4-print-settings:save", async (_event, settings) => {
    if (!settings || typeof settings !== "object") throw new Error("invalid print settings");
    await fs.promises.writeFile(printSettingsFile(), JSON.stringify(settings), "utf8");
    return true;
  });

  ipcMain.handle("s4-print:list", async (event) => {
    const printers = await event.sender.getPrintersAsync();
    return printers.map((p) => ({ name: p.name, displayName: p.displayName || p.name, isDefault: !!p.isDefault }));
  });

  // Sends raw bytes (ESC/POS drawer kick) to a Windows printer via the spooler.
  // HTML silent print cannot pulse a cash drawer; this path must report real spooler errors.
  ipcMain.handle("s4-print:raw", async (_event, payload = {}) => {
    if (process.platform !== "win32") {
      return { ok: false, error: "Cash drawer raw print is only supported on Windows" };
    }
    const deviceName = typeof payload.deviceName === "string" ? payload.deviceName.trim() : "";
    const b64 = typeof payload.base64 === "string" ? payload.base64.trim() : "";
    if (!deviceName) return { ok: false, error: "printer name required" };
    if (!b64 || b64.length > 4096) return { ok: false, error: "invalid raw payload" };
    let bytes;
    try { bytes = Buffer.from(b64, "base64"); } catch { return { ok: false, error: "invalid base64" }; }
    if (!bytes.length || bytes.length > 256) return { ok: false, error: "invalid raw length" };
    const rawFile = path.join(app.getPath("temp"), `s4-drawer-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.bin`);
    const psFile = path.join(app.getPath("temp"), `s4-drawer-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.ps1`);
    try {
      await fs.promises.writeFile(rawFile, bytes);
      const ps = `
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @"
using System;
using System.IO;
using System.Runtime.InteropServices;
public class S4RawPrinter {
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Ansi)]
  public class DOCINFOA {
    [MarshalAs(UnmanagedType.LPStr)] public string pDocName;
    [MarshalAs(UnmanagedType.LPStr)] public string pOutputFile;
    [MarshalAs(UnmanagedType.LPStr)] public string pDataType;
  }
  [DllImport("winspool.Drv", EntryPoint="OpenPrinterA", SetLastError=true, CharSet=CharSet.Ansi)]
  public static extern bool OpenPrinter([MarshalAs(UnmanagedType.LPStr)] string szPrinter, out IntPtr hPrinter, IntPtr pd);
  [DllImport("winspool.Drv", EntryPoint="ClosePrinter", SetLastError=true)]
  public static extern bool ClosePrinter(IntPtr hPrinter);
  [DllImport("winspool.Drv", EntryPoint="StartDocPrinterA", SetLastError=true, CharSet=CharSet.Ansi)]
  public static extern bool StartDocPrinter(IntPtr hPrinter, Int32 level, [In] DOCINFOA di);
  [DllImport("winspool.Drv", EntryPoint="EndDocPrinter", SetLastError=true)]
  public static extern bool EndDocPrinter(IntPtr hPrinter);
  [DllImport("winspool.Drv", EntryPoint="StartPagePrinter", SetLastError=true)]
  public static extern bool StartPagePrinter(IntPtr hPrinter);
  [DllImport("winspool.Drv", EntryPoint="EndPagePrinter", SetLastError=true)]
  public static extern bool EndPagePrinter(IntPtr hPrinter);
  [DllImport("winspool.Drv", EntryPoint="WritePrinter", SetLastError=true)]
  public static extern bool WritePrinter(IntPtr hPrinter, IntPtr pBytes, Int32 dwCount, out Int32 dwWritten);
  public static void Send(string printer, string file) {
    IntPtr h = IntPtr.Zero;
    if (!OpenPrinter(printer, out h, IntPtr.Zero)) throw new Exception("OpenPrinter failed " + Marshal.GetLastWin32Error());
    try {
      DOCINFOA di = new DOCINFOA();
      di.pDocName = "S4 Cash Drawer";
      di.pDataType = "RAW";
      if (!StartDocPrinter(h, 1, di)) throw new Exception("StartDocPrinter failed " + Marshal.GetLastWin32Error());
      try {
        if (!StartPagePrinter(h)) throw new Exception("StartPagePrinter failed " + Marshal.GetLastWin32Error());
        try {
          byte[] data = File.ReadAllBytes(file);
          IntPtr p = Marshal.AllocHGlobal(data.Length);
          try {
            Marshal.Copy(data, 0, p, data.Length);
            int written;
            if (!WritePrinter(h, p, data.Length, out written) || written != data.Length)
              throw new Exception("WritePrinter failed " + Marshal.GetLastWin32Error());
          } finally { Marshal.FreeHGlobal(p); }
        } finally { EndPagePrinter(h); }
      } finally { EndDocPrinter(h); }
    } finally { ClosePrinter(h); }
  }
}
"@
[S4RawPrinter]::Send(${JSON.stringify(deviceName)}, ${JSON.stringify(rawFile)})
Write-Output 'OK'
`;
      await fs.promises.writeFile(psFile, ps, "utf8");
      const { stdout, stderr } = await execFileAsync("powershell.exe", [
        "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", psFile,
      ], { windowsHide: true, timeout: 20000, maxBuffer: 1024 * 1024 });
      const out = String(stdout || "");
      if (!/\bOK\b/.test(out)) {
        return { ok: false, error: String(stderr || out || "raw print failed").trim().slice(0, 300) };
      }
      return { ok: true };
    } catch (err) {
      return { ok: false, error: String(err?.stderr || err?.message || err).trim().slice(0, 300) };
    } finally {
      fs.promises.unlink(rawFile).catch(() => {});
      fs.promises.unlink(psFile).catch(() => {});
    }
  });

  // Prints an HTML document straight to the chosen printer, without a dialog.
  ipcMain.handle("s4-print:html", async (_event, html, options = {}) => {
    if (typeof html !== "string" || !html || Buffer.byteLength(html, "utf8") > PRINT_HTML_MAX_BYTES) {
      throw new Error("invalid print document");
    }
    const deviceName = typeof options.deviceName === "string" ? options.deviceName : "";
    // A silent print uses the printer's default paper, so documents like cheques send their exact size.
    const mm = options.pageSizeMm || {};
    const exactPage = Number(mm.width) >= 50 && Number(mm.width) <= 500 && Number(mm.height) >= 30 && Number(mm.height) <= 500;
    const pageOptions = exactPage
      ? { pageSize: { width: Math.round(mm.width * 1000), height: Math.round(mm.height * 1000) }, margins: { marginType: "none" } }
      : {};
    const file = path.join(app.getPath("temp"), `s4-print-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.html`);
    await fs.promises.writeFile(file, html, "utf8");
    const win = new BrowserWindow({
      show: false,
      webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, javascript: false },
    });
    try {
      await win.loadFile(file);
      return await new Promise((resolve) => {
        // color:false — a silent job sent as "color" makes many printers switch to a slower
        // pipeline even for plain black text; these documents never need actual color ink.
        win.webContents.print({ silent: true, printBackground: true, color: false, deviceName, ...pageOptions }, (ok, reason) => {
          resolve({ ok, error: ok ? "" : String(reason || "print failed") });
        });
      });
    } finally {
      win.destroy();
      fs.promises.unlink(file).catch(() => {});
    }
  });
}

function runWiaScript(scriptPath) {
  return new Promise((resolve, reject) => {
    const child = spawn("powershell.exe", [
      "-NoProfile", "-STA", "-ExecutionPolicy", "Bypass", "-File", scriptPath,
    ], { windowsHide: false });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      try { child.kill(); } catch { /* ignore */ }
      reject(new Error("scan timed out"));
    }, 180000);
    child.stdout.on("data", (d) => { stdout += d; });
    child.stderr.on("data", (d) => { stderr += d; });
    child.on("error", (err) => { clearTimeout(timer); reject(err); });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 2) resolve({ cancelled: true, stdout, stderr });
      else if (code === 0) resolve({ stdout, stderr });
      else reject(Object.assign(new Error(String(stderr || "").trim() || "scan failed"), { code, stderr }));
    });
  });
}

// WhatsApp (Windows desktop): a document is printed to a PDF in Documents\S4 Business Thinking\WhatsApp, the file is
// put on the clipboard as a file (the same as Copy in Explorer) and the party's chat opens in WhatsApp Desktop with the
// message typed in. WhatsApp cannot take a file from another app by itself: pressing Ctrl+V in the chat (or dragging
// the file from the folder) attaches the PDF. Nothing is sent without the user pressing Send.
// Opening the chat tries, in order: whatsapp://send (WhatsApp Desktop, Store or classic), then wa.me in the browser.
// The chat opens even when the PDF could not be made; the result says which steps worked.
const SHARE_NAME_RE = /[^\w.\- ()]+/g;
const shareFolder = () => path.join(app.getPath("documents"), "S4 Business Thinking", "WhatsApp");
const waPhone = (v) => String(v || "").replace(/\D/g, "").slice(0, 15);

function copyFileToClipboard(file) {
  if (process.platform !== "win32") return Promise.resolve(false);
  return new Promise((resolve) => {
    // the path travels in an environment variable, never inside the command text
    execFile("powershell.exe", ["-NoProfile", "-NonInteractive", "-STA", "-Command", "Set-Clipboard -LiteralPath $env:S4_CLIP_FILE"],
      { windowsHide: true, timeout: 15000, env: { ...process.env, S4_CLIP_FILE: file } },
      (err) => { if (err) console.warn("[S4 Share] clipboard copy failed", err.message); resolve(!err); });
  });
}

// WhatsApp Desktop handles whatsapp:// (the Store app registers it as a packaged protocol, the classic app in HKCR).
function hasWhatsAppDesktop() {
  try { if (app.getApplicationNameForProtocol("whatsapp://")) return Promise.resolve(true); } catch { /* fall through */ }
  if (process.platform !== "win32") return Promise.resolve(false);
  return new Promise((resolve) => execFile("reg.exe", ["query", "HKCR\whatsapp"], { windowsHide: true, timeout: 5000 }, (err) => resolve(!err)));
}

/** -> "desktop" (WhatsApp Desktop opened) | "web" (wa.me in the browser) */
function autoPasteWhatsAppAttachment() {
  if (process.platform !== "win32") return Promise.resolve(false);
  return new Promise((resolve) => {
    const ps = "Start-Sleep -Milliseconds 1600; Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('^v')";
    execFile("powershell.exe", ["-NoProfile", "-NonInteractive", "-STA", "-Command", ps],
      { windowsHide: true, timeout: 12000 },
      (err) => {
        if (err) console.warn("[S4 Share] auto-paste failed", err.message);
        resolve(!err);
      });
  });
}

async function openWhatsAppChat(phone, text) {
  const msg = encodeURIComponent(String(text || ""));
  if (await hasWhatsAppDesktop()) {
    try {
      await shell.openExternal(`whatsapp://send?${phone ? `phone=${phone}&` : ""}text=${msg}`);
      return "desktop";
    } catch (err) {
      console.warn("[S4 Share] whatsapp:// failed, using wa.me", err?.message || err);
    }
  }
  await shell.openExternal(`https://wa.me/${phone}?text=${msg}`);
  return "web";
}

async function writeSharePdf(html, fileName) {
  const base = String(fileName || "document").replace(/\.pdf$/i, "").replace(SHARE_NAME_RE, "-").slice(0, 80) || "document";
  const folder = shareFolder();
  await fs.promises.mkdir(folder, { recursive: true });
  const tmp = path.join(app.getPath("temp"), `s4-share-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.html`);
  await fs.promises.writeFile(tmp, html, "utf8");
  const win = new BrowserWindow({ show: false, webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, javascript: false } });
  try {
    await win.loadFile(tmp);
    const pdf = await win.webContents.printToPDF({ printBackground: true, preferCSSPageSize: true, pageSize: "A4" });
    const file = path.join(folder, `${base}.pdf`);
    try {
      await fs.promises.writeFile(file, pdf);
      return file;
    } catch (err) {
      // the same file is still open in a PDF viewer: keep both
      const alt = path.join(folder, `${base}-${Date.now().toString(36)}.pdf`);
      console.warn("[S4 Share] PDF in use, saving as", alt, err?.message || err);
      await fs.promises.writeFile(alt, pdf);
      return alt;
    }
  } finally {
    win.destroy();
    fs.promises.unlink(tmp).catch(() => {});
  }
}

function setupShareIpc() {
  ipcMain.handle("s4-share:whatsapp-pdf", async (_event, payload = {}) => {
    const html = payload.html;
    if (typeof html !== "string" || !html || Buffer.byteLength(html, "utf8") > PRINT_HTML_MAX_BYTES) throw new Error("invalid document");
    let file = "";
    let pdfError = "";
    try { file = await writeSharePdf(html, payload.fileName); } catch (err) { pdfError = String(err?.message || err); console.warn("[S4 Share] PDF failed", pdfError); }
    const clipboard = file ? await copyFileToClipboard(file) : false;
    const via = await openWhatsAppChat(waPhone(payload.phone), payload.text);
    const autoPaste = payload.autoPaste === true && clipboard && via === "desktop";
    const pasted = autoPaste ? await autoPasteWhatsAppAttachment() : false;
    return { path: file, folder: shareFolder(), clipboard, desktop: via === "desktop", via, pdfError, autoPaste: pasted };
  });
  // Bulk messages: text only, one chat at a time.
  ipcMain.handle("s4-share:whatsapp-text", async (_event, payload = {}) => {
    const via = await openWhatsAppChat(waPhone(payload.phone), payload.text);
    return { desktop: via === "desktop", via };
  });
  const inShareFolder = (file) => {
    const target = path.resolve(String(file || ""));
    return target.startsWith(shareFolder() + path.sep) ? target : "";
  };
  ipcMain.handle("s4-share:show-file", async (_event, file) => {
    const target = inShareFolder(file);
    if (!target) return false;
    shell.showItemInFolder(target);
    return true;
  });
  // "Copy PDF again" when something else was copied before pasting into WhatsApp.
  ipcMain.handle("s4-share:copy-file", async (_event, file) => {
    const target = inShareFolder(file);
    return target && fs.existsSync(target) ? copyFileToClipboard(target) : false;
  });
}

// UAE e-invoicing: the request to the shop's own ASP. Sent from here, not from the page, because an ASP's
// server-to-server API does not answer browser (CORS) requests. https only (plain http only to this computer),
// no redirects (the auth header must not follow to another host), size and time limits; headers are never logged.
const ASP_MAX_BODY = 5 * 1024 * 1024;
const ASP_MAX_REPLY = 256 * 1024;
const ASP_TIMEOUT_MS = 30000;
function setupAspIpc() {
  ipcMain.handle("s4-asp:request", async (_event, req = {}) => {
    // the same bridge serves the SMS / email reminder providers (req.purpose), so errors name the right service
    const say = requestText(req.purpose);
    let url;
    try { url = new URL(String(req.url || "")); } catch { throw new Error(say.badUrl); }
    const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    if (url.protocol !== "https:" && !(url.protocol === "http:" && local)) throw new Error(say.notHttps);
    const method = req.method === "GET" ? "GET" : "POST";
    const headers = {};
    Object.entries(req.headers && typeof req.headers === "object" ? req.headers : {}).forEach(([k, v]) => {
      if (/^[A-Za-z0-9-]+$/.test(k) && typeof v === "string" && !/[\r\n]/.test(v)) headers[k] = v;
    });
    const body = method === "POST" && typeof req.body === "string" ? req.body : undefined;
    if (body && Buffer.byteLength(body, "utf8") > ASP_MAX_BODY) throw new Error(say.tooLarge);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), ASP_TIMEOUT_MS);
    try {
      const res = await fetch(url, { method, headers, body, redirect: "error", signal: ctrl.signal });
      const text = await res.text();
      return { status: res.status, text: text.slice(0, ASP_MAX_REPLY) };
    } catch (err) {
      throw new Error(ctrl.signal.aborted ? say.timeout(ASP_TIMEOUT_MS / 1000) : say.failed(err?.cause?.message || err?.message || err));
    } finally {
      clearTimeout(timer);
    }
  });
}

function setupScanIpc() {
  ipcMain.handle("s4-scan:acquire", async () => {
    const scriptPath = path.join(app.getPath("temp"), `s4-wia-${Date.now()}.ps1`);
    const script = [
      "$ErrorActionPreference = 'Stop'",
      "$jpeg = '{B96B3CAE-0728-11D3-9D7B-0000F81EF32E}'",
      "try {",
      "  $dialog = New-Object -ComObject WIA.CommonDialog",
      "  $img = $null",
      "  try { $img = $dialog.ShowAcquireImage(1, 0, 0, $jpeg, $false, $true, $true) } catch {}",
      "  if (-not $img) { try { $img = $dialog.ShowAcquireImage() } catch {} }",
      "  if (-not $img) { exit 2 }",
      "  $tmp = Join-Path $env:TEMP ('s4-scan-' + [guid]::NewGuid().ToString('N') + '.jpg')",
      "  if ($img.FormatID -ne $jpeg) {",
      "    $ip = New-Object -ComObject WIA.ImageProcess",
      "    [void]$ip.Filters.Add($ip.FilterInfos.Item('Convert').FilterID)",
      "    $ip.Filters.Item(1).Properties.Item('FormatID').Value = $jpeg",
      "    try { $ip.Filters.Item(1).Properties.Item('Quality').Value = 80 } catch {}",
      "    $img = $ip.Apply($img)",
      "  }",
      "  if (Test-Path -LiteralPath $tmp) { Remove-Item -LiteralPath $tmp -Force }",
      "  $img.SaveFile($tmp)",
      "  Write-Output $tmp",
      "} catch {",
      "  [Console]::Error.WriteLine($_.Exception.Message)",
      "  exit 1",
      "}",
    ].join("\r\n");
    await fs.promises.writeFile(scriptPath, script, "utf8");
    try {
      const result = await runWiaScript(scriptPath);
      if (result.cancelled) return { ok: false, cancelled: true };
      const file = String(result.stdout || "").trim().split(/\r?\n/).filter(Boolean).pop();
      if (!file) return { ok: false, cancelled: true };
      const bytes = await fs.promises.readFile(file);
      fs.promises.unlink(file).catch(() => {});
      return { ok: true, dataUrl: `data:image/jpeg;base64,${bytes.toString("base64")}` };
    } catch (err) {
      if (Number(err?.code) === 2) return { ok: false, cancelled: true };
      return { ok: false, error: String(err?.stderr || err?.message || "scan failed") };
    } finally {
      fs.promises.unlink(scriptPath).catch(() => {});
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
        closeAllowed = true;
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
