import test from "node:test";
import assert from "node:assert/strict";
import { buildGlobalLedger, balances } from "../ledger/globalLedger.js";
import { buildTrialBalance } from "../reports/trialBalance.js";
import { buildBalanceSheet } from "../reports/balanceSheet.js";
import { journalPlByAccount, journalPlTotal } from "../reports/journalPl.js";
import { computeVat } from "../reports/taxDomain.js";
import { yearEndJournal } from "../reports/yearEnd.js";
import { payrollExpense, buildPayroll } from "../employees/payroll.js";
import { CASH_ACCOUNT } from "../vouchers/accountVoucherDomain.js";
import {
  OPENING, chargeFor, depreciationBlockers, depreciationJournal, depreciationPosted, disposalBlockers, disposalJournal, isFixedAssetAccount, monthlyCharge,
  nextAssetCode, normalizeAssets, purchaseJournal, registerCsvRows, registerRows, unpostedMonths, validateAsset,
} from "./fixedAssets.js";

const S = "s1";
const vendors = [{ id: "v1", vendorName: "Gulf Furniture", trnNumber: "100200300400500" }];
const asV = (j) => ({ id: j.id, ...j.doc });
const capital = [{ id: "k", shopId: S, kind: "capitalIn", partnerId: "o", partnerName: "Owner", amount: 20000, method: "cash", date: "2026-01-01" }];
const ledgerOf = (vouchers, extra = {}) => buildGlobalLedger({ partnerEntries: capital, accountVouchers: vouchers, ...extra }, { shopId: S, vendors, expenseLabel: (e) => (e.category === "salary" ? "Salary" : "Expense") });
const nameBal = (ledger, day, name) => { const k = [...ledger.accounts.values()].find((a) => a.name === name)?.key; return balances(ledger.postings, day).get(k) || 0; };

const desk = normalizeAssets([{ id: "a1", code: "FA-0001", name: "Counter desk", category: "Furniture & Fittings", purchaseDate: "2026-01-10", cost: 3600, vatAmount: 180, supplierTrn: "100200300400500", paidFrom: "Gulf Furniture", lifeMonths: 36, residual: 0 }])[0];
const pc = normalizeAssets([{ id: "a2", code: "FA-0002", name: "Billing PC", category: "Computers & IT", purchaseDate: "2025-06-01", cost: 2400, paidFrom: OPENING, openingAccum: 400, lifeMonths: 24, residual: 0 }])[0];

test("validation, codes and the straight-line charge", () => {
  assert.equal(validateAsset({ name: "" }).error, "name");
  const base = { name: "Shelf", category: "Furniture & Fittings", purchaseDate: "2026-02-01", cost: "1000", lifeMonths: "10", paidFrom: CASH_ACCOUNT };
  assert.equal(validateAsset({ ...base, cost: "0" }).error, "cost");
  assert.equal(validateAsset({ ...base, lifeMonths: "0" }).error, "life");
  assert.equal(validateAsset({ ...base, residual: "1000" }).error, "residual");
  assert.equal(validateAsset({ ...base, paidFrom: OPENING, vatAmount: "50" }).error, "vat");
  assert.equal(validateAsset({ ...base, purchaseDate: "2026-12-01" }, [], { today: "2026-11-25" }).error, "future");
  assert.equal(validateAsset(base, [], { lockDate: "2026-03-31" }).error, "locked");
  const ok = validateAsset(base, [desk, pc]);
  assert.equal(ok.asset.code, "FA-0003");
  assert.equal(nextAssetCode([]), "FA-0001");
  // locked assets: only the name and note change
  assert.deepEqual(validateAsset({ ...desk, name: "Front desk", cost: 1 }, [desk], { locked: true }).asset.cost, 3600);
  assert.equal(monthlyCharge(desk), 100);
  assert.equal(chargeFor(desk, "2025-12", 0), 0, "before booking");
  assert.equal(chargeFor({ ...desk, cost: 1000, lifeMonths: 3 }, "2026-03", 666.66), 333.34, "last month takes the cents");
  assert.equal(chargeFor(desk, "2026-05", 3600), 0, "fully written down");
  assert.ok(isFixedAssetAccount("Fixed Assets - Vehicles") && isFixedAssetAccount("Accumulated Depreciation - Vehicles") && !isFixedAssetAccount("Fixed Deposit"));
});

