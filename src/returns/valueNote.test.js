import test from "node:test";
import assert from "node:assert/strict";
import { buildGlobalLedger, balances } from "../ledger/globalLedger.js";
import { buildTrialBalance } from "../reports/trialBalance.js";
import { billVatPerc, validateValueNote, valueNoteRoom, valueNoteTotals } from "./returnsDomain.js";

const S = "s1";
const bill = { id: "i1", shopId: S, invoiceNo: "SI-1", invoiceDate: "2026-11-01", status: "confirmed", customerId: "c1", customerName: "Ali", grandTotal: 210, totalVat: 10, amountPaid: 0, items: [{ name: "Oil", qty: 2, unitPrice: 100 }] };
const pbill = { id: "p1", shopId: S, invoiceNo: "PI-1", invoiceDate: "2026-11-01", status: "confirmed", vendorId: "v1", vendorName: "Gulf", grandTotal: 525, totalTax: 25, amountPaid: 0, items: [] };

test("value note totals: amount before VAT, the bill's VAT rate by default", () => {
  assert.equal(billVatPerc(bill), 5);
  assert.equal(billVatPerc(pbill, "purchase"), 5);
  assert.equal(billVatPerc({ grandTotal: 100, totalVat: 0 }), 0);
  assert.deepEqual(valueNoteTotals({ amount: "20", vatPerc: 5 }), { subtotal: 20, totalVat: 1, total: 21, vatPerc: 5 });
  assert.deepEqual(valueNoteTotals({ amount: "1,000", vatPerc: "" }), { subtotal: 1000, totalVat: 0, total: 1000, vatPerc: 0 });
  assert.deepEqual(valueNoteTotals({ amount: "-5", vatPerc: 5 }).total, 0);
});

test("value note checks: live bill, amount, no more than the bill less earlier returns / notes", () => {
  const prior = [{ id: "r1", invoiceId: "i1", status: "confirmed", total: 105 }, { id: "r2", invoiceId: "i1", status: "cancelled", total: 50 }, { id: "r3", invoiceId: "other", status: "confirmed", total: 99 }];
  assert.equal(valueNoteRoom(bill, prior), 105);
  assert.equal(validateValueNote(bill, 105, prior), "");
  assert.equal(validateValueNote(bill, 106, prior), "OVER");
  assert.equal(validateValueNote(bill, 150, prior, "r1"), "", "editing r1 frees its own amount");
  assert.equal(validateValueNote(bill, 0, prior), "AMOUNT");
  assert.equal(validateValueNote({ ...bill, status: "draft" }, 10), "INVOICE_NOT_RETURNABLE");
  assert.equal(validateValueNote(null, 10), "INVOICE_MISSING");
});

test("a value note posts like a return of money: Sales Return + VAT against the customer, no stock line, TB balances", () => {
  const note = { id: "vn1", shopId: S, returnNo: "SR-0007", returnDate: "2026-11-10", invoiceId: "i1", invoiceNo: "SI-1", partyId: "c1", partyName: "Ali",
    noteType: "value", vatPerc: 5, items: [], subtotal: 20, totalVat: 1, total: 21, appliedToInvoice: 21, refundAmount: 0, status: "confirmed" };
  const pnote = { id: "vn2", shopId: S, returnNo: "PR-0003", returnDate: "2026-11-11", invoiceId: "p1", partyId: "v1", partyName: "Gulf", noteType: "value", items: [], subtotal: 100, totalVat: 5, total: 105, status: "confirmed" };
  const data = { salesInvoices: [bill], purchaseInvoices: [pbill], salesReturns: [note], purchaseReturns: [pnote] };
  const ledger = buildGlobalLedger(data, { shopId: S, customers: [{ id: "c1", customerName: "Ali" }], vendors: [{ id: "v1", vendorName: "Gulf" }] });
  const bal = balances(ledger.postings, "");
  const key = (n) => [...ledger.accounts.values()].find((a) => a.name === n)?.key;
  assert.equal(bal.get("c:c1"), 189, "customer owes 210 - 21");
  assert.equal(bal.get(key("Sales Return")), 20);
  assert.equal(bal.get(key("VAT Output")), -9, "VAT 10 on the bill less 1 on the note");
  assert.equal(bal.get("v:v1"), -420, "we owe 525 - 105");
  assert.equal(bal.get(key("Purchase Return")), -100);
  assert.equal(bal.get(key("VAT Input")), 20);
  const noteLines = ledger.postings.filter((p) => p.docId === "vn1");
  assert.deepEqual(noteLines.map((p) => p.type), ["salesReturn", "salesReturn", "salesReturn"]);
  assert.equal(buildTrialBalance(ledger, {}).difference, 0);
  // cancelled: nothing posts
  const off = buildGlobalLedger({ ...data, salesReturns: [{ ...note, status: "cancelled" }] }, { shopId: S, customers: [{ id: "c1", customerName: "Ali" }] });
  assert.equal(balances(off.postings, "").get("c:c1"), 210);
});
