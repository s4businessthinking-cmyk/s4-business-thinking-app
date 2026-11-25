import test from "node:test";
import assert from "node:assert/strict";
import { buildGlobalLedger, balances } from "../ledger/globalLedger.js";
import { buildTrialBalance } from "./trialBalance.js";
import { buildBalanceSheet } from "./balanceSheet.js";
import { buildCashFlow } from "./cashFlow.js";
import { buildAging } from "./partyAging.js";
import { computeVat } from "./taxDomain.js";
import { buildVat201 } from "./vat201.js";
import { collectBankTransactions, reconcile } from "../accounts/bankRec.js";
import { combinePrintHtml, packChecks, packCsvRows, packFileName, packSections, packStatus } from "./monthEndPack.js";

const S = "s1";
const customers = [{ id: "c1", customerName: "Ali", emirate: "Dubai" }];
const vendors = [{ id: "v1", vendorName: "Gulf", trnNumber: "100" }];
const data = {
  salesInvoices: [{ id: "i1", shopId: S, invoiceNo: "SI-1", invoiceDate: "2026-11-05", status: "partial", customerId: "c1", customerName: "Ali", grandTotal: 1050, totalVat: 50, amountPaid: 500, paymentMethod: "bank_transfer" }],
  purchaseInvoices: [{ id: "p1", shopId: S, invoiceNo: "PI-1", invoiceDate: "2026-11-02", status: "confirmed", vendorId: "v1", vendorName: "Gulf", grandTotal: 630, totalTax: 30, amountPaid: 0 }],
  partnerEntries: [{ id: "k", shopId: S, kind: "capitalIn", partnerId: "o", partnerName: "Owner", amount: 2000, method: "cash", date: "2026-10-01" }],
  receipts: [], payments: [], expenses: [], accountVouchers: [], salesReturns: [], purchaseReturns: [],
};
const from = "2026-11-01", to = "2026-11-30";
const build = () => {
  const ledger = buildGlobalLedger(data, { shopId: S, customers, vendors });
  const tb = buildTrialBalance(ledger, { from, to });
  const sheet = buildBalanceSheet({ accounts: ledger.accounts, bal: balances(ledger.postings, to), closingStock: 400, openingStock: 0 });
  const cash = buildCashFlow(ledger.postings, ledger.accounts, { from, to });
  const debtors = buildAging(ledger.postings, ledger.accounts, { side: "customer", asOf: to });
  const creditors = buildAging(ledger.postings, ledger.accounts, { side: "vendor", asOf: to });
  const vat = computeVat({ ...data, extras: { salesReturns: [], purchaseReturns: [] } }, { shopId: S, from, to, customers, vendors });
  const ret201 = buildVat201(vat, { customers, shopEmirate: "Sharjah" });
  const txs = collectBankTransactions(data, S);
  const rec = reconcile(txs, new Map([["salesInvoices:i1", "2026-11-06"]]), { asOf: to, statementBalance: 500 });
  const bank = { configured: true, statement: { asOf: to, statementBalance: 500, difference: rec.difference }, rec, typeLabel: (t) => t.col };
  const pl = { netSales: 1000, cogs: 200, grossProfit: 800, vendorDiscount: 0, expenseTotal: 0, netProfit: 800 };
  return { ledger, tb, sheet, cash, debtors, creditors, vat, ret201, bank, pl };
};

