import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_LABEL_SETTINGS, applyPreset, buildLabelsHtml, labelSettingsOf, labelsPerPage, productBarcode, productMrp, productPrice } from "./labelLayout.js";

const oil = { id: "a", name: "Oil <Filter>", code: "OF1", barcode: "1234567890", vatInclusive: "12.5", mrp: "15" };
const noBar = { id: "b", name: "Pad", code: "BP-1", unitPrices: [{ unit: "Pcs", factor: 1, vatInclusive: "30", mrp: "35" }], unit: "Pcs" };

test("price, mrp and barcode fallbacks", () => {
  assert.equal(productPrice(oil), 12.5);
  assert.equal(productMrp(oil), 15);
  assert.equal(productPrice(noBar), 30);
  assert.equal(productMrp(noBar), 35);
  assert.equal(productBarcode(noBar, DEFAULT_LABEL_SETTINGS), "BP-1");
  assert.equal(productBarcode(noBar, { ...DEFAULT_LABEL_SETTINGS, useCodeIfNoBarcode: false }), "");
});

test("presets and per-page counts", () => {
  const s = applyPreset(DEFAULT_LABEL_SETTINGS, "a4_65");
  assert.equal(s.sheet, "a4");
  assert.equal(s.cols, 5);
  assert.equal(labelsPerPage(s), 65);
  assert.equal(labelsPerPage(applyPreset(s, "roll_2up_38x25")), 2);
  assert.deepEqual(labelSettingsOf({ labelSettings: { fields: { mrp: true } } }).fields.name, true);
});

test("html has one label per copy, pages and escaped names", () => {
  const roll = buildLabelsHtml({ items: [{ product: oil, copies: 3 }, { product: noBar, copies: 0 }], settings: DEFAULT_LABEL_SETTINGS, shopName: "S4 & Co" });
  assert.equal(roll.labels, 3);
  assert.equal(roll.pages, 3);
  assert.ok(roll.html.includes("Oil &lt;Filter&gt;"));
  assert.ok(roll.html.includes("S4 &amp; Co"));
  assert.ok(roll.html.includes("<svg"));
  assert.ok(roll.html.includes("size: 38mm 25mm"));
  const a4 = buildLabelsHtml({ items: [{ product: oil, copies: 70 }], settings: applyPreset(DEFAULT_LABEL_SETTINGS, "a4_65"), skip: 10 });
  assert.equal(a4.labels, 70);
  assert.equal(a4.pages, 2);
  assert.ok(a4.html.includes("size: 210mm 297mm"));
});
