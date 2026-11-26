import test from "node:test";
import assert from "node:assert/strict";
import { marksByDate, monthDates } from "./attendance.js";
import { buildPayroll, buildSif, expenseMethodOf, nextExpenseNos, payrollExpense, payrollLineBlockers, payrollPostedFor, payrollSheetRows, payslipRows, wpsEmployerProblems, wpsLineProblems, WPS_HANDOFF_STEPS } from "./payroll.js";
import { buildGlobalLedger, balances } from "../ledger/globalLedger.js";
import { buildTrialBalance } from "../reports/trialBalance.js";
import { buildBalanceSheet } from "../reports/balanceSheet.js";
import { closingBalances, yearEndJournal } from "../reports/yearEnd.js";

const S = "s1";
const YM = "2026-11";
const emp = (id, extra = {}) => ({ id, shopId: S, name: id.toUpperCase(), joinDate: "2025-01-01", status: "active", ...extra });
const employees = [
  emp("ali", { basicSalary: "2000", housingAllowance: "800", transportAllowance: "200", otRate: "15", payMethod: "wps", bankAccount: "AE07 0331 2345 6789 0123 456", bankRoutingCode: "803320101", wpsPersonId: "10012345678901" }),
  emp("babu", { salary: "1500", payMethod: "cash" }),
  emp("gone", { salary: "900", status: "inactive", leftDate: "2026-10-15" }),
];
// every day present; Ali 2 unpaid-leave days and 4 OT hours; Babu all present
const docs = monthDates(YM).map((date) => ({
  id: date, shopId: S, date, marks: {
    ali: date === "2026-11-03" || date === "2026-11-04" ? { s: "UL" } : { s: "P", ot: date === "2026-11-10" ? "4" : "" },
    babu: { s: "P" },
  },
}));
const byDate = marksByDate(docs, S);
const advance = { id: "x1", shopId: S, expenseNo: "EXP-0007", expenseDate: "2026-11-12", category: "advance", amount: 500, method: "cash", employeeId: "babu", forMonth: YM, status: "active" };

test("salary sheet: parts pro-rated by paid days, overtime, bonus, deduction, advances already paid", () => {
  const sheet = buildPayroll({ employees, byDate, expenses: [advance], shopId: S, ym: YM, extras: { ali: { bonus: "100", deduction: "50", deductionNote: "Late" } } });
  assert.deepEqual(sheet.lines.map((l) => l.employeeId), ["ali", "babu"], "left before the month: not on the sheet");
  const [ali, babu] = sheet.lines;
  assert.equal(ali.paidDays, 28);
  assert.deepEqual(ali.parts.map((p) => [p.k, p.amount]), [["basicSalary", 1866.67], ["housingAllowance", 746.67], ["transportAllowance", 186.66]]);
  assert.deepEqual([ali.fixed, ali.ot, ali.bonus, ali.deduction, ali.earned, ali.payable], [2800, 60, 100, 50, 2910, 2910]);
  assert.deepEqual([babu.fixed, babu.paid, babu.payable], [1500, 500, 1000], "older record with `salary` only; the advance comes off");
  assert.equal(sheet.totals.payable, 3910);
  assert.deepEqual(payrollSheetRows(sheet).at(-1).slice(0, 3), ["TOTAL", "", "4300.00"]);
});

test("blockers: unmarked days, locked or future date, nothing due", () => {
  const half = marksByDate(docs.slice(0, 20), S);
  const [ali] = buildPayroll({ employees, byDate: half, expenses: [], shopId: S, ym: YM }).lines;
  assert.deepEqual(payrollLineBlockers(ali, { payDate: "2026-11-30", today: "2026-11-30" }).map((b) => b.id), ["unmarked"]);
  const full = buildPayroll({ employees, byDate, expenses: [], shopId: S, ym: YM }).lines[0];
  assert.deepEqual(payrollLineBlockers(full, { payDate: "2026-11-30", lockDate: "2026-11-30", today: "2026-12-01" }).map((b) => b.id), ["locked"]);
  assert.deepEqual(payrollLineBlockers(full, { payDate: "2026-12-05", today: "2026-12-01" }).map((b) => b.id), ["future"]);
  assert.deepEqual(payrollLineBlockers(full, { payDate: "2026-11-30", today: "2026-12-01" }), []);
  assert.deepEqual(payrollLineBlockers({ ...full, payable: 0 }, { payDate: "2026-11-30" }).map((b) => b.id), ["nothing"]);
});

