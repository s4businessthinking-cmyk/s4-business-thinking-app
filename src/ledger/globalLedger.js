// Global ledger: double-entry postings worked out from every saved document (bills, vouchers, returns, expenses,
// journal / contra, partner money, bank entries). Nothing is written; each account's statement is read from these.
// Follows the same rules as the P&L (accountsCalc) and bank reconciliation (bankRec):
// - a bill's own payment is amountPaid less what receipts / payments and returns settled on it;
// - payment method cash -> "Cash in Hand", transfer / card / cheque -> "Bank", credit -> no money moves;
// - VAT goes to "VAT Output" (sales) / "VAT Input" (purchases, expenses); an expense's cost is its amount less VAT.
// Like the party ledger: every bill counts except cancelled / draft, and a bill or voucher without a party id goes to
// the customer / supplier of that name.

import { CASH_ACCOUNT } from "../vouchers/accountVoucherDomain.js";
import { n, r2, dayOf, isLive, liveReturnsOf } from "../reports/reportFilters.js";

export const GROUPS = [
  { id: "customer", bn: "কাস্টমার", en: "Customers" },
  { id: "vendor", bn: "সাপ্লায়ার", en: "Suppliers" },
  { id: "money", bn: "ক্যাশ ও ব্যাংক", en: "Cash & Bank" },
  { id: "income", bn: "আয়", en: "Income" },
  { id: "expense", bn: "খরচ ও ক্রয়", en: "Purchases & Expenses" },
  { id: "tax", bn: "ভ্যাট", en: "VAT" },
  { id: "equity", bn: "মূলধন ও পার্টনার", en: "Capital & Partners" },
  { id: "other", bn: "অন্যান্য", en: "Other" },
];

const BANK = "Bank";
const FIXED = {
  [CASH_ACCOUNT]: "money", [BANK]: "money", Sales: "income", "Discount Received": "income", "Purchase Return": "expense", "Bank Interest": "income",
  Purchase: "expense", "Sales Return": "income", "Discount Allowed": "expense", "Bank Charges": "expense",
  "VAT Output": "tax", "VAT Input": "tax", Capital: "equity", Drawings: "equity", "Opening Balance": "equity", "Profit Distribution": "equity",
  "Bounced Cheques (unpaid)": "other", "Bank Adjustment": "other",
};
const lc = (v) => String(v || "").trim().toLowerCase();
const BANK_METHODS = new Set(["bank", "bank_transfer", "card", "cheque"]);
const live = (d, shopId) => isLive(d, shopId) && d.status !== "cancelled" && d.status !== "draft";
const liveSales = (list, shopId) => (list || []).filter((inv) => live(inv, shopId) && inv.docKind !== "quotation" && inv.invoiceType !== "delivery");
const livePurchases = (list, shopId) => (list || []).filter((inv) => live(inv, shopId) && !inv.internalTransfer && inv.sourceType !== "branch_transfer");
const sumAlloc = (vouchers, id) => vouchers.reduce((t, v) => t + (v.allocations || []).filter((a) => a.invoiceId === id).reduce((x, a) => x + n(a.amount), 0), 0);
const sumApplied = (rets, id) => rets.filter((r) => r.invoiceId === id).reduce((t, r) => t + n(r.appliedToInvoice), 0);

/**
 * data: { salesInvoices, purchaseInvoices, salesReturns, purchaseReturns, receipts, payments, expenses, accountVouchers,
 * partnerEntries, bankEntries }. -> { accounts: Map(key -> { key, name, group, partyId? }), postings: [...] }
 * posting: { key, date, dr, cr, type, no, col, docId, narration, against } - one per account line of an entry.
 */
