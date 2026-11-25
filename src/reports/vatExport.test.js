import test from "node:test";
import assert from "node:assert/strict";
import { computeVat } from "./taxDomain.js";
import { csvText, excludedCounts, num, purchaseDetail, salesDetail, vatChecks, vatFileName, vatPackRows } from "./vatExport.js";

const X = "x";
const data = {
  salesInvoices: [
    { id: "s1", shopId: X, status: "paid", invoiceType: "tax", invoiceDate: "2026-10-02", invoiceNo: "SI-1", customerId: "c1", customerName: "Al Noor, LLC", grandTotal: 1050, totalVat: 50, items: [] },
    { id: "s2", shopId: X, status: "confirmed", invoiceType: "regular", invoiceDate: "2026-10-03", invoiceNo: "SI-2", grandTotal: 50, totalVat: 0, items: [] },
    { id: "s3", shopId: X, status: "draft", invoiceDate: "2026-10-03", invoiceNo: "SI-D", grandTotal: 999, totalVat: 99 },
    { id: "s4", shopId: X, status: "cancelled", invoiceDate: "2026-10-04", invoiceNo: "SI-X", grandTotal: 999, totalVat: 99 },
    { id: "q1", shopId: X, status: "open", docKind: "quotation", invoiceDate: "2026-10-04", invoiceNo: "QT-1", grandTotal: 999, totalVat: 99 },
    { id: "d1", shopId: X, status: "confirmed", invoiceType: "delivery", invoiceDate: "2026-10-04", invoiceNo: "DN-1", grandTotal: 999, totalVat: 99 },
    { id: "s9", shopId: X, status: "paid", invoiceType: "tax", invoiceDate: "2026-09-30", invoiceNo: "SI-9", grandTotal: 210, totalVat: 10 },
  ],
  purchaseInvoices: [
    { id: "p1", shopId: X, status: "confirmed", invoiceDate: "2026-10-05", invoiceNo: "PI-1", supplierInvoiceNo: "GT-1", vendorId: "v1", vendorName: "Gulf", grandTotal: 420, totalTax: 20, items: [] },
    { id: "p2", shopId: X, status: "confirmed", invoiceDate: "2026-10-06", invoiceNo: "PI-2", vendorId: "v2", vendorName: "No TRN Co", grandTotal: 105, totalTax: 5, items: [] },
    { id: "p3", shopId: X, status: "draft", invoiceDate: "2026-10-06", invoiceNo: "PI-D", vendorId: "v1", grandTotal: 999, totalTax: 99 },
    { id: "bt", shopId: X, status: "confirmed", internalTransfer: true, invoiceDate: "2026-10-07", invoiceNo: "BT-1", vendorId: "v1", grandTotal: 999, totalTax: 99 },
  ],
  extras: {
    salesReturns: [
      { id: "r1", shopId: X, status: "confirmed", returnDate: "2026-10-08", returnNo: "SR-1", invoiceNo: "SI-1", invoiceId: "s1", partyId: "c1", partyName: "Al Noor, LLC", total: 105, totalVat: 5, items: [] },
      { id: "r2", shopId: X, status: "cancelled", returnDate: "2026-10-08", returnNo: "SR-X", total: 500, totalVat: 25, items: [] },
    ],
    purchaseReturns: [{ id: "pr1", shopId: X, status: "confirmed", returnDate: "2026-10-09", returnNo: "PR-1", invoiceId: "p1", partyId: "v1", partyName: "Gulf", total: 42, totalVat: 2, items: [] }],
  },
  expenses: [{ id: "e1", shopId: X, status: "active", expenseDate: "2026-10-10", expenseNo: "EX-1", paidTo: "DEWA", supplierTrn: "100200300", amount: 210, vatAmount: 10 }],
};
const opts = { shopId: X, from: "2026-10-01", to: "2026-12-31", customers: [{ id: "c1", trnNumber: "111222333" }], vendors: [{ id: "v1", trnNumber: "999888777" }, { id: "v2" }] };
const vat = computeVat(data, opts);

test("sales detail: every bill and return, returns negative, typed", () => {
  const s = salesDetail(vat);
  assert.deepEqual(s.rows.map((r) => [r[1], r[2], r[6], r[7]]), [["Sale", "SI-1", "1000.00", "50.00"], ["Sale", "SI-2", "50.00", "0.00"], ["Sales return", "SR-1", "-100.00", "-5.00"]]);
  assert.equal(s.rows[2][3], "SI-1");
  assert.equal(s.rows[0][5], "111222333");
  assert.equal(s.rows[1][4], "Cash customer");
  assert.equal(s.totals.vat, vat.outputVat);
});

test("purchase detail: recoverable lines, expense typed, no-TRN supplier listed apart", () => {
  const p = purchaseDetail(vat);
  assert.deepEqual(p.rows.map((r) => [r[1], r[2], r[7]]), [["Purchase", "PI-1", "20.00"], ["Purchase return", "PR-1", "-2.00"], ["Expense", "EX-1", "10.00"]]);
  assert.equal(p.rows[0][3], "GT-1");
  assert.deepEqual(p.excluded.map((r) => [r[2], r[4], r[7]]), [["PI-2", "No TRN Co", "5.00"]]);
  assert.equal(p.totals.vat, vat.inputVat);
});