test("checks: everything agrees -> closable; problems block or ask for a look", () => {
  const p = build();
  const checks = packChecks({ ...p, to });
  assert.deepEqual(checks.map((c) => [c.id, c.ok]), [["tb", true], ["bs", true], ["vat", true], ["bank", true]]);
  assert.equal(packStatus(checks), "ok");
  assert.equal(packStatus(packChecks({ ...p, to, drafts: 2 })), "warn");
  assert.equal(packStatus(packChecks({ ...p, to, bank: { configured: true, statement: null, rec: p.bank.rec } })), "warn", "no saved bank reconciliation");
  assert.equal(packStatus(packChecks({ ...p, to, bank: { ...p.bank, statement: { difference: 12 } } })), "blocked");
  assert.equal(packStatus(packChecks({ ...p, to, tb: { difference: 5 } })), "blocked");
  assert.ok(packChecks({ ...p, to, lockDate: "2026-11-30" }).some((c) => c.id === "lock"));
  const nonUae = packChecks({ tb: p.tb, sheet: p.sheet, vat: p.vat, to });
  assert.equal(nonUae.find((c) => c.id === "vat").ok, true);
});

test("pack sections carry the reports' own figures", () => {
  const p = build();
  const sections = packSections({ meta: { shopName: "S4", trn: "123", from, to, currency: "AED" }, checks: packChecks({ ...p, to }), ...p, stockValue: 400 });
  assert.deepEqual(sections.map((s) => s.id), ["cover", "tb", "pl", "bs", "cash", "vat", "debtors", "creditors", "stock", "bank"]);
  const tbTotal = sections.find((s) => s.id === "tb").rows.find((r) => r[0] === "TOTAL");
  assert.equal(tbTotal[6], tbTotal[7], "closing debit = closing credit");
  assert.deepEqual(sections.find((s) => s.id === "pl").rows.at(-1), ["Net profit", "800.00"]);
  const bs = sections.find((s) => s.id === "bs").rows;
  assert.deepEqual(bs.find((r) => r[0] === "Difference"), ["Difference", "0.00"]);
  assert.deepEqual(bs.find((r) => r[0] === "Total assets"), ["Total assets", p.sheet.totalAssets.toFixed(2)]);
  assert.ok(bs.some((r) => r[0].trim() === "Closing stock" && r[1] === "400.00"));
  const box14 = sections.find((s) => s.id === "vat").rows.find((r) => r[0] === "14");
  assert.equal(box14[3], p.vat.payable.toFixed(2), "VAT201 box 14 = Tax page payable");
  assert.equal(sections.find((s) => s.id === "debtors").rows.find((r) => r[0] === "TOTAL")[1], p.debtors.totals.due.toFixed(2));
  assert.equal(sections.find((s) => s.id === "creditors").rows.find((r) => r[0] === "TOTAL")[1], "630.00");
  assert.deepEqual(sections.find((s) => s.id === "bank").rows.at(-1), ["Difference", "", "", "", "", "", "0.00"]);
  const cash = sections.find((s) => s.id === "cash").rows;
  assert.equal(cash.at(-1)[3], p.cash.closing.toFixed(2));
  const nonUae = packSections({ meta: { from, to, taxName: "GST" }, tb: p.tb, vat: p.vat });
  assert.equal(nonUae.find((s) => s.id === "vat").title, "GST RETURN");
  assert.equal(nonUae.some((s) => s.id === "bank"), false, "no bank section without a bank reconciliation set up");
});

test("Excel rows, file name and one printout from many pages", () => {
  const rows = packCsvRows([{ title: "A", cols: ["x"], rows: [["1"]] }, { title: "B", cols: ["y"], rows: [["2"]] }]);
  assert.deepEqual(rows, [["A"], ["x"], ["1"], [], ["B"], ["y"], ["2"]]);
  assert.equal(packFileName("2026-11-01", "2026-11-30"), "month-end-pack-2026-11-01-2026-11-30.csv");
  const html = combinePrintHtml(["<!DOCTYPE html><html><head><style>t{}</style></head><body><p>one</p></body></html>", "<html><head></head><body><p>two</p></body></html>"]);
  assert.ok(html.startsWith("<!DOCTYPE html><html><head><style>t{}</style></head><body>"));
  assert.ok(html.includes("<p>one</p>") && html.includes("page-break-before:always") && html.includes("<p>two</p>"));
  assert.equal((html.match(/<body/g) || []).length, 1);
  assert.equal(combinePrintHtml([]), "");
});
