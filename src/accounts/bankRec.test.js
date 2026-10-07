import test from "node:test";
import assert from "node:assert/strict";
import { collectBankTransactions, reconcile } from "./bankRec.js";

const data = {
  salesInvoices: [
    { id: "s1", shopId: "A", status: "confirmed", paymentMethod: "bank", amountPaid: 500, invoiceDate: "2026-10-01", invoiceNo: "SI-1" },
    { id: "s2", shopId: "A", status: "confirmed", paymentMethod: "cash", amountPaid: 300, invoiceDate: "2026-10-01" },
    { id: "s3", shopId: "A", status: "cancelled", paymentMethod: "bank", amountPaid: 900, invoiceDate: "2026-10-01" },
    { id: "s4", shopId: "A", status: "confirmed", paymentMethod: "bank", amountPaid: 400, invoiceDate: "2026-10-02" },
  ],
  receipts: [
    { id: "r1", shopId: "A", method: "cheque", totalAmount: 1000, receiptDate: "2026-10-02", chequeDate: "2026-10-05", chequeStatus: "pending" },
    { id: "r2", shopId: "A", method: "cheque", totalAmount: 50, receiptDate: "2026-10-02", chequeDate: "2026-10-03", chequeStatus: "bounced" },
    { id: "r3", shopId: "A", method: "bank_transfer", totalAmount: 100, receiptDate: "2026-10-03", allocations: [{ invoiceId: "s4", amount: 100 }] },
  ],
  payments: [
    { id: "p1", shopId: "A", method: "cheque", totalAmount: 700, paymentDate: "2026-10-02", chequeDate: "2026-10-04", chequeStatus: "cleared", clearedAt: "2026-10-04T10:00:00Z" },
  ],
  expenses: [{ id: "e1", shopId: "A", status: "active", method: "card", amount: 80, expenseDate: "2026-10-03" }],
  bankEntries: [{ id: "b1", shopId: "A", direction: "out", amount: 5, date: "2026-10-06", entryType: "charge" }],
};

test("collects only bank/card/cheque money and skips bounced or cancelled", () => {
  const tx = collectBankTransactions(data, "A");
  const keys = tx.map((t) => t.key);
  assert.deepEqual(keys.sort(), ["bankReconciliations:b1", "expenses:e1", "purchasePayments:p1", "salesInvoices:s1", "salesInvoices:s4", "salesReceipts:r1", "salesReceipts:r3"].sort());
  assert.equal(tx.find((t) => t.key === "salesInvoices:s4").amount, 300);
  assert.equal(tx.find((t) => t.key === "salesReceipts:r1").date, "2026-10-05");
  assert.equal(tx.find((t) => t.key === "purchasePayments:p1").autoClearedDate, "2026-10-04");
});

test("reconcile splits cleared and uncleared items", () => {
  const tx = collectBankTransactions(data, "A");
  const marks = new Map([["salesInvoices:s1", "2026-10-01"], ["expenses:e1", "2026-10-04"]]);
  const rec = reconcile(tx, marks, { opening: 1000, asOf: "2026-10-31", statementBalance: 715 });
  assert.equal(rec.bookBalance, 1000 + 500 + 300 + 1000 + 100 - 700 - 80 - 5);
  assert.equal(rec.bankBalance, 1000 + 500 - 700 - 80 - 5);
  assert.equal(rec.unclearedInTotal, 300 + 1000 + 100);
  assert.equal(rec.unclearedOutTotal, 0);
  assert.equal(rec.difference, 715 - 715);
  assert.equal(rec.bookBalance - rec.unclearedInTotal + rec.unclearedOutTotal, rec.bankBalance);
});

