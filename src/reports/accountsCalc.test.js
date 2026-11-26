import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";

// accountsCalc.js is a browser module (extensionless imports, a .jsx label helper), so it is bundled as-is with the
// app's own esbuild and the real code is tested, not a copy.
const here = fileURLToPath(new URL(".", import.meta.url));
const outDir = mkdtempSync(join(tmpdir(), "s4-accounts-calc-"));
const outFile = join(outDir, "bundle.mjs");
await build({
  stdin: {
    contents: [
      'export { computeAccounts, stockEffects } from "./accountsCalc.js";',
      'export { averageCosts } from "./averageCost.js";',
      'export { buildGlobalLedger, balances } from "../ledger/globalLedger.js";',
      'export { buildBalanceSheet, profitReconcile } from "./balanceSheet.js";',
      'export { computeStockMap } from "../inventory/stockFromInvoices.js";',
      'export { fifoRun, unitCostsAt, valuationMethodOf } from "./stockValuation.js";',
      'export { computeVat } from "./taxDomain.js";',
      'export { buildInternalPurchaseInvoice } from "../branch-transfer/branchTransferDomain.js";',
    ].join("\n"),
    resolveDir: here, loader: "js",
  },
  bundle: true, format: "esm", platform: "node", outfile: outFile, logLevel: "silent", loader: { ".js": "jsx", ".jsx": "jsx" }, jsx: "automatic",
});
const { computeAccounts, stockEffects, averageCosts, buildGlobalLedger, balances, buildBalanceSheet, profitReconcile, computeStockMap, fifoRun, unitCostsAt, valuationMethodOf, computeVat, buildInternalPurchaseInvoice } = await import(pathToFileURL(outFile).href);
test.after(() => rmSync(outDir, { recursive: true, force: true }));

const S = "s1";
const FROM = "2026-01-01", TO = "2026-12-31";
const products = [{ id: "p1", name: "Filter", unit: "Pcs", openingStock: 0 }];
const pi = { id: "pi1", shopId: S, status: "confirmed", invoiceNo: "PI-1", invoiceDate: "2026-11-01", vendorName: "Gulf", paymentMethod: "cash", amountPaid: 1000, grandTotal: 1000, totalTax: 0, items: [{ productId: "p1", qty: 10, unit: "Pcs", unitCost: 100, lineTotal: 1000 }] };
const si = { id: "si1", shopId: S, status: "paid", invoiceNo: "SI-1", invoiceDate: "2026-11-05", customerName: "Walk-in", paymentMethod: "cash", amountPaid: 750, grandTotal: 750, totalVat: 0, items: [{ productId: "p1", qty: 5, unit: "Pcs", unitPrice: 150, lineTotal: 750 }] };
const writeOff = { id: "sa1", shopId: S, status: "confirmed", adjustNo: "SA-1", adjustDate: "2026-11-10", reason: "damage", items: [{ productId: "p1", qty: 2, unit: "Pcs", direction: "out" }] };

const dataWith = ({ stockAdjustments = [], warrantyClaims = [], expenses = [] } = {}) => {
  const extras = { salesReturns: [], purchaseReturns: [], stockAdjustments, goodsReceipts: [], warrantyClaims };
  return { salesInvoices: [si], purchaseInvoices: [pi], deliveryNotes: [], extras, ...extras, receipts: [], payments: [], expenses, accountVouchers: [] };
};

// The balance sheet the way BalanceSheetReport builds it: ledger balances plus the stock count at average cost.
const sheetOf = (data) => {
  const ledger = buildGlobalLedger(data, { shopId: S, products, expenseLabel: () => "Rent" });
  const qty = computeStockMap(products, data.purchaseInvoices, data.salesInvoices, S, data.deliveryNotes, data.extras);
  const avg = averageCosts(products, data.purchaseInvoices, TO, []);
  let closing = 0;
  qty.forEach((q, id) => { if (q > 0) closing += q * (avg.get(id) || 0); });
  return buildBalanceSheet({ accounts: ledger.accounts, bal: balances(ledger.postings, TO), closingStock: closing, openingStock: 0 });
};
const plOf = (data, from = FROM, to = TO) => computeAccounts(data, { products, shopId: S, from, to, bn: false });

test("plain buy and sell: P&L and balance sheet profit agree", () => {
  const data = dataWith();
  const pl = plOf(data);
  assert.equal(pl.netProfit, 250);
  assert.equal(pl.stockAdjustLoss, 0);
  assert.equal(pl.stockAdjustCount, 0);
  assert.ok(profitReconcile(pl.netProfit, sheetOf(data).profit).agrees);
});

