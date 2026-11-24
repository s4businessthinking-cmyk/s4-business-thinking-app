// Bank statement import for Bank Reconciliation: read the bank's CSV / Excel statement, suggest which S4 bank
// movement each line is, and turn bank-only lines (charges, interest, cash deposits / withdrawals) into bank entries.
// Nothing is changed on a bill or voucher: a match only marks that S4 movement as cleared on the statement date
// (the existing "mark" record), exactly as ticking it by hand.
// Match rule (no silent guesses): same direction, amount within the tolerance (0.05), date within 3 days, not
// already cleared and not taken by another line. One clear best candidate is suggested; two or more equally good
// ones are left for the user to pick. A reference / cheque number found in the line description wins a tie.

const clean = (v) => String(v ?? "").trim();
const lc = (v) => clean(v).toLowerCase();
const r2 = (v) => Math.round(((Number(v) || 0) + Number.EPSILON) * 100) / 100;
const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
const pad = (v) => String(v).padStart(2, "0");

/** A statement date as YYYY-MM-DD: 31/12/2026, 31-12-26, 2026-12-31, 31 Dec 2026, 31-DEC-2026, an Excel serial day. "" if not a date. */
export function parseBankDate(v) {
  if (v instanceof Date && !Number.isNaN(v.getTime())) return `${v.getFullYear()}-${pad(v.getMonth() + 1)}-${pad(v.getDate())}`;
  const s = clean(v);
  if (!s) return "";
  if (/^\d{5}(\.\d+)?$/.test(s)) { // Excel serial date
    const d = new Date(Date.UTC(1899, 11, 30) + Math.floor(Number(s)) * 86400000);
    return d.toISOString().slice(0, 10);
  }
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  const ok = (y, mo, d) => (mo >= 1 && mo <= 12 && d >= 1 && d <= 31 ? `${y}-${pad(mo)}-${pad(d)}` : "");
  if (m) return ok(Number(m[1]), Number(m[2]), Number(m[3]));
  m = s.match(/^(\d{1,2})[-/.\s]([A-Za-z]{3})[A-Za-z]*[-/.\s,]*(\d{2,4})/);
  if (m && MONTHS[m[2].toLowerCase()]) { const y = Number(m[3]) < 100 ? 2000 + Number(m[3]) : Number(m[3]); return ok(y, MONTHS[m[2].toLowerCase()], Number(m[1])); }
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/);
  if (m) { const y = Number(m[3]) < 100 ? 2000 + Number(m[3]) : Number(m[3]); return ok(y, Number(m[2]), Number(m[1])); } // day first (UAE banks)
  return "";
}

const amountOf = (v) => {
  const s = clean(v);
  if (!s) return { value: 0, empty: true };
  const neg = /^\(.*\)$/.test(s) || /^-/.test(s) || /-$/.test(s);
  const n = Number(s.replace(/[(),\s]|AED|Dr|Cr|-$/gi, "").replace(/^-/, ""));
  if (!Number.isFinite(n)) return { value: NaN };
  const signed = neg ? -n : n;
  if (/\bcr\b/i.test(s)) return { value: Math.abs(signed), side: "cr" };
  if (/\bdr\b/i.test(s)) return { value: -Math.abs(signed), side: "dr" };
  return { value: signed };
};

const COLS = {
  date: ["transaction date", "txn date", "posting date", "value date", "date"],
  desc: ["description", "narration", "details", "particulars", "remarks", "transaction details", "memo"],
  ref: ["reference", "ref no", "ref", "cheque no", "cheque", "chq no", "chq"],
  debit: ["debit", "withdrawal", "withdrawals", "paid out", "dr amount", "money out", "dr"],
  credit: ["credit", "deposit", "deposits", "paid in", "cr amount", "money in", "cr"],
  amount: ["amount", "transaction amount"],
  balance: ["balance", "running balance", "closing balance", "available balance"],
};
function findCols(head) {
  const h = head.map(lc);
  const used = new Set();
  const pick = (names) => {
    for (const name of names) {
      const i = h.findIndex((x, idx) => !used.has(idx) && (x === name || (name.length > 3 && x.includes(name))));
      if (i >= 0) { used.add(i); return i; }
    }
    return -1;
  };
  const date = pick(COLS.date); const balance = pick(COLS.balance); const debit = pick(COLS.debit); const credit = pick(COLS.credit);
  const amount = debit < 0 && credit < 0 ? pick(COLS.amount) : -1;
  return { date, desc: pick(COLS.desc), ref: pick(COLS.ref), debit, credit, amount, balance };
}

