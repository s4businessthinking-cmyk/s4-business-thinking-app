// Overdue payment reminders: every day the list of customers with bills overdue by at least the owner's number of days
// (and at least the minimum amount) builds itself, and the bell shows how many are waiting. Each one is sent by opening
// WhatsApp with the message filled in (share/whatsappDocShare.js openWhatsAppText - the desktop bridge, else wa.me);
// the person still presses Send in WhatsApp, so S4 records "opened in WhatsApp", never "sent" or "delivered".
// - Which bills: the same open amounts and due dates as the overdue-interest list and the ageing (overdueInterest.js:
//   FIFO open charges, billDueDate), with no interest.
// - Once a day: opening a reminder saves a done record in the Reminders collection (source "overdueReminder"); a
//   customer with one dated today is shown as already reminded unless the owner sends again on purpose.
// Settings on the shop record (shop.overdueReminders), owner only.
import { overdueInterest } from "./overdueInterest.js";
import { normalizeWaPhone, partyPhone } from "../share/whatsappDocShare.js";
import { REMINDER_STATUS, channelOptions } from "../share/reminderChannels.js";

const r2 = (v) => Math.round(((Number(v) || 0) + Number.EPSILON) * 100) / 100;
const num = (v) => parseFloat(String(v ?? "").replace(/,/g, "")) || 0;
const clean = (v) => String(v ?? "").trim();
const fmtDay = (d) => (d ? String(d).slice(0, 10).split("-").reverse().join("/") : "");

export const REMINDER_VARS = ["name", "amount", "due", "days", "bills", "shop"];
export const DEFAULT_REMINDER_TEXT = {
  en: "Dear {name}, this is a reminder from {shop}: {amount} is overdue on {bills} bill(s), the oldest due on {due} ({days} days). Kindly arrange the payment. Thank you.",
  bn: "প্রিয় {name}, {shop} থেকে মনে করিয়ে দিচ্ছি: {bills}টি বিলে {amount} বকেয়া, সবচেয়ে পুরোনোটার শেষ তারিখ ছিল {due} ({days} দিন আগে)। অনুগ্রহ করে টাকাটা দিয়ে দিন। ধন্যবাদ।",
};

/** The owner's settings with defaults: off, 7 days overdue, no minimum, English message. */
export function reminderSettingsOf(shop) {
  const s = shop?.overdueReminders || {};
  const days = Math.round(num(s.minDays));
  return {
    enabled: s.enabled === true,
    minDays: days >= 1 && days <= 365 ? days : 7,
    minAmount: Math.max(0, r2(num(s.minAmount))),
    language: String(s.language || "").toLowerCase() === "bn" ? "bn" : "en",
    textEn: clean(s.textEn) || DEFAULT_REMINDER_TEXT.en,
    textBn: clean(s.textBn) || DEFAULT_REMINDER_TEXT.bn,
  };
}

/** Message with its placeholders filled; unknown {words} are left as typed. */
export const fillReminder = (text, values = {}) => String(text || "").replace(/\{(\w+)\}/g, (m, k) => (REMINDER_VARS.includes(k.toLowerCase()) ? String(values[k.toLowerCase()] ?? "") : m));

/** The day a reminder record was made for a customer (reminders collection, this feature only). */
const reminderDay = (r) => String(r?.doneAt || r?.createdAt || r?.dueDate || "").slice(0, 10);
export const isOverdueReminderRecord = (r) => r && !r.isDeleted && r.source === "overdueReminder";
/** Last reminder per customer: Map(customerId -> ISO time). */
export function lastReminders(reminders) {
  const out = new Map();
  (reminders || []).filter(isOverdueReminderRecord).forEach((r) => {
    const at = String(r.doneAt || r.createdAt || "");
    if (r.customerId && (!out.has(r.customerId) || at > out.get(r.customerId))) out.set(r.customerId, at);
  });
  return out;
}

/**
 * Customers to remind on `asOf`.
 * -> [{ customerId, partyKey, name, phone, amount, bills, oldestDue, days, lastAt, status, reason }] most overdue first.
 * status: "ready" | "done" (reminded today) | "noPhone" (no WhatsApp / mobile number on the customer master).
 */
