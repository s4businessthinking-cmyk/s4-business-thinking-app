const num = (v) => parseFloat(String(v ?? "").replace(/,/g, "")) || 0;
export const r2 = (v) => Math.round((num(v) + Number.EPSILON) * 100) / 100;
const day = (v) => String(v || "").slice(0, 10);
const live = (r, shopId) => r && !r.isDeleted && (!shopId || r.shopId === shopId) && r.status !== "cancelled" && r.status !== "draft";

const BANK_METHODS = new Set(["bank", "bank_transfer", "card", "cheque"]);
export const METHOD_LABEL = { bank: "Bank Transfer", bank_transfer: "Bank Transfer", card: "Card", cheque: "Cheque" };

const sumAlloc = (vouchers, id) => vouchers.reduce((t, v) => t + (v.allocations || []).filter((a) => a.invoiceId === id).reduce((x, a) => x + num(a.amount), 0), 0);
const sumApplied = (rets, id) => rets.filter((r) => r.invoiceId === id).reduce((t, r) => t + num(r.appliedToInvoice), 0);

/**
 * Every money movement through the bank (transfer, card, cheque) from bills, vouchers, expenses and manual bank entries.
 * A cheque's bank date is its cheque date; bounced cheques never touched the bank and are left out.
 */
export function collectBankTransactions(data, shopId) {
  const out = [];
  const receipts = (data?.receipts || []).filter((r) => live(r, shopId));
  const payments = (data?.payments || []).filter((r) => live(r, shopId));
  const salesRet = (data?.salesReturns || []).filter((r) => live(r, shopId));
  const purchRet = (data?.purchaseReturns || []).filter((r) => live(r, shopId));
  const push = (t) => {
    if (!BANK_METHODS.has(t.method) || !(r2(t.amount) > 0) || t.chequeStatus === "bounced") return;
    const auto = t.chequeStatus === "cleared";
    out.push({ ...t, amount: r2(t.amount), key: `${t.col}:${t.id}`, autoCleared: auto, autoClearedDate: auto ? day(t.clearedAt) || t.date : "" });
  };

  (data?.salesInvoices || []).forEach((inv) => {
    if (!live(inv, shopId) || inv.source === "openingBalance" || inv.invoiceType === "delivery") return;
    const direct = num(inv.amountPaid) - sumAlloc(receipts, inv.id) - sumApplied(salesRet, inv.id);
    push({ col: "salesInvoices", id: inv.id, dir: "in", method: inv.paymentMethod, amount: direct, no: inv.invoiceNo, party: inv.customerName || "",
      date: day(inv.paymentMethod === "cheque" ? inv.chequeDate || inv.invoiceDate : inv.invoiceDate), ref: inv.chequeNo || inv.paymentRef || "", chequeStatus: inv.chequeStatus, clearedAt: inv.clearedAt });
  });
  (data?.purchaseInvoices || []).forEach((inv) => {
    if (!live(inv, shopId) || inv.source === "openingBalance") return;
    const direct = num(inv.amountPaid) - sumAlloc(payments, inv.id) - sumApplied(purchRet, inv.id);
    push({ col: "purchaseInvoices", id: inv.id, dir: "out", method: inv.paymentMethod, amount: direct, no: inv.invoiceNo, party: inv.vendorName || "",
      date: day(inv.paymentMethod === "cheque" ? inv.chequeDate || inv.invoiceDate : inv.invoiceDate), ref: inv.chequeNo || "", chequeStatus: inv.chequeStatus, clearedAt: inv.clearedAt });
  });
  receipts.forEach((v) => push({ col: "salesReceipts", id: v.id, dir: "in", method: v.method, amount: v.totalAmount, no: v.receiptNo, party: v.customerName || "",
    date: day(v.method === "cheque" ? v.chequeDate || v.receiptDate : v.refDate || v.receiptDate), ref: v.chequeNo || v.refNo || "", chequeStatus: v.chequeStatus, clearedAt: v.clearedAt }));
  payments.forEach((v) => push({ col: "purchasePayments", id: v.id, dir: "out", method: v.method, amount: v.chequeAmount ?? v.totalAmount, no: v.paymentNo, party: v.vendorName || "",
    date: day(v.method === "cheque" ? v.chequeDate || v.paymentDate : v.refDate || v.paymentDate), ref: v.chequeNo || v.refNo || "", chequeStatus: v.chequeStatus, clearedAt: v.clearedAt }));
  (data?.expenses || []).forEach((e) => {
    if (!live(e, shopId)) return;
    push({ col: "expenses", id: e.id, dir: "out", method: e.method, amount: e.amount, no: e.expenseNo, party: e.employeeName || e.paidTo || e.categoryName || e.category || "",
      date: day(e.method === "cheque" ? e.chequeDate || e.expenseDate : e.expenseDate), ref: e.chequeNo || e.refNo || "", chequeStatus: e.chequeStatus, clearedAt: e.clearedAt });
  });
  salesRet.forEach((r) => push({ col: "salesReturns", id: r.id, dir: "out", method: r.refundMethod, amount: r.refundAmount, no: r.returnNo, party: r.partyName || "",
    date: day(r.returnDate), ref: r.invoiceNo || "" }));
  purchRet.forEach((r) => push({ col: "purchaseReturns", id: r.id, dir: "in", method: r.refundMethod, amount: r.refundAmount, no: r.returnNo, party: r.partyName || "",
    date: day(r.returnDate), ref: r.supplierInvoiceNo || r.invoiceNo || "" }));
  // Journal / contra lines on a "Bank…" account: debit puts money into the bank, credit takes it out (cash deposits, withdrawals, transfers).
  (data?.vouchers || []).forEach((v) => {
    if (!live(v, shopId)) return;
    (v.lines || []).forEach((l, i) => {
      if (!/^bank\b/i.test(String(l.account || "").trim())) return;
      const dr = num(l.debit), cr = num(l.credit);
      const other = (v.lines || []).filter((x, j) => j !== i && (dr > 0 ? num(x.credit) > 0 : num(x.debit) > 0)).map((x) => x.account).join(", ");
      push({ col: "accountVouchers", id: `${v.id}:${i}`, dir: dr > 0 ? "in" : "out", method: "bank_transfer", amount: dr > 0 ? dr : cr, no: v.voucherNo || "",
        party: [other, v.narration].filter(Boolean).join(" · "), date: day(v.voucherDate), ref: v.refNo || "" });
    });
  });
  const PARTNER_DIR = { capitalIn: "in", capitalOut: "out", drawing: "out", payout: "out" };
  const PARTNER_NO = { capitalIn: "CAPITAL IN", capitalOut: "CAPITAL OUT", drawing: "DRAWING", payout: "PAID TO PARTNER" };
  (data?.partnerEntries || []).forEach((p) => {
    if (!live(p, shopId) || !PARTNER_DIR[p.kind]) return;
    push({ col: "partnerEntries", id: p.id, dir: PARTNER_DIR[p.kind], method: p.method, amount: p.amount, no: PARTNER_NO[p.kind], party: p.partnerName || "",
      date: day(p.date), ref: p.refNo || "" });
  });
  (data?.bankEntries || []).forEach((b) => {
    if (!live(b, shopId)) return;
    out.push({ col: "bankReconciliations", id: b.id, key: `bankReconciliations:${b.id}`, dir: b.direction === "in" ? "in" : "out", method: "bank_transfer", amount: r2(b.amount),
      no: b.entryType === "interest" ? "INTEREST" : b.entryType === "charge" ? "BANK CHARGE" : "BANK", party: b.note || "", date: day(b.date), ref: b.refNo || "", manual: true,
      autoCleared: true, autoClearedDate: day(b.date) });
  });
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.key.localeCompare(b.key));
}

