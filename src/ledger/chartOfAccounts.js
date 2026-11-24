// Chart of accounts: the shop's list of named accounts (kept on the shop record as chartOfAccounts) with code, group
// and an active flag. It is a master list for pickers and labels only — the ledger still posts from the documents and
// matches accounts by name, so:
// - system accounts (the ledger's fixed accounts and the expense categories) can't be renamed, deleted or switched off;
// - a custom account can be renamed only while nothing has been posted to it (old postings keep the old name);
// - the group is never typed in: it is what the ledger itself gives that name (ledgerGroupOf), so the Balance Sheet,
//   Funds and the other reports classify it exactly as before. A bank account needs a name starting with "Bank".
import { FIXED, GROUPS, ledgerGroupOf } from "./globalLedger.js";
import { CASH_ACCOUNT } from "../vouchers/accountVoucherDomain.js";

const lc = (v) => String(v || "").trim().toLowerCase();
const clean = (v) => String(v || "").trim().replace(/\s+/g, " ");
const idOf = (name) => `acc_${lc(name).replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "x"}`;

// Posting depends on these: switching them off would hide accounts every sale, purchase or VAT entry uses.
export const ESSENTIAL = new Set([CASH_ACCOUNT, "Bank", "Sales", "Purchase", "VAT Input", "VAT Output", "Sales Return", "Purchase Return", "Opening Balance"]);
export const SYSTEM_NAMES = Object.keys(FIXED);

/** Group of an account name as the ledger posts it; expense categories are expense accounts. */
export function groupOfName(name, expenseNames = []) {
  const n = clean(name);
  if (expenseNames.some((e) => lc(e) === lc(n)) && !FIXED[n]) return "expense";
  return ledgerGroupOf(n);
}
export const groupLabel = (id, bn = false) => { const g = GROUPS.find((x) => x.id === id); return g ? (bn ? g.bn : g.en) : id; };

/**
 * Saved list + every system account that is missing from it (system accounts always exist), groups re-derived.
 * expenseNames: the Expenses page categories, which the ledger books as expense accounts.
 */
export function normalizeChart(saved, { expenseNames = [] } = {}) {
  const list = (Array.isArray(saved) ? saved : []).filter((a) => a && clean(a.name));
  const byName = new Map(list.map((a) => [lc(a.name), a]));
  const systemNames = [...SYSTEM_NAMES, ...expenseNames.filter((e) => !FIXED[e])];
  systemNames.forEach((name) => {
    if (!byName.has(lc(name))) byName.set(lc(name), { id: idOf(name), code: "", name, active: true });
  });
  return [...byName.values()].map((a) => {
    const system = systemNames.some((s) => lc(s) === lc(a.name));
    return { id: a.id || idOf(a.name), code: clean(a.code), name: clean(a.name), group: groupOfName(a.name, expenseNames), system, active: system && ESSENTIAL.has(clean(a.name)) ? true : a.active !== false,
      createdAt: a.createdAt || "", updatedAt: a.updatedAt || "", migrated: !!a.migrated, groupId: clean(a.groupId) };
  }).sort((a, b) => GROUPS.findIndex((g) => g.id === a.group) - GROUPS.findIndex((g) => g.id === b.group) || (a.code || "~").localeCompare(b.code || "~", undefined, { numeric: true }) || a.name.localeCompare(b.name));
}

/** What the saved chart should hold (no derived fields). */
export const toSaved = (chart) => chart.map(({ id, code, name, active, createdAt, updatedAt, migrated, groupId }) => ({ id, code, name, active, createdAt, updatedAt, ...(migrated ? { migrated: true } : {}), ...(groupId ? { groupId } : {}) }));

/** Account names already used in journal / contra vouchers (lower case). */
export function usedNames(accountVouchers) {
  const out = new Set();
  (accountVouchers || []).forEach((v) => {
    if (!v || v.isDeleted) return;
    (v.lines || []).forEach((l) => { if (clean(l?.account)) out.add(lc(l.account)); });
    [v.fromAccount, v.toAccount].forEach((x) => { if (clean(x)) out.add(lc(x)); });
  });
  return out;
}

/**
 * Check an add / edit. draft: { id?, code, name, active }; used: Set of used names (lower case);
 * partyNames: customers and suppliers (their names belong to party ledgers, not here).
 * -> { error } or { ok: true, account }
 */
export function validateAccount(draft, chart, { used = new Set(), partyNames = [], expenseNames = [] } = {}) {
  const name = clean(draft?.name), code = clean(draft?.code);
  const current = draft?.id ? chart.find((a) => a.id === draft.id) : null;
  if (!name) return { error: "name" };
  if (chart.some((a) => a.id !== draft?.id && lc(a.name) === lc(name))) return { error: "duplicate" };
  if (code && chart.some((a) => a.id !== draft?.id && lc(a.code) === lc(code))) return { error: "duplicateCode" };
  if (partyNames.some((p) => lc(p) === lc(name))) return { error: "party" };
  if (current) {
    const renamed = lc(current.name) !== lc(name);
    if (renamed && current.system) return { error: "systemRename" };
    if (renamed && used.has(lc(current.name))) return { error: "usedRename" };
    if (draft.active === false && current.system && ESSENTIAL.has(current.name)) return { error: "essential" };
  } else if (SYSTEM_NAMES.some((s) => lc(s) === lc(name))) {
    return { error: "duplicate" };
  }
  return { ok: true, account: { id: current?.id || idOf(name), code, name, active: draft?.active !== false, group: groupOfName(name, expenseNames), system: !!current?.system } };
}

/** A custom account can go only while nothing uses it; otherwise switch it off. */
export const canDelete = (account, used = new Set()) => !!account && !account.system && !used.has(lc(account.name));

/** Names used in vouchers that the chart does not know yet (and are not parties): added as custom accounts. */
export function missingFromVouchers(chart, accountVouchers, partyNames = []) {
  const known = new Set(chart.map((a) => lc(a.name)));
  const parties = new Set(partyNames.map(lc));
  const seen = new Map();
  (accountVouchers || []).forEach((v) => {
    if (!v || v.isDeleted) return;
    [...(v.lines || []).map((l) => l?.account), v.fromAccount, v.toAccount].forEach((x) => {
      const n = clean(x);
      if (n && !known.has(lc(n)) && !parties.has(lc(n)) && !seen.has(lc(n))) seen.set(lc(n), n);
    });
  });
  return [...seen.values()].sort().map((name) => ({ id: idOf(name), code: "", name, active: true, migrated: true }));
}

/** Names for the journal picker (active accounts) and the contra picker (active cash / bank accounts). */
export const activeNames = (chart) => chart.filter((a) => a.active).map((a) => a.name);
export const moneyNames = (chart) => chart.filter((a) => a.active && a.group === "money").map((a) => a.name);

export const CHART_COLS = ["Code", "Name", "Group", "System", "Active"];
/** groupPathOf(account) -> "Fixed Assets > Furniture" adds a Sub-group column (custom groups, coaGroups.js). */
export const chartCsvRows = (chart, groupPathOf = null) => [
  groupPathOf ? [...CHART_COLS, "Sub-group"] : CHART_COLS,
  ...chart.map((a) => [a.code, a.name, groupLabel(a.group), a.system ? "Yes" : "No", a.active ? "Yes" : "No", ...(groupPathOf ? [groupPathOf(a)] : [])]),
];
