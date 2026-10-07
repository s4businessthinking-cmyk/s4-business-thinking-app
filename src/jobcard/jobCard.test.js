import test from "node:test";
import assert from "node:assert/strict";
import { jobSettingsOf, jobTotals, warrantyUntil, jobToInvoiceSource, statusOf } from "./jobCard.js";

test("settings fall back to defaults and always include system statuses", () => {
  const s = jobSettingsOf(null);
  assert.ok(s.statuses.length >= 4);
  assert.equal(statusOf(s, "invoiced").en, "Invoiced");
  const custom = jobSettingsOf({ jobCardSettings: { statuses: [{ key: "open", en: "Open" }, { key: "cancelled", en: "X" }] } });
  assert.deepEqual(custom.statuses.map((x) => x.key), ["open"]);
  assert.equal(statusOf(custom, "cancelled").en, "Cancelled");
});

test("jobTotals adds services, parts, VAT and subtracts the advance", () => {
  const t = jobTotals({
    services: [{ name: "Labour", qty: 2, charge: 50, vatPerc: 5 }],
    parts: [{ name: "Filter", qty: 1, unitPrice: 40, vatPerc: 5 }, { name: "Oil", qty: 4, unitPrice: 10, vatPerc: 0 }],
    advance: 20,
  });
  assert.deepEqual(t, { services: 100, parts: 80, sub: 180, vat: 7, total: 187, balance: 167 });
});

test("warranty starts from delivery and needs days", () => {
  assert.equal(warrantyUntil({ warrantyDays: 30, deliveredAt: "2026-01-15T10:00:00Z", completedAt: "2026-01-10" }), "2026-02-14");
  assert.equal(warrantyUntil({ warrantyDays: 7, completedAt: "2026-12-28" }), "2027-01-04");
  assert.equal(warrantyUntil({ warrantyDays: 0, deliveredAt: "2026-01-15" }), "");
  assert.equal(warrantyUntil({ warrantyDays: 7 }), "");
});

test("jobToInvoiceSource marks services and drops VAT when not registered", () => {
  const job = { id: "j1", jobNo: "JO-0001", customerName: "Ali", vehicleNo: "D 123", services: [{ name: "Repair", charge: 100, vatPerc: 5 }], parts: [{ productId: "p1", name: "Belt", qty: 1, unitPrice: 30, vatPerc: 5 }, { productId: "p2", name: "X", qty: 0 }] };
  const src = jobToInvoiceSource(job, { taxRegistered: false });
  assert.equal(src.docKind, "jobOrder");
  assert.equal(src.invoiceNo, "JO-0001");
  assert.equal(src.items.length, 2);
  assert.equal(src.items[0].productId, "p1");
  assert.equal(src.items[1].isService, true);
  assert.equal(src.items[1].qty, 1);
  assert.ok(src.items.every((i) => i.vatPerc === 0));
  assert.equal(src.invoiceType, "regular");
});
