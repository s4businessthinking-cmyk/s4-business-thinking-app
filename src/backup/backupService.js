// Per-shop backup files (.s4backup = gzip JSON from /v1/backup/export).
// Desktop: saved into a folder (put it inside Google Drive to sync offsite).
// Android: shared via the system share sheet (e.g. "Save to Drive").
// Browser: plain download.
import { callServer } from "../backend/firestore.js";
import { FIREBASE_EXPORT_FORMAT, planFirebaseImport } from "./firebaseImport.js";

const BACKUP_FORMAT = "s4-shop-backup";
const DESKTOP_AUTO_INTERVAL_MS = 24 * 60 * 60 * 1000;
const MOBILE_REMIND_AFTER_MS = 7 * 24 * 60 * 60 * 1000;
const lastBackupKey = (shopId) => `s4-last-backup:${shopId}`;

export class BackupCancelled extends Error {}

export function backupPlatform() {
  if (typeof window === "undefined") return "web";
  if (window.S4Desktop?.backup) return "desktop";
  if (window.Capacitor?.isNativePlatform?.() === true) return "mobile";
  return "web";
}

export function getLastBackupAt(shopId) {
  try {
    return localStorage.getItem(lastBackupKey(shopId)) || null;
  } catch {
    return null;
  }
}

function setLastBackupAt(shopId, iso) {
  try {
    localStorage.setItem(lastBackupKey(shopId), iso);
  } catch {}
}

async function gzip(text) {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function gunzip(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
  return new Response(stream).text();
}

function toBase64(bytes) {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

function backupFileName(shopId, date) {
  const slug = String(shopId).replace(/[^\w-]/g, "").slice(0, 40) || "shop";
  const pad = (n) => String(n).padStart(2, "0");
  const stamp = `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}`;
  return `S4-backup-${slug}-${stamp}.s4backup`;
}

function downloadInBrowser(fileName, bytes) {
  const url = URL.createObjectURL(new Blob([bytes], { type: "application/octet-stream" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

async function shareOnMobile(fileName, bytes) {
  const [{ Filesystem, Directory }, { Share }] = await Promise.all([import("@capacitor/filesystem"), import("@capacitor/share")]);
  await Filesystem.rmdir({ path: "backups", directory: Directory.Cache, recursive: true }).catch(() => {});
  const { uri } = await Filesystem.writeFile({ path: `backups/${fileName}`, data: toBase64(bytes), directory: Directory.Cache, recursive: true });
  try {
    await Share.share({ title: fileName, files: [uri], dialogTitle: "Google Drive" });
  } catch (error) {
    if (/cancel/i.test(String(error?.message || error))) throw new BackupCancelled("share cancelled");
    throw error;
  }
  return uri;
}

export async function saveShopBackup(shopId) {
  const backup = await callServer("/v1/backup/export", { shopId });
  const bytes = await gzip(JSON.stringify(backup));
  const fileName = backupFileName(shopId, new Date());
  const platform = backupPlatform();
  let savedTo = null;
  if (platform === "desktop") savedTo = await window.S4Desktop.backup.save(fileName, bytes);
  else if (platform === "mobile") savedTo = await shareOnMobile(fileName, bytes);
  else downloadInBrowser(fileName, bytes);
  const at = new Date().toISOString();
  setLastBackupAt(shopId, at);
  return { fileName, savedTo, at, documentCount: backup.documentCount, sizeBytes: bytes.length };
}

// Parses a picked file; plain (un-gzipped) JSON backups are accepted too.
export async function readBackupFile(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const isGzip = bytes[0] === 0x1f && bytes[1] === 0x8b;
  let text;
  let backup;
  try {
    text = isGzip ? await gunzip(bytes) : new TextDecoder().decode(bytes);
    backup = JSON.parse(text);
  } catch {
    throw new Error("invalid-backup-file");
  }
  if (backup?.format === FIREBASE_EXPORT_FORMAT && backup.collections) return { firebaseExport: backup };
  if (backup?.format !== BACKUP_FORMAT || !backup.collections) throw new Error("invalid-backup-file");
  const counts = Object.fromEntries(Object.entries(backup.collections).map(([name, docs]) => [name, Array.isArray(docs) ? docs.length : 0]));
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  return { shopId: backup.shopId, createdAt: backup.createdAt, counts, total, text };
}

// Data exported from the old Firebase version: matched against this shop's
// current products, vendors and customers (see firebaseImport.js).
export async function prepareFirebaseImport(raw, { shopId, userId }) {
  const current = await callServer("/v1/backup/export", { shopId });
  return planFirebaseImport(raw, current, { shopId, userId });
}

export async function restoreShopBackup(parsed) {
  const rawBody = await gzip(`{"backup":${parsed.text}}`);
  const result = await callServer("/v1/backup/restore", null, { rawBody, headers: { "Content-Encoding": "gzip" } });
  try {
    sessionStorage.setItem(`s4-force-cloud-pull:${parsed.shopId}`, "1");
  } catch {}
  return result;
}

// Desktop: silent daily backup into the backup folder.
// Mobile: a reminder when the last backup is older than a week.
export function startAutoBackup(shopId, { onSaved, onReminder } = {}) {
  const platform = backupPlatform();
  const age = () => {
    const last = getLastBackupAt(shopId);
    return last ? Date.now() - new Date(last).getTime() : Infinity;
  };
  let busy = false;
  const tick = async () => {
    if (busy || (typeof navigator !== "undefined" && !navigator.onLine)) return;
    if (platform === "desktop" && age() >= DESKTOP_AUTO_INTERVAL_MS) {
      busy = true;
      try {
        onSaved?.(await saveShopBackup(shopId));
      } catch (error) {
        console.warn("[S4 Backup] automatic backup failed", error);
      } finally {
        busy = false;
      }
    }
  };
  if (platform === "desktop") {
    const first = setTimeout(tick, 2 * 60 * 1000);
    const every = setInterval(tick, 60 * 60 * 1000);
    return () => {
      clearTimeout(first);
      clearInterval(every);
    };
  }
  if (platform === "mobile") {
    const t = setTimeout(() => {
      if (age() >= MOBILE_REMIND_AFTER_MS) onReminder?.();
    }, 60 * 1000);
    return () => clearTimeout(t);
  }
  return () => {};
}
