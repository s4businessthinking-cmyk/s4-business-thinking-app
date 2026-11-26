// Balance sheet as at a date, read from the global ledger balances so it always agrees with the trial balance.
// Purchases are booked as an expense in the ledger, so stock is brought in from the stock count at average cost:
// opening stock (product master) sits in equity, and the year's stock change goes into profit to date.
// A ledger account goes to assets when it has a debit balance and to liabilities when it has a credit balance,
// except income / expense (rolled into profit), capital / partner accounts (equity) and accounts the chart of accounts
// puts in an asset or liability group (that side, whatever the balance).
import { recordDay, dayOf } from "../accounts/periodLock.js";
import { n, r2, isLive } from "./reportFilters.js";
import { isFixedAssetAccount } from "../accounts/fixedAssets.js";

const add = (list, name, amount, key) => { list.push({ key, name, amount: r2(amount) }); };
const sum = (list) => r2(list.reduce((t, l) => t + l.amount, 0));
const byName = (a, b) => a.name.localeCompare(b.name);
// Journal accounts typed as plain capital / drawings belong to the owner, not to other assets or liabilities.
const OWNER_EQUITY = /^(owner'?s?\s+)?(capital|drawings?)(\s+(account|a\/c))?$/i;
// Posting types that bring money into a cash or bank account from the owner, an opening entry or another money account.
const FUNDING = new Set(["capitalIn", "journal", "contra", "opening", "bank"]);
const DOC_NO = {
  salesInvoices: "invoiceNo", purchaseInvoices: "invoiceNo", salesReceipts: "receiptNo", purchasePayments: "paymentNo",
  expenses: "expenseNo", accountVouchers: "voucherNo", salesReturns: "returnNo", purchaseReturns: "returnNo",
};
export const SECTION_ORDER = {
  assets: ["cash", "receivable", "supplierAdvance", "stock", "vatRefundable", "otherAsset", "fixedAsset"],
  liabilities: ["payable", "customerAdvance", "vatPayable", "overdraft", "otherLiability"],
  equity: ["equity"],
};

/** Stock documents dated on or before `asOf` (all when empty), shaped for computeStockMap. */
export function stockDocsUpTo(rows, asOf) {
  const upTo = (col) => (list) => (list || []).filter((d) => {
    if (!asOf) return true;
    // a warranty claim adds stock on the day the company replaced the unit
    const day = col === "warrantyClaims" && d?.replacedDate ? dayOf(d.replacedDate) : recordDay(col, d);
    return !day || day <= asOf;
  });
  const x = rows?.extras || {};
  const extras = {
    salesReturns: upTo("salesReturns")(x.salesReturns), purchaseReturns: upTo("purchaseReturns")(x.purchaseReturns),
    stockAdjustments: upTo("stockAdjustments")(x.stockAdjustments), goodsReceipts: upTo("goodsReceipts")(x.goodsReceipts),
    warrantyClaims: upTo("warrantyClaims")(x.warrantyClaims),
  };
  return {
    purchaseInvoices: upTo("purchaseInvoices")(rows?.purchaseInvoices), salesInvoices: upTo("salesInvoices")(rows?.salesInvoices),
    deliveryNotes: upTo("deliveryNotes")(rows?.deliveryNotes), extras,
  };
}

/** Opening stock from the product master at its opening rate, the same value averageCosts starts from. */
export function openingStockValue(products) {
  return r2((products || []).reduce((t, p) => {
    const q = n(p?.openingStock);
    return q > 0 ? t + q * (n(p.openingRate) || n(p.landingCost)) : t;
  }, 0));
}

/** Products below zero on hand: [{ id, code, name, qty }], most negative first. qty: Map(productId -> base qty). */
export function negativeStock(qty, products) {
  const byId = new Map((products || []).filter((p) => p?.id).map((p) => [p.id, p]));
  const out = [];
  (qty || new Map()).forEach((q, id) => {
    if (!(q < 0)) return;
    const p = byId.get(id);
    out.push({ id, code: p?.code || p?.barcode || "", name: p?.name || id, qty: q });
  });
  return out.sort((a, b) => a.qty - b.qty || a.name.localeCompare(b.name));
}

/**
 * Drafts and cancelled documents dated on or before `asOf`. Lists: [[collection, docs]].
 * -> { draft, cancelled, list: [{ col, id, no, date, status, amount }] } newest first.
 */
export function excludedDocs(lists, shopId, asOf) {
  const out = { draft: 0, cancelled: 0, list: [] };
  (lists || []).forEach(([col, docs]) => (docs || []).forEach((d) => {
    if (!isLive(d, shopId) || (d.status !== "draft" && d.status !== "cancelled")) return;
    if (d.docKind === "quotation" || d.invoiceType === "delivery") return;
    const day = recordDay(col, d);
    if (asOf && day && day > asOf) return;
    out[d.status] += 1;
    out.list.push({ col, id: d.id, no: d[DOC_NO[col]] || "", date: day, status: d.status, amount: r2(n(d.grandTotal ?? d.totalAmount ?? d.amount ?? d.total)) });
  }));
  out.list.sort((a, b) => b.date.localeCompare(a.date) || String(b.no).localeCompare(String(a.no), undefined, { numeric: true }));
  return out;
}

/**
 * Cash and bank accounts up to `asOf`: where the balance comes from, by posting type.
 * -> [{ key, name, dr, cr, balance, byType: [{ type, dr, cr }], funded }]; funded is false when nothing
 * (capital, journal, contra, opening, bank entry) ever put money in, the usual reason a cash account runs below zero.
 */
export function moneyBreakdown(postings, accounts, asOf) {
  const out = new Map();
  (postings || []).forEach((p) => {
    const a = accounts?.get(p.key);
    if (a?.group !== "money" || (asOf && p.date > asOf)) return;
    let m = out.get(p.key);
    if (!m) { m = { key: p.key, name: a.name, dr: 0, cr: 0, types: new Map() }; out.set(p.key, m); }
    m.dr = r2(m.dr + p.dr);
    m.cr = r2(m.cr + p.cr);
    const t = m.types.get(p.type) || { type: p.type, dr: 0, cr: 0 };
    t.dr = r2(t.dr + p.dr);
    t.cr = r2(t.cr + p.cr);
    m.types.set(p.type, t);
  });
  return [...out.values()].map((m) => {
    const byType = [...m.types.values()].sort((x, y) => (y.dr + y.cr) - (x.dr + x.cr));
    return { key: m.key, name: m.name, dr: m.dr, cr: m.cr, balance: r2(m.dr - m.cr), byType, funded: byType.some((t) => t.dr > 0 && FUNDING.has(t.type)) };
  }).sort(byName);
}

/**
 * accounts: Map(key -> { key, name, group }) and bal: Map(key -> debit minus credit) from the global ledger.
 * -> { assets, liabilities, equity } as [{ id, lines: [{ key, name, amount }], total }], their totals,
 * profit to date and the difference (0 when the books agree).
 */
// closedStock: stock value on the last closed year-end day (yearEnd.js) - later profit counts from it and the stock gain
// of the closed years shows in equity on its own line. Left out (no year closed) the sheet works as before.
export function buildBalanceSheet({ accounts, bal, closingStock = 0, openingStock = 0, closedStock = null }) {
  const cash = [], receivable = [], supplierAdvance = [], otherAsset = [], fixedAsset = [];
  const payable = [], customerAdvance = [], overdraft = [], otherLiability = [];
  const capital = [];
  let pl = 0, vat = 0;
  (accounts ? [...accounts.values()] : []).forEach((a) => {
    const v = r2(bal?.get(a.key) || 0);
    if (Math.abs(v) < 0.005) return;
    if (a.group === "income" || a.group === "expense") { pl = r2(pl + v); return; }
    if (a.group === "tax") { vat = r2(vat + v); return; }
    if (a.group === "equity" || (a.group === "other" && OWNER_EQUITY.test(String(a.name || "").trim()))) { add(capital, a.name, -v, a.key); return; }
    if (a.group === "money") { if (v > 0) add(cash, a.name, v, a.key); else add(overdraft, a.name, -v, a.key); return; }
    if (a.group === "customer") { if (v > 0) add(receivable, a.name, v, a.key); else add(customerAdvance, a.name, -v, a.key); return; }
    if (a.group === "vendor") { if (v < 0) add(payable, a.name, -v, a.key); else add(supplierAdvance, a.name, v, a.key); return; }
    // fixed asset cost and its accumulated depreciation stay together as one non-current section (cost less depreciation)
    if (isFixedAssetAccount(a.name)) { add(fixedAsset, a.name, v, a.key); return; }
    // a chart-of-accounts asset / liability group keeps the account on its side (a credit asset shows as a negative asset)
    if (a.group === "asset") { add(otherAsset, a.name, v, a.key); return; }
    if (a.group === "liability") { add(otherLiability, a.name, -v, a.key); return; }
    if (v > 0) add(otherAsset, a.name, v, a.key); else add(otherLiability, a.name, -v, a.key);
  });

  const stock = [];
  if (Math.abs(closingStock) >= 0.005) add(stock, "Closing stock", closingStock, "stock");
  const vatAsset = [], vatLiability = [];
  if (vat > 0) add(vatAsset, "VAT refundable", vat, "vat");
  if (vat < 0) add(vatLiability, "VAT payable", -vat, "vat");
  // Ledger profit is income less purchases and expenses; adding the stock change turns purchases into cost of goods sold.
  const stockBase = closedStock == null ? openingStock : closedStock;
  const profit = r2(-pl + closingStock - stockBase);
  const equityLines = [...capital.sort(byName)];
  if (Math.abs(openingStock) >= 0.005) add(equityLines, "Opening stock", openingStock, "openingStock");
  if (closedStock != null && Math.abs(closedStock - openingStock) >= 0.005) add(equityLines, "Stock gain of closed years", r2(closedStock - openingStock), "closedStockGain");
  if (Math.abs(profit) >= 0.005) add(equityLines, "Profit to date", profit, "profit");

  const section = (id, lines, sort = true) => ({ id, lines: sort ? lines.sort(byName) : lines, total: sum(lines) });
  const assets = [
    section("cash", cash), section("receivable", receivable), section("supplierAdvance", supplierAdvance),
    section("stock", stock, false), section("vatRefundable", vatAsset, false), section("otherAsset", otherAsset), section("fixedAsset", fixedAsset),
  ].filter((s) => s.lines.length);
  const liabilities = [
    section("payable", payable), section("customerAdvance", customerAdvance), section("vatPayable", vatLiability, false),
    section("overdraft", overdraft), section("otherLiability", otherLiability),
  ].filter((s) => s.lines.length);
  const equity = [section("equity", equityLines, false)].filter((s) => s.lines.length);

  const totalAssets = r2(assets.reduce((t, s) => t + s.total, 0));
  const totalLiabilities = r2(liabilities.reduce((t, s) => t + s.total, 0));
  const totalEquity = r2(equity.reduce((t, s) => t + s.total, 0));
  // every line is current except the fixed asset register's section
  const workingCapital = r2(totalAssets - sum(fixedAsset) - totalLiabilities);
  return {
    assets, liabilities, equity, totalAssets, totalLiabilities, totalEquity, profit,
    workingCapital, difference: r2(totalAssets - totalLiabilities - totalEquity),
  };
}

/**
 * P&L net profit for the same window as the balance sheet's "Profit to date" (from the last closed year-end, or from
 * the start, up to the as-at day) against that line. The sheet always balances because profit absorbs the stock change,
 * so this is the check that the profit report and the stock count tell the same story.
 * -> { plProfit, bsProfit, difference, agrees }; agrees within 1 fils-level rounding (0.05).
 */
export function profitReconcile(plNetProfit, bsProfit) {
  const plProfit = r2(plNetProfit), sheetProfit = r2(bsProfit);
  const difference = r2(plProfit - sheetProfit);
  return { plProfit, bsProfit: sheetProfit, difference, agrees: Math.abs(difference) < 0.05 };
}

/** Financial-year start date (YYYY-MM-DD) for the year that contains `asOf`. fyStartMonth = 1..12 (shop setting). */
export function fyStartDate(asOf, fyStartMonth = 1) {
  const day = String(asOf || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return "";
  const y = parseInt(day.slice(0, 4), 10);
  const m = parseInt(day.slice(5, 7), 10);
  const startM = Math.max(1, Math.min(12, parseInt(fyStartMonth, 10) || 1));
  const startY = m >= startM ? y : y - 1;
  return `${startY}-${String(startM).padStart(2, "0")}-01`;
}

/** Last day of the previous financial year (= day before FY start). Use as Opening Balance Sheet as-at. */
export function openingBsAsOf(asOf, fyStartMonth = 1) {
  const start = fyStartDate(asOf, fyStartMonth);
  if (!start) return "";
  const d = new Date(`${start}T12:00:00`);
  d.setDate(d.getDate() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * One side of the sheet lined up against a compare sheet, so a section or line present on only one date is kept.
 * -> [{ id, total, then, lines: [{ key, name, amount, then }] }] in SECTION_ORDER; `then` is null without a compare sheet.
 */
export function alignSides(sheet, cmp, side) {
  const nowById = new Map((sheet?.[side] || []).map((s) => [s.id, s]));
  const thenById = new Map((cmp?.[side] || []).map((s) => [s.id, s]));
  return SECTION_ORDER[side].filter((id) => nowById.has(id) || thenById.has(id)).map((id) => {
    const now = nowById.get(id), then = thenById.get(id);
    const thenLines = new Map((then?.lines || []).map((l) => [l.key, l]));
    const lines = (now?.lines || []).map((l) => ({ ...l, then: cmp ? (thenLines.get(l.key)?.amount || 0) : null }));
    const seen = new Set(lines.map((l) => l.key));
    if (cmp) (then?.lines || []).filter((l) => !seen.has(l.key)).sort(byName).forEach((l) => lines.push({ ...l, amount: 0, then: l.amount }));
    return { id, total: now?.total || 0, then: cmp ? (then?.total || 0) : null, lines };
  });
}
