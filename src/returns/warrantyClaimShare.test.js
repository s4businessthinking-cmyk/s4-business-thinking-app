import assert from "node:assert/strict";
import test from "node:test";
import { warrantyClaimShareExtra, warrantyClaimSharePhone } from "./warrantyClaimShare.js";

test("share extra lists product, serials and status", () => {
  const extra = warrantyClaimShareExtra({
    productName: "Battery 70Ah", productCode: "BAT-70", qty: 1,
    serialNo: "OUT-1", replacedSerialNo: "IN-2",
    status: "sent", reason: "battery",
    invoiceNo: "SI-9", invoiceDate: "2026-01-15", invoiceId: "x",
  }, false);
  assert.match(extra, /Battery 70Ah/);
  assert.match(extra, /OUT-1/);
  assert.match(extra, /IN-2/);
  assert.match(extra, /Sent to company/);
  assert.match(extra, /SI-9/);
});

test("share phone prefers customer mobile", () => {
  assert.equal(warrantyClaimSharePhone({ customerMobile: "0501234567" }), "0501234567");
  assert.equal(warrantyClaimSharePhone({}), "");
});

test("share serial-in falls back to serial-out when blank=same", () => {
  const extra = warrantyClaimShareExtra({
    productName: "Bat", qty: 1, serialNo: "OUT-9", status: "replaced", reason: "battery",
  }, false);
  assert.match(extra, /Serial in: OUT-9/);
});
