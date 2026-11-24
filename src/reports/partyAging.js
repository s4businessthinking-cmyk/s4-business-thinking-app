// Debtors & creditors ageing as at a date. Each party's balance comes from the global ledger (so it agrees with the
// party ledger, Balance Sheet and trial balance) and is aged first-in-first-out: money received or paid clears the
// oldest bills first, so what is still due sits on the newest bills. Age = days from the bill date to the as-at date.
// A party in credit (advance) has nothing to age and is listed apart.

// Same buckets as the outstanding statement in the party ledger (vouchers/PartyLedgerWindow.jsx).
export const AGE_BUCKETS = [[0, 30, "0-30"], [31, 60, "31-60"], [61, 90, "61-90"], [91, Infinity, "90+"]];

const r2 = (v) => Math.round(((Number(v) || 0) + Number.EPSILON) * 100) / 100;
const daysBetween = (fromIso, toIso) => {
  const a = Date.parse(`${String(fromIso).slice(0, 10)}T00:00:00Z`);
  const b = Date.parse(`${String(toIso).slice(0, 10)}T00:00:00Z`);
  return Number.isFinite(a) && Number.isFinite(b) ? Math.max(0, Math.round((b - a) / 86400000)) : 0;
};
export const bucketOf = (days) => AGE_BUCKETS.findIndex(([lo, hi]) => days >= lo && days <= hi);

/**
 * side: "customer" (debtors, bills are debits) or "vendor" (creditors, bills are credits).
 * -> { rows: [{ key, name, partyId, due, buckets: [4], oldestDays, bills }], advances: [{ key, name, partyId, amount }],
 *      totals: { due, buckets: [4], advance, net } }
 */
export function buildAging(postings, accounts, { side = "customer", asOf = "" } = {}) {
  const sign = side === "vendor" ? -1 : 1;
  const byParty = new Map();
  (postings || []).forEach((p) => {
    if (accounts?.get(p.key)?.group !== side || (asOf && p.date > asOf)) return;
    let e = byParty.get(p.key);
    if (!e) { e = { balance: 0, charges: [] }; byParty.set(p.key, e); }
    const owed = sign * (p.dr - p.cr);
    e.balance = r2(e.balance + owed);
    const charge = side === "vendor" ? p.cr : p.dr;
    if (charge > 0) e.charges.push({ date: p.date, amount: charge });
  });

  const rows = [], advances = [];
  byParty.forEach((e, key) => {
    const a = accounts.get(key);
    const base = { key, name: a?.name || key, partyId: a?.partyId || "" };
    if (e.balance < -0.005) { advances.push({ ...base, amount: r2(-e.balance) }); return; }
    if (e.balance < 0.005) return;
    const buckets = AGE_BUCKETS.map(() => 0);
    let left = e.balance, oldestDays = 0, bills = 0;
    // newest charges carry what is still due
    [...e.charges].sort((x, y) => y.date.localeCompare(x.date)).some((c) => {
      const take = Math.min(left, c.amount);
      const days = daysBetween(c.date, asOf || c.date);
      buckets[bucketOf(days)] = r2(buckets[bucketOf(days)] + take);
      oldestDays = Math.max(oldestDays, days);
      bills += 1;
      left = r2(left - take);
      return left < 0.005;
    });
    rows.push({ ...base, due: e.balance, buckets, oldestDays, bills });
  });
  rows.sort((x, y) => y.due - x.due || x.name.localeCompare(y.name));
  advances.sort((x, y) => y.amount - x.amount || x.name.localeCompare(y.name));

  const due = r2(rows.reduce((t, r) => t + r.due, 0));
  const advance = r2(advances.reduce((t, r) => t + r.amount, 0));
  const totals = { due, buckets: AGE_BUCKETS.map((_, i) => r2(rows.reduce((t, r) => t + r.buckets[i], 0))), advance, net: r2(due - advance) };
  return { rows, advances, totals };
}
