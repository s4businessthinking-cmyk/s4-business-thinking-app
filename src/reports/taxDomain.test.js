import test from "node:test";
import assert from "node:assert/strict";
import { CT_ESTIMATE_NOTE, ctEstimateLines, ctEstimateRows, computeVat, corporateTax, ctDueDate, fyRange, periodRange, taxSettingsOf, addDays, countryKey } from "./taxDomain.js";

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

test("a UAE shop saved by sign-up as \"AE\" (or \"UAE\") is a UAE shop on the Tax page; other codes keep their meaning", () => {
  for (const c of ["AE", "ae", " UAE ", "United Arab Emirates", "United Arab Emirates (UAE)"]) {
    const s = taxSettingsOf({ country: c });
    assert.deepEqual([s.country, s.rate, s.currency, s.ctEnabled], ["ae", 5, "AED", true], c);
  }
  // the owner's saved UAE settings are kept, not reset to the preset
  assert.equal(taxSettingsOf({ country: "AE", taxSettings: { country: "ae", rate: 5, filingUrl: "https://my.link" } }).filingUrl, "https://my.link");
  // no change for other countries: "IN" / "BD" stay as they were (custom), never the India GST preset
  assert.deepEqual(["IN", "BD", "in", "sa"].map((c) => taxSettingsOf({ country: c }).country), ["custom", "custom", "in", "sa"]);
  assert.deepEqual([countryKey("AE"), countryKey(""), countryKey(null), countryKey("BD")], ["ae", "", "", "BD"]);
});

test("input VAT: supplier master TRN, else the TRN typed on the bill; returns follow their bill", () => {
  const bill = (id, vendorId, vat, extra = {}) => ({ id, shopId: "x", invoiceNo: id, invoiceDate: "2026-11-05", status: "confirmed", vendorId, grandTotal: 100 + vat, totalTax: vat, ...extra });
  const vendors = [{ id: "vm", trnNumber: "100000000000003" }, { id: "vn", trnNumber: "  " }];
  const data = {
    purchaseInvoices: [
      bill("PI-M", "vm", 5, { vendorTrn: "999999999999999" }),
      bill("PI-B", "vn", 5, { vendorTrn: " 100000000000011 " }),
      bill("PI-X", null, 5, { vendorTrn: "100000000000029" }),
      bill("PI-N", "vn", 5, { vendorTrn: "   " }),
      bill("PI-OLD", null, 10, { invoiceDate: "2026-09-01", vendorTrn: "100000000000037" }),
    ],
    extras: {
      purchaseReturns: [
        { id: "PR-B", shopId: "x", returnNo: "PR-B", returnDate: "2026-11-08", status: "confirmed", invoiceId: "PI-B", partyId: "vn", total: 52.5, totalVat: 2.5 },
        { id: "PR-OLD", shopId: "x", returnNo: "PR-OLD", returnDate: "2026-11-09", status: "confirmed", invoiceId: "PI-OLD", total: 21, totalVat: 1 },
        { id: "PR-N", shopId: "x", returnNo: "PR-N", returnDate: "2026-11-09", status: "confirmed", invoiceId: "PI-N", partyId: "vn", total: 21, totalVat: 1 },
      ],
    },
  };
  const v = computeVat(data, { shopId: "x", from: "2026-11-01", to: "2026-11-30", vendors });
  const row = (id) => v.purchaseRows.find((r) => r.id === id);
  assert.deepEqual([row("PI-M").trn, row("PI-M").vatClaimable], ["100000000000003", true], "master TRN wins over the bill");
  assert.deepEqual([row("PI-B").trn, row("PI-B").vatClaimable], ["100000000000011", true], "blank master falls back to the bill, trimmed");
  assert.deepEqual([row("PI-X").trn, row("PI-X").vatClaimable], ["100000000000029", true], "no supplier record, TRN on the bill");
  assert.deepEqual([row("PI-N").trn, row("PI-N").vatClaimable], ["", false], "neither: not recoverable, as before");
  assert.deepEqual([row("PR-B").trn, row("PR-B").vatClaimable], ["100000000000011", true], "return takes its bill's TRN");
  assert.equal(row("PR-OLD").vatClaimable, true, "bill from an earlier period still gives its TRN to the return");
  assert.equal(row("PR-N").vatClaimable, false);
  assert.equal(v.inputVat, 11.5, "5 + 5 + 5 - 2.5 - 1");
  assert.deepEqual([v.noTrnPurchVat, v.missingVendorTrn], [4, 1], "PI-N 5 less its return 1");
  assert.equal(v.payable, -11.5);
});

test("corporate tax estimate: lines add up to net profit (write-offs included), the CSV says estimate, never filed", () => {
  const acc = { netSales: 900000, cogs: 300000, vendorDiscount: 1000, expenseTotal: 101000, stockAdjustLoss: 2000, warrantyStockGain: 500, netProfit: 498500 };
  const ct = corporateTax({ profit: acc.netProfit, revenue: acc.netSales, settings: { ctThreshold: 375000, ctRate: 9, sbrLimit: 3000000, sbrElected: false } });
  assert.deepEqual([ct.taxable, ct.atZero, ct.atRate, ct.tax], [498500, 375000, 123500, 11115], "9% above 375,000 - unchanged");
  const lines = ctEstimateLines(acc, ct);
  const profitParts = lines.filter((x) => x.section === "profit" && !x.total).reduce((t, x) => t + x.amount, 0);
  assert.equal(Math.round(profitParts * 100) / 100, acc.netProfit, "the shown lines add up to the net profit");
  assert.deepEqual(lines.filter((x) => ["stockAdjust", "warrantyStock"].includes(x.key)).map((x) => x.amount), [-2000, 500]);
  assert.equal(lines.find((x) => x.key === "tax").en, "Estimated Corporate Tax");
  const rows = ctEstimateRows(acc, ct, { fyLabel: "2026", from: "2026-01-01", to: "2026-12-31" });
  assert.equal(rows[0][0], "Corporate Tax - estimate (not a filed return)");
  assert.equal(rows[1][0], CT_ESTIMATE_NOTE.en);
  assert.match(CT_ESTIMATE_NOTE.en, /not a filed Corporate Tax return/);
  assert.match(CT_ESTIMATE_NOTE.en, /does not submit anything to the FTA/);
  assert.deepEqual(rows.find((r) => r[0] === "Estimated Corporate Tax"), ["Estimated Corporate Tax", "11115.00"]);
  assert.deepEqual(rows[rows.length - 1], ["Return and payment due by (FTA)", "2027-09-30"]);
  const all = rows.flat().join(" ") + " " + lines.map((x) => x.en).join(" ");
  assert.doesNotMatch(all.replace(CT_ESTIMATE_NOTE.en, "").replace("not a filed return", ""), /(filed|submitted|cleared|delivered|confirmed)/i);
  assert.match(ctEstimateRows(acc, ct, { bn: true })[0][0], /আনুমানিক/);
  const sbr = corporateTax({ profit: 100000, revenue: 2000000, settings: { ctThreshold: 375000, ctRate: 9, sbrLimit: 3000000, sbrElected: true } });
  assert.ok(ctEstimateLines({ ...acc, netProfit: 100000 }, sbr).some((x) => x.key === "sbr"));
  assert.deepEqual(ctEstimateLines(null, ct), []);
});