test("booking, depreciation and the books: TB balances, BS shows cost less depreciation, P&L counts only depreciation, VAT input reaches the return", () => {
  const buy = purchaseJournal(desk, { shopId: S });
  const open = purchaseJournal(pc, { shopId: S });
  assert.deepEqual(buy.doc.lines.map((l) => [l.account, l.debit, l.credit]), [["Fixed Assets - Furniture & Fittings", 3600, 0], ["VAT Input", 180, 0], ["Gulf Furniture", 0, 3780]]);
  assert.deepEqual(open.doc.lines.map((l) => [l.account, l.debit, l.credit]), [["Fixed Assets - Computers & IT", 2400, 0], ["Accumulated Depreciation - Computers & IT", 0, 400], [OPENING, 0, 2000]]);
  let vouchers = [asV(buy), asV(open)];
  const assets = [desk, pc];
  assert.deepEqual(unpostedMonths(assets, vouchers, "2026-03").slice(0, 2), ["2025-06", "2025-07"]);
  // the books started in 2026: post Jan..Mar 2026 (the PC's earlier months are in its opening figure)
  ["2026-01", "2026-02", "2026-03"].forEach((ym) => {
    const j = depreciationJournal({ assets, vouchers, ym, shopId: S });
    vouchers = [...vouchers, asV(j)];
  });
  const posted = depreciationPosted(assets, vouchers);
  assert.equal(posted.get("a1").total, 300);
  assert.equal(posted.get("a2").total, 700, "400 opening + 3 x 100");
  const ledger = ledgerOf(vouchers);
  const end = "2026-03-31";
  assert.equal(nameBal(ledger, end, "Depreciation"), 600);
  assert.equal(nameBal(ledger, end, "Gulf Furniture"), -3780);
  const tb = buildTrialBalance(ledger, { from: "2026-01-01", to: end });
  assert.equal(tb.difference, 0);
  const sheet = buildBalanceSheet({ accounts: ledger.accounts, bal: balances(ledger.postings, end), closingStock: 0, openingStock: 0 });
  assert.equal(sheet.difference, 0);
  const fa = sheet.assets.find((s) => s.id === "fixedAsset");
  assert.equal(fa.total, 3600 + 2400 - 300 - 700);
  assert.equal(sheet.liabilities.some((s) => s.lines.some((l) => /Accumulated/.test(l.name))), false, "depreciation is not a liability");
  assert.equal(sheet.workingCapital, sheet.totalAssets - fa.total - sheet.totalLiabilities);
  // P&L: depreciation only (not the asset, VAT, supplier or opening lines)
  const pl = journalPlByAccount(vouchers, S, "2026-01-01", end);
  assert.deepEqual([...pl.entries()], [["Depreciation", 600]]);
  assert.equal(journalPlTotal(pl), 600);
  // BS profit to date = - depreciation
  assert.equal(sheet.equity[0].lines.find((l) => l.key === "profit").amount, -600);
  // VAT: the asset bill's VAT is claimable input VAT
  const vat = computeVat({ accountVouchers: vouchers, extras: {} }, { shopId: S, from: "2026-01-01", to: "2026-01-31", vendors });
  const row = vat.purchaseRows.find((r) => r.isAsset);
  assert.deepEqual([row.vat, row.taxable, row.trn, row.vatClaimable], [180, 3600, "100200300400500", true]);
  assert.equal(vat.inputVat, 180);
  // register
  const reg = registerRows(assets, vouchers, end);
  assert.deepEqual(reg.map((r) => [r.code, r.accumulated, r.bookValue]), [["FA-0001", 300, 3300], ["FA-0002", 700, 1700]]);
  assert.deepEqual(registerCsvRows(reg).at(-1).slice(5, 10), ["6000.00", "", "200.00", "1000.00", "5000.00"]);
});

