import test from "node:test";
import assert from "node:assert/strict";
import {
  addDaysYmd, buildWarrantyReminder, canAdvance, warrantyOverdueAlerts, warrantyStockProductId, warrantyStockQty,
} from "./warrantyClaim.js";

test("stock only counts while status is replaced", () => {
  assert.equal(warrantyStockQty({ status: "received", qty: 2 }), 0);
  assert.equal(warrantyStockQty({ status: "sent", qty: 2 }), 0);
  assert.equal(warrantyStockQty({ status: "replaced", qty: 2 }), 2);
  assert.equal(warrantyStockQty({ status: "replaced", qty: 0 }), 0);
  assert.equal(warrantyStockQty({ status: "delivered", qty: 2 }), 0);
  assert.equal(warrantyStockQty({ status: "cancelled", qty: 2 }), 0);
});

test("stock product prefers replacedProductId", () => {
  assert.equal(warrantyStockProductId({ productId: "a", replacedProductId: "b" }), "b");
  assert.equal(warrantyStockProductId({ productId: "a" }), "a");
});

test("status advances follow guarantee workflow", () => {
  assert.equal(canAdvance("received", "send"), true);
  assert.equal(canAdvance("received", "replace"), false);
  assert.equal(canAdvance("sent", "replace"), true);
  assert.equal(canAdvance("replaced", "deliver"), true);
  assert.equal(canAdvance("delivered", "cancel"), false);
});

test("reminder due date is sentDate + days", () => {
  assert.equal(addDaysYmd("2026-11-01", 15), "2026-11-16");
});

test("overdue alerts fire for sent claims past due", () => {
  const alerts = warrantyOverdueAlerts([
    { id: "1", status: "sent", claimNo: "WC-1", productName: "Battery", reminderDueDate: "2026-11-01", vendorName: "Co" },
    { id: "2", status: "sent", claimNo: "WC-2", productName: "X", reminderDueDate: "2026-12-01" },
    { id: "3", status: "replaced", claimNo: "WC-3", reminderDueDate: "2026-10-01" },
  ], "2026-11-06");
  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].claimNo, "WC-1");
  assert.equal(alerts[0].state, "overdue");
});

test("buildWarrantyReminder links claim for bell open", () => {
  const rem = buildWarrantyReminder({
    claim: { id: "c1", productName: "Battery 60A", vendorName: "ACDelco", customerName: "Karim" },
    claimNo: "WC-0007",
    dueDate: "2026-11-20",
    shopId: "s1",
    user: { uid: "u1" },
    profile: { personName: "Owner" },
  });
  assert.equal(rem.linkType, "warrantyClaim");
  assert.equal(rem.linkId, "c1");
  assert.equal(rem.dueDate, "2026-11-20");
  assert.match(rem.title, /WC-0007/);
  assert.match(rem.note, /Karim/);
});
