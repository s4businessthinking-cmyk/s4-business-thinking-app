// Offers the shop owner a data backup before logging out or closing the desktop app.
import { BackupCancelled, saveShopBackup } from "./backupService.js";

// "yes" | "no" | "cancel". The desktop app shows Yes / No / Cancel; elsewhere OK = yes, Cancel = no.
function askBackup(message, bn) {
  const choose = typeof window !== "undefined" ? window.S4Desktop?.dialog?.choose : null;
  if (choose) {
    const i = choose(message, [bn ? "হ্যাঁ, ব্যাকআপ নিন" : "Yes, back up", bn ? "না" : "No", bn ? "বাতিল" : "Cancel"], 2);
    return i === 0 ? "yes" : i === 1 ? "no" : "cancel";
  }
  return window.confirm(`${message}\n\n${bn ? "OK = হ্যাঁ, Cancel = না" : "OK = Yes, Cancel = No"}`) ? "yes" : "no";
}

// Resolves true when the logout / close should go ahead, false when the user cancelled it.
export async function backupBeforeExit({ shopId, lang, toast, action }) {
  const bn = lang === "bn";
  const what = action === "close" ? (bn ? "সফটওয়্যার বন্ধ" : "closing the software") : (bn ? "লগআউট" : "logging out");
  const choice = askBackup(bn ? `${what} করার আগে ডেটা ব্যাকআপ নেবেন?` : `Back up your data before ${what}?`, bn);
  if (choice === "cancel") return false;
  if (choice === "no") return true;
  toast?.(bn ? "💾 ব্যাকআপ নেওয়া হচ্ছে…" : "💾 Backing up…");
  try {
    const result = await saveShopBackup(shopId);
    toast?.(bn ? `✅ ব্যাকআপ সেভ হয়েছে (${result.documentCount ?? 0} রেকর্ড)` : `✅ Backup saved (${result.documentCount ?? 0} records)`);
    return true;
  } catch (error) {
    const reason = error instanceof BackupCancelled ? (bn ? "বাতিল করা হয়েছে" : "cancelled") : String(error?.message || error);
    return window.confirm(bn
      ? `❌ ব্যাকআপ হয়নি (${reason})।\n\nতবুও ${what} করবেন?`
      : `❌ Backup failed (${reason}).\n\nContinue ${what} anyway?`);
  }
}
