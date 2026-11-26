import assert from "node:assert/strict";
import test from "node:test";
import {
  invoiceStatusLabel, settleStatusPatch, SETTLE_BY_RETURN, SETTLE_BY_WARRANTY,
} from "./invoiceSettleKind.js";

test("return-closed bill label is not Paid", () => {
  const statuses = { paid: { bn: "পরিশোধিত", en: "Paid" } };
  assert.equal(invoiceStatusLabel({ status: "paid", settleKind: SETTLE_BY_RETURN }, "en", statuses), "Settled by return");
  assert.equal(invoiceStatusLabel({ status: "paid", settleKind: SETTLE_BY_RETURN }, "bn", statuses), "রিটার্নে নিষ্পন্ন");
  assert.equal(invoiceStatusLabel({ status: "paid", settleKind: "" }, "en", statuses), "Paid");
  assert.equal(invoiceStatusLabel({ status: "paid" }, "en", statuses), "Paid");
});

test("warranty-closed bill label is not Paid", () => {
  const statuses = { paid: { bn: "পরিশোধিত", en: "Paid" } };
  assert.equal(invoiceStatusLabel({ status: "paid", settleKind: SETTLE_BY_WARRANTY }, "en", statuses), "Settled by warranty");
  assert.equal(invoiceStatusLabel({ status: "paid", settleKind: SETTLE_BY_WARRANTY }, "bn", statuses), "গ্যারান্টিতে নিষ্পন্ন");
});

test("settleStatusPatch marks return vs warranty vs cash close", () => {
  assert.deepEqual(settleStatusPatch(0, 100, { byReturn: true }), { status: "paid", settleKind: SETTLE_BY_RETURN });
  assert.deepEqual(settleStatusPatch(0, 100, { byWarranty: true }), { status: "paid", settleKind: SETTLE_BY_WARRANTY });
  assert.deepEqual(settleStatusPatch(0, 100, { byReturn: false }), { status: "paid", settleKind: "" });
  assert.deepEqual(settleStatusPatch(50, 50, {}), { status: "partial", settleKind: "" });
  assert.deepEqual(settleStatusPatch(100, 0, {}), { status: "confirmed", settleKind: "" });
});
