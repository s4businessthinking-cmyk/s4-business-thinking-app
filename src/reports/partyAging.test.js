import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { buildGlobalLedger, balances } from "../ledger/globalLedger.js";
import { AGE_BUCKETS, buildAging } from "./partyAging.js";

const S = "s1";
const sale = (id, date, total, paid = 0, extra = {}) => ({ id, shopId: S, status: paid >= total ? "paid" : paid ? "partial" : "confirmed", invoiceNo: id, invoiceDate: date, customerId: "c1", grandTotal: total, totalVat: 0, amountPaid: paid, paymentMethod: "cash", ...extra });
const data = {
  salesInvoices: [
    sale("SI-1", "2026-07-01", 100),
    sale("SI-2", "2026-09-10", 200),
    sale("SI-3", "2026-11-10", 300, 50),
    sale("SI-4", "2026-11-20", 40, 0, { customerId: "c2" }),
    sale("SI-D", "2026-11-20", 999, 0, { status: "draft" }),
    sale("SI-X", "2026-11-20", 999, 0, { status: "cancelled" }),
  ],
  // on-account receipt (no allocation): clears the oldest bills first
  receipts: [
    { id: "r1", shopId: S, status: "confirmed", receiptNo: "RV-1", receiptDate: "2026-11-15", customerId: "c1", method: "cash", totalAmount: 120 },
    { id: "r2", shopId: S, status: "confirmed", receiptNo: "RV-2", receiptDate: "2026-11-15", customerId: "c3", method: "cash", totalAmount: 75 },
  ],
  purchaseInvoices: [
    { id: "PI-1", shopId: S, status: "confirmed", invoiceNo: "PI-1", invoiceDate: "2026-08-01", vendorId: "v1", grandTotal: 500, totalTax: 0, amountPaid: 0, paymentMethod: "credit" },
    { id: "PI-2", shopId: S, status: "confirmed", invoiceNo: "PI-2", invoiceDate: "2026-11-01", vendorId: "v1", grandTotal: 250, totalTax: 0, amountPaid: 0, paymentMethod: "credit" },
  ],
  payments: [{ id: "p1", shopId: S, status: "confirmed", paymentNo: "PV-1", paymentDate: "2026-11-05", vendorId: "v1", method: "cash", totalAmount: 600 }],
};
const opts = {
  shopId: S,
  customers: [{ id: "c1", customerName: "Al Noor" }, { id: "c2", customerName: "Star" }, { id: "c3", customerName: "Prepaid" }],
  vendors: [{ id: "v1", vendorName: "Gulf" }],
};
const { postings, accounts } = buildGlobalLedger(data, opts);
const AS_OF = "2026-11-30";

test("buckets are the party ledger's outstanding buckets", () => {
  const src = readFileSync(fileURLToPath(new URL("../vouchers/PartyLedgerWindow.jsx", import.meta.url)), "utf8");
  const line = src.split(/\r?\n/).find((l) => l.startsWith("const AGE_BUCKETS"));
  assert.ok(line);
  // eslint-disable-next-line no-new-func
  assert.deepEqual(new Function(`return ${line.replace(/^const AGE_BUCKETS = /, "").replace(/;$/, "")}`)(), AGE_BUCKETS);
});

test("debtors: ledger balance aged first-in-first-out, drafts and cancelled left out", () => {
  const ag = buildAging(postings, accounts, { side: "customer", asOf: AS_OF });
  const c1 = ag.rows.find((r) => r.name === "Al Noor");
  // bills 100 + 200 + 300, paid 50 on SI-3 and 120 on account -> 430 due; SI-1 is cleared, SI-2 has 130 left
  assert.equal(c1.due, 430);
  assert.equal(c1.due, balances(postings, AS_OF).get(c1.key));
  // SI-3 (20 days): 300, SI-2 (81 days): 130
  assert.deepEqual(c1.buckets, [300, 0, 130, 0]);
  assert.equal(c1.oldestDays, 81);
  assert.equal(ag.rows.find((r) => r.name === "Star").buckets[0], 40);
  assert.deepEqual(ag.advances.map((a) => [a.name, a.amount]), [["Prepaid", 75]]);
  assert.equal(ag.totals.due, 470);
  assert.deepEqual(ag.totals.buckets, [340, 0, 130, 0]);
  assert.equal(ag.totals.advance, 75);
  assert.equal(ag.totals.net, 395);
  assert.equal(ag.totals.buckets.reduce((t, v) => t + v, 0), ag.totals.due);
});

test("creditors: payment clears the oldest purchase first", () => {
  const ag = buildAging(postings, accounts, { side: "vendor", asOf: AS_OF });
  assert.equal(ag.rows.length, 1);
  // 750 billed, 600 paid -> 150 due, all on PI-2 (29 days)
  assert.equal(ag.rows[0].due, 150);
  assert.deepEqual(ag.rows[0].buckets, [150, 0, 0, 0]);
  assert.equal(-balances(postings, AS_OF).get(ag.rows[0].key), 150);
});

test("as-at date drops later documents and ages from that date", () => {
  const ag = buildAging(postings, accounts, { side: "customer", asOf: "2026-10-31" });
  const c1 = ag.rows.find((r) => r.name === "Al Noor");
  // SI-1 (122 days) and SI-2 (51 days); nothing received yet
  assert.equal(c1.due, 300);
  assert.deepEqual(c1.buckets, [0, 200, 0, 100]);
  assert.equal(ag.advances.length, 0);
  const ven = buildAging(postings, accounts, { side: "vendor", asOf: "2026-10-31" });
  // PI-1 is 91 days old on 31 Oct
  assert.deepEqual(ven.rows[0].buckets, [0, 0, 0, 500]);
});
