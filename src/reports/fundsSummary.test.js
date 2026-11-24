import test from "node:test";
import assert from "node:assert/strict";
import { buildGlobalLedger, balances } from "../ledger/globalLedger.js";
import { buildBalanceSheet } from "./balanceSheet.js";
import { fundsCsvRows, fundsFileName, fundsFromSheet, fundsLines } from "./fundsSummary.js";

const S = "s1";
const data = {
  partnerEntries: [{ id: "pe1", shopId: S, kind: "capitalIn", partnerId: "pt1", partnerName: "Karim", amount: 1000, method: "cash", date: "2026-09-01" }],
  salesInvoices: [
    { id: "si1", shopId: S, status: "partial", invoiceNo: "SI-1", invoiceDate: "2026-10-01", customerId: "c1", customerName: "Al Noor", grandTotal: 105, totalVat: 5, amountPaid: 5, paymentMethod: "cash" },
    { id: "si2", shopId: S, status: "confirmed", invoiceNo: "SI-2", invoiceDate: "2026-10-02", customerId: "c2", customerName: "Star", grandTotal: 210, totalVat: 10, amountPaid: 0, paymentMethod: "credit" },
    { id: "si3", shopId: S, status: "paid", invoiceNo: "SI-3", invoiceDate: "2026-11-02", customerId: "c3", customerName: "Prepaid", grandTotal: 21, totalVat: 1, amountPaid: 60, paymentMethod: "cash" },
    { id: "sd", shopId: S, status: "draft", invoiceNo: "SI-D", invoiceDate: "2026-10-02", customerId: "c2", grandTotal: 999, totalVat: 0, amountPaid: 999, paymentMethod: "cash" },
  ],
  purchaseInvoices: [{ id: "pi1", shopId: S, status: "confirmed", invoiceNo: "PI-1", invoiceDate: "2026-10-03", vendorId: "v1", vendorName: "Gulf", grandTotal: 420, totalTax: 20, amountPaid: 0, paymentMethod: "credit" }],
  payments: [{ id: "p1", shopId: S, status: "confirmed", paymentNo: "PV-1", paymentDate: "2026-10-04", vendorId: "v1", method: "bank_transfer", totalAmount: 100 }],
  accountVouchers: [{ id: "cv", shopId: S, status: "active", voucherType: "contra", voucherNo: "CV-1", voucherDate: "2026-10-05", lines: [{ account: "Bank - ADCB", debit: 300 }, { account: "Cash in Hand", credit: 300 }] }],
};
const opts = { shopId: S, customers: [{ id: "c1", customerName: "Al Noor" }, { id: "c2", customerName: "Star" }, { id: "c3", customerName: "Prepaid" }], vendors: [{ id: "v1", vendorName: "Gulf" }] };
const { postings, accounts } = buildGlobalLedger(data, opts);
const sheetAt = (d, stock = 0) => buildBalanceSheet({ accounts, bal: balances(postings, d), closingStock: stock, openingStock: 50 });

test("working capital is the Balance Sheet's own figure and the blocks add up to its totals", () => {
  for (const [d, stock] of [["2026-10-31", 250], ["2026-11-30", 400], ["2026-09-30", 0]]) {
    const sheet = sheetAt(d, stock);
    const f = fundsFromSheet(sheet);
    assert.equal(f.workingCapital, sheet.workingCapital, d);
    assert.equal(f.assets, sheet.totalAssets, d);
    assert.equal(f.liabilities, sheet.totalLiabilities, d);
    assert.equal(f.agrees, true, d);
  }
});

test("blocks: liquid with overdraft apart, debtors, creditors, stock, VAT", () => {
  const f = fundsFromSheet(sheetAt("2026-11-30", 400));
  const b = f.blocks;
  // cash: 1000 + 5 + 60 - 300; bank: generic Bank paid 100 out (overdraft), Bank - ADCB got 300
  assert.deepEqual(b.liquid.accounts.map((a) => [a.name, a.amount]), [["Bank - ADCB", 300], ["Cash in Hand", 765]]);
  assert.equal(b.liquid.total, 1065);
  assert.deepEqual(b.liquid.overdraft.map((a) => [a.name, a.amount]), [["Bank", 100]]);
  assert.equal(b.liquid.net, 965);
  assert.deepEqual(b.receivables.top.map((p) => [p.name, p.amount]), [["Star", 210], ["Al Noor", 100]]);
  assert.equal(b.receivables.total, 310);
  assert.equal(b.receivables.advances, 39);
  assert.deepEqual([b.payables.total, b.payables.count], [320, 1]);
  assert.equal(b.inventory, 400);
  // VAT: output 5 + 10 + 1 = 16, input 20 -> 4 refundable
  assert.deepEqual(b.vat, { refundable: 4, payable: 0 });
  assert.equal(f.workingCapital, r(1065 + 310 + 400 + 4 - 320 - 39 - 100));
});

test("top list is capped", () => {
  const f = fundsFromSheet(sheetAt("2026-11-30"), { top: 1 });
  assert.deepEqual(f.blocks.receivables.top.map((p) => p.name), ["Star"]);
  assert.equal(f.blocks.receivables.count, 2);
});

test("lines and CSV: fixed headers, plain numbers, compare columns", () => {
  const f = fundsFromSheet(sheetAt("2026-11-30", 400));
  const lines = fundsLines(f);
  assert.equal(lines[lines.length - 1].amount, f.workingCapital);
  const plain = fundsCsvRows(f, { asOf: "2026-11-30" });
  assert.deepEqual(plain[0], ["Section", "Item", "Amount 2026-11-30"]);
  assert.deepEqual(plain.find((r) => r[1] === "Liquid funds (cash and bank)"), ["Current assets", "Liquid funds (cash and bank)", "1065.00"]);
  assert.ok(plain.some((r) => r[0] === "Debtors"));
  const cmp = fundsFromSheet(sheetAt("2026-10-31", 250));
  const rows = fundsCsvRows(f, { asOf: "2026-11-30", cmp, cmpAsOf: "2026-10-31" });
  assert.deepEqual(rows[0], ["Section", "Item", "2026-11-30", "2026-10-31", "Difference"]);
  const inv = rows.find((r) => r[1] === "Stock (average cost)");
  assert.deepEqual(inv.slice(2), ["400.00", "250.00", "150.00"]);
  assert.equal(fundsFileName("2026-11-30"), "funds-working-capital-2026-11-30.csv");
});

function r(v) { return Math.round(v * 100) / 100; }
