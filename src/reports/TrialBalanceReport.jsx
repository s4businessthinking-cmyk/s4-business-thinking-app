// Trial Balance hub: opening, period debits / credits and closing of every Global Ledger account for a date range,
// arranged ledger group > the shop's own CoA groups > account, with fold / unfold, an optional compare period, an
// account statement on click and the document behind a line. Print and CSV. Read-only; rules in trialBalance.js.
import React, { useEffect, useMemo, useRef, useState } from "react";
import { PM_CSS } from "../product-master/pmStyles";
import { SI_CSS, usePmFitHeight, usePmMobile } from "../sales-invoice/siSkin";
import { offlineList } from "../offline/offlineRepository";
import { loadInvoiceRows, rowsOf } from "../inventory/stockFromInvoices";
import { expenseCategoryLabel } from "../expenses/ExpensesTab.jsx";
import { printWithSettings } from "../print/printSettings.js";
import { generateStatementHTML } from "../print/printDesign.js";
import { saveTextFile } from "../utils/saveTextFile.js";
import { buildGlobalLedger, accountStatement } from "../ledger/globalLedger.js";
import { TYPE_LABEL } from "../ledger/GlobalLedgerWindow.jsx";
import { groupName } from "../ledger/coaGroups.js";
import { fyStartDate } from "./balanceSheet.js";
import { r2 } from "./reportFilters.js";
import { csvText } from "./vatExport.js";
import { buildTrialBalance, closingByKey, comparePeriod, trialBalanceFileName, trialBalanceRows } from "./trialBalance.js";
import MonthEndPackPanel from "./MonthEndPackPanel.jsx";
import YearEndPanel from "./YearEndPanel.jsx";
import ForexPanel from "./ForexPanel.jsx";
import { yearEndDocIds } from "./yearEnd.js";

