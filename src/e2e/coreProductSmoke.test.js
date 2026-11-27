/**
 * Core product E2E (node integration): auth policy, PI+SI ledger+stock chain.
 * Browser login clicks are not run here (SQLite/Firebase need the app shell).
 */
import assert from "node:assert/strict";
import test from "node:test";
import { applyCloudAccessPolicy, shouldOfferCloudSignup } from "../offline/cloudAccessPolicy.js";
import { buildGlobalLedger, balances } from "../ledger/globalLedger.js";
import { onHandAt, stockMovements } from "../reports/stockHub.js";

const SHOP = "e2e-shop-1";

test("E2E auth: offline blocks cloud signup; trial online allows it", () => {
  const trialActive = { trialStatus: "TRIAL_ACTIVE" };
  const noLicense = { trialStatus: "TRIAL_EXPIRED" };
  assert.equal(shouldOfferCloudSignup(trialActive, { online: true }), true);
  assert.equal(shouldOfferCloudSignup(trialActive, { online: false }), false);
  assert.equal(shouldOfferCloudSignup(noLicense, { online: true }), false);
  assert.equal(applyCloudAccessPolicy(trialActive), true);
  assert.equal(applyCloudAccessPolicy(noLicense), false);
});

test("E2E purchase invoice: confirmed PI posts vendor due and adds stock", () => {
  const grand = 262.5;
  const tax = 12.5;
  const pi = {
    id: "pi-e2e-1",
    shopId: SHOP,
    status: "confirmed",
    invoiceNo: "PI-E2E-1",
    invoiceDate: "2026-11-28",
    vendorId: "v1",
    vendorName: "Gulf Parts",
    grandTotal: grand,
    totalTax: tax,
    amountPaid: 0,
    paymentMethod: "credit",
    items: [{ productId: "p1", qty: 10, unit: "Pcs", unitCost: 25, discountPerc: 0, taxPerc: 5 }],
  };

  const vendors = [{ id: "v1", vendorName: "Gulf Parts" }];
  const { accounts, postings } = buildGlobalLedger({ purchaseInvoices: [pi] }, { shopId: SHOP, vendors });
  const bal = balances(postings);
  assert.equal(bal.get("v:v1"), -grand);
  const purchaseKey = [...accounts.values()].find((a) => a.name === "Purchase")?.key;
  assert.ok(purchaseKey);
  assert.equal(bal.get(purchaseKey), grand - tax);

  const products = [{ id: "p1", unit: "Pcs", openingStock: 0 }];
  const qty = onHandAt(products, stockMovements(products, { purchaseInvoices: [pi] }, SHOP));
  assert.equal(qty.get("p1"), 10);
});

test("E2E sales invoice: paid SI posts cash + sales and reduces stock", () => {
  const grand = 315;
  const vat = 15;
  const si = {
    id: "si-e2e-1",
    shopId: SHOP,
    status: "paid",
    invoiceNo: "SI-E2E-1",
    invoiceDate: "2026-11-28",
    customerId: "c1",
    customerName: "Walk-in",
    grandTotal: grand,
    totalVat: vat,
    amountPaid: grand,
    paymentMethod: "cash",
    items: [{ productId: "p1", qty: 3, unit: "Pcs", unitPrice: 100, discountPerc: 0, vatPerc: 5 }],
  };

  const customers = [{ id: "c1", customerName: "Walk-in" }];
  const { accounts, postings } = buildGlobalLedger({ salesInvoices: [si] }, { shopId: SHOP, customers });
  const bal = balances(postings);
  const salesKey = [...accounts.values()].find((a) => a.name === "Sales")?.key;
  assert.ok(salesKey);
  assert.equal(bal.get(salesKey), -(grand - vat));
  const cashKey = [...accounts.values()].find((a) => a.name === "Cash in Hand")?.key;
  assert.ok(cashKey);
  assert.equal(bal.get(cashKey), grand);

  const products = [{ id: "p1", unit: "Pcs", openingStock: 10 }];
  const qty = onHandAt(products, stockMovements(products, { salesInvoices: [si] }, SHOP));
  assert.equal(qty.get("p1"), 7);
});

test("E2E PI then SI: books balance and net stock stays correct", () => {
  const pi = {
    id: "pi-e2e-2",
    shopId: SHOP,
    status: "confirmed",
    invoiceDate: "2026-11-28",
    vendorId: "v1",
    vendorName: "Supplier",
    grandTotal: 200,
    totalTax: 0,
    amountPaid: 200,
    paymentMethod: "cash",
    items: [{ productId: "p1", qty: 10, unit: "Pcs", unitCost: 20, discountPerc: 0, taxPerc: 0 }],
  };
  const si = {
    id: "si-e2e-2",
    shopId: SHOP,
    status: "paid",
    invoiceDate: "2026-11-28",
    customerId: "c1",
    customerName: "Retail",
    grandTotal: 200,
    totalVat: 0,
    amountPaid: 200,
    paymentMethod: "cash",
    items: [{ productId: "p1", qty: 4, unit: "Pcs", unitPrice: 50, discountPerc: 0, vatPerc: 0 }],
  };

  const data = { purchaseInvoices: [pi], salesInvoices: [si] };
  const opts = {
    shopId: SHOP,
    vendors: [{ id: "v1", vendorName: "Supplier" }],
    customers: [{ id: "c1", customerName: "Retail" }],
  };
  const { postings } = buildGlobalLedger(data, opts);
  const dr = postings.reduce((t, p) => t + p.dr, 0);
  const cr = postings.reduce((t, p) => t + p.cr, 0);
  assert.equal(Math.round(dr * 100), Math.round(cr * 100));

  const products = [{ id: "p1", unit: "Pcs", openingStock: 0 }];
  const qty = onHandAt(products, stockMovements(products, { purchaseInvoices: [pi], salesInvoices: [si] }, SHOP));
  assert.equal(qty.get("p1"), 6);
});