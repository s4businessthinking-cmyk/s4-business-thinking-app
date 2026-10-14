import test from "node:test";
import assert from "node:assert/strict";
import { buildGlobalLedger, balances, accountStatement } from "./globalLedger.js";

const S = "s1";
const data = {
  salesInvoices: [
    { id: "si1", shopId: S, status: "partial", invoiceNo: "SI-1", invoiceDate: "2026-10-01", customerId: "c1", customerName: "Al Noor", grandTotal: 105, totalVat: 5, amountPaid: 90, paymentMethod: "cash" },
    { id: "si2", shopId: S, status: "confirmed", invoiceNo: "OB-1", invoiceDate: "2026-09-30", customerId: "c1", grandTotal: 50, totalVat: 0, amountPaid: 0, source: "openingBalance" },
    { id: "q1", shopId: S, status: "confirmed", invoiceNo: "Q-1", invoiceDate: "2026-10-01", customerId: "c1", grandTotal: 999, docKind: "quotation" },
    { id: "x1", shopId: S, status: "cancelled", invoiceNo: "SI-X", invoiceDate: "2026-10-01", customerId: "c1", grandTotal: 999 },
  ],
  receipts: [{ id: "r1", shopId: S, status: "confirmed", receiptNo: "RV-1", receiptDate: "2026-10-05", customerId: "c1", method: "cheque", totalAmount: 20, allocations: [{ invoiceId: "si1", amount: 20 }] }],
  purchaseInvoices: [
    { id: "pi1", shopId: S, status: "confirmed", invoiceNo: "PI-1", invoiceDate: "2026-10-02", vendorId: "v1", vendorName: "Gulf", grandTotal: 210, totalTax: 10, amountPaid: 0, paymentMethod: "credit" },
    { id: "bt", shopId: S, status: "confirmed", invoiceNo: "BT-1", invoiceDate: "2026-10-02", vendorId: "v1", grandTotal: 500, internalTransfer: true },
  ],
  payments: [{ id: "p1", shopId: S, status: "confirmed", paymentNo: "PV-1", paymentDate: "2026-10-06", vendorId: "v1", method: "cheque", totalAmount: 210, chequeAmount: 200, allocations: [{ invoiceId: "pi1", amount: 210 }] }],
  salesReturns: [{ id: "sr1", shopId: S, status: "confirmed", returnNo: "SR-1", returnDate: "2026-10-07", partyId: "c1", total: 21, totalVat: 1, refundAmount: 21, refundMethod: "cash" }],
  expenses: [
    { id: "e1", shopId: S, status: "active", expenseNo: "EX-1", expenseDate: "2026-10-03", category: "rent", amount: 105, vatAmount: 5, method: "bank_transfer" },
    { id: "e2", shopId: S, status: "active", expenseNo: "EX-2", expenseDate: "2026-10-03", category: "fuel", amount: 30, method: "partner", paidByPartner: true, partnerId: "pt1", partnerName: "Karim" },
  ],
  accountVouchers: [
    { id: "j1", shopId: S, status: "active", voucherType: "journal", voucherNo: "JV-1", voucherDate: "2026-10-08", lines: [{ account: "al noor", debit: 10 }, { account: "Discount Allowed", credit: 10 }] },
    { id: "cv1", shopId: S, status: "active", voucherType: "contra", voucherNo: "CV-1", voucherDate: "2026-10-09", lines: [{ account: "Bank - ADCB", debit: 40 }, { account: "Cash in Hand", credit: 40 }] },
  ],
  partnerEntries: [{ id: "pe1", shopId: S, kind: "capitalIn", partnerId: "pt1", partnerName: "Karim", amount: 1000, method: "cash", date: "2026-09-01" }],
};
const opts = { shopId: S, customers: [{ id: "c1", customerName: "Al Noor" }], vendors: [{ id: "v1", vendorName: "Gulf" }], expenseLabel: (e) => ({ rent: "Rent", fuel: "Fuel" })[e.category] };

