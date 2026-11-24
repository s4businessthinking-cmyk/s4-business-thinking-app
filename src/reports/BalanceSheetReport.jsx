// Balance sheet as at a date: assets, liabilities and equity from the global ledger, with stock at average cost.
// Read-only; worked out from the saved documents the same way as the Global Ledger trial balance.
import React, { useEffect, useMemo, useRef, useState } from "react";
import { PM_CSS } from "../product-master/pmStyles";
import { SI_CSS, usePmFitHeight, usePmMobile } from "../sales-invoice/siSkin";
import { offlineList } from "../offline/offlineRepository";
import { computeStockMap, loadInvoiceRows, rowsOf } from "../inventory/stockFromInvoices";
import { expenseCategoryLabel } from "../expenses/ExpensesTab.jsx";
import { printWithSettings } from "../print/printSettings.js";
import { generateStatementHTML } from "../print/printDesign.js";
import { saveTextFile } from "../utils/saveTextFile.js";
import { buildGlobalLedger, balances } from "../ledger/globalLedger.js";
import { TYPE_LABEL } from "../ledger/GlobalLedgerWindow.jsx";
import { averageCosts } from "./averageCost.js";
import { livePurchasesOf, liveReturnsOf, r2 } from "./reportFilters.js";
import {
  alignSides, buildBalanceSheet, excludedDocs, fyStartDate, moneyBreakdown, negativeStock, openingBsAsOf, openingStockValue, stockDocsUpTo,
} from "./balanceSheet.js";

