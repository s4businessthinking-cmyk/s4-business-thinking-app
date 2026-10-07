import test from "node:test";
import assert from "node:assert/strict";
import { computeVat, corporateTax, ctDueDate, fyRange, periodRange, taxSettingsOf, addDays } from "./taxDomain.js";

test("tax periods follow the monthly / quarterly setting", () => {
  const today = new Date(2026, 9, 7);
  assert.deepEqual(periodRange({ period: "quarterly", periodStartMonth: 1 }, 0, today), { from: "2026-10-01", to: "2026-12-31", label: "Oct – Dec 2026" });
  assert.equal(periodRange({ period: "quarterly", periodStartMonth: 1 }, -1, today).from, "2026-07-01");
  assert.deepEqual(periodRange({ period: "quarterly", periodStartMonth: 2 }, 0, today), { from: "2026-08-01", to: "2026-10-31", label: "Aug – Oct 2026" });
  assert.equal(periodRange({ period: "quarterly", periodStartMonth: 12 }, 0, new Date(2026, 0, 15)).label, "Dec 2025 – Feb 2026");
  assert.deepEqual(periodRange({ period: "monthly" }, -1, today), { from: "2026-09-01", to: "2026-09-30", label: "Sep 2026" });
  assert.deepEqual(fyRange({ fyStartMonth: 1 }, 0, today).to, "2026-12-31");
  assert.equal(fyRange({ fyStartMonth: 4 }, 0, new Date(2026, 1, 1)).label, "2025-26");
  assert.equal(ctDueDate("2026-12-31"), "2027-09-30");
  assert.equal(addDays("2026-12-31", 28), "2027-01-28");
  assert.equal(taxSettingsOf({}).country, "ae");
  assert.equal(taxSettingsOf({ taxSettings: { period: "monthly", country: "sa", rate: 15 } }).rate, 15);
  const moved = taxSettingsOf({ country: "sa", currency: "SAR", fyStartMonth: 4, taxSettings: { country: "ae", rate: 5, filingUrl: "https://eservices.tax.gov.ae", period: "monthly" } });
  assert.deepEqual([moved.rate, moved.currency, moved.fyStartMonth, moved.period, moved.filingUrl, moved.ctEnabled], [15, "SAR", 4, "monthly", "https://zatca.gov.sa", false]);
  assert.equal(taxSettingsOf({ country: "ae", taxSettings: { country: "ae", rate: 5, filingUrl: "https://my.link" } }).filingUrl, "https://my.link");
  assert.equal(taxSettingsOf({ taxApplicable: "none" }).taxApplicable, "none");
});

test("VAT summary nets returns and splits standard and no-VAT sales", () => {
  const data = {
    salesInvoices: [
      { id: "s1", shopId: "x", status: "paid", invoiceType: "tax", invoiceDate: "2026-10-02", invoiceNo: "SI-1", customerId: "c1", grandTotal: 105, totalVat: 5, items: [{ productId: "p1", code: "A", name: "Bolt", qty: 1, lineTotal: 105, vatAmt: 5 }] },
      { id: "s2", shopId: "x", status: "confirmed", invoiceType: "regular", invoiceDate: "2026-10-03", grandTotal: 50, totalVat: 0, items: [] },
      { id: "s3", shopId: "x", status: "draft", invoiceDate: "2026-10-03", grandTotal: 999, totalVat: 99 },
      { id: "s4", shopId: "x", status: "paid", invoiceType: "tax", invoiceDate: "2026-09-30", grandTotal: 210, totalVat: 10 },
    ],
    purchaseInvoices: [
      { id: "p1", shopId: "x", status: "paid", invoiceDate: "2026-10-01", vendorId: "v1", grandTotal: 63, totalTax: 3, items: [{ productId: "p1", qty: 1, lineTotal: 63, taxAmt: 3 }] },
    ],
    extras: {
      salesReturns: [{ id: "r1", shopId: "x", returnDate: "2026-10-04", invoiceId: "s1", partyId: "c1", total: 21, totalVat: 1, items: [{ productId: "p1", qty: 0.2, amount: 21, vatAmt: 1 }] }],
      purchaseReturns: [],
    },
  };
  const v = computeVat(data, { shopId: "x", from: "2026-10-01", to: "2026-12-31", customers: [{ id: "c1", emirate: "Sharjah", trnNumber: "100" }], vendors: [{ id: "v1", trnNumber: "200" }] });
  assert.equal(v.outputVat, 4);
  assert.equal(v.inputVat, 3);
  assert.equal(v.payable, 1);
  assert.equal(v.stdSales, 80);
  assert.equal(v.noVatSales, 50);
  assert.equal(v.stdPurch, 60);
  assert.deepEqual(v.regionRows, [{ region: "Sharjah", taxable: 80, vat: 4, bills: 1 }]);
  assert.equal(v.productRows[0].salesVat, 4);
  assert.equal(v.productRows[0].purchVat, 3);
  assert.equal(v.purchaseRows[0].trn, "200");
});

