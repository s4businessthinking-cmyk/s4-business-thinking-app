import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isStale, alertsFor, securityChequeAlerts, validateSecurityCheque, emptySecurityCheque, liveSecurityCheques,
  openInvoicesFor, outstandingBalanceFor,
} from "./securityCheque.js";

test("isStale: true once reminderMonths have passed since lastTxn, only while held", () => {
  const r = { status: "held", lastTxn: "2026-01-01", reminderMonths: 3 };
  assert.equal(isStale(r, "2026-03-31"), false);
  assert.equal(isStale(r, "2026-04-01"), true);
  assert.equal(isStale({ ...r, status: "returned" }, "2026-04-01"), false);
});

test("alertsFor: stale, closure-pending and incomplete-document alerts fire independently", () => {
  const base = { id: "1", status: "held", lastTxn: "2020-01-01", reminderMonths: 3, chequeCopy: true, idCopy: true, signedReceipt: true };
  const stale = alertsFor(base, "2026-01-01");
  assert.ok(stale.some((a) => a.kind === "stale"));
  assert.ok(!stale.some((a) => a.kind === "docs"));

  const closure = alertsFor({ ...base, lastTxn: "2026-01-01", closureRequested: true, closureApproved: false }, "2026-01-01");
  assert.ok(closure.some((a) => a.kind === "closure"));

  const missingDocs = alertsFor({ ...base, lastTxn: "2026-01-01", chequeCopy: false }, "2026-01-01");
  assert.ok(missingDocs.some((a) => a.kind === "docs"));
});

test("alertsFor: a returned or presented cheque raises no alerts", () => {
  const r = { id: "1", status: "returned", lastTxn: "2020-01-01", reminderMonths: 3, closureRequested: true };
  assert.deepEqual(alertsFor(r, "2026-01-01"), []);
});

test("securityChequeAlerts: scopes to the shop, drops deleted/other-shop records, sorts bad before warn", () => {
  const records = [
    { id: "a", shopId: "s1", party: "A", amount: 100, status: "held", lastTxn: "2020-01-01", reminderMonths: 3, chequeCopy: true, idCopy: true, signedReceipt: true },
    { id: "b", shopId: "s1", party: "B", amount: 200, status: "held", lastTxn: "2026-01-01", reminderMonths: 3, closureRequested: true, chequeCopy: true, idCopy: true, signedReceipt: true },
    { id: "c", shopId: "s2", party: "Other shop", amount: 999, status: "held", lastTxn: "2020-01-01", reminderMonths: 1 },
    { id: "d", shopId: "s1", party: "Deleted", isDeleted: true, status: "held", lastTxn: "2020-01-01", reminderMonths: 1 },
  ];
  const alerts = securityChequeAlerts({ records, shopId: "s1", today: "2026-01-01" });
  assert.deepEqual(alerts.map((a) => a.recordId), ["b", "a"]);
  assert.equal(liveSecurityCheques(records, "s1").length, 2);
});

test("validateSecurityCheque: reports the first missing required field, in bn or en", () => {
  const empty = emptySecurityCheque();
  assert.equal(validateSecurityCheque({ ...empty, party: "", chequeNo: "", bank: "", amount: "", handoverDate: "", lastTxn: "" }, false), "Party / company name *");
  const complete = { ...empty, party: "A", chequeNo: "1", bank: "ADCB", amount: "100", handoverDate: "2026-01-01", lastTxn: "2026-01-01" };
  assert.equal(validateSecurityCheque(complete, false), "");
});

test("validateSecurityCheque: amount must be a positive number, not just a non-empty string", () => {
  const empty = emptySecurityCheque();
  const form = { ...empty, party: "A", chequeNo: "1", bank: "ADCB", amount: "0", handoverDate: "2026-01-01", lastTxn: "2026-01-01" };
  assert.equal(validateSecurityCheque(form, false), "Cheque amount *");
});

test("emptySecurityCheque: has no chequeDate field and defaults linkedInvoices to an empty array", () => {
  const empty = emptySecurityCheque();
  assert.equal("chequeDate" in empty, false);
  assert.deepEqual(empty.linkedInvoices, []);
});

test("openInvoicesFor: only open (confirmed/partial, balanceDue>0) invoices for that exact party, oldest first", () => {
  const invoices = [
    { id: "i1", vendorId: "v1", status: "confirmed", balanceDue: 50, invoiceDate: "2026-02-01" },
    { id: "i2", vendorId: "v1", status: "partial", balanceDue: 10, invoiceDate: "2026-01-01" },
    { id: "i3", vendorId: "v1", status: "paid", balanceDue: 0, invoiceDate: "2026-01-15" },
    { id: "i4", vendorId: "v2", status: "confirmed", balanceDue: 99, invoiceDate: "2026-01-01" },
  ];
  assert.deepEqual(openInvoicesFor(invoices, "vendorId", "v1").map((i) => i.id), ["i2", "i1"]);
  assert.deepEqual(openInvoicesFor(invoices, "vendorId", ""), []);
});

test("outstandingBalanceFor: sums balanceDue for that party, excluding cancelled invoices and other parties", () => {
  const invoices = [
    { id: "i1", customerId: "c1", status: "confirmed", balanceDue: 50 },
    { id: "i2", customerId: "c1", status: "cancelled", balanceDue: 999 },
    { id: "i3", customerId: "c2", status: "confirmed", balanceDue: 20 },
  ];
  assert.equal(outstandingBalanceFor(invoices, "customerId", "c1"), 50);
});