test("checks: detail totals equal the summary", () => {
  const c = vatChecks(vat);
  assert.deepEqual([c.salesOk, c.purchaseOk, c.payableOk], [true, true, true]);
  assert.equal(c.outputVat, 45);
  assert.equal(c.inputVat, 28);
  assert.equal(c.payable, 17);
});

test("left-out documents are counted by reason", () => {
  const ex = excludedCounts(data, opts);
  assert.deepEqual(
    [ex.salesDraft, ex.salesCancelled, ex.quotations, ex.deliveryNotes, ex.purchaseDraft, ex.branchTransfers, ex.returnsCancelled],
    [1, 1, 1, 1, 1, 1, 1],
  );
});

test("pack: sections in order, plain numbers, BOM, quoted commas", () => {
  const rows = vatPackRows({ vat, summary: [{ box: "Box 1", label: "Standard-rated sales", labelBn: "বিক্রি", amount: 900 }], meta: { shopName: "Shop", from: opts.from, to: opts.to }, excluded: excludedCounts(data, opts) });
  const titles = rows.filter((r) => r.length === 1 && /^[A-Z (),/-]+$/.test(r[0])).map((r) => r[0]);
  assert.deepEqual(titles, ["SUMMARY", "SALES DETAIL (OUTPUT VAT)", "PURCHASE DETAIL (INPUT VAT, RECOVERABLE)", "PURCHASES NOT RECOVERABLE (SUPPLIER HAS NO TRN)", "OUTPUT VAT BY EMIRATE / REGION", "CHECKS", "LEFT OUT OF THIS RETURN (DATED IN THE PERIOD)"]);
  assert.equal(rows.filter((r) => r[3] === "MISMATCH").length, 0);
  const text = csvText(rows);
  assert.equal(text.charCodeAt(0), 0xfeff);
  assert.ok(text.includes('"Al Noor, LLC"'));
  assert.ok(text.includes("\r\n"));
  // an amount with a thousands separator would be quoted, e.g. "1,000.00"
  assert.ok(!/"-?\d{1,3}(,\d{3})+\.\d{2}"/.test(text));
  assert.equal(num("1,234.5"), "1234.50");
});

test("file names: vat-{period}-{from}-{to}", () => {
  assert.equal(vatFileName({ periodLabel: "Oct – Dec 2026", from: "2026-10-01", to: "2026-12-31" }), "vat-oct-dec-2026-2026-10-01-2026-12-31.csv");
  assert.equal(vatFileName({ periodLabel: "", from: "2026-10-05", to: "2026-10-20", part: "sales" }), "vat-custom-2026-10-05-2026-10-20-sales.csv");
});

test("fixed-asset bills from the asset register: recoverable with a TRN, listed apart without one; checks agree", () => {
  const asset = (id, no, trn, vatAmount, extra = {}) => ({ id, shopId: X, voucherType: "journal", source: "fixedAsset", faKind: "buy", status: "posted", voucherDate: "2026-11-01", voucherNo: no, paidTo: "Al Futtaim", supplierTrn: trn, totalAmount: 5250, vatAmount, ...extra });
  const d = { ...data, accountVouchers: [asset("a1", "FA-1", "300400500", 250), asset("a2", "FA-2", "", 50, { totalAmount: 1050 }), asset("a3", "FA-3", "300400500", 99, { status: "cancelled" }), asset("a4", "FA-4", "300400500", 99, { faKind: "dispose" })] };
  const v = computeVat(d, opts);
  const p = purchaseDetail(v);
  assert.deepEqual(p.rows.filter((r) => r[1] === "Fixed asset").map((r) => [r[2], r[6], r[7]]), [["FA-1", "5000.00", "250.00"]]);
  assert.deepEqual(p.excluded.map((r) => [r[1], r[2], r[7]]), [["Purchase", "PI-2", "5.00"], ["Fixed asset", "FA-2", "50.00"]]);
  assert.equal(v.inputVat, 278, "28 before + 250 asset VAT");
  const c = vatChecks(v);
  assert.deepEqual([c.salesOk, c.purchaseOk, c.payableOk, c.payable], [true, true, true, -233]);
  // without the vouchers loaded the asset VAT is simply not there - the Tax page now loads them
  assert.equal(computeVat({ ...data }, opts).inputVat, 28);
});

test("checks catch a summary that does not match the detail lines", () => {
  const c = vatChecks({ ...vat, outputVat: vat.outputVat + 1, inputVat: vat.inputVat - 0.5 });
  assert.deepEqual([c.salesOk, c.purchaseOk, c.payableOk], [false, false, false]);
  assert.equal(vatChecks({ ...vat, outputVat: vat.outputVat + 0.004 }).salesOk, true, "within a cent");
  assert.equal(vatChecks(null), null);
});

