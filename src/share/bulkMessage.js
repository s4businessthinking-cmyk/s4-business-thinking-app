// Bulk message (WhatsApp first): pick customers, pick a template, and open each customer's WhatsApp chat with the
// message filled in, one at a time - the user presses Send in WhatsApp for every chat. No SMS gateway and no silent
// sending, so the log only records what was opened or skipped on this device, never "delivered".
// Templates live on the shop record (messageTemplates, owner only). Variables are filled from real data:
//   {name} customer name, {shop} shop name, {due} what the customer owes (Global Ledger balance), {loyaltyNo} member no.
import { normalizeWaPhone, partyPhone } from "./whatsappDocShare.js";

export const TEMPLATE_VARS = ["name", "shop", "due", "loyaltyNo"];

export function defaultTemplates(bn = false) {
  return bn
    ? [
      { id: "greet", name: "শুভেচ্ছা", body: "প্রিয় {name},\n{shop}-এর পক্ষ থেকে শুভেচ্ছা। যেকোনো যন্ত্রাংশ লাগলে জানাবেন।", active: true },
      { id: "due", name: "বকেয়া মনে করানো", body: "প্রিয় {name},\n{shop}-এ আপনার বকেয়া {due}। সুবিধামতো পরিশোধ করার অনুরোধ রইল। ধন্যবাদ।", active: true },
      { id: "thanks", name: "ধন্যবাদ", body: "প্রিয় {name},\n{shop} থেকে কেনাকাটার জন্য ধন্যবাদ। আবার আসবেন।", active: true },
    ]
    : [
      { id: "greet", name: "Greeting", body: "Dear {name},\nGreetings from {shop}. Let us know whenever you need parts.", active: true },
      { id: "due", name: "Due reminder", body: "Dear {name},\nYour balance with {shop} is {due}. Kindly arrange the payment at your convenience. Thank you.", active: true },
      { id: "thanks", name: "Thank you", body: "Dear {name},\nThank you for shopping with {shop}. We look forward to seeing you again.", active: true },
    ];
}

const clean = (v) => String(v ?? "").trim();
const newId = () => `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** Saved templates, or the defaults when the owner has not saved any yet. */
export function normalizeTemplates(saved, bn = false) {
  const list = (Array.isArray(saved) ? saved : []).filter((t) => t && clean(t.name) && clean(t.body))
    .map((t) => ({ id: clean(t.id) || newId(), name: clean(t.name), body: String(t.body), active: t.active !== false }));
  return list.length ? list : defaultTemplates(bn);
}

/** Variables in a body that are not known ({foo}). */
export const unknownVars = (body) => [...new Set([...String(body || "").matchAll(/\{(\w+)\}/g)].map((m) => m[1]).filter((v) => !TEMPLATE_VARS.includes(v)))];

/** Add or change a template. -> { error: "name" | "body" | "vars" | "duplicate", vars? } | { ok, list } */
export function saveTemplate(list, draft) {
  const name = clean(draft?.name), body = String(draft?.body || "").trim();
  if (!name) return { error: "name" };
  if (!body) return { error: "body" };
  const vars = unknownVars(body);
  if (vars.length) return { error: "vars", vars };
  if (list.some((t) => t.id !== draft.id && t.name.toLowerCase() === name.toLowerCase())) return { error: "duplicate" };
  const row = { id: draft.id || newId(), name, body, active: draft.active !== false };
  return { ok: true, list: draft.id && list.some((t) => t.id === draft.id) ? list.map((t) => (t.id === draft.id ? row : t)) : [...list, row] };
}

/** Body with variables filled; values: { name, shop, due, loyaltyNo }. A missing value becomes "". */
// placeholders in any case: templates saved before the fix were stored in capitals ({NAME})
export const fillTemplate = (body, values = {}) => String(body || "").replace(/\{(\w+)\}/g, (m, k) => { const v = TEMPLATE_VARS.find((x) => x.toLowerCase() === k.toLowerCase()); return v ? String(values[v] ?? "") : m; });

/**
 * Customers who can get a message.
 * dues: Map(customerId -> amount owed); opts: { query, onlyMembers, onlyDue, countryCode }
 * -> { list: [{ id, name, phone, due, loyaltyNo, member }], noNumber }  (noNumber = matching customers without a usable number)
 */
export function recipientsOf(customers, dues = new Map(), { query = "", onlyMembers = false, onlyDue = false, countryCode } = {}) {
  const q = clean(query).toLowerCase();
  let noNumber = 0;
  const list = [];
  (customers || []).forEach((c) => {
    if (!c || c.isDeleted || ["inactive", "blocked"].includes(c.status)) return;
    const member = c.loyaltyMember === true;
    const due = Math.max(0, Number(dues.get(c.id)) || 0);
    if (onlyMembers && !member) return;
    if (onlyDue && due < 0.005) return;
    if (q && ![c.customerName, c.customerCode, c.mobileNumber, c.whatsappNumber, c.loyaltyNo].some((v) => clean(v).toLowerCase().includes(q))) return;
    const phone = normalizeWaPhone(partyPhone(c), countryCode);
    if (!phone) { noNumber += 1; return; }
    list.push({ id: c.id, name: clean(c.customerName) || "-", phone, due, loyaltyNo: member ? clean(c.loyaltyNo) : "", member });
  });
  list.sort((a, b) => a.name.localeCompare(b.name));
  return { list, noNumber };
}

/** One log line for an attempt. status: "opened" | "skipped" */
export const logEntry = (r, status, templateName, at = new Date()) => ({ at: at.toISOString(), id: r.id, name: r.name, phone: r.phone, status, template: templateName });

const LOG_MAX = 500;
const logKey = (shopId) => `s4-bulk-message-log-${shopId || "default"}`;
/** This device's attempt log (newest first); [] when storage is unavailable. */
export function readLog(shopId) {
  try { const rows = JSON.parse(localStorage.getItem(logKey(shopId)) || "[]"); return Array.isArray(rows) ? rows : []; } catch { return []; }
}
export function appendLog(shopId, entry) {
  const rows = [entry, ...readLog(shopId)].slice(0, LOG_MAX);
  try { localStorage.setItem(logKey(shopId), JSON.stringify(rows)); } catch { /* storage full or blocked: the on-screen list still shows it */ }
  return rows;
}
export function clearLog(shopId) {
  try { localStorage.removeItem(logKey(shopId)); } catch { /* blocked */ }
  return [];
}
