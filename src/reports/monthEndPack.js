// Month-end accountant pack: the period's trial balance, profit & loss, balance sheet, cash flow, VAT, debtors and
// creditors ageing, closing stock and bank reconciliation in one Excel file and one printout (PDF from the print
// dialog), with the checks to clear before the books are closed. Everything is taken from the reports' own
// results - nothing is worked out a second way here, so the pack always agrees with each screen.
import { trialBalanceRows } from "./trialBalance.js";
import { vat201Rows } from "./vat201.js";
import { reconciliationRows } from "../accounts/bankStatement.js";
import { AGE_BUCKETS } from "./partyAging.js";

const r2 = (v) => Math.round(((Number(v) || 0) + Number.EPSILON) * 100) / 100;
const num = (v) => (v == null || v === "" ? "" : r2(v).toFixed(2));
const zero = (v) => Math.abs(Number(v) || 0) < 0.005;

const BS_LABEL = {
  cash: "Cash & bank", receivable: "Trade receivables (customers)", supplierAdvance: "Advances to suppliers", stock: "Closing stock",
  vatRefundable: "VAT refundable", otherAsset: "Other assets", fixedAsset: "Fixed assets (cost less depreciation)", payable: "Trade payables (suppliers)", customerAdvance: "Advances from customers",
  vatPayable: "VAT payable", overdraft: "Bank overdraft / cash shortfall", otherLiability: "Other liabilities", equity: "Capital, reserves and profit",
};

/**
 * Checks before closing. -> [{ id, ok, warn, en, bn }] (warn = can close but look first; !ok = should not close yet)
 * bank: { configured, statement (saved statement for the period end or null), rec } | null
 */
export function packChecks({ tb, sheet, ret201 = null, vat = null, bank = null, drafts = 0, lockDate = "", to = "" }) {
  const out = [];
  out.push({ id: "tb", ok: !!tb && zero(tb.difference), en: zero(tb?.difference) ? "Trial balance balances (debits = credits)" : `Trial balance is out by ${num(tb?.difference)}`, bn: zero(tb?.difference) ? "ট্রায়াল ব্যালেন্স মিলেছে (ডেবিট = ক্রেডিট)" : `ট্রায়াল ব্যালেন্সে পার্থক্য ${num(tb?.difference)}` });
  out.push({ id: "bs", ok: !!sheet && zero(sheet.difference), en: zero(sheet?.difference) ? "Balance sheet balances" : `Balance sheet is out by ${num(sheet?.difference)}`, bn: zero(sheet?.difference) ? "ব্যালেন্স শিট মিলেছে" : `ব্যালেন্স শিটে পার্থক্য ${num(sheet?.difference)}` });
  if (ret201) {
    const unmapped = ret201.unmapped.rows.length, noTrn = ret201.excluded.rows.length;
    out.push({ id: "vat", ok: ret201.agrees, warn: ret201.agrees && (unmapped > 0 || noTrn > 0),
      en: !ret201.agrees ? "VAT201 boxes do not add up to the VAT totals" : unmapped || noTrn ? `VAT201 ready, but ${unmapped} sale(s) have no Emirate and ${noTrn} purchase(s) no supplier TRN` : "VAT201 boxes agree with the VAT totals",
      bn: !ret201.agrees ? "VAT201 বক্স VAT-এর মোটের সাথে মেলেনি" : unmapped || noTrn ? `VAT201 তৈরি, তবে ${unmapped}টি বিক্রির Emirate নেই, ${noTrn}টি ক্রয়ের সাপ্লায়ারের TRN নেই` : "VAT201 বক্স VAT-এর মোটের সাথে মিলেছে" });
  } else if (vat) {
    out.push({ id: "vat", ok: true, warn: vat.missingVendorTrn > 0, en: vat.missingVendorTrn ? `VAT worked out; ${vat.missingVendorTrn} purchase(s) have no supplier TRN` : "VAT worked out from the bills", bn: vat.missingVendorTrn ? `VAT হিসাব হয়েছে; ${vat.missingVendorTrn}টি ক্রয়ের সাপ্লায়ারের TRN নেই` : "বিল থেকে VAT হিসাব হয়েছে" });
  }
  if (bank && bank.configured) {
    const st = bank.statement;
    const diff = st ? r2(st.difference) : null;
    out.push({ id: "bank", ok: !st || zero(diff), warn: !st,
      en: !st ? `No bank reconciliation saved for ${to}` : zero(diff) ? "Bank reconciled at the period end" : `Bank reconciliation is out by ${num(diff)}`,
      bn: !st ? `${to} তারিখের ব্যাংক মেলানো সেভ করা নেই` : zero(diff) ? "মাস শেষে ব্যাংক মিলেছে" : `ব্যাংক মেলানোতে পার্থক্য ${num(diff)}` });
  }
  if (drafts > 0) out.push({ id: "drafts", ok: true, warn: true, en: `${drafts} draft bill(s) in the period are not in these figures`, bn: `এই সময়ের ${drafts}টি draft বিল হিসাবে নেই` });
  if (lockDate && to && lockDate >= to) out.push({ id: "lock", ok: true, en: `Books already closed up to ${lockDate}`, bn: `${lockDate} পর্যন্ত হিসাব আগেই বন্ধ` });
  return out;
}

