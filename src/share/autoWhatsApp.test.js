import test from "node:test";
import assert from "node:assert/strict";
import { afterInvoiceSaved, autoWhatsAppDue, autoWhatsAppOn } from "./autoWhatsApp.js";

const on = { id: "c1", customerName: "Ali", autoWhatsAppInvoice: true, mobileNumber: "0501112222" };
const bill = (extra = {}) => ({ id: "i1", invoiceNo: "SI-1", customerId: "c1", status: "confirmed", invoiceType: "tax", grandTotal: 100, ...extra });

test("the flag is off unless ticked", () => {
  assert.equal(autoWhatsAppOn({}), false);
  assert.equal(autoWhatsAppOn({ autoWhatsAppInvoice: "yes" }), false);
  assert.equal(autoWhatsAppOn(null), false);
  assert.equal(autoWhatsAppOn({ ...on, isDeleted: true }), false);
  assert.equal(autoWhatsAppOn(on), true);
});

test("fires once when a sales bill becomes live for a customer with the flag", () => {
  ["confirmed", "partial", "paid"].forEach((status) => assert.equal(autoWhatsAppDue({ saved: bill({ status }), prior: null, customer: on }), true, status));
  assert.equal(autoWhatsAppDue({ saved: bill(), prior: bill({ status: "draft" }), customer: on }), true, "draft confirmed");
  assert.equal(autoWhatsAppDue({ saved: bill({ status: "paid" }), prior: bill(), customer: on }), false, "edit of a live bill");
  assert.equal(autoWhatsAppDue({ saved: bill(), prior: bill({ status: "partial" }), customer: on }), false);
});

test("never for flag off, drafts, other documents, opening balance or cancelled", () => {
  assert.equal(autoWhatsAppDue({ saved: bill(), customer: { ...on, autoWhatsAppInvoice: false } }), false);
  assert.equal(autoWhatsAppDue({ saved: bill(), customer: null }), false);
  assert.equal(autoWhatsAppDue({ saved: bill({ status: "draft" }), customer: on }), false);
  assert.equal(autoWhatsAppDue({ saved: bill({ status: "cancelled" }), customer: on }), false);
  assert.equal(autoWhatsAppDue({ saved: bill({ invoiceType: "delivery" }), customer: on }), false);
  assert.equal(autoWhatsAppDue({ saved: bill({ source: "openingBalance" }), customer: on }), false);
  ["quotation", "salesOrder", "delivery"].forEach((kind) => assert.equal(autoWhatsAppDue({ kind, saved: bill(), customer: on }), false, kind));
  assert.equal(autoWhatsAppDue({ saved: null, customer: on }), false);
});

test("a failing WhatsApp step never reaches the save", async () => {
  let saved = null;
  const save = () => { saved = bill(); afterInvoiceSaved(() => { throw new Error("whatsapp down"); }, saved, null); return saved; };
  assert.doesNotThrow(save);
  assert.equal(saved.invoiceNo, "SI-1");
  const rejected = [];
  const origWarn = console.warn;
  console.warn = (...a) => rejected.push(a.join(" "));
  try {
    afterInvoiceSaved(async () => { throw new Error("async fail"); });
    afterInvoiceSaved(undefined);
    await new Promise((r) => setTimeout(r, 10));
  } finally { console.warn = origWarn; }
  assert.ok(rejected.some((m) => m.includes("Auto WhatsApp")));
});
