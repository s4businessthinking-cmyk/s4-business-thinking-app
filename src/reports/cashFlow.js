// Cash flow for a period: money in and out of cash and bank accounts, from the same global-ledger postings as
// Books / Balance Sheet, so the opening and closing figures match the Cash Book and Bank Book.
// An entry that only moves money between the shop's own cash and bank accounts (contra, deposit) is a transfer:
// with all accounts chosen it is shown apart and left out of in / out; with one account it counts as in or out.
// Draft and cancelled documents are already left out of the postings.
import { r2 } from "./reportFilters.js";

// Posting types by activity. Anything else (journal, contra, opening) is "other".
const ACTIVITY = {
  saleReceipt: "operating", receipt: "operating", purchasePayment: "operating", payment: "operating", expense: "operating",
  refundPaid: "operating", refundReceived: "operating", bank: "operating",
  capitalIn: "owner", capitalOut: "owner", drawing: "owner", payout: "owner", distribution: "owner",
};
export const ACTIVITIES = ["operating", "owner", "other"];

const entryId = (p) => `${p.col || ""}:${p.docId || ""}:${p.date || ""}:${p.type || ""}:${p.no || ""}`;
const daysBetween = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);

/** "day" for a range up to about two months, "month" for longer or open ranges. */
export function periodUnit(from, to, firstDate = "") {
  const start = from || firstDate;
  if (!start || !to) return "month";
  return daysBetween(start, to) <= 62 ? "day" : "month";
}

/**
 * postings / accounts from buildGlobalLedger. accountKey: one money account, or "" for all of them.
 * -> { opening, totalIn, totalOut, net, closing, transfers, byActivity, byType, byAccount, byPeriod, unit }
 *    byType: [{ type, activity, in, out }], byAccount: [{ key, name, opening, in, out, closing }],
 *    byPeriod: [{ period, in, out, net, closing }].
 */
export function buildCashFlow(postings, accounts, { from = "", to = "", accountKey = "" } = {}) {
  const isMoney = (key) => accounts?.get(key)?.group === "money" && (!accountKey || key === accountKey);
  const allMoney = (key) => accounts?.get(key)?.group === "money";

  // Entries whose every line is a cash / bank account only move money inside the shop.
  const internal = new Map();
  (postings || []).forEach((p) => {
    const id = entryId(p);
    internal.set(id, (internal.has(id) ? internal.get(id) : true) && allMoney(p.key));
  });
  const isTransfer = (p) => !accountKey && internal.get(entryId(p));

  const byAccount = new Map();
  const account = (key) => {
    if (!byAccount.has(key)) byAccount.set(key, { key, name: accounts.get(key)?.name || key, opening: 0, in: 0, out: 0, closing: 0 });
    return byAccount.get(key);
  };
  const byType = new Map();
  const byPeriod = new Map();
  let opening = 0, totalIn = 0, totalOut = 0, transfers = 0, firstDate = "";

  const moneyLines = (postings || []).filter((p) => isMoney(p.key) && (!to || p.date <= to));
  moneyLines.forEach((p) => { if (p.date && (!firstDate || p.date < firstDate)) firstDate = p.date; });
  const unit = periodUnit(from, to, firstDate);

  moneyLines.forEach((p) => {
    const a = account(p.key);
    if (from && p.date < from) {
      a.opening = r2(a.opening + p.dr - p.cr);
      opening = r2(opening + p.dr - p.cr);
      return;
    }
    a.in = r2(a.in + p.dr);
    a.out = r2(a.out + p.cr);
    if (isTransfer(p)) { transfers = r2(transfers + p.dr); return; }
    totalIn = r2(totalIn + p.dr);
    totalOut = r2(totalOut + p.cr);
    const t = byType.get(p.type) || { type: p.type, activity: ACTIVITY[p.type] || "other", in: 0, out: 0 };
    t.in = r2(t.in + p.dr);
    t.out = r2(t.out + p.cr);
    byType.set(p.type, t);
    const period = unit === "day" ? p.date : String(p.date).slice(0, 7);
    const row = byPeriod.get(period) || { period, in: 0, out: 0 };
    row.in = r2(row.in + p.dr);
    row.out = r2(row.out + p.cr);
    byPeriod.set(period, row);
  });

  byAccount.forEach((a) => { a.closing = r2(a.opening + a.in - a.out); });
  let running = opening;
  const periods = [...byPeriod.values()].sort((a, b) => a.period.localeCompare(b.period)).map((row) => {
    const net = r2(row.in - row.out);
    running = r2(running + net);
    return { ...row, net, closing: running };
  });
  const types = [...byType.values()].sort((a, b) => ACTIVITIES.indexOf(a.activity) - ACTIVITIES.indexOf(b.activity) || (b.in + b.out) - (a.in + a.out));
  const byActivity = ACTIVITIES.map((id) => {
    const list = types.filter((t) => t.activity === id);
    return { id, in: r2(list.reduce((s, t) => s + t.in, 0)), out: r2(list.reduce((s, t) => s + t.out, 0)) };
  }).map((x) => ({ ...x, net: r2(x.in - x.out) }));

  return {
    opening, totalIn, totalOut, net: r2(totalIn - totalOut), closing: r2(opening + totalIn - totalOut), transfers,
    byActivity, byType: types, byAccount: [...byAccount.values()].sort((a, b) => a.name.localeCompare(b.name)), byPeriod: periods, unit,
  };
}