/**
 * rows: sheet rows (array of arrays). The header row is the first row with a date column and an amount column.
 * -> { lines: [{ row, date, desc, ref, dir: "in"|"out", amount, balance }], skipped: [{ row, reason }], error? }
 * reasons: date (not a date), amount (no / bad amount), both (debit and credit on one line)
 */
export function parseStatementRows(rows) {
  const list = Array.isArray(rows) ? rows : [];
  let headAt = -1, cols = null;
  for (let i = 0; i < Math.min(list.length, 25); i++) {
    const c = findCols(list[i] || []);
    if (c.date >= 0 && (c.debit >= 0 || c.credit >= 0 || c.amount >= 0)) { headAt = i; cols = c; break; }
  }
  if (headAt < 0) return { lines: [], skipped: [], error: "noHeader" };
  const lines = [], skipped = [];
  list.slice(headAt + 1).forEach((r, k) => {
    const row = headAt + 2 + k; // the sheet's own row number
    if (!r || r.every((x) => !clean(x))) return;
    const date = parseBankDate(r[cols.date]);
    const desc = cols.desc >= 0 ? clean(r[cols.desc]) : "";
    if (!date) { if (/opening|closing|balance b\/f|brought forward|total/i.test(r.join(" "))) return; skipped.push({ row, reason: "date" }); return; }
    let dir = "", amount = 0;
    if (cols.debit >= 0 || cols.credit >= 0) {
      const d = cols.debit >= 0 ? amountOf(r[cols.debit]) : { value: 0, empty: true };
      const c = cols.credit >= 0 ? amountOf(r[cols.credit]) : { value: 0, empty: true };
      if (Number.isNaN(d.value) || Number.isNaN(c.value)) { skipped.push({ row, reason: "amount" }); return; }
      const dv = Math.abs(d.value), cv = Math.abs(c.value);
      if (dv > 0 && cv > 0) { skipped.push({ row, reason: "both" }); return; }
      if (dv > 0) { dir = "out"; amount = dv; } else if (cv > 0) { dir = "in"; amount = cv; }
    } else {
      const a = amountOf(r[cols.amount]);
      if (Number.isNaN(a.value)) { skipped.push({ row, reason: "amount" }); return; }
      if (a.value > 0) { dir = "in"; amount = a.value; } else if (a.value < 0) { dir = "out"; amount = -a.value; }
    }
    if (!(amount > 0)) { if (!/opening|closing|brought forward|b\/f|c\/f/i.test(desc)) skipped.push({ row, reason: "amount" }); return; }
    const bal = cols.balance >= 0 ? amountOf(r[cols.balance]) : { empty: true };
    lines.push({ row, date, desc, ref: cols.ref >= 0 ? clean(r[cols.ref]) : "", dir, amount: r2(amount), balance: bal.empty || Number.isNaN(bal.value) ? null : r2(bal.value) });
  });
  return { lines, skipped };
}

/**
 * Period, totals, opening / closing from the running balance (when the statement has one) and whether the running
 * balance agrees line by line. Banks list newest first or oldest first; both are read.
 */
export function statementSummary(lines) {
  if (!lines?.length) return null;
  const withBal = lines.filter((l) => l.balance != null);
  const dates = lines.map((l) => l.date).sort();
  const totalIn = r2(lines.filter((l) => l.dir === "in").reduce((t, l) => t + l.amount, 0));
  const totalOut = r2(lines.filter((l) => l.dir === "out").reduce((t, l) => t + l.amount, 0));
  let opening = null, closing = null, balanced = null;
  if (withBal.length === lines.length) {
    const newestFirst = lines.length > 1 && lines[0].date > lines[lines.length - 1].date;
    const ordered = newestFirst ? [...lines].reverse() : lines;
    const sign = (l) => (l.dir === "in" ? l.amount : -l.amount);
    opening = r2(ordered[0].balance - sign(ordered[0]));
    closing = ordered[ordered.length - 1].balance;
    let run = opening;
    balanced = ordered.every((l) => { run = r2(run + sign(l)); return Math.abs(run - l.balance) < 0.01; });
  }
  return { from: dates[0], to: dates[dates.length - 1], count: lines.length, totalIn, totalOut, opening, closing, balanced };
}

