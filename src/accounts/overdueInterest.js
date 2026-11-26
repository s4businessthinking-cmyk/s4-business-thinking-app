// Interest on overdue bills, customers (what they owe the shop) and, when the owner switches it on, suppliers (what the
// shop owes). Settings are the owner's, on the shop record (shop.overdueInterest).
// - Which part of a bill is still open: the debtors / creditors ageing as at the date (reports/partyAging.js) - money
//   received or paid clears the oldest bills first, so the open amount sits on the newest bills, exactly as the ageing shows.
//   Only sales / purchase bills (and opening balance bills) carry interest; refunds, journals and interest already charged do not.
// - When a bill falls due: billDueDate (partyAging.js) - the bill's due date, else its credit days, else the party's
//   Credit Days on the master.
// - Rule: simple interest on the open principal, actual days / 365. Interest days start after the due date plus the
//   grace days, so a bill paid within the grace pays none. Interest already posted for a bill (journal line interestTo)
//   is not charged again: the next run counts only the days after it.
// - Posting (owner): one journal per side and date (source "overdueInterest") - Dr customer / Cr Interest Received,
//   or Dr Interest Paid / Cr supplier. The P&L counts only its interest line (reports/journalPl.js).
import { billDueDate, buildAging, daysBetween } from "../reports/partyAging.js";

export const INTEREST_RECEIVED = "Interest Received";
export const INTEREST_PAID = "Interest Paid";
export const INTEREST_DAY_BASIS = 365;
const r2 = (v) => Math.round(((Number(v) || 0) + Number.EPSILON) * 100) / 100;
const num = (v) => parseFloat(String(v ?? "").replace(/,/g, "")) || 0;
const clean = (v) => String(v ?? "").trim();
const lc = (v) => clean(v).toLowerCase();
const BILL_COLS = { customer: "salesInvoices", vendor: "purchaseInvoices" };

/** The owner's settings with defaults: off, no rate, no grace, suppliers off. */
export function interestSettingsOf(shop) {
  const s = shop?.overdueInterest || {};
  const rate = (v) => Math.max(0, Math.min(100, r2(num(v))));
  return { enabled: s.enabled === true, arRate: rate(s.arRate), apEnabled: s.apEnabled === true, apRate: rate(s.apRate), graceDays: Math.max(0, Math.min(365, Math.round(num(s.graceDays)))) };
}

/** Settings check before saving. -> "" or "rate" (on, but no customer rate) / "apRate" (suppliers on, but no rate). */
export function interestSettingsProblem(s) {
  if (s.enabled && !(num(s.arRate) > 0)) return "rate";
  if (s.enabled && s.apEnabled && !(num(s.apRate) > 0)) return "apRate";
  return "";
}

/** Interest already posted per bill: Map(billId -> last day it was charged to), from live interest journals. */
export function postedInterest(vouchers, { shopId = "", side = "customer", asOf = "" } = {}) {
  const out = new Map();
  (vouchers || []).forEach((v) => {
    if (!v || v.isDeleted || v.status === "cancelled" || v.source !== "overdueInterest" || String(v.interestSide || "").toLowerCase() !== side) return;
    if (shopId && v.shopId && v.shopId !== shopId) return;
    if (asOf && String(v.voucherDate || "") > asOf) return;
    (v.lines || []).forEach((l) => {
      if (!l?.billId || !l.interestTo) return;
      if (!out.has(l.billId) || l.interestTo > out.get(l.billId)) out.set(l.billId, l.interestTo);
    });
  });
  return out;
}

/**
 * Overdue bills and their interest as at a date.
 * ledger: buildGlobalLedger result; bills: the side's invoices (sales or purchase); parties: customers or vendors (for
 * their Credit Days); vouchers: account vouchers (interest already posted); rate: annual %.
 * -> { rows: [{ partyKey, party, partyId, billId, no, date, dueDate, daysOverdue, interestDays, from, principal, interest }],
 *      parties: [{ partyKey, party, partyId, bills, principal, interest }], totals: { bills, principal, interest } }
 * Only bills that are past due (after grace) are listed.
 */
