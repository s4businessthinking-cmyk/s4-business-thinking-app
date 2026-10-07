import test from "node:test";
import assert from "node:assert/strict";
import { daysInMonth, hoursBetween, marksByDate, summarizeMonth, payableFor } from "./attendance.js";

test("daysInMonth handles leap years", () => {
  assert.equal(daysInMonth("2024-02"), 29);
  assert.equal(daysInMonth("2026-02"), 28);
  assert.equal(daysInMonth("2026-10"), 31);
  assert.equal(daysInMonth(""), 0);
});

test("hoursBetween supports overnight shifts", () => {
  assert.equal(hoursBetween("09:00", "18:30"), 9.5);
  assert.equal(hoursBetween("22:00", "06:00"), 8);
  assert.equal(hoursBetween("", "06:00"), 0);
});

test("summarizeMonth counts statuses and respects join date", () => {
  const docs = [
    { shopId: "s1", date: "2026-02-01", marks: { e1: { s: "P", ot: "2" }, e2: { s: "P" } } },
    { shopId: "s1", date: "2026-02-02", marks: { e1: { s: "A" } } },
    { shopId: "s1", date: "2026-02-03", marks: { e1: { s: "HD" } } },
    { shopId: "s1", date: "2026-02-04", marks: { e1: { s: "H" } }, updatedAt: "1" },
    { shopId: "s1", date: "2026-02-04", marks: { e1: { s: "L" } }, updatedAt: "2" },
    { shopId: "x", date: "2026-02-05", marks: { e1: { s: "P" } } },
  ];
  const byDate = marksByDate(docs, "s1");
  const s = summarizeMonth(byDate, "e1", "2026-02");
  assert.equal(s.P, 1); assert.equal(s.A, 1); assert.equal(s.HD, 1); assert.equal(s.L, 1); assert.equal(s.H, 0);
  assert.equal(s.paidDays, 2.5);
  assert.equal(s.otHours, 2);
  assert.equal(s.days, 28);
  assert.equal(s.unmarked, 24);
  const joined = summarizeMonth(byDate, "e2", "2026-02", "2026-02-10");
  assert.equal(joined.days, 19);
  assert.equal(joined.P, 0);
});

test("payableFor pro-rates salary and adds overtime", () => {
  const p = payableFor({ salary: 2800, otRate: 10 }, { paidDays: 14, otHours: 3 }, "2026-02");
  assert.deepEqual(p, { basic: 1400, ot: 30, total: 1430 });
});
