// Account nature from the chart of accounts: a custom account the owner has put into one of the shop's groups
// (coaGroups) takes that group's nature, and the nature decides where the account sits everywhere - the Global
// Ledger group, the Trial Balance section, the Balance Sheet side and whether a journal line is P&L.
// Left alone (no group), an account keeps the ledger's own rule (ledgerGroupOf) and the P&L's journal rule as before,
// so a shop that never groups its accounts sees no change.
// Engine accounts stay fixed whatever group they are in: the FIXED names in globalLedger.js (Cash in Hand, Bank, Sales,
// Purchase, VAT, Capital, Opening Balance, Stock Adjustment, Warranty Replacement Stock, depreciation, exchange...) and
// every "Bank ..." account (money), because bills, payments and the stock / asset / forex postings rely on them.
import { natureEditable, normalizeGroups } from "./coaGroups.js";

export { natureEditable };
const clean = (v) => String(v ?? "").trim().replace(/\s+/g, " ");
const lc = (v) => clean(v).toLowerCase();

/**
 * chart: the saved chart of accounts (shop.chartOfAccounts); coaGroups: the saved groups (shop.coaGroups).
 * -> natureOf(name): the nature of the group the account is in ("" when it has none or is an engine account).
 */
export function accountNatureOf(chart, coaGroups) {
  const groups = new Map(normalizeGroups(coaGroups).map((g) => [g.id, g]));
  const m = new Map();
  (Array.isArray(chart) ? chart : []).forEach((a) => {
    const name = clean(a?.name);
    const g = groups.get(clean(a?.groupId));
    if (g && natureEditable(name)) m.set(lc(name), g.nature);
  });
  return (name) => m.get(lc(name)) || "";
}

/** The nature resolver for a shop record. */
export const shopAccountNature = (shop) => accountNatureOf(shop?.chartOfAccounts, shop?.coaGroups);