test("left-out counts: every reason, period and shop scoped, a moved delivery note counted once", () => {
  const S = (id, o) => ({ id, shopId: X, invoiceDate: "2026-11-02", invoiceNo: id, grandTotal: 105, totalVat: 5, ...o });
  const d = {
    salesInvoices: [
      S("a", { status: "draft" }), S("b", { status: "cancelled" }), S("c", { status: "open", docKind: "quotation" }), S("d", { status: "open", docKind: "salesOrder" }),
      S("e", { status: "confirmed", invoiceType: "delivery" }), S("f", { status: "paid", source: "openingBalance" }), S("g", { status: "paid" }),
      S("h", { status: "draft", shopId: "other" }), S("i", { status: "draft", invoiceDate: "2026-09-30" }), S("j", { status: "draft", isDeleted: true }),
    ],
    deliveryNotes: [S("e", { status: "confirmed", docKind: "delivery", invoiceType: "delivery" }), S("k", { status: "confirmed", docKind: "delivery" })],
    purchaseInvoices: [
      S("p1", { status: "draft" }), S("p2", { status: "cancelled" }), S("p3", { status: "confirmed", source: "openingBalance" }),
      S("p4", { status: "confirmed", internalTransfer: true }), S("p5", { status: "confirmed", sourceType: "branch_transfer" }), S("p6", { status: "confirmed" }),
    ],
    extras: {
      salesReturns: [{ id: "r1", shopId: X, status: "cancelled", returnDate: "2026-11-03" }, { id: "r2", shopId: X, status: "confirmed", returnDate: "2026-11-03" }],
      purchaseReturns: [{ id: "r3", shopId: X, status: "cancelled", returnDate: "2026-11-03" }, { id: "r4", shopId: X, status: "cancelled", returnDate: "2027-01-03" }],
    },
  };
  assert.deepEqual(excludedCounts(d, opts), {
    salesDraft: 1, salesCancelled: 1, quotations: 2, deliveryNotes: 2, salesOpening: 1, purchaseDraft: 1, purchaseCancelled: 1, branchTransfers: 2, purchaseOpening: 1, returnsCancelled: 2,
  });
  // what is left out never reaches the VAT lines: only g, p6 and the live return r2
  const v = computeVat(d, opts);
  assert.deepEqual(v.salesRows.map((r) => r.id), ["g", "r2"]);
  assert.deepEqual(v.purchaseRows.map((r) => r.id), ["p6"]);
  assert.deepEqual(excludedCounts(null, opts).salesDraft, 0);
});

test("pack: summary, sales and purchase totals and checks agree with the figures; an empty period is a valid zero pack", () => {
  const summary = [{ box: "Box 1", label: "Output VAT", amount: vat.outputVat }, { box: "Box 10", label: "Input VAT", amount: vat.inputVat }, { label: "Net VAT payable", amount: vat.payable }];
  const rows = vatPackRows({ vat, summary, meta: {}, excluded: excludedCounts(data, opts) });
  const after = (title) => rows.slice(rows.findIndex((r) => r[0] === title));
  const totalOf = (title) => after(title).find((r) => r[0] === "Total");
  assert.deepEqual(after("SUMMARY").slice(2, 5).map((r) => [r[0], r[3]]), [["Box 1", "45.00"], ["Box 10", "28.00"], ["", "17.00"]]);
  assert.deepEqual(totalOf("SALES DETAIL (OUTPUT VAT)").slice(1, 8), ["3 line(s)", "", "", "", "", "950.00", "45.00"]);
  assert.deepEqual(totalOf("PURCHASE DETAIL (INPUT VAT, RECOVERABLE)").slice(1, 8), ["3 line(s)", "", "", "", "", "560.00", "28.00"]);
  assert.deepEqual(after("CHECKS").slice(2, 5).map((r) => r.slice(1)), [["45.00", "45.00", "OK"], ["28.00", "28.00", "OK"], ["17.00", "17.00", "OK"]]);
  // a period with nothing in it
  const empty = computeVat(data, { ...opts, from: "2027-01-01", to: "2027-03-31" });
  const zero = vatPackRows({ vat: empty, summary: [], meta: {}, excluded: excludedCounts(data, { ...opts, from: "2027-01-01", to: "2027-03-31" }) });
  const titles = zero.filter((r) => r.length === 1 && /^[A-Z (),/-]+$/.test(r[0])).map((r) => r[0]);
  assert.deepEqual(titles, ["SUMMARY", "SALES DETAIL (OUTPUT VAT)", "PURCHASE DETAIL (INPUT VAT, RECOVERABLE)", "CHECKS", "LEFT OUT OF THIS RETURN (DATED IN THE PERIOD)"]);
  assert.ok(zero.filter((r) => r[0] === "Total").every((r) => r[1] === "0 line(s)" && r[7] === "0.00"));
  assert.equal(zero.filter((r) => r[3] === "OK").length, 3);
  assert.ok(csvText(zero).startsWith("﻿"));
});
