import test from "node:test";
import assert from "node:assert/strict";
import { assertPeriodOpen, dayOf, periodLockBlock, setActivePeriodLock, withoutPeriodLock } from "./periodLock.js";

const lockDate = "2025-12-31";
const oldInv = { invoiceDate: "2025-12-20", items: [{ q: 1 }], grandTotal: 100, amountPaid: 0, balanceDue: 100, status: "confirmed" };
const newInv = { ...oldInv, invoiceDate: "2026-01-05" };

test("dayOf handles strings, dates and timestamps", () => {
  assert.equal(dayOf("2025-12-31T22:00:00Z"), "2025-12-31");
  assert.equal(dayOf("hello"), "");
  assert.equal(dayOf({ seconds: 0 }), "1970-01-01");
});

test("create, edit, cancel and delete inside the locked period are blocked", () => {
  const col = "salesInvoices";
  assert.equal(periodLockBlock({ collection: col, op: "create", after: oldInv, lockDate }), "2025-12-20");
  assert.equal(periodLockBlock({ collection: col, op: "create", after: { ...oldInv, invoiceDate: lockDate }, lockDate }), lockDate);
  assert.equal(periodLockBlock({ collection: col, op: "create", after: newInv, lockDate }), "");
  assert.ok(periodLockBlock({ collection: col, op: "update", before: oldInv, after: { ...oldInv, grandTotal: 90 }, lockDate }));
  assert.ok(periodLockBlock({ collection: col, op: "update", before: oldInv, after: { ...oldInv, status: "cancelled" }, lockDate }));
  assert.ok(periodLockBlock({ collection: col, op: "update", before: oldInv, after: { ...oldInv, invoiceDate: "2026-02-01" }, lockDate }));
  assert.ok(periodLockBlock({ collection: col, op: "update", before: newInv, after: { ...newInv, invoiceDate: "2025-11-01" }, lockDate }));
  assert.ok(periodLockBlock({ collection: col, op: "delete", before: oldInv, lockDate }));
});

test("payments on an old bill and unrelated collections stay open", () => {
  const paid = { ...oldInv, amountPaid: 100, balanceDue: 0, status: "paid", updatedAt: "2026-02-01" };
  assert.equal(periodLockBlock({ collection: "salesInvoices", op: "update", before: oldInv, after: paid, lockDate }), "");
  assert.equal(periodLockBlock({ collection: "products", op: "create", after: { date: "2020-01-01" }, lockDate }), "");
  assert.equal(periodLockBlock({ collection: "salesInvoices", op: "create", after: oldInv, lockDate: "" }), "");
  assert.ok(periodLockBlock({ collection: "partnerEntries", op: "create", after: { date: "2025-06-01" }, lockDate }));
});

test("active lock throws PERIOD_LOCKED unless bypassed", async () => {
  setActivePeriodLock(lockDate);
  try {
    assert.throws(() => assertPeriodOpen("expenses", "create", null, { expenseDate: "2025-10-01" }), (e) => e.code === "PERIOD_LOCKED");
    assert.doesNotThrow(() => assertPeriodOpen("expenses", "create", null, { expenseDate: "2026-01-10" }));
    await withoutPeriodLock(async () => {
      assert.doesNotThrow(() => assertPeriodOpen("expenses", "create", null, { expenseDate: "2025-10-01" }));
    });
  } finally {
    setActivePeriodLock("");
  }
});