test("VAT on shop expense bills counts as input VAT; no-VAT and cancelled expenses stay out", () => {
  const data = {
    salesInvoices: [{ id: "s1", shopId: "x", status: "paid", invoiceDate: "2026-10-02", grandTotal: 210, totalVat: 10 }],
    purchaseInvoices: [],
    extras: { salesReturns: [], purchaseReturns: [] },
    expenses: [
      { id: "e1", shopId: "x", status: "active", expenseDate: "2026-10-05", expenseNo: "EXP-0001", category: "rent", paidTo: "Landlord", refNo: "R-9", amount: 1050, vatAmount: 50, supplierTrn: "300" },
      { id: "e2", shopId: "x", status: "active", expenseDate: "2026-10-06", category: "salary", amount: 2000, vatAmount: 0 },
      { id: "e3", shopId: "x", status: "cancelled", expenseDate: "2026-10-06", category: "electricity", amount: 105, vatAmount: 5 },
      { id: "e4", shopId: "x", status: "active", expenseDate: "2026-09-30", category: "electricity", amount: 105, vatAmount: 5 },
      { id: "e5", shopId: "y", status: "active", expenseDate: "2026-10-06", category: "phone", amount: 105, vatAmount: 5 },
    ],
  };
  const v = computeVat(data, { shopId: "x", from: "2026-10-01", to: "2026-12-31" });
  assert.equal(v.inputVat, 50);
  assert.equal(v.expenseVat, 50);
  assert.equal(v.expenseCount, 1);
  assert.equal(v.stdPurch, 1000);
  assert.equal(v.noVatPurch, 0);
  assert.equal(v.payable, -40);
  assert.deepEqual(
    [v.purchaseRows[0].no, v.purchaseRows[0].ref, v.purchaseRows[0].party, v.purchaseRows[0].trn, v.purchaseRows[0].isExpense],
    ["EXP-0001", "R-9", "Landlord", "300", true],
  );
});

test("corporate tax: 0% up to the threshold, then the rate; small business relief", () => {
  const settings = { ctThreshold: 375000, ctRate: 9, sbrLimit: 3000000, sbrElected: false };
  assert.equal(corporateTax({ profit: 300000, revenue: 5e6, settings }).tax, 0);
  assert.equal(corporateTax({ profit: 500000, revenue: 5e6, settings }).tax, 11250);
  assert.equal(corporateTax({ profit: -1000, revenue: 5e6, settings }).isLoss, true);
  const sbr = corporateTax({ profit: 500000, revenue: 2e6, settings: { ...settings, sbrElected: true } });
  assert.equal(sbr.sbrApplied, true);
  assert.equal(sbr.tax, 0);
  assert.equal(corporateTax({ profit: 500000, revenue: 4e6, settings: { ...settings, sbrElected: true } }).sbrApplied, false);
});
