import test from "node:test";
import assert from "node:assert/strict";
import { buildGlobalLedger, balances } from "../ledger/globalLedger.js";
import { buildTrialBalance } from "./trialBalance.js";
import { buildBalanceSheet } from "./balanceSheet.js";
import { journalPlByAccount, journalPlTotal } from "./journalPl.js";
import { buildAging } from "./partyAging.js";
import { yearEndJournal } from "./yearEnd.js";
import { foreignBills, fxBlockers, fxCsvRows, fxPosition, openCurrencies, postedFx, realisedJournal, revaluationJournal, revaluationLines, settledOn } from "./forex.js";

const S = "s1";
const vendors = [{ id: "v1", vendorName: "Global Parts LLC" }];
const bill = { id: "pi1", shopId: S, invoiceNo: "PI-1", supplierInvoiceNo: "GP-77", invoiceDate: "2026-09-10", status: "confirmed", vendorId: "v1", vendorName: "global parts llc",
  currency: "USD", exchangeRate: 3.67, fcGrandTotal: 1000, grandTotal: 3670, totalTax: 0, amountPaid: 0 };
const local = { id: "pi2", shopId: S, invoiceNo: "PI-2", invoiceDate: "2026-09-12", status: "confirmed", vendorId: "v1", vendorName: "Global Parts LLC", currency: "", grandTotal: 500, totalTax: 0, amountPaid: 0 };
const capital = [{ id: "k", shopId: S, kind: "capitalIn", partnerId: "o", partnerName: "Owner", amount: 10000, method: "cash", date: "2026-01-01" }];
const asV = (j) => ({ id: j.id, ...j.doc });
const ledgerOf = (data) => buildGlobalLedger({ partnerEntries: capital, ...data }, { shopId: S, vendors });
const vendorBal = (ledger, day) => balances(ledger.postings, day).get("v:v1") || 0;
const pos = (data, asOf) => fxPosition({ purchaseInvoices: data.purchaseInvoices, payments: data.payments || [], purchaseReturns: [], vouchers: data.accountVouchers || [], vendors, shopId: S, asOf });

test("foreign bills and what is still open in their currency", () => {
  assert.deepEqual(foreignBills([bill, local, { ...bill, id: "x", status: "draft" }, { ...bill, id: "y", currency: "AED" }], S).map((b) => b.id), ["pi1"]);
  const pay = { id: "p1", shopId: S, paymentDate: "2026-10-15", vendorId: "v1", totalAmount: 1845, method: "bank_transfer", allocations: [{ invoiceId: "pi1", amount: 1835 }] };
  const paidBill = { ...bill, amountPaid: 1835 };
  assert.equal(settledOn(paidBill, { payments: [pay], asOf: "2026-09-30" }), 0, "paid after the date");
  assert.equal(settledOn(paidBill, { payments: [pay], asOf: "2026-10-31" }), 1835);
  const [b] = pos({ purchaseInvoices: [paidBill], payments: [pay] }, "2026-10-31");
  assert.deepEqual([b.fcOpen, b.fcSettled, b.bookOpen, b.vendorName], [500, 500, 1835, "Global Parts LLC"], "journal lines use the master name");
  assert.deepEqual(openCurrencies(pos({ purchaseInvoices: [bill] }, "2026-09-30")), ["USD"]);
});

