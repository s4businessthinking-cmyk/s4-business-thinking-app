import test from "node:test";
import assert from "node:assert/strict";
import { serialLineProblems, serialProblemText, serialSettingsOf, splitSerials } from "./serialRules.js";
import { buildSerialRegistry } from "../reports/serialRegistry.js";

const products = [{ id: "ph", name: "Phone X", unit: "Pcs", trackSerial: true }, { id: "cb", name: "Cable", unit: "Pcs" }];
const line = (productId, qty, serialNo = "", name = productId) => ({ productId, name, qty, unit: "Pcs", serialNo });

test("settings are off by default", () => {
  assert.deepEqual(serialSettingsOf({}), { sales: false, purchase: false });
  assert.deepEqual(serialSettingsOf({ requireSerialOnSales: true }), { sales: true, purchase: false });
});

test("setting off: a bill without serials saves", () => {
  assert.deepEqual(serialLineProblems([line("ph", 2)], products, { required: false }), []);
});

test("setting on: a marked product needs one serial per unit; other products are never asked", () => {
  const missing = serialLineProblems([line("ph", 2, "", "Phone X"), line("cb", 5)], products, { required: true });
  assert.deepEqual(missing, [{ name: "Phone X", need: 2, have: 0, duplicate: "" }]);
  assert.match(serialProblemText(missing), /Phone X.*2 needed, 0 given/);
  assert.match(serialProblemText(missing, true), /Phone X/);
  assert.deepEqual(serialLineProblems([line("ph", 2, "IMEI-1", "Phone X")], products, { required: true }).map((p) => [p.need, p.have]), [[2, 1]], "one short");
  assert.deepEqual(serialLineProblems([line("ph", 2, "IMEI-1, IMEI-2")], products, { required: true }), [], "with serials it saves");
  assert.deepEqual(serialLineProblems([line("ph", 1, "35-111 222"), line("ph", 1, "35111222", "Phone X")], products, { required: true }).map((p) => p.duplicate), ["35111222"], "the same serial twice on a bill");
  assert.deepEqual(serialLineProblems([line("cb", 5)], products, { required: true }), [], "unmarked products: nothing required");
});

test("several serials on a line, each in the registry", () => {
  assert.deepEqual(splitSerials(" A1 ,B2;\nC3,, "), ["A1", "B2", "C3"]);
  const reg = buildSerialRegistry({
    products,
    salesInvoices: [{ id: "si1", shopId: "s", status: "paid", invoiceNo: "SI-1", invoiceDate: "2026-11-20", customerName: "Ali", items: [{ productId: "ph", name: "Phone X", qty: 2, serialNo: "IMEI-1, IMEI-2" }] }],
  }, { shopId: "s" });
  assert.deepEqual(reg.map((r) => [r.serial, r.status]).sort(), [["IMEI-1", "sale"], ["IMEI-2", "sale"]]);
});
