import test from "node:test";
import assert from "node:assert/strict";
import { NOT_DUE, NOT_SET, dueDateOf, filterPending, pendingCsvRows, pendingFileName, pendingRows, pendingSummary } from "./pendingBills.js";

const AS_OF = "2026-11-30";
const si = (id, extra) => ({ id, invoiceNo: id, shopId: "s1", status: "partial", customerName: "Al Noor", customerMobile: "0501", grandTotal: 100, amountPaid: 0, balanceDue: 100, ...extra });
const sales = [
  si("SI-1", { invoiceDate: "2026-11-01", dueDate: "2026-11-15" }),
  si("SI-2", { invoiceDate: "2026-09-01", creditDays: 30 }),
  si("SI-3", { invoiceDate: "2026-11-30" }),
  si("SI-4", { invoiceDate: "2026-11-25", dueDate: "2026-12-04", balanceDue: 40, amountPaid: 60 }),
  si("SI-5", { invoiceDate: "2026-11-20", dueDate: "2026-12-30" }),
  si("SI-6", { invoiceDate: "2026-06-01", dueDate: "2026-07-01", customerName: "Star Garage" }),
  si("SI-P", { invoiceDate: "2026-11-01", status: "paid", balanceDue: 0 }),
  si("SI-D", { invoiceDate: "2026-11-01", status: "draft" }),
  si("SI-X", { invoiceDate: "2026-11-01", status: "cancelled" }),
  si("QT-1", { invoiceDate: "2026-11-01", docKind: "quotation" }),
  si("DN-1", { invoiceDate: "2026-11-01", invoiceType: "delivery" }),
  si("OB-1", { invoiceDate: "2026-01-01", source: "openingBalance" }),
  si("NO-DATE", {}),
];

test("due date: saved, else bill date + credit days, else the bill date", () => {
  assert.deepEqual(dueDateOf({ dueDate: "2026-11-15", invoiceDate: "2026-11-01", creditDays: 99 }), { date: "2026-11-15", source: "saved" });
  assert.deepEqual(dueDateOf({ invoiceDate: "2026-09-01", creditDays: 30 }), { date: "2026-10-01", source: "terms" });
  assert.deepEqual(dueDateOf({ invoiceDate: "2026-11-30" }), { date: "2026-11-30", source: "billDate" });
  assert.deepEqual(dueDateOf({}), { date: "", source: "" });
});

test("only live money bills with something due; oldest due first", () => {
  const rows = pendingRows(sales, { kind: "sales", asOf: AS_OF });
  assert.deepEqual(rows.map((r) => r.inv.invoiceNo), ["SI-6", "SI-2", "SI-1", "SI-3", "SI-4", "SI-5", "NO-DATE"]);
  assert.deepEqual(rows.map((r) => [r.days, r.bucket]), [[152, "90+"], [60, "31-60"], [15, "0-30"], [0, "0-30"], [-4, NOT_DUE], [-30, NOT_DUE], [null, NOT_SET]]);
});

test("purchase: branch transfers and opening balances are left out", () => {
  const bills = [
    { id: "p1", invoiceNo: "PI-1", status: "confirmed", invoiceDate: "2026-11-01", creditDays: 10, balanceDue: 50, grandTotal: 50, vendorName: "Gulf" },
    { id: "p2", invoiceNo: "BT-1", status: "confirmed", invoiceDate: "2026-11-01", internalTransfer: true, balanceDue: 50 },
    { id: "p3", invoiceNo: "BT-2", status: "confirmed", invoiceDate: "2026-11-01", sourceType: "branch_transfer", balanceDue: 50 },
    { id: "p4", invoiceNo: "OB-1", status: "confirmed", invoiceDate: "2026-11-01", source: "openingBalance", balanceDue: 50 },
  ];
  const rows = pendingRows(bills, { kind: "purchase", asOf: AS_OF });
  assert.deepEqual(rows.map((r) => [r.inv.invoiceNo, r.due, r.days]), [["PI-1", "2026-11-11", 19]]);
});

test("filters: overdue, due today, due in 7 days, not due, bucket, search", () => {
  const rows = pendingRows(sales, { kind: "sales", asOf: AS_OF });
  const nos = (opts) => filterPending(rows, { partyOf: (i) => i.customerName, ...opts }).map((r) => r.inv.invoiceNo);
  assert.deepEqual(nos({ mode: "overdue" }), ["SI-6", "SI-2", "SI-1"]);
  assert.deepEqual(nos({ mode: "today" }), ["SI-3"]);
  assert.deepEqual(nos({ mode: "soon" }), ["SI-4"]);
  assert.deepEqual(nos({ mode: "notDue" }), ["SI-4", "SI-5"]);
  assert.deepEqual(nos({ bucket: "31-60" }), ["SI-2"]);
  assert.deepEqual(nos({ query: "star" }), ["SI-6"]);
  assert.equal(nos({}).length, 7);
});

test("summary per bucket and CSV rows", () => {
  const rows = pendingRows(sales, { kind: "sales", asOf: AS_OF });
  const s = pendingSummary(rows);
  assert.deepEqual([s.count, s.due, s.overdueCount, s.overdue, s.todayCount, s.soonCount], [7, 640, 3, 300, 1, 1]);
  assert.deepEqual(s.buckets["0-30"], { count: 2, amount: 200 });
  assert.deepEqual(s.buckets[NOT_DUE], { count: 2, amount: 140 });
  assert.deepEqual(s.buckets[NOT_SET], { count: 1, amount: 100 });
  const csv = pendingCsvRows(rows, { kind: "sales" });
  assert.equal(csv[0].join("|"), "Date|Invoice No|Party|Mobile|Due Date|Days|Bucket|Total|Paid|Due|Status");
  assert.deepEqual(csv[1], ["2026-06-01", "SI-6", "Star Garage", "0501", "2026-07-01", "152", "90+", "100.00", "0.00", "100.00", "partial"]);
  assert.deepEqual(csv[5].slice(5, 7), ["-4", "Not due"]);
  assert.deepEqual(csv[csv.length - 1].slice(9), ["640.00", "3 overdue (300.00)"]);
  assert.equal(pendingFileName("purchase", AS_OF), "pending-bills-purchase-2026-11-30.csv");
});
