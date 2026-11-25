// Trial balance: every Global Ledger account with its opening balance (before `from`), the debits and credits of
// the period and the closing balance, arranged ledger group > the shop's own groups (CoA groups, #21) > account.
// Read only - the postings come from buildGlobalLedger as they are. A custom group is used for an account only when
// the group's nature is the group the ledger gave the account, so the tree never moves an account to another side.
// Debits always equal credits (double entry): `difference` shows anything that does not, and should be 0.
import { GROUPS } from "../ledger/globalLedger.js";
import { normalizeGroups, groupTree, groupName } from "../ledger/coaGroups.js";
import { r2 } from "./reportFilters.js";

const lc = (v) => String(v || "").trim().toLowerCase();
const zero = (v) => Math.abs(v) < 0.005;
const sideOf = (bal) => (bal > 0 ? { dr: r2(bal), cr: 0 } : { dr: 0, cr: r2(-bal) });
const emptyTotals = () => ({ opening: 0, dr: 0, cr: 0, closing: 0 });
const addTo = (t, a) => { t.opening = r2(t.opening + a.opening); t.dr = r2(t.dr + a.dr); t.cr = r2(t.cr + a.cr); t.closing = r2(t.closing + a.closing); };

/** Per account: { key, name, group, opening, dr, cr, closing } for postings up to `to`, opening = before `from`. */
export function accountBalances(ledger, { from = "", to = "", excludeDocIds = null } = {}) {
  const m = new Map();
  (ledger?.postings || []).forEach((p) => {
    if (to && p.date > to) return;
    if (excludeDocIds && excludeDocIds.has(p.docId)) return;
    if (!m.has(p.key)) m.set(p.key, { opening: 0, dr: 0, cr: 0 });
    const a = m.get(p.key);
    if (from && p.date < from) a.opening = r2(a.opening + p.dr - p.cr);
    else { a.dr = r2(a.dr + p.dr); a.cr = r2(a.cr + p.cr); }
  });
  return [...m.entries()].map(([key, a]) => {
    const acc = ledger.accounts.get(key) || { name: key, group: "other" };
    return { key, name: acc.name, group: acc.group, partyId: acc.partyId || "", opening: a.opening, dr: a.dr, cr: a.cr, closing: r2(a.opening + a.dr - a.cr) };
  });
}

/**
 * ledger: buildGlobalLedger result. opts: { from, to, chart (saved CoA rows), coaGroups (saved groups), includeZero }
 * -> { sections: [{ id, en, bn, totals, nodes }], totals, difference, accounts }
 * node: { type: "group", id, group, depth, totals, nodes } | { type: "account", key, name, code, opening, dr, cr, closing }
 */
// excludeDocIds: postings left out (e.g. the year-end closing journal, to see the figures before closing)
export function buildTrialBalance(ledger, { from = "", to = "", chart = [], coaGroups = [], includeZero = false, excludeDocIds = null } = {}) {
  const groups = normalizeGroups(coaGroups);
  const byName = new Map((Array.isArray(chart) ? chart : []).filter((a) => a?.name).map((a) => [lc(a.name), a]));
  const all = accountBalances(ledger, { from, to, excludeDocIds }).filter((a) => includeZero || !(zero(a.opening) && zero(a.dr) && zero(a.cr)))
    .map((a) => {
      const c = a.partyId ? null : byName.get(lc(a.name));
      const g = c?.groupId ? groups.find((x) => x.id === c.groupId) : null;
      return { ...a, type: "account", code: c?.code || "", groupId: g && g.nature === a.group ? g.id : "" };
    })
    .sort((a, b) => (a.code || "~").localeCompare(b.code || "~", undefined, { numeric: true }) || a.name.localeCompare(b.name));
  const totals = emptyTotals();
  const sections = GROUPS.map((sec) => {
    const accounts = all.filter((a) => a.group === sec.id);
    const secTotals = emptyTotals();
    accounts.forEach((a) => addTo(secTotals, a));
    const tree = groupTree(groups, sec.id);
    const nodeOf = new Map(tree.map(({ group, depth }) => [group.id, { type: "group", id: group.id, group, depth, totals: emptyTotals(), nodes: [] }]));
    const top = [];
    tree.forEach(({ group }) => { const n = nodeOf.get(group.id); (group.parentId && nodeOf.get(group.parentId) ? nodeOf.get(group.parentId).nodes : top).push(n); });
    accounts.forEach((a) => {
      const n = a.groupId && nodeOf.get(a.groupId);
      if (!n) return;
      n.nodes.push(a);
      for (let g = n; g; g = g.group.parentId ? nodeOf.get(g.group.parentId) : null) addTo(g.totals, a);
    });
    const prune = (list) => list.filter((n) => n.type === "account" || (n.nodes = prune(n.nodes)).length);
    const nodes = [...accounts.filter((a) => !a.groupId), ...prune(top)];
    addTo(totals, secTotals);
    return { id: sec.id, en: sec.en, bn: sec.bn, totals: secTotals, nodes };
  }).filter((s) => s.nodes.length);
  const closingDr = r2(all.reduce((t, a) => t + sideOf(a.closing).dr, 0));
  const closingCr = r2(all.reduce((t, a) => t + sideOf(a.closing).cr, 0));
  const openingDr = r2(all.reduce((t, a) => t + sideOf(a.opening).dr, 0));
  const openingCr = r2(all.reduce((t, a) => t + sideOf(a.opening).cr, 0));
  return {
    sections, accounts: all,
    totals: { openingDr, openingCr, dr: totals.dr, cr: totals.cr, closingDr, closingCr },
    difference: r2(closingDr - closingCr),
  };
}

