// Offers the shop owner a data backup before logging out or closing the desktop app.
import { BackupCancelled, saveShopBackupFromLocal } from "./backupService.js";

const CLOSE_BACKUP_MS = 8000;

function withTimeout(promise, ms) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error("timeout")), ms);
  });
  promise.catch(() => {});
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

// "yes" | "no" | "cancel". The desktop app shows Yes / No / Cancel; elsewhere OK = yes, Cancel = no.
function askBackup(message, bn) {
  const choose = typeof window !== "undefined" ? window.S4Desktop?.dialog?.choose : null;
  if (choose) {
    const i = choose(message, [bn ? "হ্যাঁ, ব্যাকআপ নিন" : "Yes, back up", bn ? "না" : "No", bn ? "বাতিল" : "Cancel"], 2);
    return i === 0 ? "yes" : i === 1 ? "no" : "cancel";
  }
  return window.confirm(`${message}\n\n${bn ? "OK = হ্যাঁ, Cancel = না" : "OK = Yes, Cancel = No"}`) ? "yes" : "no";
}

function deskApp() {
  return typeof window !== "undefined" ? window.S4Desktop?.app : null;
}

// Resolves true when the logout / close should go ahead, false when the user cancelled it.
export async function backupBeforeExit({ shopId, lang, toast, action }) {
  const bn = lang === "bn";
  const closing = action === "close";
  const what = closing ? (bn ? "সফটওয়্যার বন্ধ" : "closing the software") : (bn ? "লগআউট" : "logging out");
  const choice = askBackup(bn ? `${what} করার আগে ডেটা ব্যাকআপ নেবেন?` : `Back up your data before ${what}?`, bn);
  if (choice === "cancel") return false;
  if (choice === "no") return true;
  if (closing) deskApp()?.hide?.();
  else toast?.(bn ? "💾 ব্যাকআপ নেওয়া হচ্ছে…" : "💾 Backing up…");
  try {
    const result = await withTimeout(saveShopBackupFromLocal(shopId), closing ? CLOSE_BACKUP_MS : 30000);
    if (!closing) toast?.(bn ? `✅ ব্যাকআপ সেভ হয়েছে (${result.documentCount ?? 0} রেকর্ড)` : `✅ Backup saved (${result.documentCount ?? 0} records)`);
    return true;
  } catch (error) {
    // Window already gone from the user's view — still quit so close never hangs.
    if (closing && String(error?.message || error) === "timeout") return true;
    if (closing) deskApp()?.show?.();
    const reason = error instanceof BackupCancelled ? (bn ? "বাতিল করা হয়েছে" : "cancelled") : String(error?.message || error);
    return window.confirm(bn
      ? `❌ ব্যাকআপ হয়নি (${reason})।\n\nতবুও ${what} করবেন?`
      : `❌ Backup failed (${reason}).\n\nContinue ${what} anyway?`);
  }
}