test("paying the run: salary expenses hit Salary and cash / bank, TB and BS balance, a second run owes nothing, year-end closes it", () => {
  const sheet = buildPayroll({ employees, byDate, expenses: [advance], shopId: S, ym: YM });
  const nos = nextExpenseNos([advance], sheet.lines.length);
  assert.deepEqual(nos, ["EXP-0008", "EXP-0009"]);
  const paid = sheet.lines.map((l, i) => ({ id: `p${i}`, ...payrollExpense(l, { ym: YM, payDate: "2026-11-30", shopId: S, expenseNo: nos[i] }) }));
  assert.deepEqual(paid.map((x) => [x.employeeId, x.method, x.amount, x.category, x.forMonth, x.source]), [["ali", "bank_transfer", 2860, "salary", YM, "payroll"], ["babu", "cash", 1000, "salary", YM, "payroll"]]);
  const capital = [{ id: "k", shopId: S, kind: "capitalIn", partnerId: "o", partnerName: "Owner", amount: 10000, method: "cash", date: "2026-01-01" }];
  const data = { partnerEntries: capital, expenses: [advance, ...paid] };
  const ledger = buildGlobalLedger(data, { shopId: S, expenseLabel: (e) => (e.category === "salary" ? "Salary" : e.category === "advance" ? "Advance" : "Expense") });
  const bal = balances(ledger.postings, "2026-11-30");
  const keyOf = (name) => [...ledger.accounts.values()].find((a) => a.name === name)?.key;
  assert.equal(bal.get(keyOf("Salary")), 3860);
  assert.equal(bal.get(keyOf("Advance")), 500);
  const tb = buildTrialBalance(ledger, { from: "2026-01-01", to: "2026-11-30" });
  assert.equal(tb.difference, 0);
  const sheetBs = buildBalanceSheet({ accounts: ledger.accounts, bal, closingStock: 0, openingStock: 0 });
  assert.equal(sheetBs.difference, 0);
  assert.equal(sheetBs.equity[0].lines.find((l) => l.key === "profit").amount, -4360);
  // a second run sees everything paid
  const again = buildPayroll({ employees, byDate, expenses: data.expenses, shopId: S, ym: YM });
  assert.equal(again.totals.payable, 0);
  assert.deepEqual([...payrollPostedFor(data.expenses, S, YM).keys()], ["ali", "babu"]);
  // payslip after paying
  const slip = payslipRows(again.lines[1], payrollPostedFor(data.expenses, S, YM).get("babu"));
  assert.deepEqual(slip.slice(-3), [["Less: advance / paid during the month", "-500.00"], ["Paid 2026-11-30 EXP-0009 (cash)", "-1000.00"], ["Balance due", "0.00"]]);
  // cancelling the payroll expense brings the due back
  const cancelled = data.expenses.map((x) => (x.id === "p1" ? { ...x, status: "cancelled" } : x));
  assert.equal(buildPayroll({ employees, byDate, expenses: cancelled, shopId: S, ym: YM }).lines[1].payable, 1000);
  // year-end: salary closes into Capital with everything else
  const ye = yearEndJournal({ ledger, fyStart: "2026-01-01", fyEnd: "2026-12-31", shopId: S });
  assert.equal(closingBalances(ledger, "2026-12-31").net, 4360);
  assert.ok(ye.doc.lines.some((l) => l.account === "Salary" && l.credit === 3860));
  const closed = buildGlobalLedger({ ...data, accountVouchers: [{ id: ye.id, ...ye.doc }] }, { shopId: S, expenseLabel: (e) => (e.category === "salary" ? "Salary" : "Advance") });
  assert.equal(buildTrialBalance(closed, { from: "2026-01-01", to: "2026-12-31" }).difference, 0);
  assert.ok(Math.abs(balances(closed.postings, "2026-12-31").get(keyOf("Salary")) || 0) < 0.005);
});

test("pay method mapping and cheque fields", () => {
  assert.deepEqual(["cash", "bank", "wps", "cheque", ""].map(expenseMethodOf), ["cash", "bank_transfer", "bank_transfer", "cheque", "cash"]);
  const [ali] = buildPayroll({ employees, byDate, expenses: [], shopId: S, ym: YM }).lines;
  const doc = payrollExpense(ali, { ym: YM, payDate: "2026-11-30", shopId: S, expenseNo: "EXP-0001", method: "cheque" });
  assert.deepEqual([doc.method, doc.chequeDate, doc.chequeStatus], ["cheque", "2026-11-30", "pending"]);
  assert.match(doc.note, /28\/30 paid days, OT 4 h 60\.00/);
});

test("UAE WPS SIF: EDR per employee, SCR control line, checks on IDs", () => {
  const [ali, babu] = buildPayroll({ employees, byDate, expenses: [], shopId: S, ym: YM, extras: { ali: { bonus: "100" } } }).lines;
  assert.deepEqual(wpsLineProblems(ali), []);
  assert.equal(wpsLineProblems(babu).length, 3);
  const wps = { employerId: "1234567890123", routingCode: "803320101", reference: "NOV" };
  assert.deepEqual(wpsEmployerProblems(wps), []);
  assert.equal(wpsEmployerProblems({ employerId: "12" }).length, 2);
  const sif = buildSif({ wps, ym: YM, lines: [ali], amounts: new Map([["ali", ali.payable]]), now: new Date(2026, 11, 1, 9, 5, 7) });
  const [edr, scr] = sif.text.trim().split("\r\n");
  assert.equal(edr, "EDR,10012345678901,803320101,AE070331234567890123456,2026-11-01,2026-11-30,30,2800.00,160.00,2");
  assert.equal(scr, "SCR,1234567890123,803320101,2026-12-01,0905,112026,1,2960.00,AED,NOV");
  assert.equal(sif.fileName, "1234567890123261201090507.SIF");
  assert.deepEqual([sif.count, sif.total], [1, 2960]);
});

test("WPS handoff checklist: real steps in both languages, never claims the bank or MOHRE accepted the file", () => {
  assert.ok(WPS_HANDOFF_STEPS.length >= 4);
  for (const x of WPS_HANDOFF_STEPS) { assert.ok(x.en.trim() && x.bn.trim()); }
  const all = WPS_HANDOFF_STEPS.map((x) => x.en).join(" ");
  assert.match(all, /Upload it on your bank/);
  assert.match(all, /S4 does not receive them/);
  assert.doesNotMatch(all, /\b(uploaded|submitted|accepted by|approved|processed by MOHRE)\b/i);
});