test("bank refunds on returns and bank lines of journal / contra vouchers are included", () => {
  const tx = collectBankTransactions({
    salesReturns: [{ id: "sr1", shopId: "A", status: "active", refundAmount: 120, refundMethod: "bank_transfer", returnDate: "2026-10-04", returnNo: "SR-1" },
      { id: "sr2", shopId: "A", status: "active", refundAmount: 60, refundMethod: "cash", returnDate: "2026-10-04" }],
    purchaseReturns: [{ id: "pr1", shopId: "A", status: "cancelled", refundAmount: 90, refundMethod: "cheque", returnDate: "2026-10-04" },
      { id: "pr2", shopId: "A", status: "active", refundAmount: 40, refundMethod: "card", returnDate: "2026-10-05", returnNo: "PR-2" }],
    vouchers: [
      { id: "v1", shopId: "A", voucherType: "contra", voucherNo: "CV-1", voucherDate: "2026-10-06", lines: [{ account: "Bank - ENBD", debit: 2000, credit: 0 }, { account: "Cash in Hand", debit: 0, credit: 2000 }] },
      { id: "v2", shopId: "A", voucherType: "journal", voucherNo: "JV-1", voucherDate: "2026-10-07", lines: [{ account: "Rent", debit: 500, credit: 0 }, { account: "Bank - ENBD", debit: 0, credit: 500 }] },
      { id: "v3", shopId: "A", status: "cancelled", voucherNo: "CV-2", voucherDate: "2026-10-07", lines: [{ account: "Bank", debit: 9, credit: 0 }, { account: "Cash in Hand", debit: 0, credit: 9 }] },
      { id: "v4", shopId: "A", voucherNo: "JV-2", voucherDate: "2026-10-07", lines: [{ account: "Capital", debit: 0, credit: 100 }, { account: "Cash in Hand", debit: 100, credit: 0 }] },
    ],
  }, "A");
  const by = Object.fromEntries(tx.map((t) => [t.key, t]));
  assert.deepEqual(Object.keys(by).sort(), ["accountVouchers:v1:0", "accountVouchers:v2:1", "purchaseReturns:pr2", "salesReturns:sr1"]);
  assert.equal(by["salesReturns:sr1"].dir, "out");
  assert.equal(by["purchaseReturns:pr2"].dir, "in");
  assert.equal(by["accountVouchers:v1:0"].dir, "in");
  assert.equal(by["accountVouchers:v1:0"].party, "Cash in Hand");
  assert.equal(by["accountVouchers:v2:1"].dir, "out");
  assert.equal(by["accountVouchers:v2:1"].amount, 500);
});

test("partner money through the bank is included; cash, reinvest and profit shares are not", () => {
  const tx = collectBankTransactions({
    partnerEntries: [
      { id: "pe1", shopId: "A", status: "active", kind: "capitalIn", method: "bank_transfer", amount: 10000, date: "2026-10-01", partnerName: "Karim" },
      { id: "pe2", shopId: "A", status: "active", kind: "payout", method: "cheque", amount: 900, date: "2026-10-05", partnerName: "Karim" },
      { id: "pe3", shopId: "A", status: "active", kind: "drawing", method: "cash", amount: 50, date: "2026-10-05" },
      { id: "pe4", shopId: "A", status: "active", kind: "reinvest", amount: 70, date: "2026-10-05" },
      { id: "pe5", shopId: "A", status: "cancelled", kind: "capitalOut", method: "card", amount: 30, date: "2026-10-05" },
      { id: "pe6", shopId: "A", status: "active", kind: "distribution", allocations: [], periodTo: "2026-09-30" },
    ],
  }, "A");
  assert.deepEqual(tx.map((t) => [t.key, t.dir, t.amount]), [["partnerEntries:pe1", "in", 10000], ["partnerEntries:pe2", "out", 900]]);
});

test("items cleared after the as-of date stay uncleared", () => {
  const tx = collectBankTransactions(data, "A");
  const rec = reconcile(tx, new Map([["expenses:e1", "2026-10-09"]]), { opening: 0, asOf: "2026-10-06" });
  assert.ok(rec.unclearedOut.some((t) => t.key === "expenses:e1"));
  assert.equal(rec.difference, null);
});