/** Closing balance per account key of another trial balance (for the compare column). */
export const closingByKey = (tb) => new Map((tb?.accounts || []).map((a) => [a.key, a.closing]));

/** Days in [from, to] shifted back by the period's own length (previous period) or one year (same period last year). */
export function comparePeriod(from, to, mode) {
  if (!from || !to || from > to) return null;
  const d = (s) => new Date(`${s}T00:00:00Z`);
  const iso = (x) => x.toISOString().slice(0, 10);
  if (mode === "lastYear") {
    const f = d(from), t = d(to);
    f.setUTCFullYear(f.getUTCFullYear() - 1); t.setUTCFullYear(t.getUTCFullYear() - 1);
    return { from: iso(f), to: iso(t) };
  }
  if (mode === "previous") {
    const days = Math.round((d(to) - d(from)) / 86400000) + 1;
    const t = d(from); t.setUTCDate(t.getUTCDate() - 1);
    const f = new Date(t); f.setUTCDate(f.getUTCDate() - days + 1);
    return { from: iso(f), to: iso(t) };
  }
  return null;
}

export const TB_COLS = ["Level", "Group / Account", "Code", "Opening Dr", "Opening Cr", "Period Dr", "Period Cr", "Closing Dr", "Closing Cr"];
/**
 * CSV rows: section, group and account lines (indented by level), then the total line. compare: Map from
 * closingByKey(); its column shows the other period's closing balance (debit positive).
 */
export function trialBalanceRows(tb, { compare = null, compareLabel = "Compare closing" } = {}) {
  const num = (v) => (zero(v) ? "" : r2(v).toFixed(2));
  const cols = compare ? [...TB_COLS, compareLabel, "Change"] : TB_COLS;
  const out = [cols];
  const line = (level, label, code, t, key = null) => {
    const o = sideOf(t.opening), c = sideOf(t.closing);
    const row = [String(level), `${"  ".repeat(level)}${label}`, code, num(o.dr), num(o.cr), num(t.dr), num(t.cr), num(c.dr), num(c.cr)];
    if (compare) {
      const other = key ? compare.get(key) || 0 : null;
      row.push(key ? num(other) : "", key ? num(t.closing - other) : "");
    }
    out.push(row);
  };
  const walk = (nodes, level) => nodes.forEach((n) => {
    if (n.type === "account") line(level, n.name, n.code, n, n.key);
    else { line(level, groupName(n.group), n.group.code, n.totals); walk(n.nodes, level + 1); }
  });
  tb.sections.forEach((s) => { line(0, s.en, "", s.totals); walk(s.nodes, 1); });
  out.push(["", "TOTAL", "", num(tb.totals.openingDr), num(tb.totals.openingCr), num(tb.totals.dr), num(tb.totals.cr), num(tb.totals.closingDr), num(tb.totals.closingCr), ...(compare ? ["", ""] : [])]);
  return out;
}

export const trialBalanceFileName = (from, to) => `trial-balance-${from || "start"}-${to || "today"}.csv`;
