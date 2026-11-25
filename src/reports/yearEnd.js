// Year-end close: at the end of a financial year the income and expense accounts (and Profit Distribution) are
// emptied into Capital with one closing journal dated the year-end day, so the new year starts with every P&L
// account at zero and the profit or loss of the year inside the owner's equity. The journal is an ordinary
// accountVouchers journal (source "yearEnd", fixed id) - the ledger reads it like any other.
// Stock is not a ledger account (the Balance Sheet adds it), so the stock value on the year-end day is kept on the
// close record (shop.yearEnds); the Balance Sheet then shows the stock gain of the closed years in equity and
// counts later profit from that stock value. Totals never change - only where equity sits.
// The P&L report leaves year-end journals out (journalPl.js), so a year's profit reads the same after closing.

const r2 = (v) => Math.round(((Number(v) || 0) + Number.EPSILON) * 100) / 100;
const zero = (v) => Math.abs(Number(v) || 0) < 0.005;
export const YEAR_END_TARGET = "Capital";
export const yearEndJournalId = (fyEnd) => `yearend-${fyEnd}`;
export const isYearEndJournal = (v) => v?.source === "yearEnd";

/**
 * Balances to close on the year-end day: every income / expense account and Profit Distribution.
 * -> { lines: [{ key, name, balance }], net } (balance: debit positive; net > 0 = loss, < 0 = profit)
 */
export function closingBalances(ledger, fyEnd) {
  const bal = new Map();
  (ledger?.postings || []).forEach((p) => { if (p.date <= fyEnd) bal.set(p.key, r2((bal.get(p.key) || 0) + p.dr - p.cr)); });
  const lines = [];
  (ledger?.accounts ? [...ledger.accounts.values()] : []).forEach((a) => {
    const v = r2(bal.get(a.key) || 0);
    if (zero(v)) return;
    if (a.group === "income" || a.group === "expense" || a.name === "Profit Distribution") lines.push({ key: a.key, name: a.name, balance: v });
  });
  lines.sort((a, b) => a.name.localeCompare(b.name));
  return { lines, net: r2(lines.reduce((t, l) => t + l.balance, 0)) };
}

/** The closing journal for the year (each account reversed, the net into Capital). null when nothing to close. */
export function yearEndJournal({ ledger, fyStart, fyEnd, shopId = "", uid = "", by = "", now = new Date() }) {
  const { lines, net } = closingBalances(ledger, fyEnd);
  if (!lines.length) return null;
  const jl = lines.map((l) => ({ account: l.name, debit: l.balance < 0 ? -l.balance : 0, credit: l.balance > 0 ? l.balance : 0, note: "Year-end close" }));
  if (!zero(net)) jl.push({ account: YEAR_END_TARGET, debit: net > 0 ? net : 0, credit: net < 0 ? -net : 0, note: net < 0 ? "Profit for the year" : "Loss for the year" });
  const total = r2(jl.reduce((t, l) => t + l.debit, 0));
  const at = new Date(now).toISOString();
  return {
    id: yearEndJournalId(fyEnd),
    doc: {
      shopId, voucherType: "journal", voucherNo: `YE-${fyEnd.slice(0, 4)}`, voucherDate: fyEnd, narration: `Year-end close ${fyStart} to ${fyEnd}: P&L into ${YEAR_END_TARGET}`,
      lines: jl, totalAmount: total, status: "active", source: "yearEnd", fyStart, fyEnd,
      createdBy: uid, createdByName: by, createdAt: at, updatedAt: at, updatedBy: uid,
    },
    net, profit: r2(-net),
  };
}

/**
 * The latest live close on or before `asOf`: { fyEnd, stockValue } or null. A close whose journal was cancelled
 * (or never synced) does not count. vouchers: accountVouchers.
 */
export function closedYearAt(yearEnds, asOf, vouchers = []) {
  const live = new Set((vouchers || []).filter((v) => v && !v.isDeleted && v.status !== "cancelled" && isYearEndJournal(v)).map((v) => v.id));
  return (Array.isArray(yearEnds) ? yearEnds : [])
    .filter((y) => y && y.fyEnd && (!asOf || y.fyEnd <= asOf) && live.has(y.journalId))
    .sort((a, b) => b.fyEnd.localeCompare(a.fyEnd))[0] || null;
}

/** Journal ids of live year-end closes inside [from, to] (the trial balance can show figures before closing). */
export const yearEndDocIds = (vouchers, from = "", to = "") => new Set((vouchers || [])
  .filter((v) => v && !v.isDeleted && v.status !== "cancelled" && isYearEndJournal(v) && (!from || v.voucherDate >= from) && (!to || v.voucherDate <= to)).map((v) => v.id));

/**
 * Can the year be closed? -> [{ id, ok, warn, en, bn }]
 * existing: the live close record of this year or null; lockDate: the period lock; earlierOpen: an earlier year
 * that has P&L but no close.
 */
export function yearEndChecks({ fyEnd, today, journal, existing = null, lockDate = "", earlierOpen = null, packStatus = "ok" }) {
  const out = [];
  if (fyEnd > today) out.push({ id: "future", ok: false, en: `The year ends on ${fyEnd} - close it after that day`, bn: `বছর শেষ ${fyEnd} - তার পরে বন্ধ করুন` });
  if (existing) out.push({ id: "closed", ok: false, en: `This year is already closed (${existing.closedByName || ""} ${String(existing.closedAt || "").slice(0, 10)})`, bn: `এই বছর আগেই বন্ধ (${existing.closedByName || ""} ${String(existing.closedAt || "").slice(0, 10)})` });
  if (lockDate && lockDate >= fyEnd && !existing) out.push({ id: "locked", ok: false, en: `The books are locked up to ${lockDate} - lift the lock to post the closing journal, then lock again`, bn: `${lockDate} পর্যন্ত লক - বন্ধের জার্নাল দিতে আগে লক খুলুন, পরে আবার লক করুন` });
  if (!journal && !existing) out.push({ id: "nothing", ok: false, en: "No income or expense balance to close", bn: "বন্ধ করার মতো আয় / খরচের ব্যালেন্স নেই" });
  if (earlierOpen) out.push({ id: "earlier", ok: true, warn: true, en: `The year ending ${earlierOpen} was never closed - its profit closes together with this year`, bn: `${earlierOpen}-এ শেষ হওয়া বছর বন্ধ হয়নি - তার লাভও এই বছরের সাথে বন্ধ হবে` });
  if (packStatus === "blocked") out.push({ id: "pack", ok: false, en: "The year-end checks are not clear (trial balance / balance sheet / VAT / bank)", bn: "বছর শেষের চেক ঠিক নেই (ট্রায়াল ব্যালেন্স / ব্যালেন্স শিট / VAT / ব্যাংক)" });
  else if (packStatus === "warn") out.push({ id: "pack", ok: true, warn: true, en: "Some year-end checks are amber - look at them first", bn: "কিছু বছর শেষের চেক হলুদ - আগে দেখে নিন" });
  return out;
}

/** The close record kept on the shop (shop.yearEnds). */
export const yearEndRecord = ({ fyStart, fyEnd, journalId, profit, stockValue, uid = "", by = "", now = new Date() }) => ({
  fyStart, fyEnd, journalId, profit: r2(profit), stockValue: r2(stockValue), target: YEAR_END_TARGET, closedAt: new Date(now).toISOString(), closedBy: uid, closedByName: by,
});
