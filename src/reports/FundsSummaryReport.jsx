// Funds / working capital: liquid funds, debtors, creditors and stock on a date, regrouped from the Balance Sheet
// (same Global Ledger balances and stock valuation), with an optional compare date, print and CSV. Read-only.
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
import { shopAccountNature } from "../ledger/accountNature.js";
import { averageCosts } from "./averageCost.js";
import { unitCostsAt, valuationMethodOf } from "./stockValuation.js";
import { livePurchasesOf, liveReturnsOf, r2 } from "./reportFilters.js";
import { buildBalanceSheet, openingStockValue, stockDocsUpTo } from "./balanceSheet.js";
import { csvText } from "./vatExport.js";
import { fundsCsvRows, fundsFileName, fundsFromSheet, fundsLines } from "./fundsSummary.js";

const money = (v) => r2(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const localDay = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const fmtDay = (d) => (d ? String(d).slice(0, 10).split("-").reverse().join("/") : "");
const LINE_BN = {
  liquid: "নগদ ও ব্যাংক (তরল টাকা)", receivables: "কাস্টমারদের কাছে পাওনা (ডেটরস)", supplierAdvance: "সাপ্লায়ারকে অগ্রিম", inventory: "স্টক (গড় খরচে)",
  vatRefundable: "VAT ফেরতযোগ্য", otherAssets: "অন্যান্য সম্পদ", assets: "মোট চলতি সম্পদ", payables: "সাপ্লায়ারদের দেনা (ক্রেডিটরস)", customerAdvance: "কাস্টমারের অগ্রিম",
  vatPayable: "VAT দেনা", overdraft: "ব্যাংক ওভারড্রাফট / নগদ ঘাটতি", otherLiabilities: "অন্যান্য দেনা", liabilities: "মোট চলতি দেনা", workingCapital: "ওয়ার্কিং ক্যাপিটাল (সম্পদ − দেনা)",
};
const FS_CSS = `
.fs-kpis { grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); }
.fs-kpis .si-kpi b { white-space: normal; overflow: visible; text-overflow: clip; overflow-wrap: anywhere; font-variant-numeric: tabular-nums; }
.fs-kpis .si-kpi span { white-space: normal; }
.fs-table { width: 100%; border-collapse: collapse; font-size: 11.5px; }
.fs-table th { text-align: left; background: #e8eef7; padding: 3px 5px; border-bottom: 1px solid #8797a9; white-space: nowrap; }
.fs-table td { padding: 3px 5px; border-bottom: 1px solid #e2e8f0; }
.fs-table .num { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
.fs-table tr.is-total td { font-weight: 700; border-top: 1px solid #7d94b7; background: #f8fafc; }
`;

export default function FundsSummaryReport({ lang = "en", shopId, shop = null, products = [], customers = [], vendors = [], shopName = "", cur = "AED", toast, canPrint = false }) {
  const bn = lang === "bn";
  const L = (b, e) => (bn ? b : e);
  const [asOf, setAsOf] = useState(() => localDay());
  const [compareAsOf, setCompareAsOf] = useState("");
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [tick, setTick] = useState(0);
  const mobile = usePmMobile();
  const rootRef = useRef(null);
  const fitH = usePmFitHeight(rootRef, mobile);

  // Same documents and loading as the Balance Sheet.
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
    }).catch((err) => { console.warn("[S4 Funds] load failed", err); if (!cancelled) setError(String(err?.message || err)); });
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
  // chart-of-accounts nature of custom accounts (ledger/accountNature.js)
  const natureOf = useMemo(() => shopAccountNature(shop), [shop?.chartOfAccounts, shop?.coaGroups]); // eslint-disable-line react-hooks/exhaustive-deps
  const ledger = useMemo(() => (data ? buildGlobalLedger(data, { shopId, customers, vendors, natureOf, expenseLabel: (e) => expenseCategoryLabel(e, false) }) : null), [data, shopId, customers, vendors, natureOf]);
  const openingStock = useMemo(() => openingStockValue(products), [products]);

  // Stock value on a day exactly as the Balance Sheet works it out (quantity on hand x cost at the shop's method, negatives left out).
  const stockValueAt = (cutDay) => {
    const cut = stockDocsUpTo(data.rows, cutDay);
    const avg = unitCostsAt(valuationMethodOf(shop), products, cut, { shopId, upTo: cutDay });
    const qty = computeStockMap(products, cut.purchaseInvoices, cut.salesInvoices, shopId, cut.deliveryNotes, cut.extras);
    let value = 0;
    qty.forEach((q, id) => { if (q > 0) value += q * (avg.get(id) || 0); });
    return r2(value);
  };
  const fundsAt = (d) => (ledger && d ? fundsFromSheet(buildBalanceSheet({ accounts: ledger.accounts, bal: balances(ledger.postings, d), closingStock: stockValueAt(d), openingStock })) : null);
  const f = useMemo(() => fundsAt(day), [ledger, data, products, shopId, day, openingStock, shop?.stockValuationMethod]); // eslint-disable-line react-hooks/exhaustive-deps
  const fc = useMemo(() => (cmpDay ? fundsAt(cmpDay) : null), [ledger, data, products, shopId, cmpDay, openingStock, shop?.stockValuationMethod]); // eslint-disable-line react-hooks/exhaustive-deps

  const lines = f ? fundsLines(f) : [];
  const thenOf = fc ? new Map(fundsLines(fc).map((l) => [l.key, l.amount])) : null;
  const label = (l) => (bn ? LINE_BN[l.key] || l.label : l.label);
  const shown = lines.filter((l) => l.side !== "asset" && l.side !== "liability" ? true : Math.abs(l.amount) >= 0.005 || (thenOf && Math.abs(thenOf.get(l.key) || 0) >= 0.005));
  const wcColor = (v) => (v >= 0 ? "#15803d" : "#b91c1c");
  const subtitle = cmpDay ? `${L("পর্যন্ত", "As at")} ${fmtDay(day)}  ${L("বনাম", "vs")} ${fmtDay(cmpDay)}` : `${L("পর্যন্ত", "As at")} ${fmtDay(day)}`;

  const print = () => {
    if (!f) return;
    const cols = [{ label: "Particulars" }, { label: `${fmtDay(day)} (${cur})`, align: "right" }, ...(fc ? [{ label: `${fmtDay(cmpDay)} (${cur})`, align: "right" }, { label: "Difference", align: "right" }] : [])];
    const rows = shown.map((l) => [l.side === "asset" || l.side === "liability" ? `   ${l.label}` : l.label.toUpperCase(), money(l.amount), ...(fc ? [money(thenOf.get(l.key) || 0), money(l.amount - (thenOf.get(l.key) || 0))] : [])]);
    const detail = (title, list) => { if (!list.length) return; rows.push([title.toUpperCase(), "", ...(fc ? ["", ""] : [])]); list.forEach((x) => rows.push([`   ${x.name}`, money(x.amount), ...(fc ? ["", ""] : [])])); };
    detail("Cash and bank accounts", f.blocks.liquid.accounts);
    detail("Top debtors", f.blocks.receivables.top);
    detail("Top creditors", f.blocks.payables.top);
    printWithSettings(generateStatementHTML({
      shopName, title: "FUNDS / WORKING CAPITAL", subtitle, partyLine: "Figures follow the Balance Sheet and Global Ledger rules; drafts and cancelled documents are left out. Working capital = assets - liabilities.",
      cols, rows,
    }), { lang });
  };
  const exportCsv = async () => {
    if (!f) return;
    try { await saveTextFile(fundsFileName(day), csvText(fundsCsvRows(f, { asOf: day, cmp: fc, cmpAsOf: cmpDay }))); } catch (e) { toast?.(e.message || String(e), "err"); }
  };

  const kpi = (labelText, value, color) => (
    <div className="si-kpi" title={`${labelText}: ${cur} ${money(value)}`}><span>{labelText}</span><b style={{ color }}>{cur} {money(value)}</b></div>
  );
  const partyTable = (title, block, empty) => (
    <fieldset className="pm-panel" style={{ margin: 0 }}>
      <legend className="pm-panel-legend">{title} ({block.count})</legend>
      <div className="si-panel-body" style={{ overflow: "auto", maxHeight: mobile ? undefined : 300 }}>
        {!block.top.length ? <div className="si-empty">{empty}</div> : (
          <table className="fs-table">
            <tbody>
              {block.top.map((p) => <tr key={p.key}><td>{p.name}</td><td className="num">{money(p.amount)}</td></tr>)}
              {block.count > block.top.length && <tr><td className="si-muted">{L(`আরও ${block.count - block.top.length}টি পার্টি`, `${block.count - block.top.length} more part${block.count - block.top.length === 1 ? "y" : "ies"}`)}</td><td className="num">{money(block.total - block.top.reduce((t, p) => t + p.amount, 0))}</td></tr>}
              <tr className="is-total"><td>{L("মোট", "Total")}</td><td className="num">{money(block.total)}</td></tr>
            </tbody>
          </table>
        )}
      </div>
    </fieldset>
  );

  return (
    <div ref={rootRef} className="si-root" style={fitH ? { height: fitH } : undefined}>
      <style>{PM_CSS}</style>
      <style>{SI_CSS}</style>
      <style>{FS_CSS}</style>
      <div className="pm-reference-title">
        <strong> {L("ফান্ড / ওয়ার্কিং ক্যাপিটাল", "Funds / Working Capital")}</strong>
        <span>{subtitle}</span>
      </div>
      <div className="si-toolbar">
        {canPrint && <button type="button" className="pm-btn pm-btn--primary" onClick={print} disabled={!f}> {L("প্রিন্ট", "Print")}</button>}
        {canPrint && <button type="button" className="pm-btn-secondary" onClick={exportCsv} disabled={!f}> Excel</button>}
        <button type="button" className="pm-btn-secondary" onClick={() => setTick((v) => v + 1)}> {L("রিফ্রেশ", "Refresh")}</button>
        <span className="si-toolbar-gap" />
        <button type="button" className={`pm-btn-secondary${day === localDay() ? " is-active" : ""}`} onClick={() => setAsOf(localDay())}>{L("আজ", "Today")}</button>
        <input type="date" className="pm-input" style={{ width: mobile ? "48%" : 130 }} value={asOf} onChange={(e) => setAsOf(e.target.value)} title={L("যে তারিখ পর্যন্ত", "As at date")} />
        <input type="date" className="pm-input" style={{ width: mobile ? "48%" : 130 }} value={compareAsOf} onChange={(e) => setCompareAsOf(e.target.value)} title={L("তুলনা তারিখ (ঐচ্ছিক)", "Compare date (optional)")} />
        {compareAsOf && <button type="button" className="pm-btn-secondary" onClick={() => setCompareAsOf("")}>{L("তুলনা সরান", "Clear compare")}</button>}
      </div>
      {f && (
        <div className="si-kpis fs-kpis">
          {kpi(L("তরল টাকা (নগদ + ব্যাংক)", "Liquid funds (cash + bank)"), f.blocks.liquid.total, "#1d4ed8")}
          {kpi(L("ডেটরস (পাওনা)", "Debtors"), f.blocks.receivables.total, "#15803d")}
          {kpi(L("ক্রেডিটরস (দেনা)", "Creditors"), f.blocks.payables.total, "#b91c1c")}
          {kpi(L("স্টক", "Stock"), f.blocks.inventory, "#7c3aed")}
          {kpi(L("ওয়ার্কিং ক্যাপিটাল", "Working capital"), f.workingCapital, wcColor(f.workingCapital))}
        </div>
      )}
      <div className="si-body">
        {error && <div className="si-paid-box is-due">{L("ডেটা পড়া যায়নি: ", "Could not load: ")}{error}</div>}
        {!f && !error && <div className="si-empty">{L("লোড হচ্ছে…", "Loading…")}</div>}
        {f && !f.agrees && <div className="si-paid-box is-due">{L("ভাগগুলোর যোগফল ব্যালেন্স শিটের সাথে মেলেনি", "The blocks do not add up to the Balance Sheet totals")}</div>}
        {f && (
          <>
            <div className={mobile ? "" : "si-cols"} style={mobile ? { display: "flex", flexDirection: "column", gap: 4 } : { alignItems: "start" }}>
              <fieldset className="pm-panel" style={{ margin: 0 }}>
                <legend className="pm-panel-legend">{L("চলতি সম্পদ ও দেনা", "Current assets and liabilities")}</legend>
                <div className="si-panel-body" style={{ overflowX: "auto" }}>
                  <table className="fs-table">
                    {fc && <thead><tr><th /><th className="num">{fmtDay(day)}</th><th className="num">{fmtDay(cmpDay)}</th><th className="num">{L("পার্থক্য", "Diff")}</th></tr></thead>}
                    <tbody>
                      {shown.map((l) => {
                        const then = thenOf ? thenOf.get(l.key) || 0 : 0;
                        const strong = l.side === "total" || l.side === "result";
                        return (
                          <tr key={l.key} className={strong ? "is-total" : undefined}>
                            <td style={{ paddingLeft: strong ? 5 : 14 }}>{label(l)}</td>
                            <td className="num" style={{ color: l.key === "workingCapital" ? wcColor(l.amount) : undefined }}>{money(l.amount)}</td>
                            {fc && <td className="num" style={{ color: "#64748b" }}>{money(then)}</td>}
                            {fc && <td className="num" style={{ color: l.amount - then < 0 ? "#b91c1c" : undefined }}>{money(l.amount - then)}</td>}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </fieldset>
              <fieldset className="pm-panel" style={{ margin: 0 }}>
                <legend className="pm-panel-legend">{L("নগদ ও ব্যাংক খাত", "Cash and bank accounts")}</legend>
                <div className="si-panel-body">
                  <table className="fs-table">
                    <tbody>
                      {f.blocks.liquid.accounts.map((a) => <tr key={a.key}><td>{a.name}</td><td className="num">{money(a.amount)}</td></tr>)}
                      {f.blocks.liquid.overdraft.map((a) => <tr key={a.key}><td style={{ color: "#b91c1c" }}>{a.name} ({L("ঘাটতি", "overdrawn")})</td><td className="num" style={{ color: "#b91c1c" }}>{money(-a.amount)}</td></tr>)}
                      {!f.blocks.liquid.accounts.length && !f.blocks.liquid.overdraft.length && <tr><td colSpan={2} className="si-empty">{L("নগদ বা ব্যাংকে কিছু নেই", "Nothing in cash or bank")}</td></tr>}
                      <tr className="is-total"><td>{L("নিট তরল টাকা", "Net liquid funds")}</td><td className="num">{money(f.blocks.liquid.net)}</td></tr>
                    </tbody>
                  </table>
                </div>
              </fieldset>
            </div>
            <div className={mobile ? "" : "si-cols"} style={mobile ? { display: "flex", flexDirection: "column", gap: 4 } : { alignItems: "start" }}>
              {partyTable(L("শীর্ষ ডেটরস", "Top debtors"), f.blocks.receivables, L("কোনো কাস্টমারের কাছে পাওনা নেই", "No customer owes anything"))}
              {partyTable(L("শীর্ষ ক্রেডিটরস", "Top creditors"), f.blocks.payables, L("কোনো সাপ্লায়ারের দেনা নেই", "Nothing owed to suppliers"))}
            </div>
            <div className="si-note">
              {L(
                "সব সংখ্যা একই তারিখের ব্যালেন্স শিট থেকে (গ্লোবাল লেজারের ব্যালেন্স আর গড় খরচে স্টক) — draft ও বাতিল ধরা হয়নি। ওয়ার্কিং ক্যাপিটাল = সম্পদ − দেনা, ব্যালেন্স শিটের ওয়ার্কিং ক্যাপিটালের সমান। দোকানে ফিক্সড অ্যাসেট রেজিস্টার নেই, তাই সব লাইন চলতি ধরা হয় আর আলাদা কারেন্ট রেশিও দেখানো হয়নি। ডেটরস / ক্রেডিটরস = পার্টির লেজার ব্যালেন্স (এজিং রিপোর্টের মোটের সমান); অগ্রিম আলাদা। এটা একটা তারিখের অবস্থা — সময়ের মধ্যে টাকা আসা-যাওয়া দেখতে ক্যাশ ফ্লো খুলুন।",
                "Every figure comes from the Balance Sheet for the same date (Global Ledger balances and stock at average cost) — drafts and cancelled documents are left out. Working capital = assets − liabilities, the same as the Balance Sheet's working capital. The shop has no fixed-asset register, so every line counts as current and no separate current ratio is shown. Debtors / creditors = party ledger balances (the same totals as the ageing report); advances are shown apart. This is the position on one date — open Cash Flow for money in and out over a period."
              )}
            </div>
          </>
        )}
      </div>
      <div className="si-statusbar">
        {f && <span>{L("সম্পদ", "Assets")} <b>{money(f.assets)}</b></span>}
        {f && <span>{L("দেনা", "Liabilities")} <b>{money(f.liabilities)}</b></span>}
        <span>{L("উইন্ডোতে ফিরলে নিজে থেকে রিফ্রেশ হয়", "Refreshes automatically when you come back to the window")}</span>
      </div>
    </div>
  );
}
