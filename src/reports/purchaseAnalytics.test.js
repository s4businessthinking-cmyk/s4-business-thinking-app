import test from "node:test";
import assert from "node:assert/strict";
import { buildPurchaseAnalytics, payStatus } from "./purchaseAnalytics.js";

const S = "s1";
const products = [
  { id: "p1", code: "F-100", name: "Oil Filter", brand: "Bosch", category: "Filters", unit: "Pcs", unitPrices: [{ unit: "Box", factor: 10 }] },
  { id: "p2", code: "B-200", name: "Brake Pad", brand: "TRW", category: "Brakes", unit: "Pcs" },
];
const it = (productId, qty, lineTotal, taxAmt, extra = {}) => ({ productId, qty, lineTotal, taxAmt, code: products.find((p) => p.id === productId)?.code, name: products.find((p) => p.id === productId)?.name, ...extra });
const purchaseInvoices = [
  // 200 + 10 VAT, bank transfer, paid
  { id: "a", shopId: S, status: "paid", invoiceNo: "PI-1", supplierInvoiceNo: "GT-778", invoiceDate: "2026-11-03", vendorId: "v1", vendorName: "Gulf Traders", paymentMethod: "bank_transfer", createdByName: "Rafiq",
    grandTotal: 210, totalTax: 10, totalDiscount: 20, amountPaid: 210, balanceDue: 0, items: [it("p1", 1, 126, 6, { unit: "Box", unitFactor: 10, brand: "Bosch" }), it("p2", 2, 84, 4, { brand: "TRW" })] },
  // bill-level adjustment: lines say 400 net but the bill nets 380 + 19 VAT
  { id: "b", shopId: S, status: "confirmed", invoiceNo: "PI-2", invoiceDate: "2026-11-18", vendorId: "v2", vendorName: "Star Parts", paymentMethod: "credit", createdByName: "Karim",
    grandTotal: 399, totalTax: 19, totalDiscount: 0, amountPaid: 0, balanceDue: 399, items: [it("p2", 10, 420, 20, { brand: "TRW" })] },
  { id: "c", shopId: S, status: "partial", invoiceNo: "PI-3", invoiceDate: "2026-09-10", vendorId: "v1", vendorName: "Gulf Traders", paymentMethod: "cash", createdByName: "Rafiq",
    grandTotal: 52.5, totalTax: 2.5, amountPaid: 20, balanceDue: 32.5, items: [it("p1", 5, 52.5, 2.5)] },
  { id: "d", shopId: S, status: "draft", invoiceNo: "PI-D", invoiceDate: "2026-11-05", vendorName: "Gulf Traders", grandTotal: 999, totalTax: 0, items: [it("p1", 9, 999, 0)] },
  { id: "x", shopId: S, status: "cancelled", invoiceNo: "PI-X", invoiceDate: "2026-11-05", vendorName: "Gulf Traders", grandTotal: 999, totalTax: 0, items: [it("p1", 9, 999, 0)] },
  { id: "bt", shopId: S, status: "confirmed", internalTransfer: true, invoiceNo: "BT-1", invoiceDate: "2026-11-06", vendorName: "Main shop", grandTotal: 999, totalTax: 0, items: [it("p1", 9, 999, 0)] },
  { id: "bt2", shopId: S, status: "confirmed", sourceType: "branch_transfer", invoiceNo: "BT-2", invoiceDate: "2026-11-06", vendorName: "Main shop", grandTotal: 999, totalTax: 0, items: [it("p1", 9, 999, 0)] },
  { id: "ob", shopId: S, status: "confirmed", source: "openingBalance", invoiceNo: "OB-1", invoiceDate: "2026-11-01", vendorName: "Gulf Traders", grandTotal: 999, totalTax: 0, items: [] },
];
const purchaseReturns = [
  { id: "r1", shopId: S, status: "confirmed", returnDate: "2026-11-20", partyName: "Star Parts", total: 42, totalVat: 2, items: [{ productId: "p2", code: "B-200", name: "Brake Pad", brand: "TRW", amount: 42, vatAmt: 2 }] },
  { id: "r2", shopId: S, status: "cancelled", returnDate: "2026-11-20", partyName: "Star Parts", total: 500, totalVat: 0, items: [] },
];
const data = { purchaseInvoices, purchaseReturns, products };
const NOV = { shopId: S, from: "2026-11-01", to: "2026-11-30", today: "2026-11-30" };

