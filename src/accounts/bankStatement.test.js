import test from "node:test";
import assert from "node:assert/strict";
import { collectBankTransactions, reconcile } from "./bankRec.js";
import { lockedLines, parseBankDate, parseStatementRows, reconciliationFileName, reconciliationRows, statementSummary, suggestEntryType, suggestMatches } from "./bankStatement.js";

test("statement dates in the usual bank formats", () => {
  assert.equal(parseBankDate("31/12/2026"), "2026-12-31");
  assert.equal(parseBankDate("05-11-26"), "2026-11-05");
  assert.equal(parseBankDate("2026-11-05"), "2026-11-05");
  assert.equal(parseBankDate("05 Nov 2026"), "2026-11-05");
  assert.equal(parseBankDate("05-NOV-2026"), "2026-11-05");
  assert.equal(parseBankDate("46331"), "2026-11-05", "Excel serial day");
  assert.equal(parseBankDate("32/13/2026"), "");
  assert.equal(parseBankDate("Opening balance"), "");
});

test("debit / credit columns, header below a title, bad rows skipped with a reason, running balance check", () => {
  const rows = [
    ["Emirates NBD - Account Statement"], [],
    ["Transaction Date", "Description", "Cheque No", "Debit", "Credit", "Balance"],
    ["", "Opening Balance", "", "", "", "10,000.00"],
    ["01/11/2026", "Balance brought forward", "", "", "", "10,000.00"],
    ["02/11/2026", "POS deposit Ali Garage", "", "", "1,050.00", "11,050.00"],
    ["03/11/2026", "CHQ 000123 Gulf Parts", "000123", "2,000.00", "", "9,050.00"],
    ["04/11/2026", "Service charges", "", "26.25", "", "9,023.75"],
    ["xx/11/2026", "garbage", "", "5", "", ""],
    ["05/11/2026", "both sides", "", "5", "6", ""],
    ["06/11/2026", "nothing", "", "", "", ""],
  ];
  const { lines, skipped } = parseStatementRows(rows);
  assert.deepEqual(lines.map((l) => [l.row, l.date, l.dir, l.amount, l.balance]), [[6, "2026-11-02", "in", 1050, 11050], [7, "2026-11-03", "out", 2000, 9050], [8, "2026-11-04", "out", 26.25, 9023.75]]);
  assert.equal(lines[1].ref, "000123");
  assert.deepEqual(skipped.map((s) => [s.row, s.reason]), [[9, "date"], [10, "both"], [11, "amount"]]);
  assert.deepEqual(statementSummary(lines), { from: "2026-11-02", to: "2026-11-04", count: 3, totalIn: 1050, totalOut: 2026.25, opening: 10000, closing: 9023.75, balanced: true });
});

test("one signed amount column, newest first, Dr / Cr suffixes", () => {
  const { lines } = parseStatementRows([["Date", "Narration", "Amount", "Balance"], ["04/11/2026", "Interest", "12.00 Cr", "512.00"], ["03/11/2026", "ATM cash wd", "-100", "500.00"], ["01/11/2026", "Cash deposit CDM", "600", "600.00"]]);
  assert.deepEqual(lines.map((l) => [l.dir, l.amount]), [["in", 12], ["out", 100], ["in", 600]]);
  const s = statementSummary(lines);
  assert.deepEqual([s.opening, s.closing, s.balanced], [0, 512, true]);
  assert.deepEqual(lines.map(suggestEntryType), ["interest", "withdrawal", "deposit"]);
  assert.equal(parseStatementRows([["Foo", "Bar"], ["1", "2"]]).error, "noHeader");
});

