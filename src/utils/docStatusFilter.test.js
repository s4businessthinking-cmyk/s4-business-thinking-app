import test from "node:test";
import assert from "node:assert/strict";
import { LIVE, inDateRange, listSummary, matchesStatus, statusCounts } from "./docStatusFilter.js";

const docs = [
  { id: "a", status: "paid", invoiceDate: "2026-11-02", grandTotal: 105 },
  { id: "b", status: "partial", invoiceDate: "2026-11-10", grandTotal: "1,000.50" },
  { id: "c", status: "draft", invoiceDate: "2026-11-11", grandTotal: 40 },
  { id: "d", status: "cancelled", invoiceDate: "2026-10-30", grandTotal: 60 },
  { id: "e", status: "confirmed", invoiceDate: "2026-11-12", grandTotal: 999, source: "openingBalance" },
];

test("status filter: all, live (no draft / cancelled), exact", () => {
  assert.equal(docs.filter((d) => matchesStatus(d, "ALL")).length, 5);
  assert.deepEqual(docs.filter((d) => matchesStatus(d, LIVE)).map((d) => d.id), ["a", "b", "e"]);
  assert.deepEqual(docs.filter((d) => matchesStatus(d, "cancelled")).map((d) => d.id), ["d"]);
  assert.deepEqual(docs.filter((d) => matchesStatus(d, "draft")).map((d) => d.id), ["c"]);
  assert.equal(matchesStatus(docs[0], ""), true);
});

test("counts per status for the pills", () => {
  assert.deepEqual(statusCounts(docs), { ALL: 5, LIVE: 3, paid: 1, partial: 1, draft: 1, cancelled: 1, confirmed: 1 });
});

test("date range on the document date", () => {
  assert.deepEqual(docs.filter((d) => inDateRange(d, "invoiceDate", "2026-11-01", "2026-11-10")).map((d) => d.id), ["a", "b"]);
  assert.equal(docs.filter((d) => inDateRange(d, "invoiceDate", "", "")).length, 5);
});

test("summary: drafts and cancelled apart, opening balances out of the amount", () => {
  const s = listSummary(docs, { skip: (d) => d.source === "openingBalance" });
  assert.deepEqual(s, { count: 5, counted: 3, amount: 1105.5, draft: 1, draftAmount: 40, cancelled: 1, cancelledAmount: 60 });
  const onlyCancelled = listSummary(docs.filter((d) => matchesStatus(d, "cancelled")));
  assert.deepEqual([onlyCancelled.counted, onlyCancelled.amount, onlyCancelled.cancelledAmount], [0, 0, 60]);
});