const money = (v) => r2(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const qtyFmt = (v) => (Math.round((Number(v) || 0) * 1000) / 1000).toLocaleString("en-US", { maximumFractionDigits: 3 });
const localDay = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const fmtDay = (d) => (d ? String(d).slice(0, 10).split("-").reverse().join("/") : "");
const csvCell = (v) => { const s = String(v ?? ""); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
const csvText = (rows) => "\uFEFF" + rows.map((r) => r.map((c) => csvCell(String(c ?? "").trim())).join(",")).join("\r\n");

const SECTION_LABEL = {
  cash: ["নগদ ও ব্যাংক", "Cash & bank"],
  receivable: ["কাস্টমারদের কাছে পাওনা", "Trade receivables (customers)"],
  supplierAdvance: ["সাপ্লায়ারকে অগ্রিম", "Advances to suppliers"],
  stock: ["স্টক", "Inventory"],
  vatRefundable: ["VAT ফেরতযোগ্য", "VAT refundable"],
  otherAsset: ["অন্যান্য সম্পদ", "Other assets"],
  payable: ["সাপ্লায়ারদের দেনা", "Trade payables (suppliers)"],
  customerAdvance: ["কাস্টমারের অগ্রিম", "Advances from customers"],
  vatPayable: ["VAT দেনা", "VAT payable"],
  overdraft: ["ব্যাংক ওভারড্রাফট / নগদ ঘাটতি", "Bank overdraft / cash shortfall"],
  otherLiability: ["অন্যান্য দেনা", "Other liabilities"],
  equity: ["মূলধন ও পার্টনার", "Capital & partners"],
};
const LINE_LABEL = {
  stock: ["সমাপনী স্টক (গড় খরচে)", "Closing stock (average cost)"],
  vat: ["নিট VAT", "Net VAT"],
  openingStock: ["ওপেনিং স্টক (প্রোডাক্ট মাস্টার)", "Opening stock (product master)"],
  profit: ["আজ পর্যন্ত লাভ / ক্ষতি", "Profit / loss to date"],
};
const DOC_LABEL = {
  salesInvoices: ["সেলস ইনভয়েস", "Sales invoice"], purchaseInvoices: ["পারচেজ ইনভয়েস", "Purchase invoice"],
  salesReceipts: ["রসিদ", "Receipt"], purchasePayments: ["পেমেন্ট", "Payment"], expenses: ["খরচ", "Expense"],
  accountVouchers: ["জার্নাল / কন্ট্রা", "Journal / contra"], salesReturns: ["সেলস রিটার্ন", "Sales return"], purchaseReturns: ["পারচেজ রিটার্ন", "Purchase return"],
};
// Party sections fold into one line unless party detail is on.
const PARTY_SECTIONS = new Set(["receivable", "supplierAdvance", "payable", "customerAdvance"]);
// Summary figures wrap instead of being cut off with an ellipsis.
const BS_CSS = `
.bs-kpis { grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); }
.bs-kpis .si-kpi b { white-space: normal; overflow: visible; text-overflow: clip; overflow-wrap: anywhere; font-variant-numeric: tabular-nums; }
.bs-kpis .si-kpi span { white-space: normal; }
.bs-table { width: 100%; border-collapse: collapse; font-size: 11.5px; }
.bs-table th { text-align: left; background: #e8eef7; padding: 3px 5px; border-bottom: 1px solid #8797a9; white-space: nowrap; }
.bs-table td { padding: 3px 5px; border-bottom: 1px solid #e2e8f0; vertical-align: top; }
.bs-table .num { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
`;

export default function BalanceSheetReport({
  lang = "en", shopId, products = [], customers = [], vendors = [], shopName = "", cur = "AED", toast, canPrint = false, fyStartMonth = 1,
}) {
  const bn = lang === "bn";
  const L = (b, e) => (bn ? b : e);
  const [asOf, setAsOf] = useState(() => localDay());
  const [compareAsOf, setCompareAsOf] = useState("");
  const [detail, setDetail] = useState(false);
  const [panel, setPanel] = useState("");
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [tick, setTick] = useState(0);
  const mobile = usePmMobile();
  const rootRef = useRef(null);
  const fitH = usePmFitHeight(rootRef, mobile);

  useEffect(() => {
    let cancelled = false;
    setError("");
    Promise.all([
      loadInvoiceRows(), offlineList("salesReceipts"), offlineList("purchasePayments"), offlineList("expenses"),
      offlineList("accountVouchers").catch(() => []), offlineList("partnerEntries").catch(() => []), offlineList("bankReconciliations").catch(() => []),
    ]).then(([rows, rc, pm, ex, av, pe, br]) => {
      if (cancelled) return;
      setData({
        rows, salesInvoices: rows.salesInvoices, purchaseInvoices: rows.purchaseInvoices, salesReturns: rows.extras?.salesReturns || [], purchaseReturns: rows.extras?.purchaseReturns || [],
        receipts: rowsOf(rc), payments: rowsOf(pm), expenses: rowsOf(ex), accountVouchers: rowsOf(av), partnerEntries: rowsOf(pe),
        bankEntries: rowsOf(br).filter((d) => d?.kind === "entry"),
      });
    }).catch((err) => { console.warn("[S4 Balance Sheet] load failed", err); if (!cancelled) setError(String(err?.message || err)); });
    return () => { cancelled = true; };
  }, [shopId, tick]);

  useEffect(() => {
    const refresh = () => { if (document.visibilityState !== "hidden") setTick((v) => v + 1); };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => { window.removeEventListener("focus", refresh); document.removeEventListener("visibilitychange", refresh); };
  }, []);

  const day = asOf || localDay();
  const cmpDay = compareAsOf && compareAsOf !== day ? compareAsOf : "";
  const fyMonth = Math.max(1, Math.min(12, Number(fyStartMonth) || 1));
  const ledger = useMemo(() => (data ? buildGlobalLedger(data, { shopId, customers, vendors, expenseLabel: (e) => expenseCategoryLabel(e, false) }) : null), [data, shopId, customers, vendors]);
  const openingStock = useMemo(() => openingStockValue(products), [products]);

  // Stock on a day at average purchase cost up to that day (same valuation as P&L). Negative quantities are listed, not valued.
  const stockAt = (cutDay) => {
    if (!data || !cutDay) return null;
    const cut = stockDocsUpTo(data.rows, cutDay);
    const purchases = livePurchasesOf(cut.purchaseInvoices, shopId).filter((inv) => inv.source !== "openingBalance");
    const avg = averageCosts(products, purchases, cutDay, liveReturnsOf(cut.extras.purchaseReturns, shopId));
    const qty = computeStockMap(products, cut.purchaseInvoices, cut.salesInvoices, shopId, cut.deliveryNotes, cut.extras);
    let value = 0, unpriced = 0;
    qty.forEach((q, id) => {
      if (q <= 0) return;
      const cost = avg.get(id) || 0;
      if (!cost) unpriced += 1;
      value += q * cost;
    });
    return { value: r2(value), negatives: negativeStock(qty, products), unpriced };
  };
  const stock = useMemo(() => stockAt(day), [data, products, shopId, day]); // eslint-disable-line react-hooks/exhaustive-deps
  const stockCmp = useMemo(() => (cmpDay ? stockAt(cmpDay) : null), [data, products, shopId, cmpDay]); // eslint-disable-line react-hooks/exhaustive-deps

  const sheetAt = (d, st) => (ledger && st ? buildBalanceSheet({ accounts: ledger.accounts, bal: balances(ledger.postings, d), closingStock: st.value, openingStock }) : null);
  const sheet = useMemo(() => sheetAt(day, stock), [ledger, stock, day, openingStock]); // eslint-disable-line react-hooks/exhaustive-deps
  const sheetCmp = useMemo(() => (cmpDay ? sheetAt(cmpDay, stockCmp) : null), [ledger, stockCmp, cmpDay, openingStock]); // eslint-disable-line react-hooks/exhaustive-deps
  const moneyRows = useMemo(() => (ledger ? moneyBreakdown(ledger.postings, ledger.accounts, day) : []), [ledger, day]);

  const excluded = useMemo(() => (data ? excludedDocs([
    ["salesInvoices", data.salesInvoices], ["purchaseInvoices", data.purchaseInvoices], ["salesReceipts", data.receipts], ["purchasePayments", data.payments],
    ["expenses", data.expenses], ["accountVouchers", data.accountVouchers], ["salesReturns", data.salesReturns], ["purchaseReturns", data.purchaseReturns],
  ], shopId, day) : { draft: 0, cancelled: 0, list: [] }), [data, shopId, day]);

  const sectionName = (id) => { const x = SECTION_LABEL[id]; return x ? L(x[0], x[1]) : id; };
  const lineName = (l) => { const x = LINE_LABEL[l.key]; return x ? L(x[0], x[1]) : l.name; };
  const typeName = (t) => { const x = TYPE_LABEL[t]; return x ? L(x[0], x[1]) : t; };
  const docName = (c) => { const x = DOC_LABEL[c]; return x ? L(x[0], x[1]) : c; };
  const statusName = (s) => (s === "draft" ? "Draft" : L("বাতিল", "Cancelled"));
  const partyCount = (k) => L(`${k}টি পার্টি`, `${k} part${k === 1 ? "y" : "ies"}`);
  // Section lines as shown: party sections fold into one line unless party detail is on.
  const linesOf = (s) => (PARTY_SECTIONS.has(s.id) && !detail
    ? [{ key: `${s.id}:all`, name: partyCount(s.lines.filter((l) => Math.abs(l.amount) >= 0.005).length), amount: s.total, then: s.then }]
    : s.lines.map((l) => ({ ...l, name: lineName(l) })));

  const sides = sheet ? [
    { id: "assets", title: L("সম্পদ", "Assets"), total: sheet.totalAssets, then: sheetCmp?.totalAssets, totalLabel: L("মোট সম্পদ", "Total assets") },
    { id: "liabilities", title: L("দেনা", "Liabilities"), total: sheet.totalLiabilities, then: sheetCmp?.totalLiabilities, totalLabel: L("মোট দেনা", "Total liabilities") },
    { id: "equity", title: L("মালিকানা (ইকুইটি / নেট ওয়ার্থ)", "Equity (net worth)"), total: sheet.totalEquity, then: sheetCmp?.totalEquity, totalLabel: L("মোট ইকুইটি / নেট ওয়ার্থ", "Total equity / net worth") },
  ].map((side) => ({ ...side, sections: alignSides(sheet, sheetCmp, side.id) })) : [];
  const liabEq = sheet ? r2(sheet.totalLiabilities + sheet.totalEquity) : 0;
  const liabEqThen = sheetCmp ? r2(sheetCmp.totalLiabilities + sheetCmp.totalEquity) : null;

  const amtCells = (now, then) => (sheetCmp ? [money(now), money(then || 0), money(r2(now - (then || 0)))] : [money(now)]);
  const blank = sheetCmp ? ["", "", ""] : [""];

  // Rows shared by print and CSV
  const reportRows = () => {
    const rows = [];
    sides.forEach((side) => {
      rows.push([side.title.toUpperCase(), ...blank]);
      side.sections.forEach((s) => {
        rows.push([`   ${sectionName(s.id)}`, ...blank]);
        linesOf(s).forEach((l) => rows.push([`      ${l.name}`, ...amtCells(l.amount, l.then)]));
        rows.push([`   ${L("মোট", "Total")} ${sectionName(s.id)}`, ...amtCells(s.total, s.then)]);
      });
      rows.push([side.totalLabel, ...amtCells(side.total, side.then)]);
    });
    rows.push([L("মোট দেনা ও ইকুইটি", "Total liabilities and equity"), ...amtCells(liabEq, liabEqThen)]);
    rows.push([L("ওয়ার্কিং ক্যাপিটাল (সম্পদ − দেনা)", "Working capital (assets − liabilities)"), ...amtCells(sheet.workingCapital, sheetCmp?.workingCapital)]);
    return rows;
  };
  const title = L("ব্যালেন্স শিট", "Balance Sheet");
  const subtitle = sheetCmp
    ? `${L("পর্যন্ত", "As at")} ${fmtDay(day)}  ${L("বনাম", "vs")} ${fmtDay(cmpDay)}`
    : `${L("পর্যন্ত", "As at")} ${fmtDay(day)}`;
  const amountCols = sheetCmp
    ? [{ label: `${fmtDay(day)} (${cur})`, align: "right" }, { label: `${fmtDay(cmpDay)} (${cur})`, align: "right" }, { label: L("পার্থক্য", "Diff"), align: "right" }]
    : [{ label: `${L("টাকা", "Amount")} (${cur})`, align: "right" }];

  const print = () => {
    if (!sheet) return;
    printWithSettings(generateStatementHTML({ shopName, title: title.toUpperCase(), subtitle, cols: [{ label: L("বিবরণ", "Particulars") }, ...amountCols], rows: reportRows() }), { lang });
  };

  const save = async (name, rows) => {
    try { await saveTextFile(name, csvText(rows)); } catch (e) { toast?.(e.message || String(e), "err"); }
  };
  const exportCsv = () => sheet && save(`balance-sheet-${day}${cmpDay ? `-vs-${cmpDay}` : ""}.csv`, [[L("বিবরণ", "Particulars"), ...amountCols.map((c) => c.label)], ...reportRows()]);
  const exportNegativeCsv = () => stock && save(`negative-stock-${day}.csv`, [
    [L("কোড", "Code"), L("প্রোডাক্ট", "Product"), L("পরিমাণ", "Qty")], ...stock.negatives.map((p) => [p.code, p.name, qtyFmt(p.qty)]),
  ]);

  const today = localDay();
  const now = new Date();
  const openBs = openingBsAsOf(today, fyMonth);
  const lastYearEnd = `${now.getFullYear() - 1}-12-31`;
  const quick = [
    ["today", L("আজ", "Today"), today],
    ["lastMonth", L("গত মাসের শেষ", "End of last month"), localDay(new Date(now.getFullYear(), now.getMonth(), 0))],
    ["opening", L("ওপেনিং BS (আগের FY শেষ)", "Opening BS (prev. FY end)"), openBs],
    ["fyStart", L("FY শুরু", "FY start"), fyStartDate(today, fyMonth)],
    // With a January financial year the previous year end is the opening BS date already.
    ...(lastYearEnd !== openBs ? [["lastYear", L("গত বছরের শেষ", "End of last year"), lastYearEnd]] : []),
  ].filter(([, , d]) => !!d);
  const activeQuick = quick.find(([, , d]) => d === day)?.[0];
  const valColor = (v) => (v < 0 ? "#b91c1c" : undefined);
  const balanced = sheet && Math.abs(sheet.difference) < 0.01;
  const overdrawn = moneyRows.filter((m) => m.balance < -0.005);
  const thinEquity = sheet && !(sheet.equity[0]?.lines || []).some((l) => l.key !== "openingStock" && l.key !== "profit");
  const togglePanel = (id) => setPanel((p) => (p === id ? "" : id));

  const amountBlock = (amount, then) => (
    <span style={{ display: "inline-flex", gap: sheetCmp ? 8 : 0, justifyContent: "flex-end", whiteSpace: "nowrap" }}>
      <b style={{ color: valColor(amount), minWidth: sheetCmp ? 72 : undefined, textAlign: "right" }}>{cur} {money(amount)}</b>
      {sheetCmp && (
        <>
          <span style={{ color: "#64748b", minWidth: 72, textAlign: "right" }}>{money(then || 0)}</span>
          <span style={{ color: valColor(r2(amount - (then || 0))), minWidth: 72, textAlign: "right" }}>{money(r2(amount - (then || 0)))}</span>
        </>
      )}
    </span>
  );

  const sidePanel = (side) => (
    <fieldset key={side.id} className="pm-panel" style={{ margin: 0 }}>
      <legend className="pm-panel-legend">{side.title}</legend>
      <div className="si-panel-body">
        {sheetCmp && (
          <div className="si-total-row" style={{ fontSize: 10, color: "#64748b" }}>
            <span />
            <span style={{ display: "inline-flex", gap: 8 }}>
              <span style={{ minWidth: 72, textAlign: "right" }}>{fmtDay(day)}</span>
              <span style={{ minWidth: 72, textAlign: "right" }}>{fmtDay(cmpDay)}</span>
              <span style={{ minWidth: 72, textAlign: "right" }}>{L("পার্থক্য", "Diff")}</span>
            </span>
          </div>
        )}
        {!side.sections.length && <div className="si-empty">{L("কিছু নেই", "Nothing")}</div>}
        {side.sections.map((s) => {
          const lines = linesOf(s);
          return (
            <div key={s.id} style={{ marginBottom: 4 }}>
              <div className="si-total-row" style={{ fontWeight: 700 }}><span>{sectionName(s.id)}</span><span /></div>
              {lines.map((l) => (
                <div key={l.key} className="si-total-row">
                  <span style={{ paddingLeft: 10, color: "#1f2937", overflow: "hidden", textOverflow: "ellipsis" }} title={l.name}>{l.name}</span>
                  {amountBlock(l.amount, l.then)}
                </div>
              ))}
              {lines.length > 1 && (
                <div className="si-total-row">
                  <span style={{ paddingLeft: 10 }}>{L("মোট", "Total")}</span>
                  {amountBlock(s.total, s.then)}
                </div>
              )}
            </div>
          );
        })}
        <div className="si-total-row is-grand" style={{ fontSize: mobile ? 15 : 12 }}>
          <span>{side.totalLabel}</span>
          {amountBlock(side.total, side.then)}
        </div>
      </div>
    </fieldset>
  );

  const kpi = (label, value, color) => (
    <div className="si-kpi" title={`${label}: ${cur} ${money(value)}`}><span>{label}</span><b style={{ color }}>{cur} {money(value)}</b></div>
  );
  const warn = { color: "#b45309", fontWeight: 700, marginTop: 3 };
  const linkBtn = (id, label) => (
    <button type="button" className={`pm-btn-secondary${panel === id ? " is-active" : ""}`} onClick={() => togglePanel(id)} style={{ marginLeft: 6 }}>{label}</button>
  );

  return (
    <div ref={rootRef} className="si-root" style={fitH ? { height: fitH } : undefined}>
      <style>{PM_CSS}</style>
      <style>{SI_CSS}</style>
      <style>{BS_CSS}</style>
      <div className="pm-reference-title">
        <strong> {title}</strong>
        <span>{subtitle}</span>
      </div>
      <div className="si-toolbar">
        {canPrint && <button type="button" className="pm-btn pm-btn--primary" onClick={print} disabled={!sheet}> {L("প্রিন্ট", "Print")}</button>}
        {canPrint && <button type="button" className="pm-btn-secondary" onClick={exportCsv} disabled={!sheet}> Excel</button>}
        <button type="button" className="pm-btn-secondary" onClick={() => setTick((v) => v + 1)}> {L("রিফ্রেশ", "Refresh")}</button>
        <label className="pm-btn-secondary" style={{ display: "inline-flex", alignItems: "center", gap: 4, cursor: "pointer" }}>
          <input type="checkbox" checked={detail} onChange={(e) => setDetail(e.target.checked)} /> {L("পার্টি অনুযায়ী", "Party detail")}
        </label>
        <span className="si-toolbar-gap" />
        <div className="si-pills">
          {quick.map(([key, label, d]) => (
            <button key={key} type="button" className={`pm-btn-secondary${activeQuick === key ? " is-active" : ""}`} onClick={() => setAsOf(d)} title={fmtDay(d)}>{label}</button>
          ))}
        </div>
        <input type="date" className="pm-input" style={{ width: mobile ? "48%" : 130 }} value={asOf} onChange={(e) => setAsOf(e.target.value)} title={L("যে তারিখ পর্যন্ত", "As at date")} />
        <input type="date" className="pm-input" style={{ width: mobile ? "48%" : 130 }} value={compareAsOf} onChange={(e) => setCompareAsOf(e.target.value)} title={L("তুলনা তারিখ (ঐচ্ছিক)", "Compare date (optional)")} />
        {openBs && !compareAsOf && <button type="button" className="pm-btn-secondary" onClick={() => setCompareAsOf(openBs)}>{L("ওপেনিং BS-এর সাথে তুলনা", "Compare with opening BS")}</button>}
        {compareAsOf && <button type="button" className="pm-btn-secondary" onClick={() => setCompareAsOf("")}>{L("তুলনা সরান", "Clear compare")}</button>}
      </div>
      {sheet && (
        <div className="si-kpis bs-kpis">
          {kpi(L("মোট সম্পদ", "Total assets"), sheet.totalAssets)}
          {kpi(L("মোট দেনা", "Total liabilities"), sheet.totalLiabilities, "#b91c1c")}
          {kpi(L("ইকুইটি / নেট ওয়ার্থ (সম্পদ − দেনা)", "Equity / net worth (assets − liabilities)"), sheet.totalEquity, sheet.totalEquity >= 0 ? "#15803d" : "#b91c1c")}
          {kpi(L("ওয়ার্কিং ক্যাপিটাল", "Working capital"), sheet.workingCapital, sheet.workingCapital >= 0 ? "#15803d" : "#b91c1c")}
          <div className="si-kpi"><span>{L("মিল", "Check")}</span><b style={{ color: balanced ? "#15803d" : "#b91c1c" }}>{balanced ? L("মিলেছে", "Balanced") : `${L("পার্থক্য", "Difference")} ${money(sheet.difference)}`}</b></div>
        </div>
      )}
      <div className="si-body">
        {error && <div className="si-paid-box is-due">{L("ডেটা পড়া যায়নি: ", "Could not load: ")}{error}</div>}
        {!sheet && !error ? (
          <div className="si-empty">{L("লোড হচ্ছে…", "Loading…")}</div>
        ) : sheet && (
          <>
            <div className={mobile ? "" : "si-cols"} style={mobile ? { display: "flex", flexDirection: "column", gap: 4 } : { alignItems: "start" }}>
              {sidePanel(sides[0])}
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {sidePanel(sides[1])}
                {sidePanel(sides[2])}
                <div className="si-total-row is-grand" style={{ padding: "4px 6px", fontSize: mobile ? 15 : 12 }}>
                  <span>{L("মোট দেনা ও ইকুইটি", "Total liabilities and equity")}</span>
                  {amountBlock(liabEq, liabEqThen)}
                </div>
                <div className="si-total-row is-grand" style={{ padding: "4px 6px", fontSize: mobile ? 15 : 12 }}>
                  <span>{L("ওয়ার্কিং ক্যাপিটাল (সম্পদ − দেনা)", "Working capital (assets − liabilities)")}</span>
                  {amountBlock(sheet.workingCapital, sheetCmp?.workingCapital)}
                </div>
              </div>
            </div>

            <div className="si-note">
              {L(
                "গ্লোবাল লেজারের ব্যালেন্স থেকে তৈরি — একই তারিখে গ্লোবাল লেজারের ট্রায়াল ব্যালেন্স খুলে মিলিয়ে নিন। ক্যাশ ও ব্যাংকের ডেবিট ব্যালেন্স (জমা > খরচ) সম্পদে যায়; ক্রেডিট ব্যালেন্স (খরচ > জমা) দেনায় ওভারড্রাফট / নগদ ঘাটতি হিসেবে যায়। পার্টির ক্ষেত্রেও একই নিয়ম। স্টক = ওই তারিখ পর্যন্ত confirmed বিল, রিটার্ন, সমন্বয় ও রিসিভ ধরে হাতে থাকা পরিমাণ × গড় ক্রয়মূল্য (VAT বাদে)। আজ পর্যন্ত লাভ = আয় − ক্রয় ও খরচ + (সমাপনী স্টক − ওপেনিং স্টক); লাভ-ক্ষতি পেজ প্রতি বিক্রিতে গড় খরচ ধরে, তাই সামান্য পার্থক্য হতে পারে। ওপেনিং BS = আগের হিসাব বছরের শেষ দিন (শপের FY মাস অনুযায়ী)। ফিক্সড অ্যাসেট রেজিস্টার ও আলাদা লোন মাস্টার নেই: ফার্নিচার, গাড়ি, লোন ইত্যাদি জার্নাল ভাউচারে লিখলে অন্যান্য সম্পদ / অন্যান্য দেনায় আসে; মালিকের মূলধন ও ড্রয়িং পার্টনার পেজ বা জার্নালের Capital / Drawings খাতে লিখলে ইকুইটিতে আসে।",
                "Built from the Global Ledger balances — open the Global Ledger trial balance on the same date to reconcile. A cash or bank account with a debit balance (in > out) is an asset; with a credit balance (out > in) it is shown under liabilities as overdraft / cash shortfall. Parties follow the same rule. Stock = quantity on hand on the date (confirmed bills, returns, adjustments and goods received) at average purchase cost, VAT excluded. Profit to date = income − purchases and expenses + (closing stock − opening stock); the P&L page costs each sale at average cost, so small differences are possible. Opening BS = last day of the previous financial year (from the shop FY month). There is no fixed-asset register or separate loan master: furniture, vehicles, loans and the like entered as journal vouchers appear under Other assets / Other liabilities; owner capital and drawings entered on the Partners page or in a journal to Capital / Drawings appear in equity."
              )}
              {overdrawn.length > 0 && (
                <div style={warn}>
                  {L(
                    `${overdrawn.map((m) => m.name).join(", ")}: যত টাকা ঢুকেছে তার চেয়ে বেশি বেরিয়েছে, তাই দেনায় দেখাচ্ছে।${overdrawn.some((m) => !m.funded) ? " এই খাতে কোনো ওপেনিং / মূলধন / কন্ট্রা জমা নেই — দোকানের শুরুর নগদ বা ব্যাংক ব্যালেন্স পার্টনার পেজে মূলধন জমা বা জার্নাল দিয়ে লিখুন।" : ""}`,
                    `${overdrawn.map((m) => m.name).join(", ")}: more money went out than came in, so it is shown under liabilities.${overdrawn.some((m) => !m.funded) ? " Nothing (opening, capital or contra) was ever paid into it — enter the shop's starting cash / bank balance as a capital-in on the Partners page or as a journal." : ""}`
                  )}
                  {linkBtn("money", L("ক্যাশ ও ব্যাংক বিস্তারিত", "Cash & bank detail"))}
                </div>
              )}
              {thinEquity && (
                <div style={warn}>
                  {L("ইকুইটিতে মালিকের মূলধন বা পার্টনার নেই — শুধু ওপেনিং স্টক আর লাভ। মূলধন থাকলে পার্টনার পেজে বা জার্নালে Capital খাতে লিখুন।", "Equity has no owner capital or partners — only opening stock and profit. If capital was put in, enter it on the Partners page or as a journal to Capital.")}
                </div>
              )}
              {(excluded.draft > 0 || excluded.cancelled > 0) && (
                <div style={warn}>
                  {L(`ধরা হয়নি: ${excluded.draft}টি draft, ${excluded.cancelled}টি বাতিল ডকুমেন্ট।`, `Not counted: ${excluded.draft} draft and ${excluded.cancelled} cancelled document(s).`)}
                  {linkBtn("excluded", L("তালিকা দেখুন", "Show list"))}
                </div>
              )}
              {stock?.negatives.length > 0 && (
                <div style={warn}>
                  {L(`${stock.negatives.length}টি প্রোডাক্টের স্টক মাইনাস, সেগুলো স্টকের মূল্যে ধরা হয়নি।`, `${stock.negatives.length} product(s) have negative stock and are left out of the stock value.`)}
                  {linkBtn("negative", L("তালিকা দেখুন", "Show list"))}
                </div>
              )}
              {stock?.unpriced > 0 && <div style={warn}>{L(`${stock.unpriced}টি প্রোডাক্টের ক্রয়মূল্য নেই, তাই মূল্য 0 ধরা হয়েছে।`, `${stock.unpriced} product(s) in stock have no purchase cost, so they are valued at 0.`)}</div>}
              {!overdrawn.length && moneyRows.length > 0 && <div style={{ marginTop: 3 }}>{linkBtn("money", L("ক্যাশ ও ব্যাংক বিস্তারিত", "Cash & bank detail"))}</div>}
            </div>

            {panel === "money" && (
              <fieldset className="pm-panel" style={{ margin: 0 }}>
                <legend className="pm-panel-legend">{L("ক্যাশ ও ব্যাংক — কোথা থেকে ব্যালেন্স", "Cash & bank — where the balance comes from")}</legend>
                <div className="si-panel-body" style={{ overflowX: "auto" }}>
                  {moneyRows.map((m) => (
                    <table key={m.key} className="bs-table" style={{ marginBottom: 6 }}>
                      <thead>
                        <tr>
                          <th>{m.name} — {m.balance >= 0 ? L("সম্পদ", "Asset") : L("দেনা (ওভারড্রাফট / ঘাটতি)", "Liability (overdraft / shortfall)")}</th>
                          <th className="num">{L("জমা (ডেবিট)", "In (debit)")}</th>
                          <th className="num">{L("খরচ (ক্রেডিট)", "Out (credit)")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {m.byType.map((t) => (
                          <tr key={t.type}><td>{typeName(t.type)}</td><td className="num">{t.dr ? money(t.dr) : ""}</td><td className="num">{t.cr ? money(t.cr) : ""}</td></tr>
                        ))}
                        <tr style={{ fontWeight: 700 }}>
                          <td>{L("ব্যালেন্স", "Balance")} {money(Math.abs(m.balance))} {m.balance >= 0 ? "Dr" : "Cr"}</td>
                          <td className="num">{money(m.dr)}</td><td className="num">{money(m.cr)}</td>
                        </tr>
                      </tbody>
                    </table>
                  ))}
                </div>
              </fieldset>
            )}

            {panel === "negative" && stock && (
              <fieldset className="pm-panel" style={{ margin: 0 }}>
                <legend className="pm-panel-legend">{L("মাইনাস স্টক", "Negative stock")} — {fmtDay(day)} ({stock.negatives.length})</legend>
                <div className="si-panel-body" style={{ overflowX: "auto" }}>
                  {canPrint && <button type="button" className="pm-btn-secondary" onClick={exportNegativeCsv} style={{ marginBottom: 4 }}> Excel</button>}
                  <table className="bs-table">
                    <thead><tr><th>{L("কোড", "Code")}</th><th>{L("প্রোডাক্ট", "Product")}</th><th className="num">{L("পরিমাণ", "Qty")}</th></tr></thead>
                    <tbody>
                      {stock.negatives.map((p) => (
                        <tr key={p.id}><td>{p.code}</td><td>{p.name}</td><td className="num" style={{ color: "#b91c1c" }}>{qtyFmt(p.qty)}</td></tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="si-note" style={{ marginTop: 4 }}>
                    {L("সাধারণত ক্রয় বিল draft-এ আছে, ওপেনিং স্টক দেওয়া হয়নি, বা বিক্রি আগে হয়ে ক্রয় পরে লেখা হয়েছে। ক্রয় confirm করুন বা স্টক সমন্বয় দিন।", "Usually a purchase bill is still a draft, opening stock was not entered, or the sale was billed before the purchase. Confirm the purchase or enter a stock adjustment.")}
                  </div>
                </div>
              </fieldset>
            )}

            {panel === "excluded" && (
              <fieldset className="pm-panel" style={{ margin: 0 }}>
                <legend className="pm-panel-legend">{L("ধরা হয়নি (Draft / বাতিল)", "Not counted (draft / cancelled)")} ({excluded.list.length})</legend>
                <div className="si-panel-body" style={{ overflowX: "auto" }}>
                  <table className="bs-table">
                    <thead><tr><th>{L("তারিখ", "Date")}</th><th>{L("ধরন", "Kind")}</th><th>{L("নং", "No")}</th><th>{L("অবস্থা", "Status")}</th><th className="num">{L("টাকা", "Amount")}</th></tr></thead>
                    <tbody>
                      {excluded.list.map((d) => (
                        <tr key={`${d.col}:${d.id}`}>
                          <td>{fmtDay(d.date)}</td><td>{docName(d.col)}</td><td>{d.no}</td>
                          <td style={{ color: d.status === "draft" ? "#b45309" : "#64748b", fontWeight: 700 }}>{statusName(d.status)}</td>
                          <td className="num">{money(d.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="si-note" style={{ marginTop: 4 }}>
                    {L("Draft গুলো সংশ্লিষ্ট পেজে confirm করলে তবেই হিসাবে আসবে। বাতিল ডকুমেন্ট কখনো হিসাবে আসে না।", "Drafts are counted only once confirmed on their own page. Cancelled documents are never counted.")}
                  </div>
                </div>
              </fieldset>
            )}
          </>
        )}
      </div>
      <div className="si-statusbar">
        {sheet && <span>{L("পর্যন্ত", "As at")} <b>{fmtDay(day)}</b></span>}
        {sheet && <span>{L("স্টক", "Stock")} <b>{money(stock?.value || 0)}</b></span>}
        <span>{L("উইন্ডোতে ফিরলে নিজে থেকে রিফ্রেশ হয়", "Refreshes automatically when you come back to the window")}</span>
      </div>
    </div>
  );
}