test("only live bills count; drafts, cancelled, transfers and opening balances are left out", () => {
  const a = buildPurchaseAnalytics(data, NOV);
  assert.deepEqual(a.invoices.map((i) => i.no), ["PI-2", "PI-1"]);
  assert.equal(a.kpi.count, 2);
  assert.equal(a.kpi.gross, 609);
  assert.equal(a.kpi.vat, 29);
  assert.equal(a.kpi.net, 580);
  assert.equal(a.kpi.discount, 20);
  assert.equal(a.kpi.avgBill, 304.5);
  assert.equal(a.kpi.paid, 210);
  assert.equal(a.kpi.balance, 399);
});

test("net purchases follows the P&L rule", () => {
  const a = buildPurchaseAnalytics(data, NOV);
  assert.equal(a.kpi.returnsTotal, 42);
  assert.equal(a.kpi.returnsCount, 1);
  // P&L: grossPurch - purchReturnTotal - (totalTax - returnVat) = 609 - 42 - (29 - 2)
  assert.equal(a.kpi.netPurchases, 540);
});

test("product amounts share the bill net, so they add up to the bills", () => {
  const a = buildPurchaseAnalytics(data, NOV);
  const p1 = a.byProduct.find((p) => p.productId === "p1");
  const p2 = a.byProduct.find((p) => p.productId === "p2");
  // PI-1: 200 net over lines 120 / 80; PI-2: 380 on its one line
  assert.equal(p1.net, 120);
  assert.equal(p2.net, 460);
  assert.equal(p1.net + p2.net, a.kpi.net);
  // 1 Box of 10, and 2 + 10 Pcs
  assert.equal(p1.qty, 10);
  assert.equal(p2.qty, 12);
  assert.deepEqual(a.byBrand.map((b) => [b.key, b.net]), [["TRW", 460], ["Bosch", 120]]);
});

test("breakdowns: supplier, method, user, period", () => {
  const a = buildPurchaseAnalytics(data, NOV);
  assert.deepEqual(a.byVendor.map((v) => [v.name, v.amount, v.balance]), [["Star Parts", 399, 399], ["Gulf Traders", 210, 0]]);
  assert.deepEqual(a.byMethod.map((m) => m.key), ["credit", "bank_transfer"]);
  assert.deepEqual(a.byUser.map((u) => u.key), ["Karim", "Rafiq"]);
  assert.equal(a.unit, "day");
  const all = buildPurchaseAnalytics(data, { shopId: S, today: "2026-11-30" });
  assert.equal(all.unit, "month");
  assert.deepEqual(all.byPeriod.map((r) => [r.period, r.count]), [["2026-09", 1], ["2026-11", 2]]);
});

test("filters: supplier, supplier bill no, product, method, user, status", () => {
  assert.deepEqual(buildPurchaseAnalytics(data, { ...NOV, vendor: "star" }).invoices.map((i) => i.no), ["PI-2"]);
  assert.deepEqual(buildPurchaseAnalytics(data, { ...NOV, vendor: "gt-778" }).invoices.map((i) => i.no), ["PI-1"]);
  assert.deepEqual(buildPurchaseAnalytics(data, { ...NOV, method: "credit" }).invoices.map((i) => i.no), ["PI-2"]);
  assert.deepEqual(buildPurchaseAnalytics(data, { shopId: S, user: "Rafiq" }).invoices.map((i) => i.no), ["PI-1", "PI-3"]);
  assert.deepEqual(buildPurchaseAnalytics(data, { shopId: S, status: "partial" }).invoices.map((i) => i.no), ["PI-3"]);
  const bosch = buildPurchaseAnalytics(data, { ...NOV, brand: "Bosch" });
  assert.equal(bosch.kpi.count, 1);
  assert.equal(bosch.kpi.gross, 126);
  assert.equal(bosch.kpi.net, 120);
  assert.equal(bosch.kpi.discount, null);
  assert.equal(bosch.kpi.returnsTotal, 0);
  assert.equal(buildPurchaseAnalytics(data, { ...NOV, item: "brake" }).kpi.returnsTotal, 42);
  assert.deepEqual(buildPurchaseAnalytics(data, NOV).options.methods, ["bank_transfer", "cash", "credit"]);
  assert.equal(payStatus({ status: "confirmed" }), "unpaid");
});

