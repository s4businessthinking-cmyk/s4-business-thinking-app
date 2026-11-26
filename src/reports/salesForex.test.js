import test from "node:test";
import assert from "node:assert/strict";
import { cancelSalesFxPatch, postedSalesFx, salesFxPosition, salesRealisedJournal } from "./salesForex.js";
import { fetchRate, parseRate, rateUrl } from "./fxRates.js";
import { saleToBase } from "../sales-invoice/siForex.js";
import { buildGlobalLedger, balances } from "../ledger/globalLedger.js";
import { journalPlByAccount } from "./journalPl.js";

const S = "s1";
const customers = [{ id: "c1", customerName: "Global Traders" }];
// USD 100 bill at 3.67 (no VAT), on credit
const bill = () => ({ ...saleToBase({
  shopId: S, invoiceNo: "SI-7", invoiceType: "regular", invoiceDate: "2026-11-01", status: "confirmed", customerId: "c1", customerName: "Global Traders", currency: "USD", paymentMethod: "credit",
  items: [{ productId: "p1", name: "Pump", qty: 1, unitPrice: 100, discountAmt: 0, vatAmt: 0, lineTotal: 100 }],
  subtotal: 100, totalDiscount: 0, totalVat: 0, grandTotal: 100, amountPaid: 0, balanceDue: 100,
}, { rate: 3.67 }), id: "si7" });
const receipt = (aed, alloc) => ({ id: `r-${aed}`, shopId: S, status: "confirmed", receiptNo: "RV-1", receiptDate: "2026-11-20", customerId: "c1", customerName: "Global Traders", method: "bank_transfer", totalAmount: aed, allocations: [{ invoiceId: "si7", amount: alloc }] });
const pos = (inv, vouchers = []) => salesFxPosition({ salesInvoices: [inv], vouchers, customers, shopId: S })[0];
const book = (inv, receipts, vouchers) => {
  const led = buildGlobalLedger({ salesInvoices: [inv], receipts, accountVouchers: vouchers }, { shopId: S, customers });
  const bal = balances(led.postings, "");
  const of = (name) => bal.get([...led.accounts.values()].find((a) => a.name === name)?.key) || 0;
  return { of, sum: Math.abs(Math.round([...bal.values()].reduce((t, v) => t + v, 0) * 100)) };
};

test("received at 3.70: gain of 3.00 on the customer, ledger balances, customer settles", () => {
  // receipt 370 AED: 367 settles the bill, 3 sits on the customer as an advance until the journal clears it
  const inv = { ...bill(), amountPaid: 367, balanceDue: 0, status: "paid" };
  const p = pos(inv);
  assert.deepEqual([p.billRate, p.fc, p.grandTotal, p.bookOpen, p.fcToSettle], [3.67, 100, 367, 0, 100]);
  const j = salesRealisedJournal({ bill: p, inv, fcAmount: 100, rate: 3.70, date: "2026-11-20", shopId: S });
  assert.deepEqual([j.kind, j.amount, j.invoicePatch], ["gain", 3, null]);
  assert.deepEqual(j.doc.lines.map((l) => [l.account, l.debit, l.credit]), [["Global Traders", 3, 0], ["Exchange Gain", 0, 3]]);
  const voucher = { id: j.id, ...j.doc };
  const b = book(inv, [receipt(370, 367)], [voucher]);
  assert.equal(b.of("Global Traders"), 0, "customer settled");
  assert.equal(b.of("Exchange Gain"), -3);
  assert.equal(b.sum, 0, "trial balance");
  assert.deepEqual([...journalPlByAccount([voucher], S, "", "").entries()], [["Exchange Gain", -3]], "P&L counts the gain only");
  assert.deepEqual(postedSalesFx([voucher]).get("si7"), { amount: 3, fc: 100 });
  assert.equal(pos(inv, [voucher]).fcToSettle, 0);
  assert.equal(salesRealisedJournal({ bill: pos(inv, [voucher]), inv, fcAmount: 1, rate: 3.7, date: "2026-11-21" }).error, "fcMax", "not twice");
});