export function buildGlobalLedger(data, { shopId = "", customers = [], vendors = [], expenseLabel = (e) => e.categoryName || e.category || "Expense" } = {}) {
  const accounts = new Map();
  const postings = [];
  const acc = (key, name, group, extra) => {
    if (!accounts.has(key)) accounts.set(key, { key, name, group, ...extra });
    return key;
  };
  const named = (name) => acc(`a:${lc(name)}`, name, FIXED[name] || (/^bank\b/i.test(name) ? "money" : "other"));

  const custById = new Map(customers.filter((c) => c?.id).map((c) => [c.id, c]));
  const vendById = new Map(vendors.filter((v) => v?.id).map((v) => [v.id, v]));
  const custByName = new Map(customers.filter((c) => c?.id && !c.isDeleted && c.customerName).map((c) => [lc(c.customerName), c]));
  const vendByName = new Map(vendors.filter((v) => v?.id && !v.isDeleted && v.vendorName).map((v) => [lc(v.vendorName), v]));
  const customer = (pid, name) => { const id = pid || custByName.get(lc(name))?.id; return (id
    ? acc(`c:${id}`, custById.get(id)?.customerName || name || "Customer", "customer", { partyId: id })
    : acc(`cn:${lc(name) || "walk-in"}`, name || "Walk-in", "customer")); };
  const vendor = (pid, name) => { const id = pid || vendByName.get(lc(name))?.id; return (id
    ? acc(`v:${id}`, vendById.get(id)?.vendorName || name || "Supplier", "vendor", { partyId: id })
    : acc(`vn:${lc(name) || "-"}`, name || "Supplier", "vendor")); };
  const partner = (id, name) => acc(`p:${id || lc(name)}`, name || "Partner", "equity", { partnerId: id });
  const money = (method) => (method === "credit" ? null : named(BANK_METHODS.has(method) ? BANK : CASH_ACCOUNT));
  // a journal line's account: a customer / supplier by name goes to their own ledger
  const byName = (name) => {
    const k = lc(name);
    if (k === lc(CASH_ACCOUNT)) return named(CASH_ACCOUNT);
    const c = custByName.get(k);
    if (c) return customer(c.id, c.customerName);
    const v = vendByName.get(k);
    if (v) return vendor(v.id, v.vendorName);
    return named(String(name).trim());
  };

  // every customer and supplier has a ledger, even before the first bill
  customers.filter((c) => c?.id && !c.isDeleted).forEach((c) => customer(c.id, c.customerName));
  vendors.filter((v) => v?.id && !v.isDeleted).forEach((v) => vendor(v.id, v.vendorName));
  [CASH_ACCOUNT, BANK, "Sales", "Purchase", "VAT Output", "VAT Input"].forEach(named);

  // lines: [[accountKey, dr, cr]]; zero lines are dropped
  const entry = (doc, lines) => {
    const rows = lines.filter(([k, dr, cr]) => k && (r2(dr) > 0 || r2(cr) > 0)).map(([k, dr, cr]) => [k, r2(dr), r2(cr)]);
    rows.forEach(([key, dr, cr]) => {
      const other = rows.filter(([k2, d2, c2]) => k2 !== key && (dr > 0 ? c2 > 0 : d2 > 0)).map(([k2]) => accounts.get(k2)?.name).filter(Boolean);
      postings.push({ key, date: dayOf(doc.date), dr, cr, type: doc.type, no: doc.no || "", col: doc.col, docId: doc.id, narration: doc.narration || "", against: [...new Set(other)].join(", ") });
    });
  };

  const receipts = (data.receipts || []).filter((r) => live(r, shopId));
  const payments = (data.payments || []).filter((p) => live(p, shopId));
  const salesRet = liveReturnsOf(data.salesReturns, shopId);
  const purchRet = liveReturnsOf(data.purchaseReturns, shopId);

  liveSales(data.salesInvoices, shopId).forEach((inv) => {
    const c = customer(inv.customerId, inv.customerName);
    const gt = n(inv.grandTotal), vat = n(inv.totalVat);
    const doc = { date: inv.invoiceDate, no: inv.invoiceNo, col: "salesInvoices", id: inv.id, narration: inv.note || "" };
    if (inv.source === "openingBalance") entry({ ...doc, type: "opening" }, [[c, gt, 0], [named("Opening Balance"), 0, gt]]);
    else entry({ ...doc, type: "sale" }, [[c, gt, 0], [named("Sales"), 0, gt - vat], [named("VAT Output"), 0, vat]]);
    const direct = n(inv.amountPaid) - sumAlloc(receipts, inv.id) - sumApplied(salesRet, inv.id);
    if (direct > 0.009 && inv.chequeStatus !== "bounced") entry({ ...doc, type: "saleReceipt" }, [[money(inv.paymentMethod) || named(CASH_ACCOUNT), direct, 0], [c, 0, direct]]);
  });
  livePurchases(data.purchaseInvoices, shopId).forEach((inv) => {
    const v = vendor(inv.vendorId, inv.vendorName);
    const gt = n(inv.grandTotal), vat = n(inv.totalTax);
    const doc = { date: inv.invoiceDate, no: inv.invoiceNo, col: "purchaseInvoices", id: inv.id, narration: [inv.supplierInvoiceNo, inv.note].filter(Boolean).join(" · ") };
    if (inv.source === "openingBalance") entry({ ...doc, type: "opening" }, [[named("Opening Balance"), gt, 0], [v, 0, gt]]);
    else entry({ ...doc, type: "purchase" }, [[named("Purchase"), gt - vat, 0], [named("VAT Input"), vat, 0], [v, 0, gt]]);
    const direct = n(inv.amountPaid) - sumAlloc(payments, inv.id) - sumApplied(purchRet, inv.id);
    if (direct > 0.009 && inv.chequeStatus !== "bounced") entry({ ...doc, type: "purchasePayment" }, [[v, direct, 0], [money(inv.paymentMethod) || named(CASH_ACCOUNT), 0, direct]]);
  });
  receipts.forEach((r) => {
    const amt = n(r.totalAmount);
    entry({ date: r.receiptDate || r.createdAt, no: r.receiptNo, col: "salesReceipts", id: r.id, type: "receipt", narration: [r.chequeNo && `Chq ${r.chequeNo}`, r.note].filter(Boolean).join(" · ") },
      [[money(r.method) || named(CASH_ACCOUNT), amt, 0], [customer(r.customerId, r.customerName), 0, amt]]);
  });
  payments.forEach((p) => {
    const total = n(p.totalAmount);
    const paid = p.chequeAmount != null ? n(p.chequeAmount) : total - n(p.discountAmount);
    entry({ date: p.paymentDate || p.createdAt, no: p.paymentNo, col: "purchasePayments", id: p.id, type: "payment", narration: [p.chequeNo && `Chq ${p.chequeNo}`, p.note].filter(Boolean).join(" · ") },
      [[vendor(p.vendorId, p.vendorName), total, 0], [money(p.method) || named(CASH_ACCOUNT), 0, paid], [named("Discount Received"), 0, total - paid]]);
  });
  salesRet.forEach((r) => {
    const c = customer(r.partyId, r.partyName);
    const total = n(r.total), vat = n(r.totalVat), refund = n(r.refundAmount);
    const doc = { date: r.returnDate, no: r.returnNo, col: "salesReturns", id: r.id, narration: r.invoiceNo ? `Inv ${r.invoiceNo}` : "" };
    entry({ ...doc, type: "salesReturn" }, [[named("Sales Return"), total - vat, 0], [named("VAT Output"), vat, 0], [c, 0, total]]);
    if (refund > 0.009) entry({ ...doc, type: "refundPaid" }, [[c, refund, 0], [money(r.refundMethod) || named(CASH_ACCOUNT), 0, refund]]);
  });
  purchRet.forEach((r) => {
    const v = vendor(r.partyId, r.partyName);
    const total = n(r.total), vat = n(r.totalVat), refund = n(r.refundAmount);
    const doc = { date: r.returnDate, no: r.returnNo, col: "purchaseReturns", id: r.id, narration: r.supplierInvoiceNo || r.invoiceNo ? `Inv ${r.supplierInvoiceNo || r.invoiceNo}` : "" };
    entry({ ...doc, type: "purchaseReturn" }, [[v, total, 0], [named("Purchase Return"), 0, total - vat], [named("VAT Input"), 0, vat]]);
    if (refund > 0.009) entry({ ...doc, type: "refundReceived" }, [[money(r.refundMethod) || named(CASH_ACCOUNT), refund, 0], [v, 0, refund]]);
  });
  (data.expenses || []).filter((e) => live(e, shopId)).forEach((e) => {
    const amt = n(e.amount), vat = Math.max(0, n(e.vatAmount));
    const paidFrom = e.paidByPartner || e.method === "partner" ? partner(e.partnerId, e.partnerName)
      : e.method === "cheque" && e.chequeStatus === "bounced" ? named("Bounced Cheques (unpaid)")
        : money(e.method) || named(CASH_ACCOUNT);
    const label = String(expenseLabel(e) || "Expense").trim();
    entry({ date: e.expenseDate, no: e.expenseNo, col: "expenses", id: e.id, type: "expense", narration: [e.employeeName || e.paidTo, e.note].filter(Boolean).join(" · ") },
      [[acc(`a:${lc(label)}`, label, FIXED[label] || "expense"), amt - vat, 0], [named("VAT Input"), vat, 0], [paidFrom, 0, amt]]);
  });
  (data.accountVouchers || []).filter((v) => live(v, shopId)).forEach((v) => {
    const lines = v.lines?.length ? v.lines
      : v.voucherType === "contra" ? [{ account: v.toAccount, debit: v.totalAmount }, { account: v.fromAccount, credit: v.totalAmount }] : [];
    entry({ date: v.voucherDate, no: v.voucherNo, col: "accountVouchers", id: v.id, type: v.voucherType === "contra" ? "contra" : "journal", narration: v.narration || "" },
      lines.filter((l) => String(l?.account || "").trim()).map((l) => [byName(l.account), n(l.debit), n(l.credit)]));
  });
  (data.partnerEntries || []).filter((p) => live(p, shopId)).forEach((p) => {
    const doc = { date: p.date || p.periodTo, no: p.refNo || "", col: "partnerEntries", id: p.id, narration: p.note || p.label || "" };
    if (p.kind === "distribution") {
      const allocs = (p.allocations || []).filter((a) => n(a.total));
      const total = allocs.reduce((t, a) => t + n(a.total), 0);
      entry({ ...doc, type: "distribution" }, [[named("Profit Distribution"), total, 0], ...allocs.map((a) => [partner(a.partnerId, a.partnerName || a.name), 0, n(a.total)])]);
      return;
    }
    const amt = n(p.amount), pk = partner(p.partnerId, p.partnerName), m = money(p.method) || named(CASH_ACCOUNT);
    if (p.kind === "capitalIn") entry({ ...doc, type: "capitalIn" }, [[m, amt, 0], [pk, 0, amt]]);
    else if (p.kind === "capitalOut" || p.kind === "drawing" || p.kind === "payout") entry({ ...doc, type: p.kind }, [[pk, amt, 0], [m, 0, amt]]);
  });
  (data.bankEntries || []).filter((b) => live(b, shopId) && (!b.kind || b.kind === "entry")).forEach((b) => {
    const amt = n(b.amount), bank = named(BANK);
    const other = named(b.entryType === "interest" ? "Bank Interest" : b.entryType === "charge" ? "Bank Charges" : "Bank Adjustment");
    entry({ date: b.date, no: b.refNo || "", col: "bankReconciliations", id: b.id, type: "bank", narration: b.note || "" },
      b.direction === "in" ? [[bank, amt, 0], [other, 0, amt]] : [[other, amt, 0], [bank, 0, amt]]);
  });

  postings.sort((a, b) => a.date.localeCompare(b.date) || String(a.no).localeCompare(String(b.no), undefined, { numeric: true }));
  return { accounts, postings };
}

/** Balance per account (debit minus credit) up to `to` (all when empty). */
export function balances(postings, to = "") {
  const m = new Map();
  postings.forEach((p) => { if (!to || p.date <= to) m.set(p.key, r2((m.get(p.key) || 0) + p.dr - p.cr)); });
  return m;
}

/** One account's statement: opening before `from`, the lines inside, and the running balance (debit positive). */
export function accountStatement(postings, key, { from = "", to = "" } = {}) {
  let opening = 0;
  const rows = [];
  postings.forEach((p) => {
    if (p.key !== key || (to && p.date > to)) return;
    if (from && p.date < from) { opening = r2(opening + p.dr - p.cr); return; }
    rows.push(p);
  });
  let bal = opening;
  const lines = rows.map((p) => { bal = r2(bal + p.dr - p.cr); return { ...p, balance: bal }; });
  const dr = r2(rows.reduce((t, p) => t + p.dr, 0)), cr = r2(rows.reduce((t, p) => t + p.cr, 0));
  return { opening, lines, dr, cr, closing: bal };
}