test("disposal: cost and depreciation leave, gain or loss booked, asset leaves the balance sheet", () => {
  const assets = [desk];
  let vouchers = [asV(purchaseJournal(desk, { shopId: S }))];
  ["2026-01", "2026-02"].forEach((ym) => { vouchers = [...vouchers, asV(depreciationJournal({ assets, vouchers, ym, shopId: S }))]; });
  assert.deepEqual(disposalBlockers(desk, { date: "2026-04-15", today: "2026-11-25", vouchers }).map((b) => b.id), ["depMissing"]);
  vouchers = [...vouchers, asV(depreciationJournal({ assets, vouchers, ym: "2026-03", shopId: S }))];
  assert.deepEqual(disposalBlockers(desk, { date: "2026-03-20", today: "2026-11-25", vouchers }).map((b) => b.id), ["depLater"]);
  assert.deepEqual(disposalBlockers(desk, { date: "2026-04-15", today: "2026-11-25", lockDate: "2026-04-30", vouchers }).map((b) => b.id), ["locked"]);
  assert.deepEqual(disposalBlockers(desk, { date: "2026-04-15", today: "2026-11-25", vouchers }), []);
  const j = disposalJournal(desk, { date: "2026-04-15", proceeds: 3000, receivedIn: CASH_ACCOUNT, posted: 300, shopId: S });
  assert.equal(j.result, -300, "book value 3300, sold for 3000");
  const dr = j.doc.lines.reduce((t, l) => t + l.debit, 0), cr = j.doc.lines.reduce((t, l) => t + l.credit, 0);
  assert.equal(dr, cr);
  vouchers = [...vouchers, asV(j)];
  const gone = { ...desk, disposal: { date: "2026-04-15", proceeds: 3000, result: -300 } };
  assert.equal(chargeFor(gone, "2026-04", 300), 0, "no depreciation from the disposal month");
  const ledger = ledgerOf(vouchers);
  const end = "2026-04-30";
  assert.equal(nameBal(ledger, end, "Fixed Assets - Furniture & Fittings"), 0);
  assert.equal(nameBal(ledger, end, "Accumulated Depreciation - Furniture & Fittings"), 0);
  assert.equal(nameBal(ledger, end, "Loss on Asset Disposal"), 300);
  const sheet = buildBalanceSheet({ accounts: ledger.accounts, bal: balances(ledger.postings, end), closingStock: 0, openingStock: 0 });
  assert.equal(sheet.difference, 0);
  assert.equal(sheet.assets.find((s) => s.id === "fixedAsset")?.total || 0, 0);
  assert.equal(journalPlTotal(journalPlByAccount(vouchers, S, "2026-01-01", end)), 600, "300 depreciation + 300 loss");
  assert.equal(registerRows([gone], vouchers, end)[0].bookValue, 0);
  const gain = disposalJournal(desk, { date: "2026-04-15", proceeds: 3500, posted: 300, shopId: S });
  assert.equal(gain.result, 200);
  assert.ok(gain.doc.lines.some((l) => l.account === "Gain on Asset Disposal" && l.credit === 200));
});

test("month checks and identity with payroll and year-end close", () => {
  assert.deepEqual(depreciationBlockers("2026-11", { today: "2026-11-25", journal: {} }).map((b) => b.id), ["future"]);
  assert.deepEqual(depreciationBlockers("2026-03", { today: "2026-11-25", lockDate: "2026-03-31", journal: {} }).map((b) => b.id), ["locked"]);
  assert.deepEqual(depreciationBlockers("2026-03", { today: "2026-11-25", journal: null }).map((b) => b.id), ["nothing"]);
  assert.deepEqual(depreciationBlockers("2026-03", { today: "2026-11-25", journal: {} }), []);
  const assets = [desk];
  let vouchers = [asV(purchaseJournal(desk, { shopId: S }))];
  for (let m = 1; m <= 12; m += 1) vouchers = [...vouchers, asV(depreciationJournal({ assets, vouchers, ym: `2026-${String(m).padStart(2, "0")}`, shopId: S }))];
  assert.equal(depreciationJournal({ assets, vouchers, ym: "2026-12", shopId: S }).id, "fa-dep-2026-12");
  // one payroll salary in the same year
  const emp = { id: "e1", name: "Ali", salary: "3000", payMethod: "cash" };
  const line = buildPayroll({ employees: [emp], byDate: new Map(), expenses: [], shopId: S, ym: "2026-06" }).lines[0];
  const salary = { id: "x1", ...payrollExpense({ ...line, payable: 3000 }, { ym: "2026-06", payDate: "2026-06-30", shopId: S, expenseNo: "EXP-0001" }) };
  const ledger = ledgerOf(vouchers, { expenses: [salary] });
  const ye = yearEndJournal({ ledger, fyStart: "2026-01-01", fyEnd: "2026-12-31", shopId: S });
  assert.deepEqual(ye.doc.lines.filter((l) => l.account !== "Capital").map((l) => [l.account, l.credit]), [["Depreciation", 1200], ["Salary", 3000]]);
  assert.equal(ye.profit, -4200);
  const closed = ledgerOf([...vouchers, asV(ye)], { expenses: [salary] });
  const end = "2026-12-31";
  assert.equal(buildTrialBalance(closed, { from: "2026-01-01", to: end }).difference, 0);
  const sheet = buildBalanceSheet({ accounts: closed.accounts, bal: balances(closed.postings, end), closingStock: 0, openingStock: 0, closedStock: 0 });
  assert.equal(sheet.difference, 0);
  assert.equal(sheet.assets.find((s) => s.id === "fixedAsset").total, 2400, "accumulated depreciation is not closed - only Depreciation is");
  assert.equal(journalPlTotal(journalPlByAccount([...vouchers, asV(ye)], S, "2026-01-01", end)), 1200, "the year-end journal stays out of P&L");
});
