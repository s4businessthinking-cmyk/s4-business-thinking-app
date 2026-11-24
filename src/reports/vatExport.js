// VAT export: the CSV files behind the Tax page, built from computeVat's result so the files always carry the same
// numbers as the screen. Headers are fixed English (with a Bangla label column on the summary) so a saved file reads the
// same whatever language the app is in; amounts are plain numbers (no thousands separators) so Excel can add them up.
import { n, r2, dayOf, inRange, isLive } from "./reportFilters.js";

const csvCell = (v) => { const s = String(v ?? ""); return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
/** Rows to CSV text with a UTF-8 BOM (Excel then opens Bangla and Arabic text correctly). */
export const csvText = (rows) => "\uFEFF" + rows.map((r) => (r || []).map(csvCell).join(",")).join("\r\n");
/** Amount for a CSV cell: two decimals, no separators. */
export const num = (v) => r2(n(v)).toFixed(2);

const slug = (v) => String(v || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
/** vat-{period}-{from}-{to}[-{part}].csv, e.g. vat-oct-dec-2026-2026-10-01-2026-12-31-sales.csv */
export function vatFileName({ periodLabel = "", from = "", to = "", part = "" } = {}) {
  return ["vat", slug(periodLabel) || "custom", from || "start", to || "end", slug(part)].filter(Boolean).join("-") + ".csv";
}

const salesType = (r) => (r.isReturn ? "Sales return" : "Sale");
const purchaseType = (r) => (r.isReturn ? "Purchase return" : r.isExpense ? "Expense" : "Purchase");

export const SALES_DETAIL_COLS = ["Date", "Type", "Document No", "Original Bill", "Customer", "Customer TRN", "Taxable", "VAT", "Total"];
export const PURCHASE_DETAIL_COLS = ["Date", "Type", "Document No", "Supplier Bill No", "Supplier", "Supplier TRN", "Taxable", "VAT", "Total"];

const totals = (rows) => ({ taxable: r2(rows.reduce((t, r) => t + n(r.taxable), 0)), vat: r2(rows.reduce((t, r) => t + n(r.vat), 0)), total: r2(rows.reduce((t, r) => t + n(r.total), 0)) });

/** Output VAT lines: every live sales bill and sales return in the period (returns negative). */
export function salesDetail(vat) {
  const list = vat?.salesRows || [];
  return {
    cols: SALES_DETAIL_COLS,
    rows: list.map((r) => [r.date, salesType(r), r.no, r.ref || "", r.party || "Cash customer", r.trn || "", num(r.taxable), num(r.vat), num(r.total)]),
    totals: totals(list), count: list.length,
  };
}

/**
 * Input VAT lines: purchase bills, purchase returns and expense bills with VAT. `rows` are the ones counted as
 * recoverable (supplier TRN on file); `excluded` are the ones left out because the supplier has no TRN.
 */
export function purchaseDetail(vat) {
  const all = vat?.purchaseRows || [];
  const line = (r) => [r.date, purchaseType(r), r.no, r.ref || "", r.party || "", r.trn || "", num(r.taxable), num(r.vat), num(r.total)];
  const counted = all.filter((r) => r.vatClaimable);
  const excluded = all.filter((r) => !r.vatClaimable && n(r.vat) !== 0);
  return { cols: PURCHASE_DETAIL_COLS, rows: counted.map(line), totals: totals(counted), excluded: excluded.map(line), excludedTotals: totals(excluded), count: counted.length };
}

/**
 * Do the detail lines add up to the summary? Output VAT = all sales lines; input VAT = the recoverable purchase lines
 * that carry VAT (no-VAT purchases add 0 either way).
 */
export function vatChecks(vat) {
  if (!vat) return null;
  const sales = salesDetail(vat).totals.vat;
  const purch = purchaseDetail(vat).totals.vat;
  const ok = (a, b) => Math.abs(r2(a) - r2(b)) < 0.01;
  return {
    salesDetailVat: sales, outputVat: r2(vat.outputVat), salesOk: ok(sales, vat.outputVat),
    purchaseDetailVat: purch, inputVat: r2(vat.inputVat), purchaseOk: ok(purch, vat.inputVat),
    payable: r2(vat.payable), payableOk: ok(r2(vat.outputVat - vat.inputVat), vat.payable),
  };
}

/** Documents dated in the period that the VAT return leaves out, by reason. */
export function excludedCounts(data, { shopId = "", from = "", to = "" } = {}) {
  const out = { salesDraft: 0, salesCancelled: 0, quotations: 0, deliveryNotes: 0, salesOpening: 0, purchaseDraft: 0, purchaseCancelled: 0, branchTransfers: 0, purchaseOpening: 0, returnsCancelled: 0 };
  const inPeriod = (d) => inRange(dayOf(d), from, to);
  (data?.salesInvoices || []).forEach((inv) => {
    if (!isLive(inv, shopId) || !inPeriod(inv.invoiceDate)) return;
    if (inv.docKind === "quotation" || inv.docKind === "salesOrder") out.quotations += 1;
    else if (inv.invoiceType === "delivery" || inv.docKind === "delivery") out.deliveryNotes += 1;
    else if (inv.status === "draft") out.salesDraft += 1;
    else if (inv.status === "cancelled") out.salesCancelled += 1;
    else if (inv.source === "openingBalance") out.salesOpening += 1;
  });
  (data?.deliveryNotes || []).forEach((dn) => { if (isLive(dn, shopId) && inPeriod(dn.invoiceDate)) out.deliveryNotes += 1; });
  (data?.purchaseInvoices || []).forEach((inv) => {
    if (!isLive(inv, shopId) || !inPeriod(inv.invoiceDate)) return;
    if (inv.internalTransfer || inv.sourceType === "branch_transfer") out.branchTransfers += 1;
    else if (inv.status === "draft") out.purchaseDraft += 1;
    else if (inv.status === "cancelled") out.purchaseCancelled += 1;
    else if (inv.source === "openingBalance") out.purchaseOpening += 1;
  });
  [...(data?.extras?.salesReturns || []), ...(data?.extras?.purchaseReturns || [])].forEach((r) => {
    if (isLive(r, shopId) && r.status === "cancelled" && inPeriod(r.returnDate)) out.returnsCancelled += 1;
  });
  return out;
}

/**
 * One file for the period: header, return summary, sales detail, purchase detail, excluded purchases, region split
 * and the checks. summary: [{ box, label, labelBn, amount }] from the Tax page; regions: computeVat regionRows.
 */
export function vatPackRows({ vat, summary = [], meta = {}, excluded = null }) {
  const s = salesDetail(vat), p = purchaseDetail(vat), c = vatChecks(vat);
  const blank = [];
  const out = [
    ["VAT period pack"], ["Shop", meta.shopName || ""], ["Shop TRN", meta.trn || ""], ["Country", meta.country || ""],
    ["Period", meta.periodLabel || ""], ["From", meta.from || ""], ["To", meta.to || ""], ["Currency", meta.currency || ""], ["Generated", meta.generatedAt || ""],
    blank, ["SUMMARY"], ["Box", "Item", "Item (BN)", "Amount"],
    ...summary.map((x) => [x.box || "", x.label, x.labelBn || "", x.amount == null ? "" : num(x.amount)]),
    blank, ["SALES DETAIL (OUTPUT VAT)"], s.cols, ...s.rows, ["Total", `${s.count} line(s)`, "", "", "", "", num(s.totals.taxable), num(s.totals.vat), num(s.totals.total)],
    blank, ["PURCHASE DETAIL (INPUT VAT, RECOVERABLE)"], p.cols, ...p.rows, ["Total", `${p.count} line(s)`, "", "", "", "", num(p.totals.taxable), num(p.totals.vat), num(p.totals.total)],
  ];
  if (p.excluded.length) {
    out.push(blank, ["PURCHASES NOT RECOVERABLE (SUPPLIER HAS NO TRN)"], p.cols, ...p.excluded, ["Total", `${p.excluded.length} line(s)`, "", "", "", "", num(p.excludedTotals.taxable), num(p.excludedTotals.vat), num(p.excludedTotals.total)]);
  }
  if ((vat?.regionRows || []).length) {
    out.push(blank, ["OUTPUT VAT BY EMIRATE / REGION"], ["Region", "Bills", "Taxable", "VAT"], ...vat.regionRows.map((x) => [x.region || "Not set", String(x.bills), num(x.taxable), num(x.vat)]));
  }
  out.push(blank, ["CHECKS"], ["Check", "Detail", "Summary", "Result"],
    ["Output VAT: sales detail vs summary", num(c.salesDetailVat), num(c.outputVat), c.salesOk ? "OK" : "MISMATCH"],
    ["Input VAT: purchase detail vs summary", num(c.purchaseDetailVat), num(c.inputVat), c.purchaseOk ? "OK" : "MISMATCH"],
    ["Net VAT: output - input", num(c.outputVat - c.inputVat), num(c.payable), c.payableOk ? "OK" : "MISMATCH"]);
  if (excluded) {
    out.push(blank, ["LEFT OUT OF THIS RETURN (DATED IN THE PERIOD)"], ["Reason", "Documents"],
      ["Sales drafts", String(excluded.salesDraft)], ["Cancelled sales bills", String(excluded.salesCancelled)], ["Quotations / sales orders", String(excluded.quotations)],
      ["Delivery notes", String(excluded.deliveryNotes)], ["Customer opening balances", String(excluded.salesOpening)], ["Purchase drafts", String(excluded.purchaseDraft)],
      ["Cancelled purchase bills", String(excluded.purchaseCancelled)], ["Branch-transfer bills", String(excluded.branchTransfers)], ["Supplier opening balances", String(excluded.purchaseOpening)],
      ["Cancelled returns", String(excluded.returnsCancelled)]);
  }
  return out;
}