/** Can the period be closed? -> "ok" | "warn" (closable after a second look) | "blocked" */
export const packStatus = (checks) => (checks.some((c) => !c.ok) ? "blocked" : checks.some((c) => c.warn) ? "warn" : "ok");

const agingSection = (title, aging) => ({
  title,
  cols: ["Party", "Due", ...AGE_BUCKETS.map((b) => `${b[2]} days`)],
  rows: [
    ...(aging?.rows || []).map((r) => [r.name, num(r.due), ...r.buckets.map(num)]),
    ["TOTAL", num(aging?.totals?.due), ...(aging?.totals?.buckets || []).map(num)],
    ...(aging && !zero(aging.totals.advance) ? [["Advances (credit balances)", num(-aging.totals.advance), ...AGE_BUCKETS.map(() => "")]] : []),
  ],
});

/**
 * The pack's sections: [{ id, title, cols, rows }] - the same list goes to the Excel file and the printout.
 * pl: computeAccounts(); sheet: buildBalanceSheet(); cash: buildCashFlow(); debtors / creditors: buildAging().
 */
export function packSections({ meta = {}, checks = [], tb, pl, sheet, cash, vat, ret201 = null, debtors, creditors, stockValue = 0, bank = null }) {
  const sections = [];
  sections.push({ id: "cover", title: "MONTH-END PACK", cols: ["Item", "Value"], rows: [
    ["Shop", meta.shopName || ""], ["TRN", meta.trn || ""], ["Period", `${meta.from || "start"} to ${meta.to || ""}`], ["Currency", meta.currency || ""], ["Generated", meta.generatedAt || ""],
    ...checks.map((c) => [`Check: ${c.id}`, `${!c.ok ? "NOT OK" : c.warn ? "LOOK" : "OK"} - ${c.en}`]),
  ] });
  if (tb) {
    const rows = trialBalanceRows(tb);
    sections.push({ id: "tb", title: "TRIAL BALANCE", cols: rows[0].slice(1), rows: rows.slice(1).map((r) => r.slice(1)) });
  }
  if (pl) {
    sections.push({ id: "pl", title: "PROFIT & LOSS", cols: ["Particulars", "Amount"], rows: [
      ["Net sales (after returns, before VAT)", num(pl.netSales)], ["Cost of goods sold (average cost)", num(-pl.cogs)], ["Gross profit", num(pl.grossProfit)],
      ["Discount received from suppliers", num(pl.vendorDiscount)], ["Expenses", num(-pl.expenseTotal)], ["Net profit", num(pl.netProfit)],
    ] });
  }
  if (sheet) {
    const block = (label, list, total) => [[label.toUpperCase(), ""], ...list.flatMap((s) => [[`  ${BS_LABEL[s.id] || s.id}`, num(s.total)], ...s.lines.map((l) => [`      ${l.name}`, num(l.amount)])]), [`Total ${label.toLowerCase()}`, num(total)]];
    sections.push({ id: "bs", title: `BALANCE SHEET AS AT ${meta.to || ""}`, cols: ["Particulars", "Amount"], rows: [
      ...block("Assets", sheet.assets, sheet.totalAssets), ...block("Liabilities", sheet.liabilities, sheet.totalLiabilities), ...block("Equity", sheet.equity, sheet.totalEquity),
      ["Difference", num(sheet.difference)],
    ] });
  }
  if (cash) {
    sections.push({ id: "cash", title: "CASH FLOW (CASH & BANK)", cols: ["Particulars", "In", "Out", "Net"], rows: [
      ["Opening cash & bank", "", "", num(cash.opening)],
      ...cash.byActivity.map((a) => [{ operating: "Trading (customers, suppliers, expenses, VAT)", owner: "Owner / partners", other: "Other" }[a.id] || a.id, num(a.in), num(a.out), num(a.net)]),
      ["Closing cash & bank", num(cash.totalIn), num(cash.totalOut), num(cash.closing)],
    ] });
  }
  if (ret201) {
    const rows = vat201Rows(ret201);
    sections.push({ id: "vat", title: "VAT RETURN (VAT201)", cols: rows[0], rows: rows.slice(1) });
  } else if (vat) {
    sections.push({ id: "vat", title: `${meta.taxName || "VAT"} RETURN`, cols: ["Particulars", "Taxable", "Tax"], rows: [
      ["Standard-rated sales", num(vat.stdSales), num(vat.outputVat)], ["Sales without tax", num(vat.noVatSales), ""],
      ["Standard-rated purchases & expenses (recoverable)", num(vat.stdPurch), num(vat.inputVat)], [vat.payable >= 0 ? "Net payable" : "Net refundable", "", num(vat.payable)],
    ] });
  }
  if (debtors) sections.push({ id: "debtors", ...agingSection(`DEBTORS AGEING AS AT ${meta.to || ""}`, debtors) });
  if (creditors) sections.push({ id: "creditors", ...agingSection(`CREDITORS AGEING AS AT ${meta.to || ""}`, creditors) });
  sections.push({ id: "stock", title: `CLOSING STOCK AS AT ${meta.to || ""}`, cols: ["Particulars", "Amount"], rows: [["Stock on hand at average cost", num(stockValue)]] });
  if (bank && bank.configured) {
    const rows = reconciliationRows(bank.rec, { asOf: meta.to, statementBalance: bank.statement ? bank.statement.statementBalance : null, typeLabel: bank.typeLabel });
    sections.push({ id: "bank", title: `BANK RECONCILIATION AS AT ${meta.to || ""}`, cols: rows[0], rows: rows.slice(1) });
  }
  return sections;
}

/** One CSV sheet: each section's title, header and rows, a blank line between. */
export const packCsvRows = (sections) => sections.flatMap((s, i) => [...(i ? [[]] : []), [s.title], s.cols, ...s.rows]);
export const packFileName = (from, to) => `month-end-pack-${from || "start"}-${to || "today"}.csv`;

/** Joins several printable documents (same print design) into one, each starting on a new page. */
export function combinePrintHtml(htmls) {
  const list = (htmls || []).filter(Boolean);
  if (!list.length) return "";
  const head = (list[0].match(/<head[^>]*>[\s\S]*?<\/head>/i) || ["<head><meta charset=\"utf-8\"></head>"])[0];
  const bodyOf = (h) => (h.match(/<body[^>]*>([\s\S]*?)<\/body>/i) || [null, h])[1];
  const pages = list.map((h, i) => `<div style="${i ? "page-break-before:always;break-before:page;" : ""}">${bodyOf(h)}</div>`).join("\n");
  return `<!DOCTYPE html><html>${head}<body>${pages}</body></html>`;
}