test("write-off of 2 damaged units at average cost lowers P&L profit to the balance sheet figure", () => {
  const data = dataWith({ stockAdjustments: [writeOff] });
  const pl = plOf(data);
  const sheet = sheetOf(data);
  assert.equal(pl.grossProfit, 250, "gross profit is still sales less cost of goods sold");
  assert.equal(pl.stockAdjustLoss, 200);
  assert.equal(pl.stockAdjustCount, 1);
  assert.equal(pl.netProfit, 50);
  assert.equal(sheet.profit, 50);
  assert.equal(sheet.difference, 0);
  assert.deepEqual(profitReconcile(pl.netProfit, sheet.profit), { plProfit: 50, bsProfit: 50, difference: 0, agrees: true });
});

test("count-up adjustment adds stock value as a gain, same as the balance sheet", () => {
  const found = { ...writeOff, id: "sa2", reason: "count", items: [{ productId: "p1", qty: 1, unit: "Pcs", direction: "in" }] };
  const data = dataWith({ stockAdjustments: [writeOff, found] });
  const pl = plOf(data);
  assert.equal(pl.stockAdjustLoss, 100);
  assert.equal(pl.netProfit, 150);
  assert.ok(profitReconcile(pl.netProfit, sheetOf(data).profit).agrees);
});

test("warranty replacement from the company is a stock gain on its replaced day, matching the balance sheet", () => {
  const claim = { id: "wc1", shopId: S, status: "replaced", claimDate: "2026-11-02", replacedDate: "2026-11-20", productId: "p1", qty: 1 };
  const data = dataWith({ warrantyClaims: [claim] });
  const pl = plOf(data);
  assert.equal(pl.warrantyStockGain, 100);
  assert.equal(pl.warrantyStockCount, 1);
  assert.equal(pl.netProfit, 350);
  assert.ok(profitReconcile(pl.netProfit, sheetOf(data).profit).agrees);
  // claim raised in range but replaced after it: not yet stock
  assert.equal(plOf(data, FROM, "2026-11-15").warrantyStockGain, 0);
  // only "replaced" claims add stock
  assert.equal(plOf(dataWith({ warrantyClaims: [{ ...claim, status: "sent" }] })).warrantyStockGain, 0);
});

test("draft, cancelled, deleted, other-shop and out-of-range adjustments do not move profit", () => {
  const ignored = [
    { ...writeOff, id: "d", status: "draft" },
    { ...writeOff, id: "c", status: "cancelled" },
    { ...writeOff, id: "x", isDeleted: true },
    { ...writeOff, id: "o", shopId: "other" },
  ];
  const pl = plOf(dataWith({ stockAdjustments: ignored }));
  assert.equal(pl.stockAdjustLoss, 0);
  assert.equal(pl.stockAdjustCount, 0);
  assert.equal(pl.netProfit, 250);
  assert.equal(plOf(dataWith({ stockAdjustments: [writeOff] }), "2026-12-01", TO).stockAdjustLoss, 0);
});

test("expenses and write-offs together still reconcile", () => {
  const rent = { id: "e1", shopId: S, status: "active", expenseNo: "EX-1", expenseDate: "2026-11-03", category: "rent", amount: 105, vatAmount: 5, method: "cash" };
  const data = dataWith({ stockAdjustments: [writeOff], expenses: [rent] });
  const pl = plOf(data);
  assert.equal(pl.netProfit, -50);
  assert.ok(profitReconcile(pl.netProfit, sheetOf(data).profit).agrees);
});

test("stockEffects values units by the average cost map it is given", () => {
  const avg = new Map([["p1", 80]]);
  const r = stockEffects({ stockAdjustments: [writeOff] }, { products, shopId: S, from: FROM, to: TO, avg });
  assert.deepEqual(r, { adjustLoss: 160, warrantyGain: 0, adjustCount: 1, warrantyCount: 0 });
});

