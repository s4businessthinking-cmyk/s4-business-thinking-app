import assert from "node:assert/strict";
import test from "node:test";
import {
  canRecordCustomerSettle,
  claimCustomerSettleFields,
  customerSettleLabel,
  hasCustomerSettle,
  invoiceBalanceDue,
  validateCustomerSettle,
} from "./warrantyCustomerSettle.js";

const claim = {
  id: "w1", claimNo: "WC-0001", status: "sent",
  invoiceId: "si1", invoiceNo: "SI-1", customerName: "Ali",
};

test("customer settle labels", () => {
  assert.equal(customerSettleLabel("refund", false), "Refund to customer");
  assert.equal(customerSettleLabel("credit", true), "মূল বিল থেকে কেটে নিন");
  assert.equal(customerSettleLabel("", false), "No money");
});

test("has / can record settle once only", () => {
  assert.equal(canRecordCustomerSettle(claim), true);
  assert.equal(hasCustomerSettle(claim), false);
  const settled = { ...claim, customerSettleKind: "refund", customerSettleAmount: 50 };
  assert.equal(hasCustomerSettle(settled), true);
  assert.equal(canRecordCustomerSettle(settled), false);
  assert.equal(canRecordCustomerSettle({ ...claim, status: "cancelled" }), false);
});

test("validate refund needs amount + method", () => {
  assert.equal(validateCustomerSettle({ claim, kind: "refund", amount: 0, method: "cash" }), "AMOUNT");
  assert.equal(validateCustomerSettle({ claim, kind: "refund", amount: 10, method: "" }), "METHOD");
  assert.equal(validateCustomerSettle({ claim, kind: "refund", amount: 10, method: "cash" }), "");
});

test("validate credit needs linked bill with due room", () => {
  assert.equal(validateCustomerSettle({
    claim: { ...claim, invoiceId: null, invoiceNo: "" }, kind: "credit", amount: 10,
  }), "NO_INVOICE");
  assert.equal(validateCustomerSettle({
    claim, kind: "credit", amount: 10, invoice: null,
  }), "INVOICE_MISSING");
  const inv = { id: "si1", grandTotal: 100, amountPaid: 100, balanceDue: 0, status: "paid" };
  assert.equal(validateCustomerSettle({ claim, kind: "credit", amount: 10, invoice: inv }), "NO_DUE");
  const open = { id: "si1", grandTotal: 100, amountPaid: 40, balanceDue: 60, status: "partial" };
  assert.equal(validateCustomerSettle({ claim, kind: "credit", amount: 70, invoice: open }), "OVER");
  assert.equal(validateCustomerSettle({ claim, kind: "credit", amount: 60, invoice: open }), "");
});

test("invoiceBalanceDue prefers balanceDue then grand-paid", () => {
  assert.equal(invoiceBalanceDue({ grandTotal: 100, amountPaid: 30, balanceDue: 55 }), 55);
  assert.equal(invoiceBalanceDue({ grandTotal: 100, amountPaid: 30 }), 70);
});

test("claimCustomerSettleFields stores refund voucher links", () => {
  const f = claimCustomerSettleFields({
    kind: "refund", amount: 25.5, method: "cash", settleDate: "2026-11-26",
    voucher: { id: "r1", no: "RCT-0009", col: "salesReceipts" },
  });
  assert.equal(f.customerSettleKind, "refund");
  assert.equal(f.customerSettleAmount, 25.5);
  assert.equal(f.customerSettleMethod, "cash");
  assert.equal(f.customerRefundVoucherNo, "RCT-0009");
  assert.equal(f.customerRefundVoucherCol, "salesReceipts");
});

test("claimCustomerSettleFields credit clears method / voucher", () => {
  const f = claimCustomerSettleFields({
    kind: "credit", amount: 40, method: "cash", settleDate: "2026-11-26",
  });
  assert.equal(f.customerSettleKind, "credit");
  assert.equal(f.customerSettleMethod, "");
  assert.equal(f.customerRefundVoucherId, null);
});
