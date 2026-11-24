import test from "node:test";
import assert from "node:assert/strict";
import { buildGlobalLedger, balances } from "../ledger/globalLedger.js";
import { mergePlan, splitCandidates, splitPlan } from "./partyMerge.js";
import { normalizeAdjustments, normalizeAllowances, reasonsFor, saveMasterRow, savedAllowances } from "./simpleMasters.js";

const S = "s1";
const A = { id: "a", customerName: "Ali Garage", customerCode: "C001", mobileNumber: "", loyaltyMember: false };
const B = { id: "b", customerName: "Ali Garage LLC", customerCode: "C009", mobileNumber: "0501112222", email: "ali@x.ae", loyaltyMember: true, loyaltyNo: "M-9", loyaltySince: "2026-01-01" };
const data = () => ({
  salesInvoices: [
    { id: "i1", shopId: S, invoiceNo: "SI-1", invoiceDate: "2026-11-01", status: "partial", customerId: "b", customerName: "Ali Garage LLC", grandTotal: 100, totalVat: 0, amountPaid: 0 },
    { id: "i2", shopId: S, invoiceNo: "SI-2", invoiceDate: "2026-11-02", status: "confirmed", customerId: "b", customerName: "Ali Garage LLC", grandTotal: 50, totalVat: 0, amountPaid: 0 },
    { id: "i3", shopId: S, invoiceNo: "SI-3", invoiceDate: "2026-11-03", status: "confirmed", customerId: null, customerName: "ali garage llc", grandTotal: 30, totalVat: 0, amountPaid: 0 },
    { id: "i4", shopId: S, invoiceNo: "SI-4", invoiceDate: "2026-11-03", status: "confirmed", customerId: "a", customerName: "Ali Garage", grandTotal: 10, totalVat: 0, amountPaid: 0 },
    { id: "ob", shopId: S, invoiceNo: "OB-1", invoiceDate: "2026-01-01", status: "confirmed", source: "openingBalance", customerId: "b", customerName: "Ali Garage LLC", grandTotal: 500, totalVat: 0, amountPaid: 0 },
  ],
  salesReceipts: [
    { id: "r1", shopId: S, receiptNo: "RV-1", receiptDate: "2026-11-04", customerId: "b", customerName: "Ali Garage LLC", method: "cash", totalAmount: 60, allocations: [{ invoiceId: "i1", amount: 40 }, { invoiceId: "i2", amount: 20 }] },
    { id: "r2", shopId: S, receiptNo: "RV-2", receiptDate: "2026-11-04", customerId: "b", customerName: "Ali Garage LLC", method: "cash", totalAmount: 5, allocations: [] },
  ],
  salesReturns: [{ id: "sr1", shopId: S, returnNo: "SR-1", returnDate: "2026-11-05", invoiceId: "i2", partyId: "b", partyName: "Ali Garage LLC", total: 10, totalVat: 0, status: "confirmed" }],
  quotations: [{ id: "q1", shopId: S, invoiceNo: "QT-1", customerId: "b", customerName: "Ali Garage LLC" }],
  securityCheques: [{ id: "sc1", partyType: "customer", partyId: "b", partyName: "Ali Garage LLC" }, { id: "sc2", partyType: "vendor", partyId: "b", partyName: "X" }],
  accountVouchers: [{ id: "j1", shopId: S, voucherType: "journal", voucherNo: "JV-1", voucherDate: "2026-11-06", totalAmount: 7, lines: [{ account: "Ali Garage LLC", debit: 7 }, { account: "Sales", credit: 7 }] }],
});
const apply = (d, changes) => {
  const out = JSON.parse(JSON.stringify(d));
  changes.forEach((c) => { const doc = out[c.col].find((x) => x.id === c.id); Object.assign(doc, c.patch); });
  return out;
};