test("returns follow their bill: bill-level filters and the bill's supplier decide whether a return counts", () => {
  // r3 is against PI-1 (bank transfer, Rafiq, paid) and its party name differs from the bill's supplier
  const r3 = { id: "r3", shopId: S, status: "confirmed", returnDate: "2026-11-21", invoiceId: "a", partyName: "GT Trading", total: 21, totalVat: 1, items: [{ productId: "p2", code: "B-200", name: "Brake Pad", brand: "TRW", amount: 21, vatAmt: 1 }] };
  const d2 = { ...data, purchaseReturns: [...purchaseReturns, r3] };
  assert.equal(buildPurchaseAnalytics(d2, NOV).kpi.returnsTotal, 63);
  // user / method / status come from the bill; r1 has no bill so it drops out once a bill filter is set
  const rafiq = buildPurchaseAnalytics(d2, { ...NOV, user: "Rafiq" });
  assert.deepEqual([rafiq.kpi.returnsTotal, rafiq.kpi.returnsCount], [21, 1]);
  assert.equal(rafiq.kpi.netPurchases, 210 - 21 - (10 - 1));
  assert.equal(buildPurchaseAnalytics(d2, { ...NOV, user: "Karim" }).kpi.returnsTotal, 0);
  assert.equal(buildPurchaseAnalytics(d2, { ...NOV, method: "credit" }).kpi.returnsTotal, 0);
  assert.equal(buildPurchaseAnalytics(d2, { ...NOV, method: "bank_transfer" }).kpi.returnsTotal, 21);
  assert.equal(buildPurchaseAnalytics(d2, { ...NOV, status: "paid" }).kpi.returnsTotal, 21);
  assert.equal(buildPurchaseAnalytics(d2, { ...NOV, status: "unpaid" }).kpi.returnsTotal, 0);
  // supplier: the bill's supplier (Gulf Traders), its supplier bill no, or the return's own party name all match
  assert.equal(buildPurchaseAnalytics(d2, { ...NOV, vendor: "gulf" }).kpi.returnsTotal, 21);
  assert.equal(buildPurchaseAnalytics(d2, { ...NOV, vendor: "gt-778" }).kpi.returnsTotal, 21);
  assert.equal(buildPurchaseAnalytics(d2, { ...NOV, vendor: "gt trading" }).kpi.returnsTotal, 21);
  assert.equal(buildPurchaseAnalytics(d2, { ...NOV, vendor: "star" }).kpi.returnsTotal, 42);
  // product filter still works line by line on top
  assert.equal(buildPurchaseAnalytics(d2, { ...NOV, user: "Rafiq", brand: "Bosch" }).kpi.returnsTotal, 0);
  assert.equal(buildPurchaseAnalytics(d2, { ...NOV, brand: "TRW" }).kpi.returnsTotal, 63);
  // a return on a cancelled bill does not borrow a filter match
  assert.equal(buildPurchaseAnalytics({ ...data, purchaseReturns: [{ ...r3, invoiceId: "x" }] }, { ...NOV, user: "Rafiq" }).kpi.returnsTotal, 0);
});

test("the period rows add up to the KPIs, returns included, under any filter", () => {
  const r3 = { id: "r3", shopId: S, status: "confirmed", returnDate: "2026-11-21", invoiceId: "a", partyName: "Gulf Traders", total: 21, totalVat: 1, items: [{ productId: "p2", code: "B-200", name: "Brake Pad", brand: "TRW", amount: 21, vatAmt: 1 }] };
  const d2 = { ...data, purchaseReturns: [...purchaseReturns, r3] };
  const nov = buildPurchaseAnalytics(d2, NOV);
  assert.deepEqual(nov.byPeriod.filter((r) => !r.count).map((r) => [r.period, r.returns]), [["2026-11-20", 42], ["2026-11-21", 21]], "days with returns only get their own row");
  [NOV, { ...NOV, user: "Rafiq" }, { ...NOV, brand: "TRW" }, { ...NOV, vendor: "gulf" }, { ...NOV, method: "credit" }, { shopId: S, today: "2027-01-31" }].forEach((f) => {
    const a = buildPurchaseAnalytics(d2, f);
    const sum = (k) => Math.round(a.byPeriod.reduce((t, r) => t + r[k], 0) * 100) / 100;
    assert.deepEqual([sum("amount"), sum("vat"), sum("net"), sum("returns"), sum("returnsVat"), sum("netPurchases")], [a.kpi.gross, a.kpi.vat, a.kpi.net, a.kpi.returnsTotal, a.kpi.returnsVat, a.kpi.netPurchases], JSON.stringify(f));
    assert.equal(a.invoices.reduce((t, r) => t + r.amount, 0).toFixed(2), a.kpi.gross.toFixed(2));
  });
});