test("ledger posts the write-off and warranty stock once, inside the P&L accounts: TB balances, profit not counted twice", () => {
  const claim = { id: "wc1", shopId: S, status: "replaced", claimNo: "WC-1", claimDate: "2026-11-02", replacedDate: "2026-11-20", productId: "p1", qty: 1 };
  const data = dataWith({ stockAdjustments: [writeOff], warrantyClaims: [claim] });
  const withStock = buildGlobalLedger(data, { shopId: S, products });
  const without = buildGlobalLedger(data, { shopId: S });
  const balOf = (ledger, name) => balances(ledger.postings, TO).get([...ledger.accounts.values()].find((a) => a.name === name)?.key) || 0;
  assert.equal(balOf(withStock, "Stock Adjustment"), 200, "2 damaged at average 100");
  assert.equal(balOf(withStock, "Warranty Replacement Stock"), -100, "1 replaced unit at average 100, a credit");
  assert.equal(balOf(withStock, "Purchase"), 1000 - 200 + 100);
  // trial balance: debits equal credits
  const all = [...balances(withStock.postings, TO).values()];
  assert.equal(Math.round(all.reduce((t, v) => t + v, 0) * 100) / 100, 0);
  // ledger profit (income less purchases and expenses) is the same with or without the stock entries
  const ledgerPl = (ledger) => { let t = 0; balances(ledger.postings, TO).forEach((v, k) => { const g = ledger.accounts.get(k)?.group; if (g === "income" || g === "expense") t += v; }); return Math.round(t * 100) / 100; };
  assert.equal(ledgerPl(withStock), ledgerPl(without));
  // P&L counts the write-off and the warranty gain once, and still equals the balance sheet
  const pl = plOf(data);
  assert.deepEqual([pl.stockAdjustLoss, pl.warrantyStockGain, pl.netProfit], [200, 100, 150]);
  const sheet = sheetOf(data);
  assert.equal(sheet.profit, 150);
  assert.equal(sheet.difference, 0);
  assert.ok(profitReconcile(pl.netProfit, sheet.profit).agrees);
  // the TB / ledger lines carry the same amounts as the P&L lines
  assert.equal(balOf(withStock, "Stock Adjustment"), pl.stockAdjustLoss);
  assert.equal(-balOf(withStock, "Warranty Replacement Stock"), pl.warrantyStockGain);
});

// ---- A46: FIFO alongside average ----
const P2 = [{ id: "p2", name: "Belt", unit: "Pcs", openingStock: 0 }];
const buy2 = (id, day, qty, cost, extra = {}) => ({ id, shopId: S, status: "confirmed", invoiceNo: id, invoiceDate: day, vendorName: "Gulf", paymentMethod: "cash", amountPaid: qty * cost, grandTotal: qty * cost, totalTax: 0, items: [{ productId: "p2", qty, unit: "Pcs", lineTotal: qty * cost }], ...extra });
const sell2 = (id, day, qty, price) => ({ id, shopId: S, status: "paid", invoiceNo: id, invoiceDate: day, customerName: "Walk-in", paymentMethod: "cash", amountPaid: qty * price, grandTotal: qty * price, totalVat: 0, items: [{ productId: "p2", qty, unit: "Pcs", lineTotal: qty * price }] });
const data2 = ({ purchases = [buy2("PB-1", "2026-11-01", 5, 10), buy2("PB-2", "2026-11-02", 5, 20)], sales = [sell2("SB-1", "2026-11-03", 6, 30)], salesReturns = [], purchaseReturns = [], stockAdjustments = [], warrantyClaims = [] } = {}) => {
  const extras = { salesReturns, purchaseReturns, stockAdjustments, goodsReceipts: [], warrantyClaims };
  return { salesInvoices: sales, purchaseInvoices: purchases, deliveryNotes: [], extras, ...extras, receipts: [], payments: [], expenses: [], accountVouchers: [] };
};
// the Balance Sheet as BalanceSheetReport builds it, for a method
const sheet2 = (data, method) => {
  const ledger = buildGlobalLedger(data, { shopId: S, products: P2, valuation: method });
  const qty = computeStockMap(P2, data.purchaseInvoices, data.salesInvoices, S, data.deliveryNotes, data.extras);
  const unit = unitCostsAt(method, P2, data, { shopId: S, upTo: TO });
  let closing = 0;
  qty.forEach((q, id) => { if (q > 0) closing += q * (unit.get(id) || 0); });
  return { ledger, closing: Math.round(closing * 100) / 100, sheet: buildBalanceSheet({ accounts: ledger.accounts, bal: balances(ledger.postings, TO), closingStock: closing, openingStock: 0 }) };
};
const pl2 = (data, method) => computeAccounts(data, { products: P2, shopId: S, from: FROM, to: TO, bn: false, method });