export function overdueInterest(ledger, { side = "customer", asOf = "", bills = [], parties = [], vouchers = [], rate = 0, graceDays = 0, shopId = "" } = {}) {
  const aging = buildAging(ledger?.postings || [], ledger?.accounts || new Map(), { side, asOf });
  const billById = new Map((bills || []).filter((b) => b?.id).map((b) => [b.id, b]));
  const partyById = new Map((parties || []).filter((p) => p?.id).map((p) => [p.id, p]));
  const nameKey = side === "vendor" ? "vendorName" : "customerName";
  const partyByName = new Map((parties || []).filter((p) => p?.id && !p.isDeleted && p[nameKey]).map((p) => [lc(p[nameKey]), p]));
  const posted = postedInterest(vouchers, { shopId, side, asOf });
  const yearly = Math.max(0, num(rate)) / 100;
  const rows = [];
  aging.rows.forEach((pr) => {
    const party = (pr.partyId && partyById.get(pr.partyId)) || partyByName.get(lc(pr.name)) || null;
    pr.open.forEach((c) => {
      if (c.col !== BILL_COLS[side] || !(c.amount > 0.004)) return;
      const bill = billById.get(c.docId);
      const dueDate = billDueDate(bill || { invoiceDate: c.date }, party);
      const daysOverdue = dueDate && asOf > dueDate ? daysBetween(dueDate, asOf) : 0;
      if (daysOverdue <= graceDays) return;
      const graceEnd = addDays(dueDate, graceDays);
      const after = posted.get(c.docId);
      const from = after && after > graceEnd ? after : graceEnd;
      const interestDays = asOf > from ? daysBetween(from, asOf) : 0;
      rows.push({
        partyKey: pr.key, party: pr.name, partyId: pr.partyId || party?.id || "", billId: c.docId, no: c.no, date: c.date, dueDate, daysOverdue,
        interestDays, from, principal: r2(c.amount), interest: r2(c.amount * yearly * interestDays / INTEREST_DAY_BASIS), postedTo: after || "",
      });
    });
  });
  rows.sort((a, b) => a.party.localeCompare(b.party) || a.dueDate.localeCompare(b.dueDate) || String(a.no).localeCompare(String(b.no), undefined, { numeric: true }));
  const byParty = new Map();
  rows.forEach((r) => {
    const p = byParty.get(r.partyKey) || { partyKey: r.partyKey, party: r.party, partyId: r.partyId, bills: 0, principal: 0, interest: 0 };
    p.bills += 1; p.principal = r2(p.principal + r.principal); p.interest = r2(p.interest + r.interest);
    byParty.set(r.partyKey, p);
  });
  const partiesOut = [...byParty.values()].sort((a, b) => b.interest - a.interest || a.party.localeCompare(b.party));
  return {
    rows, parties: partiesOut,
    totals: { bills: rows.length, principal: r2(rows.reduce((t, r) => t + r.principal, 0)), interest: r2(rows.reduce((t, r) => t + r.interest, 0)) },
  };
}

function addDays(day, n) {
  if (!day) return "";
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + (Number(n) || 0));
  return d.toISOString().slice(0, 10);
}

/** The journal id / number for a side and date (one per side per day, so a second post the same day is refused). */
export const interestJournalId = (side, asOf) => `int-${side === "vendor" ? "ap" : "ar"}-${asOf}`;

/**
 * The interest journal for a report (bills with interest only). -> null when there is nothing to post.
 * Customer: Dr each customer (one line per bill) / Cr Interest Received. Supplier: Dr Interest Paid / Cr each supplier.
 */
