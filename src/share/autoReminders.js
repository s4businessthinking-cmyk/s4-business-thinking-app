// Automatic payment reminders: once a local day, after the owner's hour, the overdue queue (accounts/overdueReminders.js)
// is handed to the owner's own HTTPS SMS / email / WhatsApp provider (share/reminderChannels.js sendViaProvider) without a
// person pressing Send. Rules:
// - only channels with https:// provider run on their own; sms: / mailto: / wa.me links need a person;
// - device mode: runs inside the open S4 app on the one device the owner picked (no service while S4 is closed);
// - server mode: the sync server (erp-server) runs once a day after the hour using synced data (app may be closed);
//   two devices never remind the same customer twice on the same day (reminders collection);
// - a customer already reminded today (any channel, any device that has synced) is skipped;
// - a 2xx reply is saved as "accepted by your provider" (handedOffSms / handedOffEmail), never "delivered"; a refused
//   or failed call saves nothing and is reported with its real error.
// Settings: shop.overdueReminders.auto = { on, whatsapp, sms, email, hour, when, deviceId, deviceName, lastServerRun? }.
import { reminderRecord, reminderProviderMessage, fillReminder, lastReminders } from "../accounts/overdueReminders.js";
import { providerConfigForChannel, sendViaProvider } from "./reminderChannels.js";

const clean = (v) => String(v ?? "").trim();
const https = (url) => /^https:\/\//i.test(clean(url));
export const AUTO_CHANNELS = ["whatsapp", "sms", "email"];
export const AUTO_DEFAULT_HOUR = 10;

export function autoSettingsOf(shop) {
  const a = shop?.overdueReminders?.auto || {};
  const hour = Number(a.hour);
  const when = clean(a.when) === "server" ? "server" : "device";
  const last = a.lastServerRun && typeof a.lastServerRun === "object" ? a.lastServerRun : null;
  return {
    on: a.on === true, whatsapp: a.whatsapp === true, sms: a.sms === true, email: a.email === true, when,
    hour: Number.isInteger(hour) && hour >= 0 && hour <= 23 ? hour : AUTO_DEFAULT_HOUR,
    deviceId: clean(a.deviceId), deviceName: clean(a.deviceName),
    lastServerRun: last,
  };
}

/**
 * Why automatic sending cannot be switched on as set. auto: autoSettingsOf(); channels: channelSettingsOf().
 * -> [{ id, en, bn }] (empty when it can, or when it is off)
 */
export function autoProblems(auto, channels) {
  if (!auto?.on) return [];
  const out = [];
  if (!auto.whatsapp && !auto.sms && !auto.email) out.push({ id: "noChannel", en: "Pick WhatsApp, SMS and/or email for automatic sending", bn: "স্বয়ংক্রিয়ভাবে পাঠাতে WhatsApp, SMS আর/অথবা ইমেইল বাছুন" });
  for (const ch of AUTO_CHANNELS) {
    if (!auto[ch]) continue;
    const name = ch === "whatsapp" ? "WhatsApp" : ch === "sms" ? "SMS" : "email";
    const nameBn = ch === "whatsapp" ? "WhatsApp" : ch === "sms" ? "SMS" : "ইমেইল";
    if (!channels?.[ch]) out.push({ id: `${ch}Off`, en: `Switch the ${name} channel on first`, bn: `আগে ${nameBn} চালু করুন` });
    const url = clean(providerConfigForChannel(channels, ch)?.url);
    if (!https(url)) out.push({ id: `${ch}Provider`, en: `Automatic ${name} needs your ${name} provider's https:// address`, bn: `স্বয়ংক্রিয় ${nameBn}-এর জন্য ${nameBn} প্রোভাইডারের https:// ঠিকানা লাগবে` });
  }
  if (auto.when !== "server" && !auto.deviceId) out.push({ id: "device", en: "Pick the device that runs it", bn: "কোন ডিভাইস চালাবে তা বাছুন" });
  return out;
}

/**
 * Is an automatic run due now on this device? -> { due, reason }
 * reason: "off" | "remindersOff" | "problems" | "otherDevice" | "early" | "doneToday" | ""
 */
export function autoDue({ auto, channels, enabled, deviceId, today, hour, lastRunDay = "" }) {
  if (!auto?.on) return { due: false, reason: "off" };
  if (auto.when === "server") return { due: false, reason: "serverMode" };
  if (!enabled) return { due: false, reason: "remindersOff" };
  if (autoProblems(auto, channels).length) return { due: false, reason: "problems" };
  if (!deviceId || deviceId !== auto.deviceId) return { due: false, reason: "otherDevice" };
  if (Number(hour) < auto.hour) return { due: false, reason: "early" };
  if (lastRunDay === today) return { due: false, reason: "doneToday" };
  return { due: true, reason: "" };
}

/** Server job (erp-server): same day/hour rules, no device pick. */
export function autoDueServer({ auto, channels, enabled, today, hour, lastRunDay = "" }) {
  if (!auto?.on || auto.when !== "server") return { due: false, reason: "off" };
  if (!enabled) return { due: false, reason: "remindersOff" };
  if (autoProblems(auto, channels).length) return { due: false, reason: "problems" };
  if (Number(hour) < auto.hour) return { due: false, reason: "early" };
  if (lastRunDay === today) return { due: false, reason: "doneToday" };
  return { due: true, reason: "" };
}