test("every entry balances: total debit equals total credit", () => {
  const { postings } = buildGlobalLedger(data, opts);
  const dr = postings.reduce((t, p) => t + p.dr, 0), cr = postings.reduce((t, p) => t + p.cr, 0);
  assert.equal(Math.round(dr * 100), Math.round(cr * 100));
  const byDoc = new Map();
  postings.forEach((p) => byDoc.set(`${p.col}:${p.docId}:${p.type}`, (byDoc.get(`${p.col}:${p.docId}:${p.type}`) || 0) + p.dr - p.cr));
  byDoc.forEach((v, k) => assert.ok(Math.abs(v) < 0.001, k));
});

test("balances of the main accounts", () => {
  const { accounts, postings } = buildGlobalLedger(data, opts);
  const b = balances(postings);
  const key = (name) => [...accounts.values()].find((a) => a.name === name).key;
  // customer: 105 + 50 opening - 70 at counter - 20 receipt - 21 return + 21 refund + 10 journal = 75
  assert.equal(b.get("c:c1"), 75);
  assert.equal(accounts.get("c:c1").group, "customer");
  assert.equal(b.get("v:v1"), 0); // 210 bill, paid 200 + 10 discount; branch transfer left out
  assert.equal(b.get(key("Discount Received")), -10);
  assert.equal(b.get(key("Cash in Hand")), 1000 + 70 - 21 - 40);
  assert.equal(b.get(key("Bank")), 20 - 200 - 105);
  assert.equal(b.get(key("Bank - ADCB")), 40);
  assert.equal(accounts.get(key("Bank - ADCB")).group, "money");
  assert.equal(b.get(key("Sales")), -100);
  assert.equal(b.get(key("VAT Output")), -5 + 1);
  assert.equal(b.get(key("VAT Input")), 10 + 5);
  assert.equal(b.get(key("Rent")), 100);
  assert.equal(b.get("p:pt1"), -1000 - 30); // partner: capital in + expense paid from own pocket
  assert.equal(b.get(key("Opening Balance")), -50);
  assert.ok(![...accounts.values()].some((a) => /quotation/i.test(a.name)));
});

test("statement: opening before From, running balance, totals, other side named", () => {
  const { postings } = buildGlobalLedger(data, opts);
  const st = accountStatement(postings, "c:c1", { from: "2026-10-01", to: "2026-10-05" });
  assert.equal(st.opening, 50);
  assert.deepEqual(st.lines.map((l) => [l.no, l.dr, l.cr, l.balance]), [["SI-1", 105, 0, 155], ["SI-1", 0, 70, 85], ["RV-1", 0, 20, 65]]);
  assert.equal(st.lines[0].against, "Sales, VAT Output");
  assert.deepEqual([st.dr, st.cr, st.closing], [105, 90, 65]);
});

test("like the party ledger: bills by name only join the customer, any live status counts, every customer listed", () => {
  const d = {
    salesInvoices: [
      { id: "a", shopId: S, status: "open", invoiceNo: "SI-9", invoiceDate: "2026-10-01", customerName: "AL NOOR ", grandTotal: 40, amountPaid: 0, paymentMethod: "credit" },
      { id: "b", shopId: S, status: "draft", invoiceNo: "SI-D", invoiceDate: "2026-10-01", customerId: "c1", grandTotal: 999 },
      { id: "c", shopId: S, status: "confirmed", invoiceNo: "SI-C", invoiceDate: "2026-10-01", customerId: "c1", grandTotal: 10, amountPaid: 10, paymentMethod: "credit" },
    ],
    receipts: [{ id: "r", shopId: S, status: "confirmed", receiptNo: "RV-9", receiptDate: "2026-10-02", customerName: "Al Noor", method: "cash", totalAmount: 15 }],
  };
  const { accounts, postings } = buildGlobalLedger(d, { ...opts, customers: [...opts.customers, { id: "c2", customerName: "No Bills Yet" }] });
  const b = balances(postings);
  assert.equal(b.get("c:c1"), 40 + 10 - 10 - 15);
  assert.ok(![...accounts.keys()].some((k) => k.startsWith("cn:")));
  assert.equal(accounts.get("c:c2")?.name, "No Bills Yet");
  assert.equal(accounts.get("v:v1")?.group, "vendor");
  const cash = [...accounts.values()].find((a) => a.name === "Cash in Hand").key;
  assert.equal(b.get(cash), 10 + 15); // paid on a "credit" bill still lands in cash, the entry stays balanced
});
