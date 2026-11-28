// Close / logout: optional complete local SQLite backup (.s4backup) before leaving.
import { BackupCancelled, saveShopBackupFromLocal } from "./backupService.js";

// Large shops with photos may need a bit of time.
const CLOSE_BACKUP_MS = 60000;
const LOGOUT_BACKUP_MS = 30000;

function withTimeout(promise, ms) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error("timeout")), ms);
  });
  promise.catch(() => {});
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

// "yes" | "no" | "cancel". Desktop: Yes / No / Cancel; elsewhere OK = yes, Cancel = no.
function askBackup(message, bn, { closing = false } = {}) {
  const choose = typeof window !== "undefined" ? window.S4Desktop?.dialog?.choose : null;
  if (choose) {
    const yesLbl = closing
      ? bn
        ? "হ্যাঁ, সম্পূর্ণ ব্যাকআপ"
        : "Yes, complete backup"
      : bn
        ? "হ্যাঁ, ব্যাকআপ নিন"
        : "Yes, back up";
    const i = choose(message, [yesLbl, bn ? "না" : "No", bn ? "বাতিল" : "Cancel"], 2);
    return i === 0 ? "yes" : i === 1 ? "no" : "cancel";
  }
  return window.confirm(`${message}\n\n${bn ? "OK = হ্যাঁ, Cancel = না" : "OK = Yes, Cancel = No"}`) ? "yes" : "no";
}

function deskApp() {
  return typeof window !== "undefined" ? window.S4Desktop?.app : null;
}

// Resolves true when logout / close should proceed, false when the user cancelled.
export async function backupBeforeExit({ shopId, lang, toast, action }) {
  if (!shopId) return true;
  const bn = lang === "bn";
  const closing = action === "close";
  const what = closing ? (bn ? "সফটওয়্যার বন্ধ" : "closing the software") : (bn ? "লগআউট" : "logging out");
  const prompt = closing
    ? bn
      ? "সফটওয়্যার বন্ধ করার আগে সম্পূর্ণ ব্যাকআপ (.s4backup) নেবেন?\n\n(ডেস্কটপে ব্যাকআপ ফোল্ডারে সেভ হবে — Settings › Backup ও একই ফাইল)"
      : "Take a complete backup (.s4backup) before closing?\n\n(On desktop it saves to your backup folder — same as Settings › Backup)"
    : bn
      ? `${what} করার আগে সম্পূর্ণ ব্যাকআপ নেবেন?`
      : `Take a complete backup before ${what}?`;

  const choice = askBackup(prompt, bn, { closing });
  if (choice === "cancel") return false;
  if (choice === "no") return true;
  if (closing) deskApp()?.hide?.();
  else toast?.(bn ? "সম্পূর্ণ ব্যাকআপ হচ্ছে…" : "Complete backup in progress…");
  try {
    const result = await withTimeout(
      saveShopBackupFromLocal(shopId),
      closing ? CLOSE_BACKUP_MS : LOGOUT_BACKUP_MS,
    );
    if (!closing) {
      toast?.(
        bn
          ? `সম্পূর্ণ ব্যাকআপ সেভ হয়েছে (${result.documentCount ?? 0} রেকর্ড)`
          : `Complete backup saved (${result.documentCount ?? 0} records)`,
      );
    } else {
      console.log("[S4 Backup] complete backup on close", result.fileName, result.documentCount);
    }
    return true;
  } catch (error) {
    if (closing) deskApp()?.show?.();
    const reason =
      error instanceof BackupCancelled
        ? bn
          ? "বাতিল করা হয়েছে"
          : "cancelled"
        : String(error?.message || error) === "timeout"
          ? bn
            ? "সময় শেষ"
            : "timed out"
          : String(error?.message || error);
    return window.confirm(
      bn
        ? `সম্পূর্ণ ব্যাকআপ হয়নি (${reason})।\n\nতবুও ${what} করবেন?`
        : `Complete backup failed (${reason}).\n\nContinue ${what} anyway?`,
    );
  }
}