test("received at 3.65: loss of 2.00, the bill is closed by it, no fake cash", () => {
  const inv = { ...bill(), amountPaid: 365, balanceDue: 2, status: "partial" };
  const p = pos(inv);
  assert.equal(p.bookOpen, 2);
  const j = salesRealisedJournal({ bill: p, inv, fcAmount: 100, aedReceived: 365, date: "2026-11-20", shopId: S });
  assert.deepEqual([j.kind, j.amount], ["loss", -2]);
  assert.deepEqual(j.doc.lines.map((l) => [l.account, l.debit, l.credit]), [["Exchange Loss", 2, 0], ["Global Traders", 0, 2]]);
  assert.deepEqual(j.invoicePatch, { amountPaid: 367, balanceDue: 0, fxSettledAed: 2, status: "paid" });
  const closed = { ...inv, ...j.invoicePatch };
  const b = book(closed, [receipt(365, 365)], [{ id: j.id, ...j.doc }]);
  assert.equal(b.of("Global Traders"), 0);
  assert.equal(b.of("Exchange Loss"), 2);
  assert.equal(b.of("Bank"), 365, "only the money really received; the 2 closed by the loss is not cash");
  assert.equal(b.sum, 0);
  // cancelling the journal reopens the bill
  assert.deepEqual(cancelSalesFxPatch(closed, j.doc), { amountPaid: 365, balanceDue: 2, fxSettledAed: 0, status: "partial" });
});

test("same rate: no exchange line; wrong inputs refused", () => {
  const inv = { ...bill(), amountPaid: 367, balanceDue: 0, status: "paid" };
  const p = pos(inv);
  assert.equal(salesRealisedJournal({ bill: p, inv, fcAmount: 100, rate: 3.67, date: "2026-11-20" }).error, "same");
  assert.equal(salesRealisedJournal({ bill: p, inv, fcAmount: 0, rate: 3.7, date: "2026-11-20" }).error, "fc");
  assert.equal(salesRealisedJournal({ bill: p, inv, fcAmount: 100, rate: 0, date: "2026-11-20" }).error, "rate");
  assert.equal(salesRealisedJournal({ bill: p, inv, fcAmount: 100, rate: 3.7, date: "" }).error, "date");
  assert.equal(salesRealisedJournal({ bill: { ...p, bookOpen: 1 }, inv, fcAmount: 100, rate: 3.6, date: "2026-11-20" }).error, "short", "a loss bigger than the open balance");
  assert.equal(salesFxPosition({ salesInvoices: [{ ...inv, currency: "AED", fx: null }], customers, shopId: S }).length, 0, "shop-currency bills are not listed");
});

test("rate service: only a real HTTPS reply with a positive number gives a rate", async () => {
  const api = { url: "https://rates.example/v6/{token}/pair/{from}/{to}", token: "k1" };
  assert.deepEqual(rateUrl(api, "usd", "aed"), { url: "https://rates.example/v6/k1/pair/USD/AED" });
  assert.deepEqual(rateUrl({ url: "http://rates.example/{from}" }, "USD", "AED"), { error: "url" }, "https only");
  assert.deepEqual(rateUrl({ url: "https://x/{token}" }, "USD", "AED"), { error: "token" });
  assert.deepEqual(rateUrl({ url: "" }, "USD", "AED"), { error: "url" }, "no service set: manual only");
  assert.equal(parseRate({ conversion_rate: 3.6725 }, "AED"), 3.6725);
  assert.equal(parseRate({ rates: { AED: "3.67" } }, "AED"), 3.67);
  assert.equal(parseRate({ rate: 0 }, "AED"), null);
  const ok = await fetchRate(api, "USD", "AED", { fetchImpl: async () => ({ ok: true, json: async () => ({ conversion_rate: 3.6725 }) }) });
  assert.deepEqual(ok, { rate: 3.6725, url: "https://rates.example/v6/k1/pair/USD/AED" });
  assert.deepEqual(await fetchRate(api, "USD", "AED", { fetchImpl: async () => ({ ok: false, status: 401 }) }), { error: "http", status: 401 });
  assert.deepEqual(await fetchRate(api, "USD", "AED", { fetchImpl: async () => ({ ok: true, json: async () => ({ result: "error" }) }) }), { error: "body" });
  assert.equal((await fetchRate(api, "USD", "AED", { fetchImpl: async () => { throw new Error("offline"); } })).error, "network");
});