test("buy 5@10 then 5@20, sell 6: average and FIFO give different cost of goods sold and closing stock", () => {
  const data = data2();
  const avg = pl2(data, "average"), fifo = pl2(data, "fifo");
  assert.deepEqual([avg.cogs, avg.grossProfit, avg.stockValue], [90, 90, 60], "average 15: 6 x 15 sold, 4 x 15 left");
  assert.deepEqual([fifo.cogs, fifo.grossProfit, fifo.stockValue], [70, 110, 80], "FIFO: 5 x 10 + 1 x 20 sold, 4 x 20 left");
  ["average", "fifo"].forEach((m) => {
    const { sheet, closing } = sheet2(data, m);
    assert.equal(sheet.difference, 0, m);
    assert.equal(closing, m === "fifo" ? 80 : 60);
    assert.ok(profitReconcile(pl2(data, m).netProfit, sheet.profit).agrees, `P&L agrees with the Balance Sheet (${m})`);
  });
  assert.equal(valuationMethodOf({}), "average", "average unless the shop picks FIFO");
  assert.equal(valuationMethodOf({ stockValuationMethod: "fifo" }), "fifo");
});

test("average method gives exactly the figures it gave before FIFO existed", () => {
  const data = dataWith({ stockAdjustments: [writeOff] });
  const before = computeAccounts(data, { products, shopId: S, from: FROM, to: TO, bn: false });
  const avg = computeAccounts(data, { products, shopId: S, from: FROM, to: TO, bn: false, method: "average" });
  assert.deepEqual(avg, before);
  assert.deepEqual([avg.cogs, avg.stockAdjustLoss, avg.netProfit, avg.stockValue], [500, 200, 50, 300]);
});

test("FIFO write-off, warranty, sales return and purchase return: P&L, ledger and Balance Sheet use the same layers", () => {
  const adj = { id: "SA-9", shopId: S, status: "confirmed", adjustNo: "SA-9", adjustDate: "2026-11-04", reason: "damage", items: [{ productId: "p2", qty: 2, direction: "out" }] };
  const claim = { id: "WC-9", shopId: S, status: "replaced", claimNo: "WC-9", claimDate: "2026-11-02", replacedDate: "2026-11-05", productId: "p2", qty: 1 };
  const sret = { id: "SR-9", shopId: S, status: "confirmed", returnNo: "SR-9", returnDate: "2026-11-06", invoiceId: "SB-1", partyName: "Walk-in", total: 30, totalVat: 0, refundAmount: 30, refundMethod: "cash", items: [{ productId: "p2", qty: 1 }] };
  const pret = { id: "PR-9", shopId: S, status: "confirmed", returnNo: "PR-9", returnDate: "2026-11-07", invoiceId: "PB-2", partyName: "Gulf", total: 20, totalVat: 0, refundAmount: 20, refundMethod: "cash", items: [{ productId: "p2", qty: 1, amount: 20, vatAmt: 0 }] };
  const data = data2({ stockAdjustments: [adj], warrantyClaims: [claim], salesReturns: [sret], purchaseReturns: [pret] });
  const fifo = pl2(data, "fifo");
  // after the sale 4 left @20; write off 2 @20 = 40; warranty 1 in @20 = 20; the return of SB-1 comes back at that sale's cost 70/6
  assert.equal(fifo.stockAdjustLoss, 40);
  assert.equal(fifo.warrantyStockGain, 20);
  assert.equal(Math.round(fifo.cogs * 100) / 100, Math.round((70 - 70 / 6) * 100) / 100);
  ["average", "fifo"].forEach((m) => {
    const { sheet, ledger } = sheet2(data, m);
    const pl = pl2(data, m);
    assert.equal(sheet.difference, 0, m);
    assert.ok(profitReconcile(pl.netProfit, sheet.profit).agrees, `agrees (${m}): ${pl.netProfit} vs ${sheet.profit}`);
    const balOf = (name) => balances(ledger.postings, TO).get([...ledger.accounts.values()].find((a) => a.name === name)?.key) || 0;
    if (m === "fifo") {
      assert.equal(balOf("Stock Adjustment"), pl.stockAdjustLoss, "FIFO: ledger write-off = P&L write-off");
      assert.equal(-balOf("Warranty Replacement Stock"), pl.warrantyStockGain, "FIFO: ledger warranty = P&L warranty");
    } else {
      // average (A41): the ledger values each entry at the average on its own day, the P&L at the period end - the purchase
      // return on the 7th moved the average, so the two lines differ; profit and the Balance Sheet are not affected
      assert.deepEqual([balOf("Stock Adjustment"), pl.stockAdjustLoss], [30, 28.89]);
    }
  });
});

