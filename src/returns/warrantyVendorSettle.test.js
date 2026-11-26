import assert from "node:assert/strict";
import test from "node:test";
import {
  canRecordVendorSettle,
  claimVendorSettleFields,
  hasVendorSettle,
  purchaseBalanceDue,
  validateVendorSettle,
  vendorOpenPurchaseBills,
  vendorSettleLabel,
} from "./warrantyVendorSettle.js";

const claim = {
  id: "w1", claimNo: "WC-0001", status: "replaced",
  vendorId: "v1", vendorName: "Amaron",
};

test("vendor settle labels", () => {
  assert.equal(vendorSettleLabel("receive", false), "Receive from company");
  assert.equal(vendorSettleLabel("debit", true), "কোম্পানির বিল থেকে কেটে নিন");
});

test("has / can record vendor settle once", () => {
  assert.equal(canRecordVendorSettle(claim), true);
  const settled = { ...claim, vendorSettleKind: "receive", vendorSettleAmount: 80 };
  assert.equal(hasVendorSettle(settled), true);
  assert.equal(canRecordVendorSettle(settled), false);
});

test("validate receive needs method", () => {
  assert.equal(validateVendorSettle({ claim, kind: "receive", amount: 10, method: "" }), "METHOD");
  assert.equal(validateVendorSettle({ claim, kind: "receive", amount: 10, method: "cash" }), "");
});

test("validate debit needs open PI room", () => {
  assert.equal(validateVendorSettle({ claim, kind: "debit", amount: 10, invoice: null }), "INVOICE_MISSING");
  const open = { id: "pi1", vendorId: "v1", status: "partial", grandTotal: 200, amountPaid: 50, balanceDue: 150 };
  assert.equal(validateVendorSettle({ claim, kind: "debit", amount: 160, invoice: open }), "OVER");
  assert.equal(validateVendorSettle({ claim, kind: "debit", amount: 150, invoice: open }), "");
  assert.equal(validateVendorSettle({
    claim, kind: "debit", amount: 10,
    invoice: { ...open, vendorId: "other" },
  }), "WRONG_VENDOR");
});

test("vendorOpenPurchaseBills lists due bills for vendor", () => {
  const list = vendorOpenPurchaseBills({
    vendorId: "v1",
    invoices: [
      { id: "a", vendorId: "v1", status: "confirmed", invoiceNo: "PI-1", invoiceDate: "2026-01-02", grandTotal: 100, amountPaid: 0 },
      { id: "b", vendorId: "v1", status: "paid", invoiceNo: "PI-2", invoiceDate: "2026-01-01", grandTotal: 50, amountPaid: 50 },
      { id: "c", vendorId: "v2", status: "confirmed", invoiceNo: "PI-3", invoiceDate: "2026-01-01", grandTotal: 90, amountPaid: 0 },
      { id: "d", vendorId: "v1", status: "partial", invoiceNo: "PI-0", invoiceDate: "2026-01-01", grandTotal: 80, amountPaid: 20, balanceDue: 60 },
    ],
  });
  assert.deepEqual(list.map((x) => x.invoiceNo), ["PI-0", "PI-1"]);
  assert.equal(list[0].balanceDue, 60);
});

test("purchaseBalanceDue", () => {
  assert.equal(purchaseBalanceDue({ grandTotal: 100, amountPaid: 40, balanceDue: 55 }), 55);
  assert.equal(purchaseBalanceDue({ grandTotal: 100, amountPaid: 40 }), 60);
});

test("claimVendorSettleFields", () => {
  const f = claimVendorSettleFields({
    kind: "debit", amount: 33, method: "cash", settleDate: "2026-11-26",
    invoice: { id: "pi9", invoiceNo: "PI-9" },
  });
  assert.equal(f.vendorSettleKind, "debit");
  assert.equal(f.vendorSettleMethod, "");
  assert.equal(f.vendorDebitInvoiceNo, "PI-9");
  assert.equal(f.vendorReceiveVoucherId, null);
});
