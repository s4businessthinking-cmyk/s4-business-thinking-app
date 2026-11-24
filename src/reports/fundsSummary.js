// Funds / working capital: the Balance Sheet's current position regrouped as liquid funds, debtors, creditors,
// stock and the rest. Built only from buildBalanceSheet's sections, so every figure is the Balance Sheet's own for the
// same as-at date and working capital is exactly sheet.workingCapital (total assets less total liabilities; the shop
// has no fixed-asset register, so the Balance Sheet treats every line as current).
import { r2 } from "./reportFilters.js";

const ASSET_SECTIONS = ["cash", "receivable", "supplierAdvance", "stock", "vatRefundable", "otherAsset"];
const LIABILITY_SECTIONS = ["payable", "customerAdvance", "vatPayable", "overdraft", "otherLiability"];
const byAmount = (a, b) => b.amount - a.amount || a.name.localeCompare(b.name);

/** sheet: buildBalanceSheet result. -> blocks, totals, workingCapital and a check that the blocks add up. */
export function fundsFromSheet(sheet, { top = 10 } = {}) {
  const sec = (side, id) => (sheet?.[side] || []).find((s) => s.id === id) || { id, lines: [], total: 0 };
  const cash = sec("assets", "cash"), overdraft = sec("liabilities", "overdraft");
  const receivable = sec("assets", "receivable"), customerAdvance = sec("liabilities", "customerAdvance");
  const payable = sec("liabilities", "payable"), supplierAdvance = sec("assets", "supplierAdvance");
  const stock = sec("assets", "stock");
  const vatIn = sec("assets", "vatRefundable"), vatOut = sec("liabilities", "vatPayable");
  const otherA = sec("assets", "otherAsset"), otherL = sec("liabilities", "otherLiability");

  const party = (s) => ({ total: r2(s.total), count: s.lines.length, top: [...s.lines].sort(byAmount).slice(0, top), lines: s.lines });
  const blocks = {
    liquid: { accounts: cash.lines, total: r2(cash.total), overdraft: overdraft.lines, overdraftTotal: r2(overdraft.total), net: r2(cash.total - overdraft.total) },
    receivables: { ...party(receivable), advances: r2(customerAdvance.total), advanceCount: customerAdvance.lines.length },
    payables: { ...party(payable), advances: r2(supplierAdvance.total), advanceCount: supplierAdvance.lines.length },
    inventory: r2(stock.total),
    vat: { refundable: r2(vatIn.total), payable: r2(vatOut.total) },
    other: { assets: r2(otherA.total), assetLines: otherA.lines, liabilities: r2(otherL.total), liabilityLines: otherL.lines },
  };
  const assets = r2(ASSET_SECTIONS.reduce((t, id) => t + sec("assets", id).total, 0));
  const liabilities = r2(LIABILITY_SECTIONS.reduce((t, id) => t + sec("liabilities", id).total, 0));
  const workingCapital = r2(sheet?.workingCapital ?? assets - liabilities);
  return {
    blocks, assets, liabilities, workingCapital,
    // the regrouped blocks must land on the Balance Sheet's own totals
    agrees: Math.abs(assets - r2(sheet?.totalAssets)) < 0.01 && Math.abs(liabilities - r2(sheet?.totalLiabilities)) < 0.01 && Math.abs(r2(assets - liabilities) - workingCapital) < 0.01,
  };
}

/** Summary lines shared by screen, print and CSV: [{ key, label (EN), amount, side: "asset" | "liability" | "result" }]. */
export function fundsLines(f) {
  const b = f.blocks;
  return [
    { key: "liquid", label: "Liquid funds (cash and bank)", amount: b.liquid.total, side: "asset" },
    { key: "receivables", label: "Debtors (customers owe)", amount: b.receivables.total, side: "asset" },
    { key: "supplierAdvance", label: "Advances to suppliers", amount: b.payables.advances, side: "asset" },
    { key: "inventory", label: "Stock (average cost)", amount: b.inventory, side: "asset" },
    { key: "vatRefundable", label: "VAT refundable", amount: b.vat.refundable, side: "asset" },
    { key: "otherAssets", label: "Other assets", amount: b.other.assets, side: "asset" },
    { key: "assets", label: "Total current assets", amount: f.assets, side: "total" },
    { key: "payables", label: "Creditors (owed to suppliers)", amount: b.payables.total, side: "liability" },
    { key: "customerAdvance", label: "Advances from customers", amount: b.receivables.advances, side: "liability" },
    { key: "vatPayable", label: "VAT payable", amount: b.vat.payable, side: "liability" },
    { key: "overdraft", label: "Bank overdraft / cash shortfall", amount: b.liquid.overdraftTotal, side: "liability" },
    { key: "otherLiabilities", label: "Other liabilities", amount: b.other.liabilities, side: "liability" },
    { key: "liabilities", label: "Total current liabilities", amount: f.liabilities, side: "total" },
    { key: "workingCapital", label: "Working capital (assets - liabilities)", amount: f.workingCapital, side: "result" },
  ];
}

/** CSV rows: fixed English headers, plain-number amounts; compare adds the second date and the difference. */
export function fundsCsvRows(f, { asOf = "", cmp = null, cmpAsOf = "" } = {}) {
  const now = fundsLines(f);
  const then = cmp ? new Map(fundsLines(cmp).map((l) => [l.key, l.amount])) : null;
  const cols = cmp ? ["Section", "Item", asOf, cmpAsOf, "Difference"] : ["Section", "Item", `Amount ${asOf}`];
  const section = (l) => (l.side === "asset" ? "Current assets" : l.side === "liability" ? "Current liabilities" : l.side === "total" ? "Total" : "Result");
  const out = [cols, ...now.map((l) => [section(l), l.label, l.amount.toFixed(2), ...(then ? [(then.get(l.key) || 0).toFixed(2), r2(l.amount - (then.get(l.key) || 0)).toFixed(2)] : [])])];
  const detail = (title, lines) => {
    if (!lines.length) return;
    out.push([], [title], ["Account / party", "Amount"]);
    lines.forEach((x) => out.push([x.name, r2(x.amount).toFixed(2)]));
  };
  detail("Cash and bank accounts", f.blocks.liquid.accounts);
  detail("Overdrawn cash / bank accounts", f.blocks.liquid.overdraft);
  detail("Debtors", [...f.blocks.receivables.lines].sort(byAmount));
  detail("Creditors", [...f.blocks.payables.lines].sort(byAmount));
  return out;
}

export const fundsFileName = (asOf) => `funds-working-capital-${asOf}.csv`;