export function interestJournal(rep, { side = "customer", asOf = "", rate = 0, shopId = "", uid = "", by = "", now = new Date() } = {}) {
  const billed = (rep?.rows || []).filter((r) => r.interest >= 0.01);
  if (!billed.length || !asOf) return null;
  const total = r2(billed.reduce((t, r) => t + r.interest, 0));
  const partyLines = billed.map((r) => ({
    account: r.party, partyId: r.partyId, billId: r.billId, interestTo: asOf, debit: side === "vendor" ? 0 : r.interest, credit: side === "vendor" ? r.interest : 0,
    note: `${r.no} due ${r.dueDate}: ${r.principal} x ${rate}% x ${r.interestDays}/${INTEREST_DAY_BASIS}`,
  }));
  const own = { account: side === "vendor" ? INTEREST_PAID : INTEREST_RECEIVED, debit: side === "vendor" ? total : 0, credit: side === "vendor" ? 0 : total };
  const lines = side === "vendor" ? [own, ...partyLines] : [...partyLines, own];
  const at = new Date(now).toISOString();
  const id = interestJournalId(side, asOf);
  return {
    id,
    doc: {
      shopId, voucherType: "journal", voucherNo: `INT-${side === "vendor" ? "AP" : "AR"}-${asOf}`, voucherDate: asOf,
      narration: `Interest on overdue ${side === "vendor" ? "supplier" : "customer"} bills to ${asOf} at ${rate}% a year (simple, actual/${INTEREST_DAY_BASIS})`,
      lines, totalAmount: total, status: "active", source: "overdueInterest", interestSide: side, interestRate: rate,
      createdBy: uid, createdByName: by, createdAt: at, updatedAt: at, updatedBy: uid,
    },
    total,
  };
}

/** Why the interest cannot be posted now: [{ id, en, bn }]. */
export function interestBlockers({ asOf = "", today = "", lockDate = "", rep = null, existing = null, parties = [], side = "customer" } = {}) {
  const out = [];
  if (!asOf) out.push({ id: "date", en: "Pick the date", bn: "তারিখ দিন" });
  else if (today && asOf > today) out.push({ id: "future", en: "The date is in the future", bn: "তারিখ ভবিষ্যতে" });
  if (lockDate && asOf && asOf <= lockDate) out.push({ id: "locked", en: `The books are locked up to ${lockDate}`, bn: `${lockDate} পর্যন্ত হিসাব লক` });
  if (existing) out.push({ id: "done", en: `Interest to ${asOf} is already posted (${existing.voucherNo})`, bn: `${asOf} পর্যন্ত সুদ আগেই দেওয়া (${existing.voucherNo})` });
  if (!(rep?.totals?.interest >= 0.01)) out.push({ id: "nothing", en: "No interest to post", bn: "দেওয়ার মতো সুদ নেই" });
  // a journal line reaches the party's ledger by name, so the party must be on the master
  const nameKey = side === "vendor" ? "vendorName" : "customerName";
  const known = new Set((parties || []).filter((p) => p && !p.isDeleted && p[nameKey]).map((p) => lc(p[nameKey])));
  const missing = [...new Set((rep?.rows || []).filter((r) => r.interest >= 0.01 && !known.has(lc(r.party))).map((r) => r.party))];
  if (missing.length) out.push({ id: "party", en: `Not on the master: ${missing.join(", ")}`, bn: `মাস্টারে নেই: ${missing.join(", ")}` });
  return out;
}

export const INTEREST_COLS = ["Party", "Bill", "Bill date", "Due date", "Days overdue", "Interest days", "Open amount", "Interest"];
/** CSV / print rows: each bill, then the total. */
export function interestRows(rep) {
  const f = (v) => r2(v).toFixed(2);
  return [
    INTEREST_COLS,
    ...rep.rows.map((r) => [r.party, r.no, r.date, r.dueDate, String(r.daysOverdue), String(r.interestDays), f(r.principal), f(r.interest)]),
    ["Total", `${rep.totals.bills} bill(s)`, "", "", "", "", f(rep.totals.principal), f(rep.totals.interest)],
  ];
}
export const interestFileName = (side, asOf) => `overdue-interest-${side === "vendor" ? "suppliers" : "customers"}-${asOf || "today"}.csv`;