/**
 * Which rows go to which provider: ready rows (not reminded today) with at least one automatic channel that can reach
 * them through a provider, in the order WhatsApp then SMS then email. -> { send: [{ row, channels: [...] }], skipped: [...] }
 */
export function autoPlan(queue, auto, { remindedToday = new Set() } = {}) {
  const send = [], skipped = [];
  (queue || []).forEach((row) => {
    if (row.status !== "ready" || remindedToday.has(row.customerId)) return;
    const chans = AUTO_CHANNELS.filter((ch) => auto?.[ch] && (row.options || []).some((o) => o.channel === ch && o.ok && o.via === "provider"));
    if (chans.length) send.push({ row, channels: chans });
    else skipped.push({ row, reason: auto?.email && !auto?.sms ? "noEmail" : "noPhone" });
  });
  return { send, skipped };
}

/** Customers with a payment reminder record made on `day` (reminders collection rows, any device). */
export function remindedOn(reminders, day) {
  const out = new Set();
  lastReminders(reminders).forEach((at, customerId) => { if (String(at).slice(0, 10) === day) out.add(customerId); });
  return out;
}

/**
 * One automatic run. save(record) stores the Reminders record (only after a 2xx hand-off).
 * -> { handedOff: [{ name, channel, status, providerId }], failed: [{ name, channel, message }], skipped: [{ name, reason }] }
 */
export async function runAutoReminders({ queue, auto, channels, settings, reminders = [], today, shopId, user = null, profile = null, shopName = "", cur = "AED",
  save, transport, now = () => new Date(), limit = 100 }) {
  const { send, skipped } = autoPlan(queue, auto, { remindedToday: remindedOn(reminders, today) });
  const result = { handedOff: [], failed: [], skipped: skipped.map(({ row, reason }) => ({ name: row.name, reason })) };
  for (const { row, channels: chans } of send.slice(0, limit)) {
    for (const ch of chans) {
      const opt = row.options.find((o) => o.channel === ch);
      const text = reminderProviderMessage(row, { settings, shopName, cur, channel: ch, via: opt?.via });
      const subject = ch === "email" ? fillReminder(settings?.language === "bn" ? channels.emailSubjectBn : channels.emailSubjectEn, { shop: shopName, name: row.name }) : "";
      const res = await sendViaProvider(ch, providerConfigForChannel(channels, ch), { to: opt.to, message: text, subject, ...(transport ? { transport } : {}) });
      if (!res.ok) { result.failed.push({ name: row.name, channel: ch, message: `${res.httpStatus || res.error}: ${res.message}` }); continue; }
      const rec = reminderRecord(row, { shopId, user, profile, cur, mode: "auto", channel: ch, status: res.status, providerId: res.providerId, now: now() });
      await save({ ...rec, title: `Auto ${rec.title.charAt(0).toLowerCase()}${rec.title.slice(1)}`, auto: true, doneByName: rec.doneByName ? `${rec.doneByName} (auto)` : "Auto" });
      result.handedOff.push({ name: row.name, channel: ch, status: res.status, providerId: res.providerId });
      break;
    }
  }
  if (send.length > limit) send.slice(limit).forEach(({ row }) => result.skipped.push({ name: row.name, reason: "limit" }));
  return result;
}

/** One line for a toast / the screen. Never says sent or delivered. */
export function autoRunText(result, bn) {
  const h = result.handedOff.length, f = result.failed.length;
  if (!h && !f) return bn ? "স্বয়ংক্রিয় রিমাইন্ডার: আজ পাঠানোর মতো কেউ নেই" : "Automatic reminders: nobody to remind today";
  return bn
    ? `স্বয়ংক্রিয় রিমাইন্ডার: ${h} জন প্রোভাইডার গ্রহণ করেছে (পৌঁছানোর প্রমাণ নয়)${f ? `, ${f}টি হয়নি` : ""}`
    : `Automatic reminders: ${h} accepted by your provider (not proof of receipt)${f ? `, ${f} failed` : ""}`;
}

// The last run on this device (per shop): { day, at, handedOff, failed, skipped, errors: [..] }. Browser storage only
// keeps the "once today" mark and the summary; the record of who was reminded is the synced Reminders collection.
const runKey = (shopId) => `s4.autoReminders.lastRun.${shopId || "-"}`;
export function readAutoRun(shopId) {
  try { const v = JSON.parse(window.localStorage.getItem(runKey(shopId)) || "null"); return v && typeof v === "object" ? v : null; } catch { return null; }
}
export const AUTO_RUN_EVENT = "s4:auto-reminders-run";
export function writeAutoRun(shopId, value) {
  try { window.localStorage.setItem(runKey(shopId), JSON.stringify(value)); } catch { /* storage blocked: the Reminders records still stop a second reminder today */ }
  // every open copy of the hook (the app timer, the Payment Reminders screen) shows the new run at once
  try { window.dispatchEvent(new CustomEvent(AUTO_RUN_EVENT, { detail: { shopId: shopId || "", run: value } })); } catch { /* no window */ }
}