const money = (v) => r2(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const drCr = (v) => (Math.abs(v) < 0.005 ? "" : `${money(Math.abs(v))} ${v > 0 ? "Dr" : "Cr"}`);
const amt = (v) => (Math.abs(v) < 0.005 ? "" : money(v));
const localDay = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const fmtDay = (d) => (d ? String(d).slice(0, 10).split("-").reverse().join("/") : "");
const TB_CSS = `
.tb-kpis { grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); }
.tb-kpis .si-kpi b { white-space: normal; overflow: visible; text-overflow: clip; overflow-wrap: anywhere; font-variant-numeric: tabular-nums; }
.tb-table { width: 100%; border-collapse: collapse; font-size: 11.5px; }
.tb-table th { text-align: left; background: #e8eef7; padding: 3px 5px; border-bottom: 1px solid #8797a9; white-space: nowrap; position: sticky; top: 0; z-index: 1; }
.tb-table td { padding: 3px 5px; border-bottom: 1px solid #e2e8f0; }
.tb-table .num { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
.tb-table tr.is-sec td { background: #dbe5f3; font-weight: 800; cursor: pointer; }
.tb-table tr.is-grp td { background: #f4f7fc; font-weight: 700; color: #1e3a8a; cursor: pointer; }
.tb-table tr.is-acc { cursor: pointer; }
.tb-table tr.is-acc:hover td, .tb-table tr.is-sel td { background: #eaf2ff; }
.tb-table tr.is-total td { font-weight: 800; border-top: 2px solid #7d94b7; background: #f8fafc; }
.tb-fold { display: inline-block; width: 12px; color: #475569; }
`;

export default function TrialBalanceReport({ lang = "en", shopId, shop, customers = [], vendors = [], shopName = "", cur = "AED", toast, canPrint = false, fyStartMonth = 1, onOpenDoc = null, products = [], user = null, profile = null, isOwner = false, onShopUpdated }) {
  const bn = lang === "bn";
  const L = (b, e) => (bn ? b : e);
  const today = localDay();
  const monthStart = `${today.slice(0, 8)}01`;
  const [from, setFrom] = useState(monthStart);
  const [to, setTo] = useState(today);
  const [compareMode, setCompareMode] = useState("");
  const [includeZero, setIncludeZero] = useState(false);
  const [query, setQuery] = useState("");
  const [folded, setFolded] = useState(() => new Set(["s:customer", "s:vendor"]));
  const [selKey, setSelKey] = useState("");
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [tick, setTick] = useState(0);
  const [showPack, setShowPack] = useState(false);
  const [showYear, setShowYear] = useState(false);
  const [showFx, setShowFx] = useState(false);
  const [beforeClose, setBeforeClose] = useState(false);
  const mobile = usePmMobile();
  const rootRef = useRef(null);
  const fitH = usePmFitHeight(rootRef, mobile);

  // Same documents and loading as the Global Ledger.
  useEffect(() => {
    let cancelled = false;
    setError("");
    Promise.all([
      loadInvoiceRows(), offlineList("salesReceipts"), offlineList("purchasePayments"), offlineList("expenses"),
      offlineList("accountVouchers").catch(() => []), offlineList("partnerEntries").catch(() => []), offlineList("bankReconciliations").catch(() => []),
    ]).then(([rows, rc, pm, ex, av, pe, br]) => {
      if (cancelled) return;
      setData({
        salesInvoices: rows.salesInvoices, purchaseInvoices: rows.purchaseInvoices, salesReturns: rows.extras?.salesReturns || [], purchaseReturns: rows.extras?.purchaseReturns || [],
        receipts: rowsOf(rc), payments: rowsOf(pm), expenses: rowsOf(ex), accountVouchers: rowsOf(av), partnerEntries: rowsOf(pe),
        bankEntries: rowsOf(br).filter((d) => d?.kind === "entry"),
        // for the month-end pack: stock / VAT / P&L read the full document rows, bank reconciliation its own records
        rows, bankDocs: rowsOf(br),
      });
    }).catch((err) => { console.warn("[S4 Trial balance] load failed", err); if (!cancelled) setError(String(err?.message || err)); });
    return () => { cancelled = true; };
  }, [shopId, tick]);
  useEffect(() => {
    const refresh = () => { if (document.visibilityState !== "hidden") setTick((v) => v + 1); };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => { window.removeEventListener("focus", refresh); document.removeEventListener("visibilitychange", refresh); };
  }, []);

  const badRange = !!(from && to && from > to);
  const ledger = useMemo(() => (data ? buildGlobalLedger(data, { shopId, customers, vendors, expenseLabel: (e) => expenseCategoryLabel(e, false) }) : null), [data, shopId, customers, vendors]);
  // year-end closing journals inside the period: the trial balance can show the figures before closing
  const closeIds = useMemo(() => yearEndDocIds(data?.accountVouchers, from, to), [data, from, to]);
  const excludeDocIds = beforeClose && closeIds.size ? closeIds : null;
  const opts = { chart: shop?.chartOfAccounts || [], coaGroups: shop?.coaGroups || [], includeZero, excludeDocIds };
  const tb = useMemo(() => (ledger && !badRange ? buildTrialBalance(ledger, { from, to, ...opts }) : null), [ledger, from, to, badRange, shop?.chartOfAccounts, shop?.coaGroups, includeZero, excludeDocIds]); // eslint-disable-line react-hooks/exhaustive-deps
  const cmpRange = compareMode ? comparePeriod(from, to, compareMode) : null;
  const cmp = useMemo(() => (ledger && cmpRange ? closingByKey(buildTrialBalance(ledger, { ...cmpRange, ...opts, includeZero: true })) : null), [ledger, cmpRange?.from, cmpRange?.to, shop?.chartOfAccounts, shop?.coaGroups]); // eslint-disable-line react-hooks/exhaustive-deps
  const stmt = useMemo(() => (ledger && selKey ? accountStatement(ledger.postings, selKey, { from, to }) : null), [ledger, selKey, from, to]);
  const selAccount = selKey && ledger ? ledger.accounts.get(selKey) : null;

  const q = query.trim().toLowerCase();
  const matches = (n) => n.type === "account" ? (!q || n.name.toLowerCase().includes(q) || String(n.code || "").toLowerCase().includes(q)) : n.nodes.some(matches);
  const toggle = (id) => setFolded((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const allIds = useMemo(() => {
    const ids = [];
    const walk = (nodes) => nodes.forEach((n) => { if (n.type === "group") { ids.push(`g:${n.id}`); walk(n.nodes); } });
    (tb?.sections || []).forEach((s) => { ids.push(`s:${s.id}`); walk(s.nodes); });
    return ids;
  }, [tb]);

  const quick = [
    ["month", L("এই মাস", "This month"), monthStart, today],
    ["year", L("এই বছর", "This year"), `${today.slice(0, 4)}-01-01`, today],
    ...(Number(fyStartMonth) > 1 ? [["fy", L("এই অর্থবছর", "This FY"), fyStartDate(today, fyStartMonth), today]] : []),
    ["all", L("সব সময়", "All time"), "", today],
  ];
  const activeQuick = quick.find(([, , f, t]) => f === from && t === to)?.[0];
  const period = `${from ? fmtDay(from) : L("শুরু থেকে", "From start")} - ${fmtDay(to || today)}`;
  const cmpLabel = cmpRange ? `${fmtDay(cmpRange.from)} - ${fmtDay(cmpRange.to)}` : "";

  const print = () => {
    if (!tb) return;
    const rows = trialBalanceRows(tb, { compare: cmp });
    printWithSettings(generateStatementHTML({
      shopName, title: "TRIAL BALANCE", subtitle: `${period}${cmp ? `   vs ${cmpLabel}` : ""}`,
      partyLine: "From the Global Ledger: every account with opening, period debits / credits and closing. Drafts and cancelled documents are left out.",
      cols: rows[0].slice(1).map((label, i) => ({ label, align: i >= 2 ? "right" : undefined })),
      rows: rows.slice(1).map((r) => r.slice(1)),
    }), { lang });
  };
  const exportCsv = async () => {
    if (!tb) return;
    try { await saveTextFile(trialBalanceFileName(from, to || today), csvText(trialBalanceRows(tb, { compare: cmp, compareLabel: `Closing ${cmpRange?.from || ""} to ${cmpRange?.to || ""}` }))); }
    catch (e) { toast?.(e.message || String(e), "err"); }
  };

  const numCells = (t, key = null) => (
    <>
      <td className="num">{drCr(t.opening)}</td><td className="num">{amt(t.dr)}</td><td className="num">{amt(t.cr)}</td>
      <td className="num" style={{ fontWeight: 700 }}>{drCr(t.closing)}</td>
      {cmp && <td className="num" style={{ color: "#64748b" }}>{key ? drCr(cmp.get(key) || 0) : ""}</td>}
      {cmp && <td className="num" style={{ color: key && t.closing - (cmp.get(key) || 0) < 0 ? "#b91c1c" : undefined }}>{key ? amt(t.closing - (cmp.get(key) || 0)) : ""}</td>}
    </>
  );
  const renderNodes = (nodes, depth) => nodes.filter(matches).map((n) => {
    if (n.type === "account") {
      return (
        <tr key={n.key} className={`is-acc${selKey === n.key ? " is-sel" : ""}`} onClick={() => setSelKey(n.key === selKey ? "" : n.key)}>
          <td style={{ paddingLeft: 8 + depth * 16 }}>{n.name}</td><td>{n.code}</td>{numCells(n, n.key)}
        </tr>
      );
    }
    const id = `g:${n.id}`;
    const open = q || !folded.has(id);
    return (
      <React.Fragment key={id}>
        <tr className="is-grp" onClick={() => toggle(id)}>
          <td style={{ paddingLeft: 8 + depth * 16 }}><span className="tb-fold">{open ? "-" : "+"}</span>{groupName(n.group, bn)}</td><td>{n.group.code}</td>{numCells(n.totals)}
        </tr>
        {open && renderNodes(n.nodes, depth + 1)}
      </React.Fragment>
    );
  });

  return (
    <div ref={rootRef} className="si-root" style={fitH ? { height: fitH } : undefined}>
      <style>{PM_CSS}</style>
      <style>{SI_CSS}</style>
      <style>{TB_CSS}</style>
      <div className="pm-reference-title">
        <strong> {L("ট্রায়াল ব্যালেন্স", "Trial Balance")}</strong>
        <span>{period}{cmp ? ` · ${L("তুলনা", "vs")} ${cmpLabel}` : ""}</span>
      </div>
      <div className="si-toolbar">
        {canPrint && <button type="button" className="pm-btn pm-btn--primary" onClick={print} disabled={!tb}> {L("প্রিন্ট", "Print")}</button>}
        {canPrint && <button type="button" className="pm-btn-secondary" onClick={exportCsv} disabled={!tb}> Excel</button>}
        <button type="button" className={`pm-btn-secondary${showPack ? " is-active" : ""}`} onClick={() => setShowPack((v) => !v)} disabled={!ledger}> {L("মাস শেষের প্যাক", "Month-end pack")}</button>
        <button type="button" className={`pm-btn-secondary${showYear ? " is-active" : ""}`} onClick={() => setShowYear((v) => !v)} disabled={!ledger}> {L("বছর শেষ", "Year-end close")}</button>
        <button type="button" className={`pm-btn-secondary${showFx ? " is-active" : ""}`} onClick={() => setShowFx((v) => !v)} disabled={!ledger}>{L("বিদেশি মুদ্রা", "Forex")}</button>
        <button type="button" className="pm-btn-secondary" onClick={() => setTick((v) => v + 1)}> {L("রিফ্রেশ", "Refresh")}</button>
        <span className="si-toolbar-gap" />
        <div className="si-pills">
          {quick.map(([key, label, f, t]) => <button key={key} type="button" className={`pm-btn-secondary${activeQuick === key ? " is-active" : ""}`} onClick={() => { setFrom(f); setTo(t); }}>{label}</button>)}
        </div>
        <input type="date" className="pm-input" style={{ width: mobile ? "calc(50% - 2px)" : 120, borderColor: badRange ? "#b91c1c" : undefined }} value={from} onChange={(e) => setFrom(e.target.value)} title={L("শুরুর তারিখ", "From")} />
        <input type="date" className="pm-input" style={{ width: mobile ? "calc(50% - 2px)" : 120, borderColor: badRange ? "#b91c1c" : undefined }} value={to} onChange={(e) => setTo(e.target.value)} title={L("শেষ তারিখ", "To")} />
      </div>
      <div className="si-toolbar">
        <input className="pm-input" style={{ width: mobile ? "100%" : 200 }} value={query} onChange={(e) => setQuery(e.target.value)} placeholder={L("খাত বা কোড খুঁজুন", "Search account or code")} />
        <select className="pm-input" style={{ width: mobile ? "100%" : 210 }} value={compareMode} onChange={(e) => setCompareMode(e.target.value)} title={L("তুলনা", "Compare")}>
          <option value="">{L("তুলনা নেই", "No compare")}</option>
          <option value="previous" disabled={!from}>{L("আগের সমান সময়ের সাথে", "Previous period of the same length")}</option>
          <option value="lastYear" disabled={!from}>{L("গত বছরের একই সময়ের সাথে", "Same period last year")}</option>
        </select>
        <label style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><input type="checkbox" checked={includeZero} onChange={(e) => setIncludeZero(e.target.checked)} /> {L("শূন্য খাতও", "Show zero accounts")}</label>
        {closeIds.size > 0 && <label style={{ display: "inline-flex", alignItems: "center", gap: 4 }} title={L("বছর শেষের বন্ধের জার্নাল বাদ দিয়ে", "Leave out the year-end closing journal")}><input type="checkbox" checked={beforeClose} onChange={(e) => setBeforeClose(e.target.checked)} /> {L("বছর বন্ধের আগের হিসাব", "Before year-end closing")}</label>}
        <span className="si-toolbar-gap" />
        <button type="button" className="pm-btn-secondary" onClick={() => setFolded(new Set())}>{L("সব খুলুন", "Expand all")}</button>
        <button type="button" className="pm-btn-secondary" onClick={() => setFolded(new Set(allIds))}>{L("সব ভাঁজ", "Collapse all")}</button>
      </div>
      {tb && (
        <div className="si-kpis tb-kpis">
          <div className="si-kpi"><span>{L("সময়ের মোট ডেবিট", "Period debits")}</span><b>{cur} {money(tb.totals.dr)}</b></div>
          <div className="si-kpi"><span>{L("সময়ের মোট ক্রেডিট", "Period credits")}</span><b>{cur} {money(tb.totals.cr)}</b></div>
          <div className="si-kpi"><span>{L("শেষ ব্যালেন্স ডেবিট / ক্রেডিট", "Closing Dr / Cr")}</span><b>{money(tb.totals.closingDr)} / {money(tb.totals.closingCr)}</b></div>
          <div className="si-kpi"><span>{L("পার্থক্য", "Difference")}</span><b style={{ color: Math.abs(tb.difference) < 0.005 ? "#15803d" : "#b91c1c" }}>{Math.abs(tb.difference) < 0.005 ? L("মিলেছে", "Balanced") : `${cur} ${money(tb.difference)}`}</b></div>
        </div>
      )}
      <div className="si-body">
        {showFx && ledger && (
          <ForexPanel lang={lang} shopId={shopId} shop={shop} user={user} profile={profile} isOwner={isOwner} canPrint={canPrint} data={data} vendors={vendors}
            shopName={shopName} toast={toast} onSaved={() => setTick((v) => v + 1)} onClose={() => setShowFx(false)} />
        )}
        {showYear && ledger && (
          <YearEndPanel lang={lang} shopId={shopId} shop={shop} user={user} profile={profile} isOwner={isOwner} canPrint={canPrint} data={data} ledger={ledger}
            products={products} shopName={shopName} cur={cur} toast={toast} onShopUpdated={onShopUpdated} onSaved={() => setTick((v) => v + 1)} onClose={() => setShowYear(false)} />
        )}
        {showPack && ledger && (
          <MonthEndPackPanel lang={lang} shopId={shopId} shop={shop} user={user} profile={profile} isOwner={isOwner} canPrint={canPrint} data={data} ledger={ledger}
            products={products} customers={customers} vendors={vendors} shopName={shopName} cur={cur} toast={toast} onShopUpdated={onShopUpdated} onClose={() => setShowPack(false)} />
        )}
        {error && <div className="si-paid-box is-due">{L("ডেটা পড়া যায়নি: ", "Could not load: ")}{error}</div>}
        {badRange && <div className="si-paid-box is-due">{L("শুরুর তারিখ শেষ তারিখের পরে", "The start date is after the end date")}</div>}
        {!tb && !error && !badRange && <div className="si-empty">{L("লোড হচ্ছে…", "Loading…")}</div>}
        {tb && (
          <div className={mobile || !selKey ? "" : "si-cols"} style={mobile || !selKey ? { display: "flex", flexDirection: "column", gap: 4 } : { alignItems: "start", gridTemplateColumns: "minmax(0, 3fr) minmax(0, 2fr)" }}>
            <fieldset className="pm-panel" style={{ margin: 0 }}>
              <legend className="pm-panel-legend">{L(`খাত (${tb.accounts.length})`, `Accounts (${tb.accounts.length})`)}</legend>
              <div className="si-panel-body" style={{ overflow: "auto", maxHeight: mobile ? undefined : 520 }}>
                {!tb.sections.length ? <div className="si-empty">{L("এই সময়ে কোনো লেনদেন নেই", "No entries in this period")}</div> : (
                  <table className="tb-table">
                    <thead><tr>
                      <th>{L("খাত", "Account")}</th><th>{L("কোড", "Code")}</th><th className="num">{L("শুরু", "Opening")}</th><th className="num">{L("ডেবিট", "Debit")}</th>
                      <th className="num">{L("ক্রেডিট", "Credit")}</th><th className="num">{L("শেষ", "Closing")}</th>
                      {cmp && <th className="num">{L("তুলনার শেষ", "Compare closing")}</th>}{cmp && <th className="num">{L("পরিবর্তন", "Change")}</th>}
                    </tr></thead>
                    <tbody>
                      {tb.sections.filter((s) => s.nodes.some(matches)).map((s) => {
                        const id = `s:${s.id}`;
                        const open = q || !folded.has(id);
                        return (
                          <React.Fragment key={id}>
                            <tr className="is-sec" onClick={() => toggle(id)}><td><span className="tb-fold">{open ? "-" : "+"}</span>{bn ? s.bn : s.en}</td><td />{numCells(s.totals)}</tr>
                            {open && renderNodes(s.nodes, 1)}
                          </React.Fragment>
                        );
                      })}
                      <tr className="is-total">
                        <td>{L("মোট", "Total")}</td><td />
                        <td className="num">{money(tb.totals.openingDr)} / {money(tb.totals.openingCr)}</td><td className="num">{money(tb.totals.dr)}</td><td className="num">{money(tb.totals.cr)}</td>
                        <td className="num">{money(tb.totals.closingDr)} / {money(tb.totals.closingCr)}</td>{cmp && <td />}{cmp && <td />}
                      </tr>
                    </tbody>
                  </table>
                )}
                <div className="si-muted" style={{ marginTop: 4 }}>{L("সারিতে ক্লিক: গ্রুপ খোলে / ভাঁজ হয়, খাতে ক্লিক করলে তার বিবরণী।", "Click a row: a group folds / unfolds, an account opens its statement.")}</div>
              </div>
            </fieldset>
            {selKey && stmt && (
              <fieldset className="pm-panel" style={{ margin: 0 }}>
                <legend className="pm-panel-legend">{selAccount?.name || ""} - {L("বিবরণী", "Statement")}</legend>
                <div className="si-panel-body" style={{ overflow: "auto", maxHeight: mobile ? undefined : 520 }}>
                  <table className="tb-table">
                    <thead><tr><th>{L("তারিখ", "Date")}</th><th>{L("ধরন", "Type")}</th><th>{L("নং", "No")}</th><th className="num">{L("ডেবিট", "Debit")}</th><th className="num">{L("ক্রেডিট", "Credit")}</th><th className="num">{L("ব্যালেন্স", "Balance")}</th></tr></thead>
                    <tbody>
                      <tr><td colSpan={5} className="si-muted">{L("শুরুর ব্যালেন্স", "Opening balance")}</td><td className="num">{drCr(stmt.opening) || "0.00"}</td></tr>
                      {stmt.lines.map((p, i) => {
                        const canOpen = onOpenDoc?.can?.(p.col);
                        return (
                          <tr key={`${p.docId}-${i}`} className={canOpen ? "is-acc" : undefined} onClick={canOpen ? () => onOpenDoc.open(p.col, p.docId) : undefined}
                            title={canOpen ? L("ডকুমেন্ট খুলুন", "Open the document") : p.narration || undefined}>
                            <td>{fmtDay(p.date)}</td><td>{(TYPE_LABEL[p.type] || [p.type, p.type])[bn ? 0 : 1]}</td>
                            <td style={canOpen ? { color: "#1d4ed8", textDecoration: "underline" } : undefined}>{p.no}</td>
                            <td className="num">{amt(p.dr)}</td><td className="num">{amt(p.cr)}</td><td className="num">{drCr(p.balance) || "0.00"}</td>
                          </tr>
                        );
                      })}
                      <tr className="is-total"><td colSpan={3}>{L("মোট / শেষ", "Total / closing")}</td><td className="num">{money(stmt.dr)}</td><td className="num">{money(stmt.cr)}</td><td className="num">{drCr(stmt.closing) || "0.00"}</td></tr>
                    </tbody>
                  </table>
                  <div style={{ marginTop: 4 }}><button type="button" className="pm-btn-secondary" onClick={() => setSelKey("")}>{L("বন্ধ", "Close")}</button></div>
                </div>
              </fieldset>
            )}
          </div>
        )}
        <div className="si-note">
          {L(
            "গ্লোবাল লেজার থেকে: প্রতিটি খাতের শুরুর ব্যালেন্স (শুরুর তারিখের আগে), এই সময়ের ডেবিট / ক্রেডিট আর শেষ ব্যালেন্স - draft ও বাতিল বাদ। সাজানো লেজারের ভাগ > হিসাবের খাতে বানানো গ্রুপ > খাত; গ্রুপ শুধু সাজায়, অঙ্ক বদলায় না। ডাবল এন্ট্রি বলে মোট ডেবিট = মোট ক্রেডিট - পার্থক্য সবসময় ০ হওয়ার কথা। S4-এ স্টক লেজারের খাত নয়: ব্যালেন্স শিট শেষ স্টক (গড় খরচে) আলাদা যোগ করে, তাই ব্যালেন্স শিটের মোট = এই ট্রায়াল ব্যালেন্স + স্টক। খাতে ক্লিক করলে বিবরণী, বিল নম্বরে ক্লিক করলে সেলস / পারচেজ বিল খোলে।",
            "From the Global Ledger: each account's opening balance (before the start date), the period's debits / credits and the closing balance - drafts and cancelled documents left out. Arranged ledger side > the groups made in the Chart of Accounts > account; groups only arrange, they never change a figure. Double entry means total debits = total credits - the difference should always be 0. Stock is not a ledger account in S4: the Balance Sheet adds the closing stock (average cost) on its own, so the Balance Sheet total is this trial balance plus stock. Click an account for its statement, and a bill number to open the sales / purchase bill."
          )}
        </div>
      </div>
      <div className="si-statusbar">
        {tb && <span>{L("খাত", "Accounts")} <b>{tb.accounts.length}</b></span>}
        <span>{L("উইন্ডোতে ফিরলে নিজে থেকে রিফ্রেশ হয়", "Refreshes automatically when you come back to the window")}</span>
      </div>
    </div>
  );
}
