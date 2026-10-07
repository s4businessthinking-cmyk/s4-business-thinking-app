export const CASH_ACCOUNT = "Cash in Hand";

export const ACCOUNT_VOUCHER_TYPES = {
  journal: { prefix: "JV", serial: "lastJVSerial", icon: "📒", printTitle: "JOURNAL VOUCHER", title: { bn: "জার্নাল ভাউচার", en: "Journal Voucher" } },
  contra: { prefix: "CV", serial: "lastCVSerial", icon: "🔁", printTitle: "CONTRA VOUCHER", title: { bn: "কন্ট্রা ভাউচার", en: "Contra Voucher" } },
};

const num = (v) => parseFloat(String(v ?? "").replace(/,/g, "")) || 0;
export const r2 = (v) => Math.round((num(v) + Number.EPSILON) * 100) / 100;

export function cleanJournalLines(lines) {
  return (lines || [])
    .map((l) => ({ account: String(l?.account || "").trim(), debit: r2(l?.debit), credit: r2(l?.credit), note: String(l?.note || "").trim() }))
    .filter((l) => l.account || l.debit || l.credit || l.note);
}

// Returns { rows, total } when the entry balances, otherwise { error } with the failing rule.
export function checkJournal(lines) {
  const rows = cleanJournalLines(lines);
  if (rows.length < 2) return { error: "lines" };
  for (const l of rows) {
    if (!l.account) return { error: "account" };
    if (l.debit < 0 || l.credit < 0 || (l.debit > 0) === (l.credit > 0)) return { error: "side" };
  }
  const debit = r2(rows.reduce((t, l) => t + l.debit, 0));
  const credit = r2(rows.reduce((t, l) => t + l.credit, 0));
  if (debit !== credit) return { error: "balance", debit, credit };
  return { rows, total: debit };
}

export function checkContra({ fromAccount, toAccount, amount }) {
  const from = String(fromAccount || "").trim();
  const to = String(toAccount || "").trim();
  const amt = r2(amount);
  if (!from || !to) return { error: "account" };
  if (from.toLowerCase() === to.toLowerCase()) return { error: "same" };
  if (!(amt > 0)) return { error: "amount" };
  return {
    from, to, total: amt,
    rows: [
      { account: to, debit: amt, credit: 0, note: "" },
      { account: from, debit: 0, credit: amt, note: "" },
    ],
  };
}

export function voucherParticulars(v) {
  if (v?.voucherType === "contra") return `${v.fromAccount || ""} → ${v.toAccount || ""}`;
  const lines = v?.lines || [];
  const dr = lines.filter((l) => num(l.debit) > 0).map((l) => l.account);
  const cr = lines.filter((l) => num(l.credit) > 0).map((l) => l.account);
  return `Dr ${dr.join(", ")} / Cr ${cr.join(", ")}`;
}
