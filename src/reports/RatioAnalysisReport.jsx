// Ratio analysis: margins, current / quick ratio, debtors / creditors days, stock turnover and working capital for a
// period, each with its formula and the two figures it divides, print and Excel. The P&L and the Balance Sheet are
// worked out exactly as on their own pages (chart-of-accounts nature, stock valuation method). Rules in ratioAnalysis.js.
import React, { useEffect, useMemo, useRef, useState } from "react";
import { PM_CSS } from "../product-master/pmStyles";
import { SI_CSS, usePmFitHeight, usePmMobile } from "../sales-invoice/siSkin";
import { offlineList } from "../offline/offlineRepository";
import { loadInvoiceRows, rowsOf } from "../inventory/stockFromInvoices";
import { expenseCategoryLabel } from "../expenses/ExpensesTab.jsx";
import { printWithSettings } from "../print/printSettings.js";
import { generateStatementHTML } from "../print/printDesign.js";
import { saveTextFile } from "../utils/saveTextFile.js";
import { buildGlobalLedger, balances } from "../ledger/globalLedger.js";
import { shopAccountNature } from "../ledger/accountNature.js";
import { computeAccounts } from "./accountsCalc.js";
import { buildBalanceSheet, fyStartDate, openingStockValue } from "./balanceSheet.js";
import { closedYearAt } from "./yearEnd.js";
import { stockValueAt } from "./MonthEndPackPanel.jsx";
import { valuationMethodOf } from "./stockValuation.js";
import { csvText } from "./vatExport.js";
import { buildRatios, ratioFileName, ratioRows, ratioText } from "./ratioAnalysis.js";
import DateField from "../components/DateField.jsx";