test("merge: every document of the source moves, survivor keeps its name and gets empty fields and loyalty", () => {
  const plan = mergePlan("customer", B, A, data(), { now: new Date("2026-11-24T10:00:00Z"), by: "u1" });
  assert.deepEqual(plan.blockers, []);
  assert.deepEqual(plan.counts, { salesInvoices: 4, quotations: 1, salesReceipts: 2, salesReturns: 1, securityCheques: 1, accountVouchers: 1 });
  assert.equal(plan.changes.some((c) => c.id === "sc2"), false, "a supplier security cheque stays");
  const i3 = plan.changes.find((c) => c.id === "i3");
  assert.deepEqual(i3.patch, { customerId: "a", customerName: "Ali Garage", customerCode: "C001" });
  assert.equal(plan.changes.find((c) => c.id === "sr1").patch.partyId, "a");
  assert.deepEqual(plan.changes.find((c) => c.id === "j1").patch.lines[0], { account: "Ali Garage", debit: 7 });
  assert.deepEqual(plan.targetPatch, { mobileNumber: "0501112222", email: "ali@x.ae", loyaltyMember: true, loyaltyNo: "M-9", loyaltySince: "2026-01-01" });
  assert.deepEqual([plan.sourcePatch.status, plan.sourcePatch.mergedInto, plan.sourcePatch.mergedBy], ["inactive", "a", "u1"]);
});

test("merge: ledger balance of the survivor = both balances, total unchanged", () => {
  const d = data();
  const customers = [A, B];
  const before = balances(buildGlobalLedger(d, { shopId: S, customers }).postings, "");
  const plan = mergePlan("customer", B, A, d);
  const merged = apply(d, plan.changes);
  const after = balances(buildGlobalLedger(merged, { shopId: S, customers: [A, { ...B, ...plan.sourcePatch }] }).postings, "");
  const sumOf = (m, keys) => keys.reduce((t, k) => t + (m.get(k) || 0), 0);
  const expected = sumOf(before, ["c:a", "c:b"]);
  assert.ok(Math.abs((after.get("c:a") || 0) - expected) < 0.005);
  assert.ok(Math.abs(after.get("c:b") || 0) < 0.005);
  assert.ok(Math.abs([...after.values()].reduce((t, v) => t + v, 0) - [...before.values()].reduce((t, v) => t + v, 0)) < 0.005);
});

test("merge blockers: same, already merged, both-sides link, two opening balances, closed period", () => {
  assert.ok(mergePlan("customer", A, A, data()).blockers.includes("same"));
  assert.ok(mergePlan("customer", { ...B, mergedInto: "z" }, A, data()).blockers.includes("merged"));
  assert.ok(mergePlan("customer", { ...B, linkedVendorId: "v1" }, A, data()).blockers.includes("linked"));
  const d = data();
  d.salesInvoices.push({ id: "ob2", invoiceNo: "OB-2", invoiceDate: "2026-01-01", status: "confirmed", source: "openingBalance", customerId: "a", customerName: "Ali Garage", grandTotal: 5 });
  assert.ok(mergePlan("customer", B, A, d).blockers.includes("bothOpening"));
  assert.ok(mergePlan("customer", B, A, data(), { lockDate: "2026-11-02" }).blockers.includes("locked"));
  assert.equal(mergePlan("customer", B, A, data(), { lockDate: "2025-12-31" }).blockers.length, 0);
  assert.deepEqual(mergePlan("customer", null, A, data()).blockers, ["missing"]);
});