// channels: channelSettingsOf(shop) (share/reminderChannels.js) - left out, WhatsApp only, as before. Each row gets
// options: what each switched-on channel can do for that customer; "noPhone" = none of them can reach the customer.
export function reminderQueue(ledger, { asOf, salesInvoices = [], customers = [], reminders = [], settings, countryCode, channels = null } = {}) {
  const s = settings || reminderSettingsOf(null);
  const rep = overdueInterest(ledger, { side: "customer", asOf, bills: salesInvoices, parties: customers, rate: 0, graceDays: Math.max(0, s.minDays - 1) });
  const byId = new Map((customers || []).filter((c) => c?.id).map((c) => [c.id, c]));
  const last = lastReminders(reminders);
  const groups = new Map();
  rep.rows.forEach((r) => {
    const g = groups.get(r.partyKey) || { partyKey: r.partyKey, customerId: r.partyId, name: r.party, amount: 0, bills: 0, oldestDue: r.dueDate, days: 0 };
    g.amount = r2(g.amount + r.principal); g.bills += 1;
    if (r.dueDate < g.oldestDue) g.oldestDue = r.dueDate;
    g.days = Math.max(g.days, r.daysOverdue);
    groups.set(r.partyKey, g);
  });
  return [...groups.values()].filter((g) => g.amount >= Math.max(0.01, s.minAmount)).map((g) => {
    const c = byId.get(g.customerId);
    const phone = c ? normalizeWaPhone(partyPhone(c), countryCode) : "";
    const lastAt = last.get(g.customerId) || "";
    const options = channelOptions(c, channels || { whatsapp: true, sms: false, email: false, smsProvider: {}, emailProvider: {} }, { countryCode });
    const reachable = !!c && options.some((o) => o.ok);
    const status = !reachable ? "noPhone" : lastAt.slice(0, 10) === asOf ? "done" : "ready";
    const onlyWhatsApp = !channels || (!channels.sms && !channels.email);
    const reason = status !== "noPhone" ? "" : !c ? "Not on the customer master"
      : onlyWhatsApp ? "No WhatsApp or mobile number on the customer" : "No phone or email on the customer for the switched-on channels";
    return { ...g, phone, email: options.find((o) => o.channel === "email" && o.ok)?.to || "", options, lastAt, status, reason };
  }).sort((a, b) => b.days - a.days || b.amount - a.amount || a.name.localeCompare(b.name));
}

/** The text for one customer. */
export function reminderText(row, { settings, shopName = "", cur = "AED" } = {}) {
  const s = settings || reminderSettingsOf(null);
  return fillReminder(s.language === "bn" ? s.textBn : s.textEn, {
    name: row.name, amount: `${cur} ${r2(row.amount).toFixed(2)}`, due: fmtDay(row.oldestDue), days: row.days, bills: row.bills, shop: shopName,
  });
}

/** The done record saved after WhatsApp was opened for a customer (Reminders collection; audit + once a day). */
// channel / status: how it left S4 (share/reminderChannels.js); providerId: the provider's own message id, when given.
export function reminderRecord(row, { shopId, user, profile, cur = "AED", mode = "", channel = "whatsapp", status = "openedWhatsApp", providerId = "", now = new Date() } = {}) {
  const at = new Date(now).toISOString();
  const by = profile?.personName || profile?.username || "";
  const how = channel === "whatsapp" ? "opened in WhatsApp" : REMINDER_STATUS[status]?.en?.split(" (")[0]?.toLowerCase() || status;
  return {
    title: `Payment reminder ${how} - ${row.name}`, note: `${cur} ${r2(row.amount).toFixed(2)} overdue on ${row.bills} bill(s), oldest due ${row.oldestDue} (${row.days} days)`,
    dueDate: at.slice(0, 10), dueTime: "", repeat: "none", remindBefore: 0, assignedTo: "", assignedToName: "", private: false,
    status: "done", doneAt: at, doneBy: user?.uid || "", doneByName: by,
    shopId, createdAt: at, updatedAt: at, createdBy: user?.uid || "", updatedBy: user?.uid || "", createdByName: by,
    source: "overdueReminder", customerId: row.customerId, amount: r2(row.amount), phone: row.phone, shareMode: mode,
    channel, sendStatus: status, ...(providerId ? { providerId } : {}), ...(channel === "email" && row.email ? { email: row.email } : {}),
    linkType: "customer", linkId: row.customerId, linkLabel: row.name,
  };
}

export const REMINDER_COLS = ["Customer", "Mobile / WhatsApp", "Overdue amount", "Bills", "Oldest due", "Days overdue", "Last reminded", "Status"];
export const reminderRows = (rows) => [
  REMINDER_COLS,
  ...rows.map((r) => [r.name, r.phone, r2(r.amount).toFixed(2), String(r.bills), r.oldestDue, String(r.days), r.lastAt ? r.lastAt.slice(0, 16).replace("T", " ") : "",
    r.status === "ready" ? "To remind" : r.status === "done" ? "Reminded today" : `Cannot send: ${r.reason}`]),
];
