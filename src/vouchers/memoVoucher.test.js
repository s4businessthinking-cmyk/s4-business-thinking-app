import test from "node:test";
import assert from "node:assert/strict";
import { ACCOUNT_VOUCHER_TYPES, isMemoVoucher } from "./accountVoucherDomain.js";
import { buildVoucherRegister, registerRows } from "./voucherRegister.js";
import { buildGlobalLedger, balances } from "../ledger/globalLedger.js";
import { journalPlByAccount } from "../reports/journalPl.js";
import { buildTrialBalance } from "../reports/trialBalance.js";
import { buildBalanceSheet } from "../reports/balanceSheet.js";
import { collectBankTransactions } from "../accounts/bankRec.js";
import { missingFromVouchers, normalizeChart } from "../ledger/chartOfAccounts.js";

const S = "s1";
const journal = { id: "j1", shopId: S, status: "active", voucherType: "journal", voucherNo: "JV-0001", voucherDate: "2026-11-10", totalAmount: 300, lines: [{ account: "Office Rent", debit: 300 }, { account: "Cash in Hand", credit: 300 }] };
const memo = { id: "m1", shopId: S, status: "active", voucherType: "memo", voucherNo: "MV-0001", voucherDate: "2026-11-12", totalAmount: 5000, narration: "Planned bank loan",
  lines: [{ account: "Bank - ADCB", debit: 5000 }, { account: "Loan - ADCB", credit: 5000 }, { account: "Interest Expense", debit: 0 }] };
const base = { partnerEntries: [{ id: "p", shopId: S, kind: "capitalIn", partnerId: "k", partnerName: "Karim", amount: 2000, method: "cash", date: "2026-10-01" }] };

test("memo is a voucher type that does not post", () => {
  assert.equal(ACCOUNT_VOUCHER_TYPES.memo.prefix, "MV");
  assert.match(ACCOUNT_VOUCHER_TYPES.memo.printTitle, /NOT POSTED/);
  assert.equal(isMemoVoucher(memo), true);
  assert.equal(isMemoVoucher(journal), false);
});

test("ledger, trial balance, P&L and Balance Sheet are the same with or without the memo", () => {
  const without = buildGlobalLedger({ ...base, accountVouchers: [journal] }, { shopId: S });
  const withMemo = buildGlobalLedger({ ...base, accountVouchers: [journal, memo] }, { shopId: S });
  assert.deepEqual(withMemo.postings, without.postings);
  assert.equal(withMemo.postings.some((p) => p.docId === "m1"), false);
  assert.deepEqual(buildTrialBalance(withMemo, {}).totals, buildTrialBalance(without, {}).totals);
  assert.deepEqual([...journalPlByAccount([journal, memo], S, "", "").entries()], [["Office Rent", 300]], "only the journal is P&L");
  const sheet = (l) => buildBalanceSheet({ accounts: l.accounts, bal: balances(l.postings, "") });
  assert.deepEqual([sheet(withMemo).totalAssets, sheet(withMemo).totalLiabilities, sheet(withMemo).difference], [sheet(without).totalAssets, sheet(without).totalLiabilities, 0]);
});

test("bank reconciliation and the chart of accounts ignore memo lines", () => {
  const tx = collectBankTransactions({ vouchers: [journal, memo] }, S);
  assert.equal(tx.some((t) => String(t.id).startsWith("m1")), false);
  const chart = normalizeChart([], { expenseNames: [] });
  assert.deepEqual(missingFromVouchers(chart, [journal, memo]).map((a) => a.name), ["Office Rent"], "memo names are not added as accounts");
});

test("register lists the memo with its own filter, never in the total", () => {
  const include = { journal: true, contra: true, memo: true, receipt: false, payment: false };
  const reg = buildVoucherRegister({ accountVouchers: [journal, memo] }, { shopId: S, isOwner: true, include });
  assert.deepEqual(reg.rows.map((r) => [r.no, r.kind]), [["MV-0001", "memo"], ["JV-0001", "journal"]]);
  assert.deepEqual(reg.kpi.memo, { count: 1, amount: 5000 });
  assert.deepEqual(reg.total, { count: 1, amount: 300 }, "the memo is not part of the total");
  assert.deepEqual(buildVoucherRegister({ accountVouchers: [journal, memo] }, { shopId: S, isOwner: true, include, type: "memo" }).rows.map((r) => r.no), ["MV-0001"]);
  const csv = registerRows(reg);
  assert.equal(csv.find((r) => r[2] === "MV-0001")[1], "Memo (not posted)");
  assert.deepEqual(csv[csv.length - 1].slice(0, 2), ["Total (cancelled and memo left out)", "1 voucher(s)"]);
});