const dayDiff = (a, b) => Math.abs((new Date(`${a}T00:00:00Z`) - new Date(`${b}T00:00:00Z`)) / 86400000);
const refHit = (line, t) => {
  const refs = [t.ref, t.no].map(clean).filter((x) => x.length >= 3);
  const text = lc(`${line.desc} ${line.ref}`);
  return refs.some((x) => text.includes(lc(x)));
};

/**
 * txs: collectBankTransactions(); clearedOn(t): the date a movement is cleared ("" when not).
 * -> [{ index, status: "match"|"ambiguous"|"none", txKey, candidates: [txKey] }] (one per statement line)
 */
export function suggestMatches(lines, txs, { clearedOn = () => "", tolerance = 0.05, days = 3 } = {}) {
  const open = txs.filter((t) => !t.autoCleared && !clearedOn(t));
  const taken = new Set();
  const score = (line, t) => (refHit(line, t) ? -10 : 0) + dayDiff(line.date, t.date) + Math.abs(line.amount - t.amount);
  // exact amount + closest date first, so the strongest pairs are fixed before weaker ones
  const order = lines.map((l, i) => i).sort((a, b) => lines[a].date.localeCompare(lines[b].date));
  const out = new Array(lines.length);
  order.forEach((i) => {
    const line = lines[i];
    const cands = open.filter((t) => t.dir === line.dir && Math.abs(t.amount - line.amount) <= tolerance + 1e-9 && dayDiff(line.date, t.date) <= days)
      .map((t) => ({ t, s: score(line, t) })).sort((a, b) => a.s - b.s);
    const free = cands.filter((c) => !taken.has(c.t.key));
    if (!free.length) { out[i] = { index: i, status: "none", txKey: "", candidates: cands.map((c) => c.t.key) }; return; }
    const best = free[0];
    const tie = free.length > 1 && Math.abs(free[1].s - best.s) < 0.001;
    if (tie) { out[i] = { index: i, status: "ambiguous", txKey: "", candidates: free.map((c) => c.t.key) }; return; }
    taken.add(best.t.key);
    out[i] = { index: i, status: "match", txKey: best.t.key, candidates: free.map((c) => c.t.key) };
  });
  return out;
}

/** Bank-only line -> suggested bank entry type ("" = no guess): charge / interest / deposit / withdrawal. */
export function suggestEntryType(line) {
  const d = lc(`${line.desc} ${line.ref}`);
  if (line.dir === "out" && /charge|fee|commission|vat on|service chg|chgs|penalty/.test(d)) return "charge";
  if (line.dir === "in" && /interest|profit|hibah/.test(d)) return "interest";
  if (line.dir === "in" && /cash dep|cdm|deposit/.test(d)) return "deposit";
  if (line.dir === "out" && /atm|cash wd|withdraw|cash w\/d/.test(d)) return "withdrawal";
  return "";
}

/** Lines dated on or before the lock day cannot become entries or matches. */
export const lockedLines = (lines, lockDate) => (lockDate ? lines.filter((l) => l.date <= lockDate) : []);

export const BANK_REC_COLS = ["Section", "Date", "Type", "No", "Party / Note", "Ref", "Amount"];
/** CSV of the reconciliation statement (same lines as the print). */
export function reconciliationRows(rec, { asOf = "", statementBalance = null, typeLabel = (t) => t.col } = {}) {
  const money = (v) => r2(v).toFixed(2);
  const tx = (section, t) => [section, t.date, typeLabel(t), t.no || "", t.party || "", t.ref || "", money(t.amount)];
  return [
    BANK_REC_COLS,
    ["Balance as per books", asOf, "", "", "", "", money(rec.bookBalance)],
    ["Less: deposits not yet credited by bank", "", "", "", "", "", money(-rec.unclearedInTotal)],
    ...rec.unclearedIn.map((t) => tx("Deposit not credited", t)),
    ["Add: payments not yet debited by bank", "", "", "", "", "", money(rec.unclearedOutTotal)],
    ...rec.unclearedOut.map((t) => tx("Payment not debited", t)),
    ["Expected balance as per bank", asOf, "", "", "", "", money(rec.bankBalance)],
    ...(statementBalance == null || statementBalance === "" ? [] : [
      ["Balance as per bank statement", asOf, "", "", "", "", money(statementBalance)],
      ["Difference", "", "", "", "", "", money(rec.difference)],
    ]),
  ];
}
export const reconciliationFileName = (asOf) => `bank-reconciliation-${asOf || "today"}.csv`;
