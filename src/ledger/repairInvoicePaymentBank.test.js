import assert from "node:assert/strict";
import test from "node:test";
import { invoiceNeedsPaymentBankRepair, paymentBankRepairPatch } from "./invoicePaymentBankRepair.js";

test("invoiceNeedsPaymentBankRepair flags paid bank bills without paymentBank", () => {
  assert.equal(invoiceNeedsPaymentBankRepair({ paymentMethod: "bank_transfer", amountPaid: 50 }), true);
  assert.equal(invoiceNeedsPaymentBankRepair({ paymentMethod: "cash", amountPaid: 50 }), false);
  assert.equal(invoiceNeedsPaymentBankRepair({ paymentMethod: "bank", amountPaid: 0 }), false);
  assert.equal(invoiceNeedsPaymentBankRepair({ paymentMethod: "card", amountPaid: 10, paymentBank: "FAB" }), false);
});

test("paymentBankRepairPatch uses shop branch bank", () => {
  assert.deepEqual(paymentBankRepairPatch({ isBranchCompanyFile: true, branchCode: "B2" }), {
    paymentBank: "Bank - B2",
  });
});