/** marks: Map(txKey -> clearedDate). Returns the reconciliation as at `asOf`. */
export function reconcile(txs, marks, { opening = 0, openingDate = "", asOf = "", statementBalance = null } = {}) {
  const clearedOn = (t) => (t.autoCleared ? t.autoClearedDate : marks.get(t.key) || "");
  const inScope = txs.filter((t) => (!openingDate || t.date >= openingDate) && (!asOf || t.date <= asOf));
  let book = num(opening);
  let bank = num(opening);
  const unclearedIn = [];
  const unclearedOut = [];
  inScope.forEach((t) => {
    const sign = t.dir === "in" ? 1 : -1;
    book += sign * t.amount;
    const c = clearedOn(t);
    if (c && (!asOf || c <= asOf)) bank += sign * t.amount;
    else (t.dir === "in" ? unclearedIn : unclearedOut).push(t);
  });
  const sumIn = unclearedIn.reduce((s, t) => s + t.amount, 0);
  const sumOut = unclearedOut.reduce((s, t) => s + t.amount, 0);
  const expected = r2(bank);
  return {
    bookBalance: r2(book), bankBalance: expected, unclearedIn, unclearedOut,
    unclearedInTotal: r2(sumIn), unclearedOutTotal: r2(sumOut),
    difference: statementBalance == null || statementBalance === "" ? null : r2(num(statementBalance) - expected),
    clearedOn,
  };
}
