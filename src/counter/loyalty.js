// Customer loyalty (earn only for now; there is no redeem yet). A customer is a member when the customer master has
// loyaltyMember ticked; loyaltyNo is the card / member number and loyaltySince the day earning starts.
// The rule lives on the shop record (loyaltySettings, owner only):
//   points on a bill = floor(net sales / amount per point)
// net sales = the bill's total less VAT, less the net of sales returns made against that bill. Only confirmed / paid /
// partial sales bills count (no drafts, cancelled, quotations, delivery notes or opening-balance bills).
// The amount per point is kept with the day it starts (rates), so changing it only affects bills from that day on.
// Points are worked out from the saved bills each time they are shown - nothing is stored on the bill - so a
// cancelled or returned bill takes its points back by itself.
import { dayOf, liveReturnsOf, liveSalesOf, n, r2 } from "../reports/reportFilters.js";

// same test as utils/openingBill.js isOpeningBill (that module pulls in the offline store)
const isOpeningBill = (inv) => inv?.source === "openingBalance";
const lc = (v) => String(v || "").trim().toLowerCase();
const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Saved settings -> { enabled, rates: [{ from, per }] oldest first, valid only }. */
export function normalizeLoyalty(saved) {
  const rates = (Array.isArray(saved?.rates) ? saved.rates : [])
    .map((r) => ({ from: dayOf(r?.from), per: r2(r?.per) }))
    .filter((r) => DAY.test(r.from) && r.per > 0)
    .sort((a, b) => a.from.localeCompare(b.from));
  return { enabled: !!saved?.enabled && rates.length > 0, rates };
}

/** Amount per point in force on a day (0 = no rate yet). */
export function rateOn(settings, day) {
  let per = 0;
  (settings?.rates || []).forEach((r) => { if (r.from <= dayOf(day)) per = r.per; });
  return per;
}

/** Settings with a new amount per point from `from` (a rate already starting that day is replaced). -> { error } | { ok, settings } */
export function withRate(saved, per, from, enabled = true) {
  const amount = Number(String(per ?? "").replace(/,/g, ""));
  if (!Number.isFinite(amount) || amount <= 0) return { error: "rate" };
  if (!DAY.test(dayOf(from))) return { error: "date" };
  const cur = normalizeLoyalty({ ...saved, enabled: true });
  const rates = [...cur.rates.filter((r) => r.from !== dayOf(from)), { from: dayOf(from), per: r2(amount) }].sort((a, b) => a.from.localeCompare(b.from));
  return { ok: true, settings: { enabled: !!enabled, rates } };
}

export const isMember = (c) => !!c && !c.isDeleted && c.loyaltyMember === true;

/**
 * Points per member customer.
 * -> Map(customerId -> { points, bills, net, lastDay })
 */
export function loyaltyBalances({ customers = [], salesInvoices = [], salesReturns = [], settings, shopId = "" }) {
  const cfg = settings?.rates ? settings : normalizeLoyalty(settings);
  const out = new Map();
  if (!cfg.enabled) return out;
  const members = new Map(customers.filter(isMember).map((c) => [c.id, c]));
  const returned = new Map();
  liveReturnsOf(salesReturns, shopId).forEach((r) => {
    if (r.invoiceId) returned.set(r.invoiceId, (returned.get(r.invoiceId) || 0) + n(r.total) - n(r.totalVat));
  });
  members.forEach((c, id) => out.set(id, { points: 0, bills: 0, net: 0, lastDay: "" }));
  liveSalesOf(salesInvoices, shopId).forEach((inv) => {
    const c = members.get(inv.customerId);
    const day = dayOf(inv.invoiceDate || inv.createdAt);
    if (!c || isOpeningBill(inv) || (c.loyaltySince && day < dayOf(c.loyaltySince))) return;
    const per = rateOn(cfg, day);
    if (!per) return;
    const net = Math.max(0, n(inv.grandTotal) - n(inv.totalVat) - (returned.get(inv.id) || 0));
    const row = out.get(inv.customerId);
    row.points += Math.floor((net + 1e-9) / per);
    row.bills += 1;
    row.net = r2(row.net + net);
    if (day > row.lastDay) row.lastDay = day;
  });
  return out;
}

/** Member number check: "" (fine) | "required" | "duplicate" (another customer has it). */
export function memberNoIssue(no, customers, selfId = "") {
  if (!String(no || "").trim()) return "required";
  return (customers || []).some((c) => c && !c.isDeleted && c.id !== selfId && lc(c.loyaltyNo) === lc(no)) ? "duplicate" : "";
}

export const MEMBER_COLS = ["Member No", "Customer", "Mobile", "Since", "Bills", "Net sales", "Points", "Last bill"];
export const memberCsvRows = (customers, balances) => [
  MEMBER_COLS,
  ...(customers || []).filter(isMember).map((c) => ({ c, b: balances.get(c.id) || { points: 0, bills: 0, net: 0, lastDay: "" } }))
    .sort((a, b) => b.b.points - a.b.points || String(a.c.customerName || "").localeCompare(String(b.c.customerName || "")))
    .map(({ c, b }) => [c.loyaltyNo || "", c.customerName || "", c.mobileNumber || "", dayOf(c.loyaltySince), String(b.bills), r2(b.net).toFixed(2), String(b.points), b.lastDay]),
];
