// Cash flow: money in and out of cash and bank for a period, by activity, account and day / month.
// Read-only; from the Global Ledger postings, so opening and closing match the Cash Book and Bank Book.
import React, { useEffect, useMemo, useRef, useState } from "react";
import { PM_CSS } from "../product-master/pmStyles";
import { SI_CSS, usePmFitHeight, usePmMobile } from "../sales-invoice/siSkin";
import { offlineList } from "../offline/offlineRepository";
import { loadInvoiceRows, rowsOf } from "../inventory/stockFromInvoices";
import { expenseCategoryLabel } from "../expenses/ExpensesTab.jsx";
import { printWithSettings } from "../print/printSettings.js";
import { generateStatementHTML } from "../print/printDesign.js";
import { saveTextFile } from "../utils/saveTextFile.js";
import { buildGlobalLedger } from "../ledger/globalLedger.js";
import { shopAccountNature } from "../ledger/accountNature.js";
import { TYPE_LABEL } from "../ledger/GlobalLedgerWindow.jsx";
import { r2 } from "./reportFilters.js";
import { moneyAccounts } from "./booksHub.js";
import { buildCashFlow } from "./cashFlow.js";

const money = (v) => r2(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const localDay = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const monthStart = () => { const d = new Date(); return localDay(new Date(d.getFullYear(), d.getMonth(), 1)); };
const fmtDay = (d) => (d ? String(d).slice(0, 10).split("-").reverse().join("/") : "");
const fmtPeriod = (p) => (p.length === 7 ? `${p.slice(5, 7)}/${p.slice(0, 4)}` : fmtDay(p));
const csvCell = (v) => { const s = String(v ?? ""); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };

const ACTIVITY_LABEL = {
  operating: ["ব্যবসার লেনদেন (বিক্রি, ক্রয়, খরচ)", "Operating (sales, purchases, expenses)"],
  owner: ["মালিক / পার্টনার (মূলধন, ড্রয়িং, লাভ বণ্টন)", "Owner / partners (capital, drawings, profit share)"],
  other: ["অন্যান্য (জার্নাল, কন্ট্রা)", "Other (journal, contra)"],
};
// Summary figures wrap instead of being cut off with an ellipsis.
const CF_CSS = `
.cf-kpis { grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); }
.cf-kpis .si-kpi b { white-space: normal; overflow: visible; text-overflow: clip; overflow-wrap: anywhere; font-variant-numeric: tabular-nums; }
.cf-table { width: 100%; border-collapse: collapse; font-size: 11.5px; }
.cf-table th { text-align: left; background: #e8eef7; padding: 3px 5px; border-bottom: 1px solid #8797a9; white-space: nowrap; position: sticky; top: 0; }
.cf-table td { padding: 3px 5px; border-bottom: 1px solid #e2e8f0; }
.cf-table .num { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
.cf-table tfoot td { font-weight: 700; border-top: 1px solid #7d94b7; }
`;

export default function CashFlowReport({ lang = "en", shopId, shop = null, customers = [], vendors = [], shopName = "", cur = "AED", toast, canPrint = false }) {
  const bn = lang === "bn";
  const L = (b, e) => (bn ? b : e);
  const [from, setFrom] = useState(monthStart);
  const [to, setTo] = useState(() => localDay());
  const [accountKey, setAccountKey] = useState("");
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
        salesInvoices: rows.salesInvoices, purchaseInvoices: rows.purchaseInvoices,
        salesReturns: rows.extras?.salesReturns || [], purchaseReturns: rows.extras?.purchaseReturns || [],
        receipts: rowsOf(rc), payments: rowsOf(pm), expenses: rowsOf(ex), accountVouchers: rowsOf(av),
        partnerEntries: rowsOf(pe), bankEntries: rowsOf(br).filter((d) => d?.kind === "entry"),
      });
    }).catch((err) => { console.warn("[S4 Cash Flow] load failed", err); if (!cancelled) setError(String(err?.message || err)); });
    return () => { cancelled = true; };
  }, [shopId, tick]);

  useEffect(() => {
    const refresh = () => { if (document.visibilityState !== "hidden") setTick((v) => v + 1); };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => { window.removeEventListener("focus", refresh); document.removeEventListener("visibilitychange", refresh); };
  }, []);

  // chart-of-accounts nature of custom accounts (ledger/accountNature.js)
  const natureOf = useMemo(() => shopAccountNature(shop), [shop?.chartOfAccounts, shop?.coaGroups]); // eslint-disable-line react-hooks/exhaustive-deps
  const ledger = useMemo(
    () => (data ? buildGlobalLedger(data, { shopId, customers, vendors, natureOf, expenseLabel: (e) => expenseCategoryLabel(e, false) }) : null),
    [data, shopId, customers, vendors, natureOf],
  );
  const moneyList = useMemo(() => (ledger ? moneyAccounts(ledger.accounts) : []), [ledger]);
  const badRange = !!(from && to && from > to);
  const flow = useMemo(
    () => (ledger && !badRange ? buildCashFlow(ledger.postings, ledger.accounts, { from, to, accountKey }) : null),
    [ledger, from, to, accountKey, badRange],
  );

  const typeName = (t) => { const x = TYPE_LABEL[t]; return x ? L(x[0], x[1]) : t; };
  const activityName = (id) => { const x = ACTIVITY_LABEL[id]; return x ? L(x[0], x[1]) : id; };
  const accountName = accountKey ? (ledger?.accounts.get(accountKey)?.name || "") : L("সব ক্যাশ ও ব্যাংক", "All cash & bank");
  const period = `${from ? fmtDay(from) : L("শুরু", "Start")} — ${to ? fmtDay(to) : L("আজ", "Today")}`;
  const title = L("ক্যাশ ফ্লো", "Cash Flow");

  // Rows shared by print and CSV: [particulars, in, out, net]
  const reportRows = () => {
    const rows = [[L("ওপেনিং ব্যালেন্স", "Opening balance"), "", "", money(flow.opening)]];
    flow.byActivity.forEach((a) => {
      const types = flow.byType.filter((t) => t.activity === a.id);
      if (!types.length) return;
      rows.push([activityName(a.id).toUpperCase(), "", "", ""]);
      types.forEach((t) => rows.push([`   ${typeName(t.type)}`, t.in ? money(t.in) : "", t.out ? money(t.out) : "", money(t.in - t.out)]));
      rows.push([`   ${L("মোট", "Total")}`, money(a.in), money(a.out), money(a.net)]);
    });
    rows.push([L("মোট টাকা এসেছে / গেছে", "Total money in / out"), money(flow.totalIn), money(flow.totalOut), money(flow.net)]);
    rows.push([L("সমাপনী ব্যালেন্স", "Closing balance"), "", "", money(flow.closing)]);
    if (flow.transfers > 0) rows.push([L("নিজেদের ক্যাশ-ব্যাংকের মধ্যে ট্রান্সফার (উপরে ধরা হয়নি)", "Transfers between own cash and bank (not counted above)"), money(flow.transfers), money(flow.transfers), money(0)]);
    if (!accountKey && flow.byAccount.length) {
      rows.push(["", "", "", ""]);
      rows.push([L("খাত অনুযায়ী (ওপেনিং / এসেছে / গেছে / সমাপনী)", "By account (opening / in / out / closing)"), "", "", ""]);
      flow.byAccount.forEach((a) => rows.push([`   ${a.name} (${L("ওপেনিং", "opening")} ${money(a.opening)})`, money(a.in), money(a.out), money(a.closing)]));
    }
    return rows;
  };
  const cols = [
    { label: L("বিবরণ", "Particulars") }, { label: `${L("এসেছে", "In")} (${cur})`, align: "right" },
    { label: `${L("গেছে", "Out")} (${cur})`, align: "right" }, { label: `${L("নিট / ব্যালেন্স", "Net / balance")} (${cur})`, align: "right" },
  ];

  const print = () => {
    if (!flow) return;
    printWithSettings(generateStatementHTML({ shopName, title: title.toUpperCase(), subtitle: period, partyLine: accountName, cols, rows: reportRows() }), { lang });
  };

  const exportCsv = async () => {
    if (!flow) return;
    const periodRows = flow.byPeriod.map((r) => [fmtPeriod(r.period), money(r.in), money(r.out), money(r.net), money(r.closing)]);
    const text = "\uFEFF" + [
      cols.map((c) => c.label), ...reportRows(), [],
      [flow.unit === "day" ? L("দিন", "Day") : L("মাস", "Month"), L("এসেছে", "In"), L("গেছে", "Out"), L("নিট", "Net"), L("ব্যালেন্স", "Balance")], ...periodRows,
    ].map((r) => r.map((c) => csvCell(String(c ?? "").trim())).join(",")).join("\r\n");
    try { await saveTextFile(`cash-flow-${from || "start"}_${to || "today"}.csv`, text); } catch (e) { toast?.(e.message || String(e), "err"); }
  };

  const today = localDay();
  const quick = [
    ["today", L("আজ", "Today"), today, today],
    ["month", L("এই মাস", "This month"), monthStart(), today],
    ["year", L("এই বছর", "This year"), `${new Date().getFullYear()}-01-01`, today],
    ["all", L("সব সময়", "All time"), "", ""],
  ];
  const activeQuick = quick.find(([, , f, t]) => f === from && t === to)?.[0];
  const valColor = (v) => (v < 0 ? "#b91c1c" : undefined);
  const kpi = (label, value, color) => (
    <div className="si-kpi" title={`${label}: ${cur} ${money(value)}`}><span>{label}</span><b style={{ color: color || valColor(value) }}>{cur} {money(value)}</b></div>
  );
  const row = (label, value, strong, color) => (
    <div key={label} className={`si-total-row${strong ? " is-grand" : ""}`} style={strong ? { fontSize: mobile ? 15 : 12 } : undefined}>
      <span style={{ color: strong ? undefined : "#1f2937" }}>{label}</span>
      <b style={{ whiteSpace: "nowrap", color: color || valColor(value) }}>{cur} {money(value)}</b>
    </div>
  );

  return (
    <div ref={rootRef} className="si-root" style={fitH ? { height: fitH } : undefined}>
      <style>{PM_CSS}</style>
      <style>{SI_CSS}</style>
      <style>{CF_CSS}</style>
      <div className="pm-reference-title">
        <strong> {title}</strong>
        <span>{accountName} · {period}</span>
      </div>
      <div className="si-toolbar">
        {canPrint && <button type="button" className="pm-btn pm-btn--primary" onClick={print} disabled={!flow}> {L("প্রিন্ট", "Print")}</button>}
        {canPrint && <button type="button" className="pm-btn-secondary" onClick={exportCsv} disabled={!flow}> Excel</button>}
        <button type="button" className="pm-btn-secondary" onClick={() => setTick((v) => v + 1)}> {L("রিফ্রেশ", "Refresh")}</button>
        <select className="pm-input" style={{ width: mobile ? "100%" : 180 }} value={accountKey} onChange={(e) => setAccountKey(e.target.value)} title={L("খাত", "Account")}>
          <option value="">{L("সব ক্যাশ ও ব্যাংক", "All cash & bank")}</option>
          {moneyList.map((a) => <option key={a.key} value={a.key}>{a.name}</option>)}
        </select>
        <span className="si-toolbar-gap" />
        <div className="si-pills">
          {quick.map(([key, label, f, t]) => (
            <button key={key} type="button" className={`pm-btn-secondary${activeQuick === key ? " is-active" : ""}`} onClick={() => { setFrom(f); setTo(t); }}>{label}</button>
          ))}
        </div>
        <input type="date" className="pm-input" style={{ width: mobile ? "calc(50% - 2px)" : 120, borderColor: badRange ? "#b91c1c" : undefined }} value={from} onChange={(e) => setFrom(e.target.value)} />
        <input type="date" className="pm-input" style={{ width: mobile ? "calc(50% - 2px)" : 120, borderColor: badRange ? "#b91c1c" : undefined }} value={to} onChange={(e) => setTo(e.target.value)} />
      </div>
      {flow && (
        <div className="si-kpis cf-kpis">
          {kpi(L("ওপেনিং", "Opening"), flow.opening)}
          {kpi(L("টাকা এসেছে", "Money in"), flow.totalIn, "#15803d")}
          {kpi(L("টাকা গেছে", "Money out"), flow.totalOut, "#b91c1c")}
          {kpi(L("নিট (এসেছে − গেছে)", "Net (in − out)"), flow.net, flow.net >= 0 ? "#15803d" : "#b91c1c")}
          {kpi(L("সমাপনী", "Closing"), flow.closing)}
        </div>
      )}
      <div className="si-body">
        {error && <div className="si-paid-box is-due">{L("ডেটা পড়া যায়নি: ", "Could not load: ")}{error}</div>}
        {badRange && <div className="si-paid-box is-due">{L("শুরুর তারিখ শেষের তারিখের পরে — তারিখ ঠিক করুন", "The start date is after the end date — fix the dates")}</div>}
        {!ledger && !error ? (
          <div className="si-empty">{L("লোড হচ্ছে…", "Loading…")}</div>
        ) : flow && (
          <>
            <div className={mobile ? "" : "si-cols"} style={mobile ? { display: "flex", flexDirection: "column", gap: 4 } : { alignItems: "start" }}>
              <fieldset className="pm-panel" style={{ margin: 0 }}>
                <legend className="pm-panel-legend">{L("কোথা থেকে এসেছে, কোথায় গেছে", "Where money came from and went")}</legend>
                <div className="si-panel-body">
                  {row(L("ওপেনিং ব্যালেন্স", "Opening balance"), flow.opening)}
                  {!flow.byType.length && <div className="si-empty">{L("এই সময়ে কোনো লেনদেন নেই", "No money moved in this period")}</div>}
                  {flow.byActivity.map((a) => {
                    const types = flow.byType.filter((t) => t.activity === a.id);
                    if (!types.length) return null;
                    return (
                      <div key={a.id} style={{ marginTop: 4 }}>
                        <div className="si-total-row" style={{ fontWeight: 700 }}><span>{activityName(a.id)}</span><span /></div>
                        {types.map((t) => (
                          <React.Fragment key={t.type}>
                            {t.in > 0 && row(`   ${typeName(t.type)} — ${L("এসেছে", "in")}`, t.in, false, "#15803d")}
                            {t.out > 0 && row(`   ${typeName(t.type)} — ${L("গেছে", "out")}`, -t.out)}
                          </React.Fragment>
                        ))}
                        {row(`   ${L("নিট", "Net")}`, a.net, false)}
                      </div>
                    );
                  })}
                  {row(L("মোট টাকা এসেছে", "Total money in"), flow.totalIn, true, "#16a34a")}
                  {row(L("মোট টাকা গেছে", "Total money out"), -flow.totalOut, true, "#dc2626")}
                  {row(L("সমাপনী ব্যালেন্স", "Closing balance"), flow.closing, true)}
                </div>
              </fieldset>

              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {!accountKey && (
                  <fieldset className="pm-panel" style={{ margin: 0 }}>
                    <legend className="pm-panel-legend">{L("খাত অনুযায়ী", "By account")}</legend>
                    <div className="si-panel-body" style={{ overflowX: "auto" }}>
                      <table className="cf-table">
                        <thead><tr><th>{L("খাত", "Account")}</th><th className="num">{L("ওপেনিং", "Opening")}</th><th className="num">{L("এসেছে", "In")}</th><th className="num">{L("গেছে", "Out")}</th><th className="num">{L("সমাপনী", "Closing")}</th></tr></thead>
                        <tbody>
                          {flow.byAccount.map((a) => (
                            <tr key={a.key} style={{ cursor: "pointer" }} onClick={() => setAccountKey(a.key)} title={L("শুধু এই খাত দেখুন", "Show this account only")}>
                              <td>{a.name}</td><td className="num">{money(a.opening)}</td><td className="num">{money(a.in)}</td><td className="num">{money(a.out)}</td>
                              <td className="num" style={{ color: valColor(a.closing), fontWeight: 700 }}>{money(a.closing)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {flow.transfers > 0 && (
                        <div className="si-note" style={{ marginTop: 4 }}>
                          {L(`নিজেদের ক্যাশ-ব্যাংকের মধ্যে ${cur} ${money(flow.transfers)} ট্রান্সফার হয়েছে। খাতের সারিতে আছে, কিন্তু মোট এসেছে / গেছে-তে ধরা হয়নি।`, `${cur} ${money(flow.transfers)} moved between the shop's own cash and bank. It is in the account rows but not in total money in / out.`)}
                        </div>
                      )}
                    </div>
                  </fieldset>
                )}
                <fieldset className="pm-panel" style={{ margin: 0 }}>
                  <legend className="pm-panel-legend">{flow.unit === "day" ? L("দিন অনুযায়ী", "By day") : L("মাস অনুযায়ী", "By month")}</legend>
                  <div className="si-panel-body" style={{ overflow: "auto", maxHeight: mobile ? undefined : 360 }}>
                    <table className="cf-table">
                      <thead><tr><th>{flow.unit === "day" ? L("দিন", "Day") : L("মাস", "Month")}</th><th className="num">{L("এসেছে", "In")}</th><th className="num">{L("গেছে", "Out")}</th><th className="num">{L("নিট", "Net")}</th><th className="num">{L("ব্যালেন্স", "Balance")}</th></tr></thead>
                      <tbody>
                        {flow.byPeriod.map((r) => (
                          <tr key={r.period}>
                            <td>{fmtPeriod(r.period)}</td><td className="num">{money(r.in)}</td><td className="num">{money(r.out)}</td>
                            <td className="num" style={{ color: valColor(r.net) }}>{money(r.net)}</td><td className="num" style={{ color: valColor(r.closing) }}>{money(r.closing)}</td>
                          </tr>
                        ))}
                        {!flow.byPeriod.length && <tr><td colSpan={5} className="si-empty">{L("কিছু নেই", "Nothing")}</td></tr>}
                      </tbody>
                      {flow.byPeriod.length > 0 && (
                        <tfoot><tr><td>{L("মোট", "Total")}</td><td className="num">{money(flow.totalIn)}</td><td className="num">{money(flow.totalOut)}</td><td className="num">{money(flow.net)}</td><td className="num">{money(flow.closing)}</td></tr></tfoot>
                      )}
                    </table>
                  </div>
                </fieldset>
              </div>
            </div>
            <div className="si-note">
              {L(
                "গ্লোবাল লেজারের ক্যাশ ও ব্যাংক খাত থেকে তৈরি, তাই ওপেনিং ও সমাপনী ক্যাশ বুক / ব্যাংক বুকের সাথে মিলবে। বিলে নগদ পাওয়া / দেওয়া, রসিদ ও পেমেন্ট ভাউচার, খরচ, রিফান্ড, পার্টনারের মূলধন ও ড্রয়িং, জার্নাল, কন্ট্রা আর ব্যাংক এন্ট্রি সব ধরা আছে। চেক / ট্রান্সফার / কার্ড ব্যাংকে, বাকি নগদে যায়; বাকিতে বিক্রি বা ক্রয়ে টাকা নড়ে না। Draft ও বাতিল ডকুমেন্ট, বাউন্স হওয়া খরচের চেক আর পার্টনারের পকেট থেকে দেওয়া খরচ ধরা হয়নি। লাভ-ক্ষতি পেজের 'টাকা আসা-যাওয়া' পার্টনারের মূলধন, জার্নাল, কন্ট্রা ও ব্যাংক এন্ট্রি ধরে না, তাই সেগুলো থাকলে সংখ্যা আলাদা হবে।",
                "Built from the Global Ledger cash and bank accounts, so the opening and closing match the Cash Book / Bank Book. Money paid on bills, receipt and payment vouchers, expenses, refunds, partner capital and drawings, journals, contra and bank entries are all included. Cheque / transfer / card goes to bank, the rest to cash; credit sales and purchases move no money. Drafts, cancelled documents, bounced expense cheques and expenses paid from a partner's pocket are not counted. The P&L page's 'Money in / out' leaves out partner capital, journals, contra and bank entries, so it differs when there are any."
              )}
            </div>
          </>
        )}
      </div>
      <div className="si-statusbar">
        {flow && <span>{L("লেনদেনের ধরন", "Kinds")} <b>{flow.byType.length}</b></span>}
        {flow && <span>{flow.unit === "day" ? L("দিন", "Days") : L("মাস", "Months")} <b>{flow.byPeriod.length}</b></span>}
        <span>{L("উইন্ডোতে ফিরলে নিজে থেকে রিফ্রেশ হয়", "Refreshes automatically when you come back to the window")}</span>
      </div>
    </div>
  );
}
