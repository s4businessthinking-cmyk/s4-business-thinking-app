import { DUE_TO_HQ } from "./interCompanyAccounts.js";
import { livePurchasesOf, r2 } from "../reports/reportFilters.js";

const plDay = (v) => String(v || "").slice(0, 10);
const inPlRange = (d, from, to) => {
  if (!d) return false;
  if (from && d < from) return false;
  if (to && d > to) return false;
  return true;
};

/** Inter-company receive purchase in the P&L window (eliminate one side at group). */
export function measureInterCompanyPlElimination(perFile = [], from, to) {
  let total = 0;
  for (const { scoped, shopId } of perFile) {
    if (!scoped) continue;
    for (const inv of livePurchasesOf(scoped.purchaseInvoices || [], shopId)) {
      if (inv.interCompanyIn !== true) continue;
      const d = plDay(inv.invoiceDate);
      if (!inPlRange(d, from, to)) continue;
      total += Number(inv.grandTotal) || 0;
    }
    for (const v of scoped.accountVouchers || []) {
      if (v?.interCompanyOut !== true || v.isDeleted || v.deleted) continue;
      const d = plDay(v.voucherDate || v.date);
      if (!inPlRange(d, from, to)) continue;
      const amt = Number(v.totalAmount ?? v.amount ?? 0);
      if (amt > 0.009) total = Math.max(total, amt);
    }
  }
  return r2(total);
}

const lc = (v) => String(v || "").trim().toLowerCase();
const isDueFrom = (name) => /^due from /i.test(String(name || "").trim());
const isDueToHq = (name) => lc(name) === lc(DUE_TO_HQ);
/** Peer IC uses "Due to Branch X"; HQ path uses "Due to HQ". */
const isDueToIc = (name) => isDueToHq(name) || /^due to /i.test(String(name || "").trim());

/** Net inter-company Due from vs Due to (HQ or peer branch) in consolidated trial balance rows. */
export function eliminateInterCompanyTrialBalance(merged) {
  if (!merged?.accounts?.length) return { ...merged, elimination: 0 };
  const accounts = merged.accounts.map((a) => ({ ...a }));
  const fromRows = accounts.filter((a) => isDueFrom(a.name));
  const toRows = accounts.filter((a) => isDueToIc(a.name));
  const fromAsset = r2(fromRows.reduce((t, a) => t + Math.max(0, a.closing), 0));
  const toLiability = r2(toRows.reduce((t, a) => t + Math.max(0, -a.closing), 0));
  let elim = r2(Math.min(fromAsset, toLiability));
  if (elim < 0.01) return { ...merged, accounts, elimination: 0 };

  for (const row of fromRows) {
    if (elim <= 0) break;
    if (row.closing <= 0) continue;
    const take = Math.min(row.closing, elim);
    row.closing = r2(row.closing - take);
    row.dr = r2(Math.max(0, row.dr - take));
    elim = r2(elim - take);
  }
  elim = r2(Math.min(fromAsset, toLiability));
  for (const row of toRows) {
    if (elim <= 0) break;
    if (row.closing >= 0) continue;
    const take = Math.min(-row.closing, elim);
    row.closing = r2(row.closing + take);
    row.cr = r2(Math.max(0, row.cr - take));
    elim = r2(elim - take);
  }

  const kept = accounts.filter(
    (a) => Math.abs(a.closing) >= 0.01 || Math.abs(a.opening) >= 0.01 || Math.abs(a.dr) >= 0.01 || Math.abs(a.cr) >= 0.01
  );
  const closingDr = r2(kept.reduce((sum, a) => sum + (a.closing > 0 ? a.closing : 0), 0));
  const closingCr = r2(kept.reduce((sum, a) => sum + (a.closing < 0 ? -a.closing : 0), 0));
  return {
    ...merged,
    accounts: kept,
    elimination: r2(Math.min(fromAsset, toLiability)),
    difference: r2(closingDr - closingCr),
  };
}

/** Measure paired Due from / Due to HQ balances across company files (as-of balances). */
export function measureInterCompanyElimination(fileLedgers = [], asOf = "") {
  let from = 0;
  let to = 0;
  for (const { ledger } of fileLedgers) {
    if (!ledger?.accounts || !ledger?.postings) continue;
    const bal = (key) => {
      let t = 0;
      for (const p of ledger.postings) {
        if (asOf && p.date > asOf) continue;
        if (p.key !== key) continue;
        t += p.dr - p.cr;
      }
      return r2(t);
    };
    for (const a of ledger.accounts.values()) {
      const v = bal(a.key);
      if (isDueFrom(a.name)) from = r2(from + Math.max(0, v));
      if (isDueToIc(a.name)) to = r2(to + Math.max(0, -v));
    }
  }
  return r2(Math.min(from, to));
}

/** Undo one side of inter-company purchase double-count in consolidated P&L totals. */
export function applyEliminationToPlTotals(totals, elimination) {
  if (!elimination || elimination < 0.01) return { ...totals, interCompanyPlElimination: 0 };
  return {
    ...totals,
    grossProfit: r2((totals.grossProfit || 0) + elimination),
    netProfit: r2((totals.netProfit || 0) + elimination),
    interCompanyPlElimination: elimination,
  };
}

export function applyEliminationToGroupTotals(totals, elimination) {
  if (!elimination || elimination < 0.01) return { ...totals, elimination: 0 };
  return {
    ...totals,
    totalAssets: r2(Math.max(0, (totals.totalAssets || 0) - elimination)),
    totalLiabilities: r2(Math.max(0, (totals.totalLiabilities || 0) - elimination)),
    elimination,
  };
}

/** Adjust consolidated P&L/BS totals after inter-company due netting (asset/liability lines only). */
export function eliminateInterCompanyBsRows(bsRows = []) {
  const rows = bsRows.map((r) => ({ ...r }));
  const fromTotal = r2(rows.filter((r) => isDueFrom(r.label)).reduce((t, r) => t + (r.totalAssets || 0), 0));
  const toTotal = r2(rows.filter((r) => isDueToHq(r.label)).reduce((t, r) => t + (r.totalLiabilities || 0), 0));
  const elim = r2(Math.min(fromTotal, toTotal));
  if (elim < 0.01) return { rows, elimination: 0 };
  return {
    rows: rows.map((r) => {
      if (isDueFrom(r.label) && r.totalAssets > 0) {
        return { ...r, totalAssets: r2(Math.max(0, r.totalAssets - elim)), interCompanyElim: elim };
      }
      if (isDueToHq(r.label) && r.totalLiabilities > 0) {
        return { ...r, totalLiabilities: r2(Math.max(0, r.totalLiabilities - elim)), interCompanyElim: elim };
      }
      return r;
    }),
    elimination: elim,
  };
}