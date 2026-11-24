import test from "node:test";
import assert from "node:assert/strict";
import { buildGlobalLedger, balances } from "../ledger/globalLedger.js";
import { buildTrialBalance } from "../reports/trialBalance.js";
import { computeVat } from "../reports/taxDomain.js";
import { normalizeAdjustments, reasonsFor } from "../masters/simpleMasters.js";

// A purchase bill's Adjustment (+/-) sits after VAT: grandTotal = lines + VAT + adjustment (piCalcTotals). The ledger
// books Purchase = grandTotal - VAT, so the adjustment lands in Purchase; VAT Input and the VAT return are unchanged.
const S = "s1";
const bill = (adjustment) => ({
  id: "p1", shopId: S, invoiceNo: "PI-1", invoiceDate: "2026-11-05", status: "confirmed", vendorId: "v1", vendorName: "Gulf", supplierTrn: "100",
  items: [{ name: "Filter", qty: 10, unitCost: 10, taxPerc: 5, taxAmt: 5, lineTotal: 105 }], subtotal: 100, totalTax: 5, grandTotal: 105 + adjustment, amountPaid: 0,
  adjustment, adjustmentReason: adjustment ? "Freight / delivery charge" : "",
});
const ledgerOf = (adj) => buildGlobalLedger({ purchaseInvoices: [bill(adj)] }, { shopId: S, vendors: [{ id: "v1", vendorName: "Gulf", trnNumber: "100" }] });
const key = (ledger, n) => [...ledger.accounts.values()].find((a) => a.name === n)?.key;

test("a + adjustment raises the bill and Purchase, not VAT; the trial balance still balances", () => {
  const led = ledgerOf(12.5);
  const bal = balances(led.postings, "");
  assert.equal(bal.get("v:v1"), -117.5);
  assert.equal(bal.get(key(led, "Purchase")), 112.5);
  assert.equal(bal.get(key(led, "VAT Input")), 5);
  assert.equal(buildTrialBalance(led, {}).difference, 0);
});

test("a - adjustment (rounding / rate difference) lowers the bill and Purchase; no adjustment = as before", () => {
  const led = ledgerOf(-0.5);
  const bal = balances(led.postings, "");
  assert.equal(bal.get("v:v1"), -104.5);
  assert.equal(bal.get(key(led, "Purchase")), 99.5);
  const plain = balances(ledgerOf(0).postings, "");
  assert.equal(plain.get("v:v1"), -105);
});

test("the VAT return keeps the bill's VAT whatever the adjustment", () => {
  const vendors = [{ id: "v1", trnNumber: "100" }];
  const vatOf = (adj) => computeVat({ purchaseInvoices: [bill(adj)], salesInvoices: [] }, { shopId: S, from: "2026-11-01", to: "2026-11-30", vendors }).inputVat;
  assert.equal(vatOf(0), 5);
  assert.equal(vatOf(12.5), 5);
  assert.equal(vatOf(-0.5), 5);
});

test("purchase adjustment reasons come from the Merge / Masters list", () => {
  assert.deepEqual(reasonsFor(normalizeAdjustments([]), "purchase").map((r) => r.nameEn), ["Rounding", "Freight / delivery charge", "Rate difference"]);
});
