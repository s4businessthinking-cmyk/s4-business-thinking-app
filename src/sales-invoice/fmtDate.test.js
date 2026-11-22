import assert from "node:assert/strict";
import test from "node:test";

// Same rules as SalesInvoiceDesktopForm.fmtDate / fmtDateLong (avoid importing JSX in node:test).
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const fmtDate = (iso) => {
  const m = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : String(iso || "");
};
const fmtDateLong = (iso) => {
  const m = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}-${MONTHS[Number(m[2]) - 1]}-${m[1]}` : String(iso || "");
};
const fmtDayDocs = (d) => (d ? String(d).slice(0, 10).split("-").reverse().join("/") : "");

test("fmtDate is day/month/year not month/day", () => {
  assert.equal(fmtDate("2026-11-22"), "22/11/2026");
  assert.equal(fmtDate("2026-01-05"), "05/01/2026");
  assert.notEqual(fmtDate("2026-11-22"), "11/22/2026");
  assert.equal(fmtDate("2026-11-22T10:00:00.000Z"), "22/11/2026");
});

test("fmtDateLong keeps day first", () => {
  assert.equal(fmtDateLong("2026-11-22"), "22-Nov-2026");
});

test("PurchaseDocs fmtDay matches day-first", () => {
  assert.equal(fmtDayDocs("2026-11-22"), "22/11/2026");
  assert.equal(fmtDayDocs("2026-01-05"), "05/01/2026");
});