test("month-end revaluation, part payment, realised difference: supplier ends at open FC x closing rate; TB, BS, P&L agree", () => {
  // September: revalue at 3.68 - loss 10
  let data = { purchaseInvoices: [bill, local], payments: [], accountVouchers: [] };
  const sep = revaluationJournal({ position: pos(data, "2026-09-30"), rates: { USD: 3.68 }, day: "2026-09-30", shopId: S });
  assert.deepEqual(sep.doc.lines.map((l) => [l.account, l.debit, l.credit]), [["Exchange Loss", 10, 0], ["Global Parts LLC", 0, 10]]);
  data = { ...data, accountVouchers: [asV(sep)] };
  assert.equal(revaluationJournal({ position: pos(data, "2026-09-30"), rates: { USD: 3.68 }, day: "2026-09-30" }), null, "nothing changes on a second run");
  assert.equal(vendorBal(ledgerOf(data), "2026-09-30"), -(3670 + 500 + 10));
  // October: half paid - the bank took 1845 for USD 500 (3.69); 1835 allocated at the bill rate
  const pay = { id: "p1", shopId: S, paymentNo: "PV-1", paymentDate: "2026-10-15", vendorId: "v1", vendorName: "Global Parts LLC", totalAmount: 1845, method: "bank_transfer", allocations: [{ invoiceId: "pi1", amount: 1835 }] };
  data = { ...data, purchaseInvoices: [{ ...bill, amountPaid: 1835 }, local], payments: [pay] };
  const [half] = pos(data, "2026-10-31").filter((b) => b.id === "pi1");
  const real = realisedJournal({ bill: half, fcAmount: 500, rate: 3.69, date: "2026-10-15", shopId: S });
  assert.equal(real.amount, 10, "USD 500 x (3.69 - 3.67)");
  assert.equal(realisedJournal({ bill: half, fcAmount: 600, rate: 3.69, date: "2026-10-15" }).error, "fcMax");
  assert.equal(realisedJournal({ bill: half, fcAmount: 500, rate: 3.67, date: "2026-10-15" }).error, "same");
  data = { ...data, accountVouchers: [...data.accountVouchers, asV(real)] };
  // October revaluation at 3.66 on the open USD 500: target -5, 10 posted before -> gain 15
  const lines = revaluationLines(pos(data, "2026-10-31"), { USD: 3.66 });
  assert.deepEqual(lines.map((x) => [x.bill.id, x.target, x.change]), [["pi1", -5, -15]]);
  const oct = revaluationJournal({ position: pos(data, "2026-10-31"), rates: { USD: 3.66 }, day: "2026-10-31", shopId: S });
  assert.deepEqual(oct.doc.lines.map((l) => [l.account, l.debit, l.credit]), [["Global Parts LLC", 15, 0], ["Exchange Gain", 0, 15]]);
  data = { ...data, accountVouchers: [...data.accountVouchers, asV(oct)] };
  const ledger = ledgerOf(data);
  const end = "2026-10-31";
  assert.equal(vendorBal(ledger, end), -(500 * 3.66 + 500), "the USD bill now stands at USD 500 x 3.66, plus the AED bill");
  assert.equal(buildTrialBalance(ledger, { from: "2026-01-01", to: end }).difference, 0);
  const sheet = buildBalanceSheet({ accounts: ledger.accounts, bal: balances(ledger.postings, end), closingStock: 0, openingStock: 0 });
  assert.equal(sheet.difference, 0);
  assert.equal(sheet.assets.find((s) => s.id === "supplierAdvance"), undefined, "the extra 10 paid is no longer an advance");
  // P&L: only the exchange lines (10 + 10 - 15 = 5 net loss)
  const pl = journalPlByAccount(data.accountVouchers, S, "2026-01-01", end);
  assert.deepEqual([...pl.entries()].sort(), [["Exchange Gain", -15], ["Exchange Loss", 20]]);
  assert.equal(journalPlTotal(pl), 5);
  const posted = postedFx(data.accountVouchers);
  assert.deepEqual(posted.get("pi1"), { reval: -5, realised: 10, realisedFc: 500 });
  // the creditors ageing agrees with the ledger
  const aging = buildAging(ledger.postings, ledger.accounts, { side: "vendor", asOf: end });
  assert.equal(aging.totals.due, 500 * 3.66 + 500);
  assert.equal(fxCsvRows(pos(data, end), { USD: 3.66 })[0][7], "500.00");
});

test("bill paid off: the next revaluation winds the unrealised difference back; year-end closes the exchange accounts", () => {
  let data = { purchaseInvoices: [bill], payments: [], accountVouchers: [] };
  const sep = revaluationJournal({ position: pos(data, "2026-09-30"), rates: { USD: 3.7 }, day: "2026-09-30", shopId: S });
  data = { ...data, accountVouchers: [asV(sep)] };
  const pay = { id: "p1", shopId: S, paymentDate: "2026-10-20", vendorId: "v1", vendorName: "Global Parts LLC", totalAmount: 3670, method: "bank_transfer", allocations: [{ invoiceId: "pi1", amount: 3670 }] };
  data = { ...data, purchaseInvoices: [{ ...bill, amountPaid: 3670, status: "paid" }], payments: [pay] };
  const oct = revaluationJournal({ position: pos(data, "2026-10-31"), rates: { USD: 3.75 }, day: "2026-10-31", shopId: S });
  assert.deepEqual(oct.doc.lines.map((l) => [l.account, l.debit, l.credit]), [["Global Parts LLC", 30, 0], ["Exchange Gain", 0, 30]], "the September loss of 30 comes back");
  data = { ...data, accountVouchers: [...data.accountVouchers, asV(oct)] };
  const ledger = ledgerOf(data);
  assert.equal(vendorBal(ledger, "2026-10-31"), 0);
  const ye = yearEndJournal({ ledger, fyStart: "2026-01-01", fyEnd: "2026-12-31", shopId: S });
  assert.deepEqual(ye.doc.lines.filter((l) => /Exchange/.test(l.account)).map((l) => [l.account, l.debit, l.credit]), [["Exchange Gain", 30, 0], ["Exchange Loss", 0, 30]]);
});

test("checks: date, lock and suppliers missing from the master", () => {
  const rows = pos({ purchaseInvoices: [bill] }, "2026-09-30");
  assert.deepEqual(fxBlockers({ day: "2026-12-01", today: "2026-11-25", rows, vendors }).map((b) => b.id), ["future"]);
  assert.deepEqual(fxBlockers({ day: "2026-09-30", today: "2026-11-25", lockDate: "2026-09-30", rows, vendors }).map((b) => b.id), ["locked"]);
  assert.deepEqual(fxBlockers({ day: "2026-09-30", today: "2026-11-25", rows, vendors: [] }).map((b) => b.id), ["vendor"]);
  assert.deepEqual(fxBlockers({ day: "2026-09-30", today: "2026-11-25", rows, vendors }), []);
  assert.equal(revaluationLines(rows, {})[0].change, null, "no closing rate yet");
});