test("vendor merge uses the purchase side", () => {
  const V1 = { id: "v1", vendorName: "Gulf Parts", vendorCode: "V1" }, V2 = { id: "v2", vendorName: "Gulf Parts Co", vendorCode: "V2" };
  const d = { purchaseInvoices: [{ id: "p1", invoiceDate: "2026-11-01", status: "confirmed", vendorId: "v2", vendorName: "Gulf Parts Co" }],
    purchasePayments: [{ id: "pp1", paymentDate: "2026-11-02", vendorId: "v2", vendorName: "Gulf Parts Co", allocations: [{ invoiceId: "p1" }] }],
    purchaseReturns: [{ id: "pr1", partyId: "v2", partyName: "Gulf Parts Co", invoiceId: "p1" }], securityCheques: [{ id: "sc", partyType: "vendor", partyId: "v2" }] };
  const plan = mergePlan("vendor", V2, V1, d);
  assert.deepEqual(plan.counts, { purchaseInvoices: 1, purchasePayments: 1, purchaseReturns: 1, securityCheques: 1 });
  assert.deepEqual(plan.changes[0].patch, { vendorId: "v1", vendorName: "Gulf Parts", vendorCode: "V1" });
});

test("split: chosen bills move with their own receipts and returns; a shared receipt blocks; opening never", () => {
  const d = data();
  const cand = splitCandidates("customer", B, d);
  assert.deepEqual(cand.bills.map((b) => b.id).sort(), ["i1", "i2", "i3"]);
  const shared = splitPlan("customer", B, A, d, ["i1"]);
  assert.deepEqual([shared.blockers, shared.shared.map((r) => r.id)], [["sharedMoney"], ["r1"]]);
  const ok = splitPlan("customer", B, A, d, ["i1", "i2"]);
  assert.deepEqual(ok.blockers, []);
  assert.deepEqual(ok.counts, { salesInvoices: 2, salesReceipts: 1, salesReturns: 1 });
  assert.equal(ok.changes.some((c) => c.id === "r2"), false, "an on-account receipt stays");
  assert.ok(splitPlan("customer", B, A, d, ["ob"]).blockers.includes("opening"));
  assert.ok(splitPlan("customer", B, A, d, []).blockers.includes("none"));
  assert.ok(splitPlan("customer", B, B, d, ["i3"]).blockers.includes("same"));
  assert.ok(splitPlan("customer", B, A, d, ["i3"], { lockDate: "2026-11-30" }).blockers.includes("locked"));
  const moved = apply(d, ok.changes);
  const bal = balances(buildGlobalLedger(moved, { shopId: S, customers: [A, B] }).postings, "");
  const before = balances(buildGlobalLedger(d, { shopId: S, customers: [A, B] }).postings, "");
  assert.ok(Math.abs((bal.get("c:a") || 0) + (bal.get("c:b") || 0) - (before.get("c:a") || 0) - (before.get("c:b") || 0)) < 0.005);
});

test("allowance and adjustment masters", () => {
  const al = normalizeAllowances([]);
  assert.deepEqual(al.map((a) => a.field), ["housingAllowance", "transportAllowance", "foodAllowance", "otherAllowance"]);
  assert.equal(saveMasterRow(al, { ...al[0], active: false }).error, "system");
  const renamed = saveMasterRow(al, { ...al[0], nameEn: "House rent" });
  assert.equal(normalizeAllowances(savedAllowances(renamed.list))[0].nameEn, "House rent");
  assert.equal(saveMasterRow(al, { nameEn: "transport" }).error, "duplicate");
  assert.equal(saveMasterRow(al, { nameEn: "Mobile", code: "al01" }).error, "duplicateCode");
  const added = saveMasterRow(al, { nameEn: "Mobile", nameBn: "মোবাইল", code: "AL09" });
  assert.equal(normalizeAllowances(savedAllowances(added.list)).length, 5);
  assert.equal(saveMasterRow(al, { nameEn: "", nameBn: "" }).error, "name");
  const adj = normalizeAdjustments([]);
  assert.equal(adj.length, 4);
  assert.deepEqual(reasonsFor(adj, "purchase").map((a) => a.id), ["adj_round", "adj_freight", "adj_rate"]);
  const off = saveMasterRow(adj, { ...adj[0], active: false });
  assert.equal(reasonsFor(off.list, "sales").some((a) => a.id === "adj_round"), false);
  assert.equal(normalizeAdjustments([{ nameEn: "X", side: "weird" }])[0].side, "both");
});
