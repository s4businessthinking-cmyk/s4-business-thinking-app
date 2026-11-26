import test from "node:test";
import assert from "node:assert/strict";
import { isForeignSale, saleAsTyped, saleFxNote, saleToBase } from "./siForex.js";
import { buildGlobalLedger, balances } from "../ledger/globalLedger.js";

const S = "s1";
// a USD tax invoice as the form builds it: 2 x 50 + 1 x 20 = 120, VAT 5% = 6, total 126, paid 26 (amounts in USD)
const usdBill = () => ({
  shopId: S, invoiceNo: "SI-9", invoiceType: "tax", invoiceDate: "2026-11-10", status: "partial", customerId: "c1", customerName: "Global Traders",
  currency: "USD", paymentMethod: "credit",
  items: [
    { productId: "p1", name: "Filter", qty: 2, unit: "Pcs", unitPrice: 50, discountPerc: 0, discountFlat: 0, discountAmt: 0, vatPerc: 5, vatAmt: 5, lineTotal: 105 },
    { productId: "p2", name: "Belt", qty: 1, unit: "Pcs", unitPrice: 20, discountPerc: 0, discountFlat: 0, discountAmt: 0, vatPerc: 5, vatAmt: 1, lineTotal: 21 },
  ],
  subtotal: 120, totalDiscount: 0, totalVat: 6, grandTotal: 126, billDiscAmt: 0, billDiscount: 0, adjustment: 0, roundOff: 0, amountPaid: 26, balanceDue: 100,
});
const RATE = 3.6725;

test("foreign or not", () => {
  assert.equal(isForeignSale("USD", "AED"), true);
  assert.equal(isForeignSale("aed", "AED"), false);
  assert.equal(isForeignSale("", "AED"), false, "no currency = the shop's own");
  assert.deepEqual(saleToBase(usdBill(), { rate: 0 }), { error: "rate" }, "a rate is required");
});

test("a USD bill is saved in AED at its rate, keeping what was typed", () => {
  const b = saleToBase({ ...usdBill(), id: "si9" }, { rate: RATE, baseCurrency: "AED" });
  assert.deepEqual([b.currency, b.exchangeRate, b.fx.currency, b.fx.base, b.fx.rate], ["USD", RATE, "USD", "AED", RATE]);
  assert.deepEqual([b.subtotal, b.totalVat, b.grandTotal, b.amountPaid, b.balanceDue], [440.7, 22.04, 462.74, 95.49, 367.25]);
  assert.deepEqual(b.items.map((it) => [it.unitPrice, it.vatAmt, it.lineTotal]), [[183.625, 18.36, 385.61], [73.45, 3.67, 77.12]]);
  assert.deepEqual([b.grandTotal, b.totalVat], [462.74, 22.04], "totals are the typed totals at the rate");
  assert.deepEqual([b.fx.doc.grandTotal, b.fx.doc.totalVat, b.fx.items[0].unitPrice], [126, 6, 50]);
  // fully paid in USD stays fully paid in AED (no fils left over)
  const paid = saleToBase({ ...usdBill(), status: "paid", amountPaid: 126, balanceDue: 0 }, { rate: RATE });
  assert.deepEqual([paid.amountPaid, paid.balanceDue], [paid.grandTotal, 0]);
});

test("the ledger books it in AED and balances; a return of it reverses in AED", () => {
  const bill = { ...saleToBase({ ...usdBill(), id: "si9" }, { rate: RATE }), id: "si9" };
  const ret = { id: "sr9", shopId: S, status: "confirmed", returnNo: "SR-9", returnDate: "2026-11-12", invoiceId: "si9", invoiceNo: "SI-9", partyId: "c1", partyName: "Global Traders",
    total: bill.items[1].lineTotal, totalVat: bill.items[1].vatAmt, refundAmount: 0, appliedToInvoice: 0, items: [{ productId: "p2", qty: 1 }] };
  const ledger = buildGlobalLedger({ salesInvoices: [bill], salesReturns: [ret] }, { shopId: S, customers: [{ id: "c1", customerName: "Global Traders" }] });
  const bal = balances(ledger.postings, "");
  const of = (name) => bal.get([...ledger.accounts.values()].find((a) => a.name === name)?.key) || 0;
  assert.equal(of("Sales"), -440.7);
  assert.equal(of("VAT Output"), -18.37);
  assert.equal(of("Sales Return"), 73.45);
  assert.equal(of("Global Traders"), Math.round((462.74 - 95.49 - 77.12) * 100) / 100, "customer owes the AED balance less the return");
  assert.equal(Math.abs(Math.round([...bal.values()].reduce((t, v) => t + v, 0) * 100)), 0, "trial balance");
});

test("opened or printed again it shows the USD figures; a shop-currency bill is unchanged", () => {
  const saved = saleToBase(usdBill(), { rate: RATE });
  const typed = saleAsTyped(saved);
  assert.deepEqual([typed.grandTotal, typed.totalVat, typed.amountPaid, typed.items[0].unitPrice, typed.items[1].lineTotal], [126, 6, 26, 50, 21]);
  assert.equal(typed.balanceDue, 100);
  // a receipt later (in AED) shows at the bill's rate
  assert.equal(saleAsTyped({ ...saved, amountPaid: 462.74, balanceDue: 0 }).amountPaid, 126);
  assert.deepEqual(saleFxNote(saved), { rate: "1 USD = 3.6725 AED", total: "AED 462.74", vat: "AED 22.04", base: "AED", currency: "USD" });
  const aed = { ...usdBill(), currency: "AED" };
  assert.equal(saleAsTyped(aed), aed, "no fx: the same object");
  assert.equal(saleFxNote(aed), null);
});
