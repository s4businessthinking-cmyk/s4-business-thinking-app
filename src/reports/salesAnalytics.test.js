import test from "node:test";
import assert from "node:assert/strict";
import { buildSalesAnalytics, payStatus } from "./salesAnalytics.js";

const S = "s1";
const products = [
  { id: "p1", code: "F-100", name: "Oil Filter", brand: "Bosch", category: "Filters", unit: "Pcs", unitPrices: [{ unit: "Box", factor: 10 }] },
  { id: "p2", code: "B-200", name: "Brake Pad", brand: "TRW", category: "Brakes", unit: "Pcs" },
];
const it = (productId, qty, lineTotal, vatAmt, extra = {}) => ({ productId, qty, lineTotal, vatAmt, code: products.find((p) => p.id === productId)?.code, name: products.find((p) => p.id === productId)?.name, ...extra });
const salesInvoices = [
  // 100 + 5 VAT, cash, paid
  { id: "a", shopId: S, status: "paid", invoiceNo: "SI-1", invoiceDate: "2026-11-02", invoiceType: "tax", customerId: "c1", customerName: "Al Noor", paymentMethod: "cash", salesmanName: "Rafiq",
    grandTotal: 105, totalVat: 5, totalDiscount: 10, amountPaid: 105, balanceDue: 0, items: [it("p1", 2, 63, 3, { brand: "Bosch" }), it("p2", 1, 42, 2, { brand: "TRW" })] },
  // bill discount: lines say 300 net but the bill nets 270 + 13.5 VAT
  { id: "b", shopId: S, status: "partial", invoiceNo: "SI-2", invoiceDate: "2026-11-15", invoiceType: "tax", customerId: "c2", customerName: "Star Garage", paymentMethod: "credit", salesmanName: "Karim",
    grandTotal: 283.5, totalVat: 13.5, totalDiscount: 30, amountPaid: 100, balanceDue: 183.5, items: [it("p1", 1, 315, 15, { unit: "Box", unitFactor: 10, brand: "Bosch" })] },
  { id: "c", shopId: S, status: "confirmed", invoiceNo: "SI-3", invoiceDate: "2026-10-20", invoiceType: "regular", customerId: "c1", customerName: "Al Noor", paymentMethod: "credit", createdByName: "Owner",
    grandTotal: 50, totalVat: 0, amountPaid: 0, balanceDue: 50, items: [it("p2", 1, 50, 0)] },
  { id: "d", shopId: S, status: "draft", invoiceNo: "SI-D", invoiceDate: "2026-11-03", customerName: "Al Noor", grandTotal: 999, totalVat: 0, items: [it("p1", 9, 999, 0)] },
  { id: "x", shopId: S, status: "cancelled", invoiceNo: "SI-X", invoiceDate: "2026-11-03", customerName: "Al Noor", grandTotal: 999, totalVat: 0, items: [it("p1", 9, 999, 0)] },
  { id: "q", shopId: S, status: "confirmed", docKind: "quotation", invoiceNo: "QT-1", invoiceDate: "2026-11-03", grandTotal: 999, totalVat: 0, items: [] },
  { id: "dn", shopId: S, status: "confirmed", invoiceType: "delivery", invoiceNo: "DN-1", invoiceDate: "2026-11-03", grandTotal: 999, totalVat: 0, items: [] },
  { id: "ob", shopId: S, status: "confirmed", source: "openingBalance", invoiceNo: "OB-1", invoiceDate: "2026-11-01", grandTotal: 999, totalVat: 0, items: [] },
];
const salesReturns = [
  { id: "r1", shopId: S, status: "confirmed", returnDate: "2026-11-20", partyName: "Al Noor", total: 31.5, totalVat: 1.5, items: [{ productId: "p1", code: "F-100", name: "Oil Filter", brand: "Bosch", amount: 31.5, vatAmt: 1.5 }] },
  { id: "r2", shopId: S, status: "cancelled", returnDate: "2026-11-20", partyName: "Al Noor", total: 500, totalVat: 0, items: [] },
];
const data = { salesInvoices, salesReturns, products };
const NOV = { shopId: S, from: "2026-11-01", to: "2026-11-30", today: "2026-11-30" };

