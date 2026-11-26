import test from "node:test";
import assert from "node:assert/strict";
import {
  addDaysYmd, addMonthsYmd, buildWarrantyReminder, canAdvance, claimBatteryFields, claimInvoiceFields, claimInvoiceLabel,
  claimWarrantyPeriodFields, parseBatteryAh, productBatteryAh, productBatteryBrand, productWarrantyMonths,
  warrantyCandidateInvoices, warrantyOverdueAlerts, warrantyStockProductId, warrantyStockQty, warrantyWindow,
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

test("BW03: different replacement SKU still drives stock on replaced product", () => {
  assert.equal(warrantyStockProductId({ productId: "old-bat", replacedProductId: "new-bat", status: "replaced" }), "new-bat");
  assert.equal(warrantyStockQty({ status: "replaced", qty: 1, productId: "old-bat", replacedProductId: "new-bat" }), 1);
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

test("BW01: candidate invoices match product and optional customer", () => {
  const invoices = [
    { id: "si1", invoiceNo: "SI-1", invoiceDate: "2026-10-01", status: "paid", customerId: "c1", customerName: "Ali", items: [{ productId: "bat", qty: 1 }] },
    { id: "si2", invoiceNo: "SI-2", invoiceDate: "2026-11-01", status: "confirmed", customerId: "c2", customerName: "Bob", items: [{ productId: "bat", qty: 1 }] },
    { id: "si3", invoiceNo: "SI-3", invoiceDate: "2026-11-05", status: "paid", customerId: "c1", customerName: "Ali", items: [{ productId: "oil", qty: 1 }] },
    { id: "dn1", invoiceNo: "DN-1", invoiceDate: "2026-11-06", status: "confirmed", invoiceType: "delivery", items: [{ productId: "bat", qty: 1 }] },
    { id: "dr", invoiceNo: "SI-D", invoiceDate: "2026-11-07", status: "draft", items: [{ productId: "bat", qty: 1 }] },
  ];
  const all = warrantyCandidateInvoices({ invoices, productId: "bat" });
  assert.deepEqual(all.map((x) => x.invoiceNo), ["SI-2", "SI-1"]);
  const forAli = warrantyCandidateInvoices({ invoices, productId: "bat", customerId: "c1" });
  assert.deepEqual(forAli.map((x) => x.invoiceNo), ["SI-1"]);
  assert.equal(claimInvoiceLabel({ invoiceNo: "SI-1", invoiceDate: "2026-10-01" }, false), "Bill SI-1 · 01/10/2026");
  assert.deepEqual(claimInvoiceFields({ invoiceId: "si1", invoiceNo: "SI-1", invoiceDate: "2026-10-01T12:00:00Z" }), {
    invoiceId: "si1", invoiceNo: "SI-1", invoiceDate: "2026-10-01",
  });
  assert.deepEqual(claimInvoiceFields(null), { invoiceId: null, invoiceNo: "", invoiceDate: "" });
});

test("BW02: warranty window from sale date + months", () => {
  assert.equal(addMonthsYmd("2026-01-15", 12), "2027-01-15");
  assert.equal(productWarrantyMonths({}, "battery"), 12);
  assert.equal(productWarrantyMonths({ warrantyMonths: 24 }, "battery"), 24);
  const ok = warrantyWindow({ saleDate: "2026-01-01", claimDate: "2026-06-01", months: 12 });
  assert.equal(ok.end, "2027-01-01");
  assert.equal(ok.expired, false);
  const late = warrantyWindow({ saleDate: "2025-01-01", claimDate: "2026-06-01", months: 12 });
  assert.equal(late.end, "2026-01-01");
  assert.equal(late.expired, true);
  const fields = claimWarrantyPeriodFields({ saleDate: "2026-01-01", claimDate: "2026-02-01", months: 6 });
  assert.equal(fields.warrantyEndDate, "2026-07-01");
  assert.equal(fields.warrantyExpiredAtOpen, false);
});

test("BW11: parse Ah from name / product and brand", () => {
  assert.equal(parseBatteryAh("Battery 70Ah"), 70);
  assert.equal(parseBatteryAh("EXIDE 100 AH DIN"), 100);
  assert.equal(parseBatteryAh("no capacity"), null);
  assert.equal(productBatteryAh({ name: "Amaron 55Ah", brand: "Amaron" }), 55);
  assert.equal(productBatteryAh({ batteryAh: 65, name: "x" }), 65);
  assert.equal(productBatteryBrand({ brand: "Exide" }), "Exide");
  assert.equal(productBatteryBrand({ company: "Amaron" }), "Amaron");
  assert.deepEqual(claimBatteryFields({ ah: "70", brand: " Amaron " }), { batteryAh: 70, batteryBrand: "Amaron" });
  assert.deepEqual(claimBatteryFields({ ah: "", brand: "" }), { batteryAh: null, batteryBrand: "" });
});