test("FIFO stock below zero: the shortfall is costed now and trued up when the next bill fills it", () => {
  const data = data2({ purchases: [buy2("PB-1", "2026-11-01", 2, 10), buy2("PB-3", "2026-11-05", 4, 25)], sales: [sell2("SB-1", "2026-11-03", 3, 40)] });
  const run = fifoRun(P2, data, { shopId: S });
  const kinds = run.issues.map((x) => [x.kind, x.date, Math.round(x.value * 100) / 100]);
  assert.deepEqual(kinds, [["sale", "2026-11-03", 30], ["shortfall", "2026-11-05", 15]], "1 short at the last cost 10, filled at 25 -> +15");
  assert.deepEqual([run.remaining.get("p2").qty, run.remaining.get("p2").value], [3, 75]);
  const pl = pl2(data, "fifo");
  assert.equal(pl.cogs, 45, "2 x 10 + 1 x 25 in the end");
  const { sheet } = sheet2(data, "fifo");
  assert.ok(profitReconcile(pl.netProfit, sheet.profit).agrees);
});

test("a branch transfer receipt bill never touches P&L, VAT, supplier dues, stock or average cost", () => {
  const transfer = { id: "bt1", shopId: S, transferNo: "BT-1", branchId: "b1", branchName: "Sharjah", vendorId: "v1", vendorName: "Gulf",
    items: [{ lineId: "l1", productId: "p1", name: "Filter", unit: "Pcs", quantity: 4, unitCost: 300 }] };
  const receipt = { id: "r1", sequence: 1, receivedAt: "2026-11-03", lines: [{ productId: "p1", name: "Filter", unit: "Pcs", acceptedQty: 4, unitCost: 300 }] };
  const cash = buildInternalPurchaseInvoice({ transfer, receipt, shop: { id: S }, actor: { uid: "u1" }, invoiceId: "bt-pi-1" });
  const credit = buildInternalPurchaseInvoice({ transfer, receipt: { ...receipt, id: "r2", sequence: 2 }, shop: { id: S }, actor: { uid: "u1" }, invoiceId: "bt-pi-2", paymentMethod: "credit" });
  assert.equal(credit.balanceDue, 1200, "the credit receipt bill carries a due on its face");
  // a tampered copy with VAT on it must still stay out of the VAT return
  const taxed = { ...cash, id: "bt-pi-3", invoiceNo: "PI-BT-3", vendorTrn: "100000000000003", totalTax: 60, grandTotal: 1260 };

  const base = dataWith();
  const withBt = { ...base, purchaseInvoices: [...base.purchaseInvoices, cash, credit, taxed] };
  const pick = (pl) => [pl.purchCount, pl.grossPurch, pl.vatIn, pl.netPurch, pl.cogs, pl.netSales, pl.payable, pl.cashOnPurch, pl.netProfit];
  assert.deepEqual(pick(plOf(withBt)), pick(plOf(base)), "P&L identical with and without the transfer bills");
  assert.equal(plOf(withBt).netProfit, 250);

  const vat = (d) => computeVat(d, { shopId: S, from: FROM, to: TO });
  assert.deepEqual([vat(withBt).inputVat, vat(withBt).purchCount, vat(withBt).purchaseRows.length], [vat(base).inputVat, vat(base).purchCount, vat(base).purchaseRows.length]);
  assert.equal(vat(withBt).purchaseRows.some((r) => String(r.no).startsWith("PI-BT-")), false);

  const ledgerOf = (d) => buildGlobalLedger(d, { shopId: S, products, expenseLabel: () => "Rent" });
  assert.deepEqual([...balances(ledgerOf(withBt).postings, TO)], [...balances(ledgerOf(base).postings, TO)], "no ledger line from a transfer bill: no purchase, no supplier due, no cash out");
  assert.equal(ledgerOf(withBt).postings.some((p) => p.docId === "bt-pi-2" || p.refId === "bt-pi-2"), false);

  const stock = (d) => [...computeStockMap(products, d.purchaseInvoices, d.salesInvoices, S, d.deliveryNotes, d.extras)];
  assert.deepEqual(stock(withBt), stock(base), "main-shop stock is not added again by the receipt bill");
});