test("only live bills count; net sales follows the P&L rule", () => {
  const a = buildSalesAnalytics(data, NOV);
  assert.deepEqual(a.invoices.map((i) => i.no), ["SI-2", "SI-1"]);
  assert.equal(a.kpi.count, 2);
  assert.equal(a.kpi.gross, 388.5);
  assert.equal(a.kpi.vat, 18.5);
  assert.equal(a.kpi.net, 370);
  assert.equal(a.kpi.discount, 40);
  assert.equal(a.kpi.avgBill, 194.25);
  assert.equal(a.kpi.paid, 205);
  assert.equal(a.kpi.balance, 183.5);
  assert.equal(a.kpi.returnsTotal, 31.5);
  assert.equal(a.kpi.returnsCount, 1);
  // 388.5 - 31.5 - (18.5 - 1.5)
  assert.equal(a.kpi.netSales, 340);
});

test("product amounts share the bill net, so they add up to the bills", () => {
  const a = buildSalesAnalytics(data, NOV);
  const p1 = a.byProduct.find((p) => p.productId === "p1");
  const p2 = a.byProduct.find((p) => p.productId === "p2");
  // SI-1: 100 net over lines 60 / 40; SI-2: 270 on its one line
  assert.equal(p1.net, 330);
  assert.equal(p2.net, 40);
  assert.equal(p1.net + p2.net, a.kpi.net);
  // 2 Pcs + 1 Box of 10
  assert.equal(p1.qty, 12);
  assert.equal(a.kpi.qty, 13);
  assert.deepEqual(a.byBrand.map((b) => [b.key, b.net]), [["Bosch", 330], ["TRW", 40]]);
  assert.deepEqual(a.byCategory.map((c) => c.key), ["Filters", "Brakes"]);
});

test("breakdowns: customer, method, salesman, period", () => {
  const a = buildSalesAnalytics(data, NOV);
  assert.deepEqual(a.byCustomer.map((c) => [c.name, c.amount, c.balance]), [["Star Garage", 283.5, 183.5], ["Al Noor", 105, 0]]);
  assert.deepEqual(a.byMethod.map((m) => [m.key, m.count]), [["credit", 1], ["cash", 1]]);
  assert.deepEqual(a.bySalesman.map((m) => m.key), ["Karim", "Rafiq"]);
  assert.equal(a.unit, "day");
  // the day of the return gets its own row (returns only)
  assert.deepEqual(a.byPeriod.map((r) => [r.period, r.amount, r.returns]), [["2026-11-02", 105, 0], ["2026-11-15", 283.5, 0], ["2026-11-20", 0, 31.5]]);
  // all time: first bill 20 Oct; more than about two months to today goes by month
  assert.equal(buildSalesAnalytics(data, { shopId: S, today: "2026-11-30" }).unit, "day");
  const all = buildSalesAnalytics(data, { shopId: S, today: "2027-01-31" });
  assert.equal(all.unit, "month");
  assert.deepEqual(all.byPeriod.map((r) => [r.period, r.count]), [["2026-10", 1], ["2026-11", 2]]);
  assert.equal(all.bySalesman.find((s) => s.key === "Owner").count, 1);
});

test("filters: customer, product, method, salesman, type, status", () => {
  assert.deepEqual(buildSalesAnalytics(data, { ...NOV, customer: "star" }).invoices.map((i) => i.no), ["SI-2"]);
  assert.deepEqual(buildSalesAnalytics(data, { ...NOV, method: "cash" }).invoices.map((i) => i.no), ["SI-1"]);
  assert.deepEqual(buildSalesAnalytics(data, { ...NOV, salesman: "Karim" }).invoices.map((i) => i.no), ["SI-2"]);
  assert.deepEqual(buildSalesAnalytics(data, { shopId: S, type: "regular" }).invoices.map((i) => i.no), ["SI-3"]);
  assert.deepEqual(buildSalesAnalytics(data, { ...NOV, status: "partial" }).invoices.map((i) => i.no), ["SI-2"]);
  // product filter: only Brake Pad's share of SI-1 (40 net + 2 VAT)
  const trw = buildSalesAnalytics(data, { ...NOV, brand: "TRW" });
  assert.equal(trw.kpi.count, 1);
  assert.equal(trw.kpi.gross, 42);
  assert.equal(trw.kpi.net, 40);
  assert.equal(trw.kpi.discount, null);
  assert.equal(trw.kpi.returnsTotal, 0);
  const filters = buildSalesAnalytics(data, { ...NOV, item: "filter" });
  assert.equal(filters.kpi.returnsTotal, 31.5);
  assert.equal(filters.kpi.net, 330);
});