const S = "s1";
const data = {
  receipts: [
    { id: "r1", shopId: S, receiptNo: "RV-1", receiptDate: "2026-11-01", method: "bank_transfer", totalAmount: 1050, customerName: "Ali Garage" },
    { id: "r2", shopId: S, receiptNo: "RV-2", receiptDate: "2026-11-02", method: "card", totalAmount: 300, customerName: "Sara" },
    { id: "r3", shopId: S, receiptNo: "RV-3", receiptDate: "2026-11-02", method: "card", totalAmount: 300, customerName: "Omar" },
  ],
  payments: [{ id: "p1", shopId: S, paymentNo: "PV-1", paymentDate: "2026-11-01", method: "cheque", chequeNo: "000123", chequeDate: "2026-11-03", totalAmount: 2000, vendorName: "Gulf Parts" }],
  expenses: [{ id: "e1", shopId: S, expenseNo: "EX-1", expenseDate: "2026-10-01", method: "bank_transfer", amount: 999 }],
};

test("matches: one clear candidate is suggested, equal candidates are left to the user, a reference wins, no reuse", () => {
  const txs = collectBankTransactions(data, S);
  const lines = [
    { date: "2026-11-02", desc: "POS deposit Ali", ref: "", dir: "in", amount: 1050.03 },
    { date: "2026-11-03", desc: "CHQ 000123", ref: "", dir: "out", amount: 2000 },
    { date: "2026-11-03", desc: "Card settlement", ref: "", dir: "in", amount: 300 },
    { date: "2026-11-20", desc: "late", ref: "", dir: "in", amount: 1050 },
    { date: "2026-11-02", desc: "too far off", ref: "", dir: "in", amount: 1050.2 },
  ];
  const m = suggestMatches(lines, txs);
  assert.deepEqual([m[0].status, m[0].txKey], ["match", "salesReceipts:r1"], "within 0.05 and 3 days");
  assert.deepEqual([m[1].status, m[1].txKey], ["match", "purchasePayments:p1"]);
  assert.equal(m[2].status, "ambiguous", "two card receipts of 300 on the same day");
  assert.deepEqual(m[2].candidates.sort(), ["salesReceipts:r2", "salesReceipts:r3"]);
  assert.equal(m[3].status, "none", "more than 3 days away");
  assert.equal(m[4].status, "none", "amount outside the tolerance");
  const withRef = suggestMatches([{ date: "2026-11-03", desc: "card RV-3", ref: "", dir: "in", amount: 300 }], txs);
  assert.deepEqual([withRef[0].status, withRef[0].txKey], ["match", "salesReceipts:r3"], "the voucher no in the text decides");
  const twice = suggestMatches([lines[0], { ...lines[0] }], txs);
  assert.deepEqual(twice.map((x) => x.status), ["match", "none"], "a movement is used once");
  const cleared = suggestMatches([lines[0]], txs, { clearedOn: (t) => (t.key === "salesReceipts:r1" ? "2026-11-02" : "") });
  assert.equal(cleared[0].status, "none", "already cleared movements are not offered");
});

test("after matching, the statement closing agrees with the expected bank balance; locked lines; CSV", () => {
  const txs = collectBankTransactions(data, S);
  const marks = new Map([["salesReceipts:r1", "2026-11-02"], ["purchasePayments:p1", "2026-11-03"], ["expenses:e1", "2026-10-01"]]);
  const rec = reconcile(txs, marks, { opening: 10000, asOf: "2026-11-04", statementBalance: 10000 + 1050 - 2000 - 999 });
  assert.equal(rec.difference, 0);
  assert.equal(rec.unclearedInTotal, 600, "the two card receipts are still open");
  assert.deepEqual(lockedLines([{ date: "2026-10-31" }, { date: "2026-11-01" }], "2026-10-31").length, 1);
  assert.deepEqual(lockedLines([{ date: "2026-10-31" }], ""), []);
  const rows = reconciliationRows(rec, { asOf: "2026-11-04", statementBalance: 8051 });
  assert.deepEqual(rows[0], ["Section", "Date", "Type", "No", "Party / Note", "Ref", "Amount"]);
  assert.equal(rows.filter((r) => r[0] === "Deposit not credited").length, 2);
  assert.deepEqual(rows[rows.length - 1], ["Difference", "", "", "", "", "", "0.00"]);
  assert.equal(reconciliationFileName("2026-11-04"), "bank-reconciliation-2026-11-04.csv");
});