const localDay = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const fmtDay = (d) => (d ? String(d).slice(0, 10).split("-").reverse().join("/") : "");
const money = (v) => (Math.round((Number(v) || 0) * 100) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dayBefore = (d) => { const x = new Date(`${d}T12:00:00`); x.setDate(x.getDate() - 1); return localDay(x); };
const monthStart = (d) => `${d.slice(0, 7)}-01`;
const lastMonth = (today) => { const d = new Date(`${today.slice(0, 7)}-01T12:00:00`); d.setDate(0); return [`${localDay(d).slice(0, 7)}-01`, localDay(d)]; };
const RA_CSS = `
.ra-table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
.ra-table th { text-align: left; background: #e8eef7; padding: 5px 6px; border-bottom: 1px solid #8797a9; white-space: nowrap; }
.ra-table td { padding: 5px 6px; border-bottom: 1px solid #e2e8f0; vertical-align: top; }
.ra-table .num { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
.ra-table .val { font-weight: 800; font-size: 14px; color: #1e3a8a; }
`;

export default function RatioAnalysisReport({ lang = "en", shopId, shop = null, products = [], customers = [], vendors = [], shopName = "", cur = "AED", toast, canPrint = false, fyStartMonth = 1 }) {
  const bn = lang === "bn";
  const L = (b, e) => (bn ? b : e);
  const today = localDay();
  const [from, setFrom] = useState(() => monthStart(today));
  const [to, setTo] = useState(today);
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [tick, setTick] = useState(0);
  const mobile = usePmMobile();
  const rootRef = useRef(null);
  const fitH = usePmFitHeight(rootRef, mobile);

  // same documents as the Balance Sheet
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
        stockAdjustments: rows.extras?.stockAdjustments || [], warrantyClaims: rows.extras?.warrantyClaims || [],
        receipts: rowsOf(rc), payments: rowsOf(pm), expenses: rowsOf(ex), accountVouchers: rowsOf(av), partnerEntries: rowsOf(pe),
        bankEntries: rowsOf(br).filter((d) => d?.kind === "entry"),
      });
    }).catch((err) => { console.warn("[S4 Ratios] load failed", err); if (!cancelled) setError(String(err?.message || err)); });
    return () => { cancelled = true; };
  }, [shopId, tick]);
  useEffect(() => {
    const refresh = () => { if (document.visibilityState !== "hidden") setTick((v) => v + 1); };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => { window.removeEventListener("focus", refresh); document.removeEventListener("visibilitychange", refresh); };
  }, []);

  const badRange = !from || !to || from > to;
  const method = valuationMethodOf(shop);
  const natureOf = useMemo(() => shopAccountNature(shop), [shop?.chartOfAccounts, shop?.coaGroups]); // eslint-disable-line react-hooks/exhaustive-deps
  const ledger = useMemo(() => (data ? buildGlobalLedger(data, { shopId, customers, vendors, products, natureOf, valuation: method, expenseLabel: (e) => expenseCategoryLabel(e, false) }) : null),
    [data, shopId, customers, vendors, products, natureOf, method]);
  const openingStock = useMemo(() => openingStockValue(products), [products]);
  const sheetOn = (day) => buildBalanceSheet({ accounts: ledger.accounts, bal: balances(ledger.postings, day), openingStock,
    closingStock: stockValueAt(data.rows, products, shopId, day, method), closedStock: closedYearAt(shop?.yearEnds, day, data.accountVouchers)?.stockValue ?? null });
  const rep = useMemo(() => {
    if (!ledger || !data || badRange) return null;
    const pl = computeAccounts({ ...data.rows, receipts: data.receipts, payments: data.payments, expenses: data.expenses, accountVouchers: data.accountVouchers },
      { products, shopId, from, to, bn, natureOf, method });
    return { ...buildRatios({ pl, sheet: sheetOn(to), openingSheet: sheetOn(dayBefore(from)), from, to }), pl };
  }, [ledger, data, badRange, products, shopId, from, to, bn, natureOf, method, openingStock, shop?.yearEnds]); // eslint-disable-line react-hooks/exhaustive-deps

  const fyFrom = fyStartDate(today, fyStartMonth);
  const [lmFrom, lmTo] = lastMonth(today);
  const quick = [
    ["month", L("এই মাস", "This month"), monthStart(today), today],
    ["last", L("গত মাস", "Last month"), lmFrom, lmTo],
    ["fy", L("এই আর্থিক বছর", "This financial year"), fyFrom, today],
  ];
  const activeQuick = quick.find(([, , f, t]) => f === from && t === to)?.[0];
  const subtitle = `${fmtDay(from)} — ${fmtDay(to)}`;

  const print = () => {
    if (!rep) return;
    const rows = ratioRows(rep, cur);
    printWithSettings(generateStatementHTML({
      shopName, title: L("অনুপাত বিশ্লেষণ", "RATIO ANALYSIS"), subtitle,
      partyLine: `${L("দিন", "Days")}: ${rep.days} · ${L("স্টকের মূল্য", "Stock valued")}: ${method === "fifo" ? "FIFO" : L("গড় খরচ", "average cost")}`,
      cols: rows[0].map((label, i) => ({ label, align: i === 1 || i === 3 || i === 4 ? "right" : undefined })), rows: rows.slice(1),
    }), { lang });
  };
  const exportCsv = async () => {
    if (!rep) return;
    try { await saveTextFile(ratioFileName(from, to), csvText(ratioRows(rep, cur))); } catch (e) { toast?.(e.message || String(e), "err"); }
  };

  return (
    <div ref={rootRef} className="si-root" style={fitH ? { height: fitH } : undefined}>
      <style>{PM_CSS}</style>
      <style>{SI_CSS}</style>
      <style>{RA_CSS}</style>
      <div className="pm-reference-title">
        <strong> {L("অনুপাত বিশ্লেষণ", "Ratio Analysis")}</strong>
        <span>{subtitle}</span>
      </div>
      <div className="si-toolbar">
        {canPrint && <button type="button" className="pm-btn pm-btn--primary" onClick={print} disabled={!rep}> {L("প্রিন্ট", "Print")}</button>}
        {canPrint && <button type="button" className="pm-btn-secondary" onClick={exportCsv} disabled={!rep}> Excel</button>}
        <button type="button" className="pm-btn-secondary" onClick={() => setTick((v) => v + 1)}> {L("রিফ্রেশ", "Refresh")}</button>
        <span className="si-toolbar-gap" />
        <div className="si-pills">
          {quick.map(([key, label, f, t]) => <button key={key} type="button" className={`pm-btn-secondary${activeQuick === key ? " is-active" : ""}`} onClick={() => { setFrom(f); setTo(t); }}>{label}</button>)}
        </div>
        <DateField className="pm-input" style={{ width: mobile ? "calc(50% - 2px)" : 130, borderColor: badRange ? "#b91c1c" : undefined }} value={from} onChange={(e) => setFrom(e.target.value)} />
        <DateField className="pm-input" style={{ width: mobile ? "calc(50% - 2px)" : 130, borderColor: badRange ? "#b91c1c" : undefined }} value={to} onChange={(e) => setTo(e.target.value)} />
      </div>
      {rep && (
        <div className="si-kpis">
          <div className="si-kpi"><span>{L("নিট বিক্রি", "Net sales")}</span><b>{cur} {money(rep.figures.netSales)}</b></div>
          <div className="si-kpi"><span>{L("নিট লাভ", "Net profit")}</span><b style={{ color: rep.figures.netProfit >= 0 ? "#15803d" : "#b91c1c" }}>{cur} {money(rep.figures.netProfit)}</b></div>
          <div className="si-kpi"><span>{L("স্টক (শেষ দিনে)", "Stock (last day)")}</span><b>{cur} {money(rep.figures.stock)}</b></div>
          <div className="si-kpi"><span>{L("দিন", "Days")}</span><b>{rep.days}</b></div>
        </div>
      )}
      <div className="si-body">
        {error && <div className="si-paid-box is-due">{L("ডেটা পড়া যায়নি: ", "Could not load: ")}{error}</div>}
        {!rep && !error && <div className="si-empty">{badRange ? L("তারিখ ঠিক করুন", "Fix the dates") : L("লোড হচ্ছে…", "Loading…")}</div>}
        {rep && (
          <>
            <fieldset className="pm-panel" style={{ margin: 0 }}>
              <legend className="pm-panel-legend">{L("অনুপাত", "Ratios")}</legend>
              <div className="si-panel-body" style={{ overflow: "auto" }}>
                <table className="ra-table">
                  <thead><tr><th>{L("অনুপাত", "Ratio")}</th><th className="num">{L("মান", "Value")}</th><th>{L("সূত্র", "Formula")}</th><th className="num">A</th><th className="num">B</th></tr></thead>
                  <tbody>
                    {rep.ratios.map((r) => (
                      <tr key={r.id}>
                        <td className="si-strong">{bn ? r.bn : r.en}{r.note ? <div className="si-muted" style={{ fontWeight: 400, fontSize: 11 }}>{r.note}</div> : null}</td>
                        <td className="num val">{ratioText(r, cur)}{r.unit === "days" && r.value != null ? ` ${L("দিন", "days")}` : ""}</td>
                        <td>{r.formula}</td>
                        <td className="num">{money(r.a)}</td><td className="num">{money(r.b)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </fieldset>
            <div className="si-note">
              {L(
                `লাভ-ক্ষতি আর ব্যালেন্স শিটের একই হিসাব (Draft ও বাতিল বাদ; স্টক ${method === "fifo" ? "FIFO" : "গড় খরচে"})। ভাগ করার সংখ্যা শূন্য হলে "-" দেখায়। চলতি দেনা = সব দেনা, কারণ ব্যালেন্স শিটে দীর্ঘমেয়াদি দেনা আলাদা নেই। পাওনা / দেনার দিন: শেষ দিনের কাস্টমার / সাপ্লায়ার ব্যালেন্স (VAT সহ) ভাগ এই সময়ের VAT সহ বিক্রি / ক্রয় (রিটার্ন বাদ) গুণ দিন।`,
                `The same figures as the P&L and the Balance Sheet (drafts and cancelled left out; stock at ${method === "fifo" ? "FIFO" : "average cost"}). A ratio whose divisor is zero shows "-". Current liabilities = all liabilities, as the Balance Sheet has no long-term split. Debtors / creditors days: customer / supplier balances on the last day (with VAT) over the period's sales / purchases with VAT less returns, times the days.`
              )}
            </div>
          </>
        )}
      </div>
      <div className="si-statusbar">
        <span>{L("স্টকের মূল্য", "Stock valued")} <b>{method === "fifo" ? "FIFO" : L("গড় খরচ", "Average cost")}</b></span>
      </div>
    </div>
  );
}