test("filter choices come from live bills only", () => {
  const a = buildSalesAnalytics(data, NOV);
  assert.deepEqual(a.options.methods, ["cash", "credit"]);
  assert.deepEqual(a.options.types, ["regular", "tax"]);
  assert.deepEqual(a.options.categories, ["Brakes", "Filters"]);
  assert.equal(payStatus({ status: "confirmed" }), "unpaid");
});

test("returns follow their bill: bill-level filters and the bill's customer decide whether a return counts", () => {
  // r3 is against SI-1 (cash, Rafiq, tax invoice, paid) and its party name differs from the bill's customer
  const r3 = { id: "r3", shopId: S, status: "confirmed", returnDate: "2026-11-21", invoiceId: "a", partyName: "Noor Auto", total: 21, totalVat: 1, items: [{ productId: "p2", code: "B-200", name: "Brake Pad", brand: "TRW", amount: 21, vatAmt: 1 }] };
  const d2 = { ...data, salesReturns: [...salesReturns, r3] };
  const base = buildSalesAnalytics(d2, NOV);
  assert.equal(base.kpi.returnsTotal, 52.5);
  // salesman / method / type / status come from the bill; r1 has no bill so it drops out once a bill filter is set
  const rafiq = buildSalesAnalytics(d2, { ...NOV, salesman: "Rafiq" });
  assert.deepEqual([rafiq.kpi.returnsTotal, rafiq.kpi.returnsCount], [21, 1]);
  assert.equal(rafiq.kpi.netSales, 105 - 21 - (5 - 1));
  assert.deepEqual([buildSalesAnalytics(d2, { ...NOV, salesman: "Karim" }).kpi.returnsTotal, buildSalesAnalytics(d2, { ...NOV, method: "credit" }).kpi.returnsTotal], [0, 0]);
  assert.equal(buildSalesAnalytics(d2, { ...NOV, method: "cash" }).kpi.returnsTotal, 21);
  assert.equal(buildSalesAnalytics(d2, { ...NOV, type: "tax" }).kpi.returnsTotal, 21);
  assert.equal(buildSalesAnalytics(d2, { ...NOV, status: "paid" }).kpi.returnsTotal, 21);
  // customer: the bill's customer (Al Noor) or the return's own party name both match
  assert.equal(buildSalesAnalytics(d2, { ...NOV, customer: "al noor" }).kpi.returnsTotal, 52.5);
  assert.equal(buildSalesAnalytics(d2, { ...NOV, customer: "noor auto" }).kpi.returnsTotal, 21);
  assert.equal(buildSalesAnalytics(d2, { ...NOV, customer: "star" }).kpi.returnsTotal, 0);
  // product filter still works line by line on top
  assert.equal(buildSalesAnalytics(d2, { ...NOV, salesman: "Rafiq", brand: "Bosch" }).kpi.returnsTotal, 0);
  // a cancelled bill's return does not borrow a filter match
  const lost = { ...r3, id: "r4", invoiceId: "x" };
  assert.equal(buildSalesAnalytics({ ...data, salesReturns: [lost] }, { ...NOV, salesman: "Rafiq" }).kpi.returnsTotal, 0);
});

test("the period rows add up to the KPIs, returns included, under any filter", () => {
  const r3 = { id: "r3", shopId: S, status: "confirmed", returnDate: "2026-11-21", invoiceId: "a", partyName: "Al Noor", total: 21, totalVat: 1, items: [{ productId: "p2", code: "B-200", name: "Brake Pad", brand: "TRW", amount: 21, vatAmt: 1 }] };
  const d2 = { ...data, salesReturns: [...salesReturns, r3] };
  [NOV, { ...NOV, salesman: "Rafiq" }, { ...NOV, brand: "TRW" }, { ...NOV, customer: "al noor" }, { shopId: S, today: "2027-01-31" }].forEach((f) => {
    const a = buildSalesAnalytics(d2, f);
    const sum = (k) => Math.round(a.byPeriod.reduce((t, r) => t + r[k], 0) * 100) / 100;
    assert.deepEqual([sum("amount"), sum("vat"), sum("net"), sum("returns"), sum("returnsVat"), sum("netSales")], [a.kpi.gross, a.kpi.vat, a.kpi.net, a.kpi.returnsTotal, a.kpi.returnsVat, a.kpi.netSales], JSON.stringify(f));
    assert.equal(a.invoices.reduce((t, r) => t + r.amount, 0).toFixed(2), a.kpi.gross.toFixed(2));
  });
});
