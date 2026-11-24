import test from "node:test";
import assert from "node:assert/strict";
import { buildVoucherRegister, registerFileName, registerRows, typeName } from "./voucherRegister.js";

const S = "s1";
const data = {
  accountVouchers: [
    { id: "j1", shopId: S, voucherType: "journal", voucherNo: "JV-1", voucherDate: "2026-11-03", status: "active", totalAmount: 500, createdBy: "u1", createdByName: "Rafiq", narration: "Rent accrual", refNo: "R-9",
      lines: [{ account: "Rent", debit: 500 }, { account: "Cash in Hand", credit: 500 }] },
    { id: "c1", shopId: S, voucherType: "contra", voucherNo: "CV-1", voucherDate: "2026-11-04", status: "active", totalAmount: 1000, createdBy: "u2", createdByName: "Karim", fromAccount: "Cash in Hand", toAccount: "Bank - ADCB" },
    { id: "j2", shopId: S, voucherType: "journal", voucherNo: "JV-2", voucherDate: "2026-11-05", status: "cancelled", totalAmount: 77, createdBy: "u1", lines: [] },
    { id: "j3", shopId: "other", voucherType: "journal", voucherNo: "JV-9", voucherDate: "2026-11-05", status: "active", totalAmount: 9, createdBy: "u1", lines: [] },
  ],
  receipts: [
    { id: "r1", shopId: S, receiptNo: "RV-1", receiptDate: "2026-11-06", status: "confirmed", customerName: "Al Noor", method: "cheque", chequeNo: "445", chequeBank: "ENBD", totalAmount: 300, allocations: [{ invoiceNo: "SI-10", amount: 300 }], createdByName: "Rafiq" },
    { id: "r2", shopId: S, receiptNo: "RV-2", receiptDate: "2026-11-07", status: "confirmed", customerName: "Star", method: "cash", totalAmount: 50, isRefund: true, returnNo: "SR-3" },
    { id: "r3", shopId: S, receiptNo: "RV-3", receiptDate: "2026-10-30", status: "confirmed", customerName: "Old", method: "cash", totalAmount: 999 },
  ],
  payments: [
    { id: "p1", shopId: S, paymentNo: "PV-1", paymentDate: "2026-11-08", status: "confirmed", vendorName: "Gulf", method: "cheque", totalAmount: 210, chequeAmount: 200, discountAmount: 10 },
    { id: "p2", shopId: S, paymentNo: "PV-2", paymentDate: "2026-11-09", status: "confirmed", vendorName: "Gulf", method: "cash", totalAmount: 100, discountAmount: 5 },
    { id: "p3", shopId: S, paymentNo: "PV-3", paymentDate: "2026-11-09", status: "cancelled", vendorName: "Gulf", method: "cash", totalAmount: 400 },
  ],
};
const ALL = { journal: true, contra: true, receipt: true, payment: true };
const NOV = { shopId: S, userId: "u1", isOwner: true, include: ALL, from: "2026-11-01", to: "2026-11-30" };

test("all four types, ledger amounts, cancelled left out of totals", () => {
  const reg = buildVoucherRegister(data, NOV);
  assert.deepEqual(reg.rows.map((r) => [r.no, r.amount]), [["PV-2", 95], ["PV-1", 200], ["RV-2", 50], ["RV-1", 300], ["CV-1", 1000], ["JV-1", 500]]);
  assert.deepEqual(reg.kpi.payment, { count: 2, amount: 295 });
  assert.deepEqual(reg.kpi.receipt, { count: 2, amount: 350 });
  assert.deepEqual(reg.total, { count: 6, amount: 2145 });
  assert.equal(reg.cancelled, 2);
});

test("particulars, party, reference, refund naming", () => {
  const reg = buildVoucherRegister(data, NOV);
  const r1 = reg.rows.find((r) => r.no === "RV-1");
  assert.equal(r1.particulars, "Al Noor · Bills SI-10");
  assert.equal(r1.ref, "Chq 445 ENBD");
  assert.equal(r1.chequeStatus, "pending");
  assert.equal(reg.rows.find((r) => r.no === "CV-1").particulars, "Cash in Hand → Bank - ADCB");
  assert.equal(reg.rows.find((r) => r.no === "JV-1").particulars, "Dr Rent / Cr Cash in Hand");
  assert.equal(typeName(reg.rows.find((r) => r.no === "RV-2")), "Refund to customer");
  assert.equal(typeName(reg.rows.find((r) => r.no === "PV-1")), "Payment");
});

test("filters: type, status, search, date; staff see only their own journals", () => {
  assert.deepEqual(buildVoucherRegister(data, { ...NOV, type: "contra" }).rows.map((r) => r.no), ["CV-1"]);
  assert.deepEqual(buildVoucherRegister(data, { ...NOV, status: "cancelled" }).rows.map((r) => r.no), ["PV-3", "JV-2"]);
  assert.equal(buildVoucherRegister(data, { ...NOV, status: "all" }).rows.length, 8);
  assert.deepEqual(buildVoucherRegister(data, { ...NOV, query: "si-10" }).rows.map((r) => r.no), ["RV-1"]);
  assert.deepEqual(buildVoucherRegister(data, { ...NOV, query: "rent" }).rows.map((r) => r.no), ["JV-1"]);
  assert.deepEqual(buildVoucherRegister(data, { ...NOV, from: "", to: "" }).rows.map((r) => r.no).slice(-1), ["RV-3"]);
  const staff = buildVoucherRegister(data, { ...NOV, isOwner: false, include: { journal: true, contra: true } });
  assert.deepEqual(staff.rows.map((r) => r.no), ["JV-1"]);
  assert.equal(buildVoucherRegister(data, { ...NOV, include: { receipt: true } }).rows.every((r) => r.kind === "receipt"), true);
});

test("CSV rows and file name", () => {
  const rows = registerRows(buildVoucherRegister(data, NOV));
  assert.equal(rows[0][2], "Voucher No");
  const pv1 = rows.find((r) => r[2] === "PV-1");
  assert.deepEqual([pv1[1], pv1[5], pv1[8], pv1[9]], ["Payment", "Cheque", "200.00", "Active (cheque pending)"]);
  assert.deepEqual(rows[rows.length - 1].slice(1, 2).concat(rows[rows.length - 1][8]), ["6 voucher(s)", "2145.00"]);
  assert.equal(registerFileName("journal", "2026-11-01", "2026-11-30"), "voucher-register-journal-2026-11-01-2026-11-30.csv");
  assert.equal(registerFileName("", "", ""), "voucher-register-all-start-today.csv");
});
