// Budget: the owner's plan for a financial year (one line per P&L item, an amount for each month, optionally per cost
// centre) and the variance report - budget against the P&L's own actuals for the year, a quarter, a month or the year
// to date, with print and Excel. Rules in accounts/budgets.js.
import React, { useEffect, useMemo, useRef, useState } from "react";
import { v4 as uuidv4 } from "uuid";
import { PM_CSS } from "../product-master/pmStyles";
import { SI_CSS, usePmFitHeight, usePmMobile } from "../sales-invoice/siSkin";
import { offlineList } from "../offline/offlineRepository";
import { saveShopRecord } from "../offline/shopService";
import { loadInvoiceRows, rowsOf } from "../inventory/stockFromInvoices";
import { EMPLOYEE_EXPENSE_CATEGORIES, EXPENSE_CATEGORIES } from "../expenses/ExpensesTab.jsx";
import { CHART_EXPENSE_NAMES } from "../ledger/ChartOfAccountsScreen.jsx";
import { normalizeChart } from "../ledger/chartOfAccounts.js";
import { shopAccountNature } from "../ledger/accountNature.js";
import { printWithSettings } from "../print/printSettings.js";
import { generateStatementHTML } from "../print/printDesign.js";
import { saveTextFile } from "../utils/saveTextFile.js";
import { logAudit } from "../utils/auditLog.js";
import { computeAccounts } from "./accountsCalc.js";
import { unitCostsAt, valuationMethodOf } from "./stockValuation.js";
import { fyStartDate } from "./balanceSheet.js";
import { csvText } from "./vatExport.js";
import { r2 } from "./reportFilters.js";
import { activeCostCentres, costCentreLabel, costCentresOf } from "../accounts/costCentres.js";
import {
  accountKey, budgetActuals, budgetFileName, budgetLineProblem, budgetLinesOf, buildVariance, expenseKey, fyMonths, monthAmounts, periodMonths, varianceRows,
} from "../accounts/budgets.js";

const money = (v) => r2(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const localDay = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const MONTH_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTH_BN = ["জানু", "ফেব্রু", "মার্চ", "এপ্রি", "মে", "জুন", "জুলা", "আগ", "সেপ্টে", "অক্টো", "নভে", "ডিসে"];
const BG_CSS = `
.bg-table { width: 100%; border-collapse: collapse; font-size: 12px; }
.bg-table th { text-align: left; background: #e8eef7; padding: 4px 6px; border-bottom: 1px solid #8797a9; white-space: nowrap; position: sticky; top: 0; }
.bg-table td { padding: 4px 6px; border-bottom: 1px solid #e2e8f0; }
.bg-table .num { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
.bg-table tr.is-total td { font-weight: 800; background: #f4f7fc; }
.bg-table tr.is-head td { background: #dbe5f3; font-weight: 800; }
.bg-months { display: grid; grid-template-columns: repeat(auto-fill, minmax(96px, 1fr)); gap: 4px; }
`;
const PROBLEM = {
  fy: ["বছর বাছুন", "Pick the year"], key: ["কী বাজেট করবেন বাছুন", "Pick what to budget"], centre: ["কস্ট সেন্টার শুধু খরচের ধরনে দেওয়া যায়", "A cost centre only goes on an expense type"],
  duplicate: ["এই বছরে এটার বাজেট আগেই আছে", "This item already has a budget for the year"],
  mixCentre: ["একই খরচ সব সেন্টারে আর একটি সেন্টারে একসাথে বাজেট করা যায় না - বিল দুবার গোনা হবে", "One item can't be budgeted for all centres and for one centre at once - bills would count twice"],
  negative: ["বাজেট মাইনাস হতে পারে না", "A budget can't be negative"], empty: ["অন্তত এক মাসে টাকা দিন", "Enter an amount for at least one month"],
};

export default function BudgetReport({ lang = "en", shopId, shop = null, user = null, profile = null, isOwner = false, products = [], shopName = "", cur = "AED", toast, canPrint = false, fyStartMonth = 1, onShopUpdated }) {
  const bn = lang === "bn";
  const L = (b, e) => (bn ? b : e);
  const [tab, setTab] = useState("variance");
  const [fyOffset, setFyOffset] = useState(0);
  const [view, setView] = useState("ytd");
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [tick, setTick] = useState(0);
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const mobile = usePmMobile();
  const rootRef = useRef(null);
  const fitH = usePmFitHeight(rootRef, mobile);

  useEffect(() => {
    let cancelled = false;
    setError("");
    Promise.all([loadInvoiceRows(), offlineList("expenses"), offlineList("accountVouchers").catch(() => [])])
      .then(([rows, ex, av]) => { if (!cancelled) setData({ rows, expenses: rowsOf(ex), vouchers: rowsOf(av) }); })
      .catch((err) => { console.warn("[S4 Budget] load failed", err); if (!cancelled) setError(String(err?.message || err)); });
    return () => { cancelled = true; };
  }, [shopId, tick]);
  useEffect(() => {
    const refresh = () => { if (document.visibilityState !== "hidden") setTick((v) => v + 1); };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => { window.removeEventListener("focus", refresh); document.removeEventListener("visibilitychange", refresh); };
  }, []);

  const today = localDay();
  const fyStart = useMemo(() => {
    const base = fyStartDate(today, fyStartMonth);
    return base ? `${Number(base.slice(0, 4)) + fyOffset}${base.slice(4)}` : "";
  }, [today, fyStartMonth, fyOffset]);
  const months = useMemo(() => fyMonths(fyStart), [fyStart]);
  const monthName = (m) => `${(bn ? MONTH_BN : MONTH_EN)[Number(m.ym.slice(5, 7)) - 1]} ${m.ym.slice(2, 4)}`;
  const fyLabel = months.length ? `${monthName(months[0])} - ${monthName(months[11])}` : "";
  const lines = useMemo(() => budgetLinesOf(shop, fyStart), [shop, fyStart]);
  const centres = useMemo(() => costCentresOf(shop), [shop]);
  const centreName = (id) => costCentreLabel(centres.find((c) => c.id === id), bn) || id;
  const natureOf = useMemo(() => shopAccountNature(shop), [shop?.chartOfAccounts, shop?.coaGroups]); // eslint-disable-line react-hooks/exhaustive-deps

  // the P&L's own net sales and cost of goods sold for each month (only when a line budgets them)
  const needPl = lines.some((l) => l.key === "sales" || l.key === "cogs");
  const plByMonth = useMemo(() => {
    if (!data || !needPl) return [];
    const docs = { ...data.rows, expenses: [], receipts: [], payments: [], accountVouchers: [] };
    return months.map((m) => computeAccounts(docs, { products, shopId, from: m.from, to: m.to, bn, natureOf, method: valuationMethodOf(shop) }));
  }, [data, needPl, months, products, shopId, bn, natureOf, shop?.stockValuationMethod]);
  const actuals = useMemo(() => (data ? budgetActuals(lines, { months, plByMonth, expenses: data.expenses, vouchers: data.vouchers, shopId, natureOf }) : null),
    [data, lines, months, plByMonth, shopId, natureOf]);
  const idx = useMemo(() => periodMonths(view, months, today), [view, months, today]);
  const rep = useMemo(() => (actuals ? buildVariance(lines, actuals, idx) : null), [lines, actuals, idx]);
  const viewLabel = view === "year" ? L("পুরো বছর", "Full year") : view === "ytd" ? L("এ পর্যন্ত (বছরের শুরু থেকে)", "Year to date")
    : view.startsWith("q") ? `Q${view.slice(1)}` : months[Number(view.slice(1))] ? monthName(months[Number(view.slice(1))]) : view;

  // items the owner can budget: net sales, cost of goods sold, expense types (with typed ones already used), journal accounts the P&L counts
  const items = useMemo(() => {
    const out = [
      { key: "sales", label: L("নিট বিক্রি", "Net sales"), kind: "income" },
      { key: "cogs", label: L("বিক্রি হওয়া মালের ক্রয়মূল্য", "Cost of goods sold"), kind: "expense" },
    ];
    const seen = new Set(out.map((i) => i.key));
    [...EXPENSE_CATEGORIES, ...EMPLOYEE_EXPENSE_CATEGORIES].filter((c) => c.key !== "other").forEach((c) => {
      const key = expenseKey(c.key);
      if (!seen.has(key)) { seen.add(key); out.push({ key, label: bn ? c.bn : c.en, kind: "expense", expense: true }); }
    });
    (data?.expenses || []).filter((e) => e?.category === "other" && String(e.categoryName || "").trim()).forEach((e) => {
      const key = expenseKey("other", e.categoryName);
      if (!seen.has(key)) { seen.add(key); out.push({ key, label: String(e.categoryName).trim(), kind: "expense", expense: true }); }
    });
    normalizeChart(shop?.chartOfAccounts, { expenseNames: CHART_EXPENSE_NAMES, coaGroups: shop?.coaGroups })
      .filter((a) => a.active && !CHART_EXPENSE_NAMES.includes(a.name) && (a.group === "income" || a.group === "expense" || (!a.system && a.group === "other"))
        && !["Sales", "Purchase", "Sales Return", "Purchase Return", "Discount Allowed", "Discount Received", "Stock Adjustment", "Warranty Replacement Stock"].includes(a.name))
      .forEach((a) => {
        const key = accountKey(a.name);
        if (!seen.has(key)) { seen.add(key); out.push({ key, label: a.name, kind: a.group === "income" ? "income" : "expense", account: true }); }
      });
    return out;
  }, [data, shop?.chartOfAccounts, shop?.coaGroups, bn]); // eslint-disable-line react-hooks/exhaustive-deps

  const print = () => {
    if (!rep) return;
    const rows = varianceRows(rep, { bn, centreName });
    printWithSettings(generateStatementHTML({
      shopName, title: L("বাজেট বনাম আসল", "BUDGET VS ACTUAL"), subtitle: `${fyLabel} · ${viewLabel}`,
      partyLine: L("আসল = লাভ-ক্ষতির একই হিসাব (Draft ও বাতিল বাদ, খরচ VAT ছাড়া)। পার্থক্য = আসল − বাজেট।", "Actual = the same figures as the P&L (drafts and cancelled left out, expenses without VAT). Variance = actual - budget."),
      cols: rows[0].map((label, i) => ({ label, align: i >= 3 && i <= 6 ? "right" : undefined })), rows: rows.slice(1),
    }), { lang });
  };
  const exportCsv = async () => {
    if (!rep) return;
    try { await saveTextFile(budgetFileName(fyStart, view), csvText(varianceRows(rep, { bn: false, centreName: (id) => costCentreLabel(centres.find((c) => c.id === id), false) || id }))); } catch (e) { toast?.(e.message || String(e), "err"); }
  };

  const saveLines = async (next, note) => {
    setSaving(true);
    try {
      const others = (Array.isArray(shop?.budgets) ? shop.budgets : []).filter((b) => b?.fyStart !== fyStart);
      const updated = await saveShopRecord(shopId, { budgets: [...others, ...next] }, { ownerUid: user?.uid || shop?.ownerUid });
      onShopUpdated?.(updated);
      logAudit({ shopId, user, profile, action: "edit", collection: "shops", docId: shopId, docNo: `Budget ${fyStart}`, note });
      return true;
    } catch (e) { toast?.(e.message || String(e), "err"); return false; } finally { setSaving(false); }
  };
  const openNew = () => setForm({ id: "", key: "", costCentreId: "", amounts: Array(12).fill(""), each: "", note: "" });
  const openLine = (l) => setForm({ id: l.id, key: l.key, costCentreId: l.costCentreId, amounts: l.amounts.map((a) => (a ? String(a) : "")), each: "", note: l.note });
  const formItem = form ? items.find((i) => i.key === form.key) || (form.id ? lines.find((l) => l.id === form.id) : null) : null;
  const saveLine = async () => {
    if (!isOwner || !form || saving) return;
    const item = formItem;
    const line = { id: form.id || uuidv4(), fyStart, key: form.key, label: item?.label || form.key, kind: item?.kind || "expense",
      costCentreId: form.key.startsWith("exp:") ? form.costCentreId : "", amounts: monthAmounts(form.amounts), note: String(form.note || "").trim(), updatedAt: new Date().toISOString() };
    const problem = budgetLineProblem(line, lines);
    if (problem) { toast?.(L(PROBLEM[problem][0], PROBLEM[problem][1]), "err"); return; }
    const next = form.id ? lines.map((l) => (l.id === line.id ? line : l)) : [...lines, line];
    const total = r2(line.amounts.reduce((t, a) => t + a, 0));
    if (await saveLines(next, `${form.id ? "Changed" : "Added"} ${line.label}${line.costCentreId ? ` (${centreName(line.costCentreId)})` : ""} · year ${total}`)) {
      toast?.(L("বাজেট সেভ হয়েছে", "Budget saved"));
      setForm(null);
    }
  };
  const removeLine = async (l) => {
    if (!isOwner || saving) return;
    if (!window.confirm(L(`"${l.label}" বাজেট লাইন মুছবেন?`, `Remove the budget line "${l.label}"?`))) return;
    if (await saveLines(lines.filter((x) => x.id !== l.id), `Removed ${l.label}`)) setForm(null);
  };

  const statusText = (s) => ({ over: L("পরিকল্পনার বাইরে", "Against plan"), under: L("পরিকল্পনার ভেতরে", "Within plan"), on: L("সমান", "On budget") }[s]);
  const statusColor = (s) => (s === "over" ? "#b91c1c" : s === "under" ? "#15803d" : "#475569");
  const kpi = (labelText, value, color) => (
    <div className="si-kpi" title={`${labelText}: ${cur} ${money(value)}`}><span>{labelText}</span><b style={{ color }}>{cur} {money(value)}</b></div>
  );

  return (
    <div ref={rootRef} className="si-root" style={fitH ? { height: fitH } : undefined}>
      <style>{PM_CSS}</style>
      <style>{SI_CSS}</style>
      <style>{BG_CSS}</style>
      <div className="pm-reference-title">
        <strong> {L("বাজেট", "Budget")}</strong>
        <span>{fyLabel}{tab === "variance" ? ` · ${viewLabel}` : ""}</span>
      </div>
      <div className="si-toolbar">
        <div className="si-pills">
          <button type="button" className={`pm-btn-secondary${tab === "variance" ? " is-active" : ""}`} onClick={() => setTab("variance")}>{L("বাজেট বনাম আসল", "Budget vs actual")}</button>
          <button type="button" className={`pm-btn-secondary${tab === "lines" ? " is-active" : ""}`} onClick={() => setTab("lines")}>{L("বাজেট লাইন", "Budget lines")}</button>
        </div>
        {tab === "variance" && canPrint && <button type="button" className="pm-btn pm-btn--primary" onClick={print} disabled={!rep || !rep.count}> {L("প্রিন্ট", "Print")}</button>}
        {tab === "variance" && canPrint && <button type="button" className="pm-btn-secondary" onClick={exportCsv} disabled={!rep || !rep.count}> Excel</button>}
        <button type="button" className="pm-btn-secondary" onClick={() => setTick((v) => v + 1)}> {L("রিফ্রেশ", "Refresh")}</button>
        <span className="si-toolbar-gap" />
        <select className="pm-input" style={{ width: 150 }} value={fyOffset} onChange={(e) => { setFyOffset(Number(e.target.value)); setForm(null); }} title={L("আর্থিক বছর", "Financial year")}>
          <option value={-1}>{L("গত বছর", "Last year")}</option>
          <option value={0}>{L("এই বছর", "This year")}</option>
          <option value={1}>{L("আগামী বছর", "Next year")}</option>
        </select>
        {tab === "variance" && (
          <select className="pm-input" style={{ width: 170 }} value={view} onChange={(e) => setView(e.target.value)} title={L("সময়", "Period")}>
            <option value="ytd">{L("এ পর্যন্ত (বছরের শুরু থেকে)", "Year to date")}</option>
            <option value="year">{L("পুরো বছর", "Full year")}</option>
            {[1, 2, 3, 4].map((q) => <option key={q} value={`q${q}`}>{`Q${q}`}</option>)}
            {months.map((m) => <option key={m.i} value={`m${m.i}`}>{monthName(m)}</option>)}
          </select>
        )}
      </div>
      {tab === "variance" && rep && rep.count > 0 && (
        <div className="si-kpis">
          {kpi(L("বাজেটে নিট", "Budget net"), rep.net.budget, "#1d4ed8")}
          {kpi(L("আসল নিট", "Actual net"), rep.net.actual, rep.net.actual >= 0 ? "#15803d" : "#b91c1c")}
          {kpi(L("খরচ: বাজেট", "Expenses: budget"), rep.sections[1].budget)}
          {kpi(L("খরচ: আসল", "Expenses: actual"), rep.sections[1].actual, rep.sections[1].actual > rep.sections[1].budget ? "#b91c1c" : "#15803d")}
        </div>
      )}
      <div className="si-body">
        {error && <div className="si-paid-box is-due">{L("ডেটা পড়া যায়নি: ", "Could not load: ")}{error}</div>}
        {!data && !error && <div className="si-empty">{L("লোড হচ্ছে…", "Loading…")}</div>}
        {tab === "variance" && rep && !rep.count && (
          <div className="si-empty">{L("এই বছরের জন্য কোনো বাজেট নেই। মালিক \"বাজেট লাইন\"-এ যোগ করলে এখানে বাজেট, আসল আর পার্থক্য দেখাবে।", "No budget for this year. Once the owner adds lines under Budget lines, budget, actual and variance show here.")}</div>
        )}
        {tab === "variance" && rep && rep.count > 0 && (
          <>
            <fieldset className="pm-panel" style={{ margin: 0 }}>
              <legend className="pm-panel-legend">{L("বাজেট বনাম আসল", "Budget vs actual")} · {viewLabel}</legend>
              <div className="si-panel-body" style={{ overflow: "auto" }}>
                <table className="bg-table">
                  <thead><tr><th>{L("বিষয়", "Item")}</th><th>{L("কস্ট সেন্টার", "Cost centre")}</th><th className="num">{L("বাজেট", "Budget")}</th><th className="num">{L("আসল", "Actual")}</th><th className="num">{L("পার্থক্য", "Variance")}</th><th className="num">%</th><th>{L("অবস্থা", "Status")}</th></tr></thead>
                  <tbody>
                    {rep.sections.map((s) => (
                      <React.Fragment key={s.kind}>
                        <tr className="is-head"><td colSpan={7}>{s.kind === "income" ? L("আয়", "Income") : L("খরচ", "Expenses")}</td></tr>
                        {s.rows.map((r) => (
                          <tr key={r.id}>
                            <td>{r.label}</td><td>{r.costCentreId ? centreName(r.costCentreId) : "-"}</td>
                            <td className="num">{money(r.budget)}</td><td className="num">{money(r.actual)}</td>
                            <td className="num" style={{ color: statusColor(r.status) }}>{money(r.variance)}</td>
                            <td className="num" style={{ color: statusColor(r.status) }}>{r.pct == null ? "" : `${r.pct.toFixed(1)}%`}</td>
                            <td style={{ color: statusColor(r.status) }}>{statusText(r.status)}</td>
                          </tr>
                        ))}
                        {!s.rows.length && <tr><td colSpan={7} className="si-muted">{L("বাজেট লাইন নেই", "No budget lines")}</td></tr>}
                        <tr className="is-total">
                          <td>{L("মোট", "Total")}</td><td />
                          <td className="num">{money(s.budget)}</td><td className="num">{money(s.actual)}</td><td className="num">{money(s.variance)}</td>
                          <td className="num">{s.budget ? `${((s.variance / s.budget) * 100).toFixed(1)}%` : ""}</td><td />
                        </tr>
                      </React.Fragment>
                    ))}
                    <tr className="is-total">
                      <td>{L("নিট (আয় − খরচ)", "Net (income - expenses)")}</td><td />
                      <td className="num">{money(rep.net.budget)}</td><td className="num">{money(rep.net.actual)}</td><td className="num">{money(rep.net.variance)}</td><td /><td />
                    </tr>
                  </tbody>
                </table>
              </div>
            </fieldset>
            <div className="si-note">
              {L(
                "আসল = লাভ-ক্ষতির একই নিয়ম: এই দোকানের চালু বিল ও ভাউচার, Draft ও বাতিল বাদ। খরচ = খরচ পেজের বিল (VAT ছাড়া), কস্ট সেন্টার দেওয়া লাইনে শুধু সেই সেন্টারের বিল; নিট বিক্রি ও বিক্রি হওয়া মালের ক্রয়মূল্য প্রতি মাসের P&L থেকে; জার্নাল খাত P&L যেমন ধরে (খাতের গ্রুপের ভাগ সহ)। পার্থক্য = আসল − বাজেট; খরচ বাজেটের বেশি বা আয় কম হলে \"পরিকল্পনার বাইরে\"। কোনো পূর্বাভাস নেই - চলতি মাসে যা লেখা হয়েছে তাই আসল। মোট শুধু বাজেট লাইনগুলোর যোগফল, দোকানের পুরো লাভ-ক্ষতি নয়।",
                "Actual follows the P&L rules: this shop's live bills and vouchers, drafts and cancelled left out. Expenses = Expenses-page bills (without VAT), only that centre's bills on a line with a cost centre; net sales and cost of goods sold come from each month's P&L; journal accounts as the P&L counts them (with the account group's kind). Variance = actual - budget; spending above budget or income below it is Against plan. Nothing is forecast - the current month shows what has been booked so far. The totals add up the budget lines only, not the shop's whole P&L."
              )}
            </div>
          </>
        )}

        {tab === "lines" && (
          <>
            <fieldset className="pm-panel" style={{ margin: 0 }}>
              <legend className="pm-panel-legend">{L("বাজেট লাইন", "Budget lines")} · {fyLabel} ({lines.length})</legend>
              <div className="si-panel-body" style={{ overflow: "auto" }}>
                {lines.length ? (
                  <table className="bg-table">
                    <thead><tr><th>{L("বিষয়", "Item")}</th><th>{L("ধরন", "Kind")}</th><th>{L("কস্ট সেন্টার", "Cost centre")}</th><th className="num">{L("বছরের বাজেট", "Year budget")}</th><th>{L("নোট", "Note")}</th>{isOwner && <th />}</tr></thead>
                    <tbody>
                      {lines.map((l) => (
                        <tr key={l.id}>
                          <td>{l.label}</td><td>{l.kind === "income" ? L("আয়", "Income") : L("খরচ", "Expense")}</td><td>{l.costCentreId ? centreName(l.costCentreId) : "-"}</td>
                          <td className="num">{money(l.amounts.reduce((t, a) => t + a, 0))}</td><td>{l.note || "-"}</td>
                          {isOwner && <td style={{ whiteSpace: "nowrap" }}>
                            <button type="button" className="pm-btn-secondary" disabled={saving} onClick={() => openLine(l)}>{L("বদলান", "Edit")}</button>{" "}
                            <button type="button" className="pm-btn-secondary" disabled={saving} onClick={() => removeLine(l)}>{L("মুছুন", "Remove")}</button>
                          </td>}
                        </tr>
                      ))}
                      <tr className="is-total"><td colSpan={3}>{L("মোট আয় / খরচ বাজেট", "Total income / expense budget")}</td>
                        <td className="num">{money(lines.filter((l) => l.kind === "income").reduce((t, l) => t + l.amounts.reduce((x, a) => x + a, 0), 0))} / {money(lines.filter((l) => l.kind === "expense").reduce((t, l) => t + l.amounts.reduce((x, a) => x + a, 0), 0))}</td><td colSpan={isOwner ? 2 : 1} /></tr>
                    </tbody>
                  </table>
                ) : <div className="si-empty">{L("এই বছরের জন্য কোনো বাজেট লাইন নেই", "No budget lines for this year")}</div>}
                {isOwner && !form && <div style={{ marginTop: 6 }}><button type="button" className="pm-btn pm-btn--primary" disabled={saving} onClick={openNew}>{L("নতুন বাজেট লাইন", "New budget line")}</button></div>}
                {!isOwner && <div className="si-muted" style={{ marginTop: 4 }}>{L("শুধু মালিক বাজেট বদলাতে পারেন।", "Only the owner can change the budget.")}</div>}
              </div>
            </fieldset>
            {isOwner && form && (
              <fieldset className="pm-panel" style={{ margin: 0 }}>
                <legend className="pm-panel-legend">{form.id ? L("বাজেট লাইন বদলান", "Edit budget line") : L("নতুন বাজেট লাইন", "New budget line")}</legend>
                <div className="si-panel-body" style={{ gap: 6 }}>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4, alignItems: "center" }}>
                    <select className="pm-input" style={{ width: mobile ? "100%" : 260 }} value={form.key} disabled={saving || !!form.id} onChange={(e) => setForm((f) => ({ ...f, key: e.target.value, costCentreId: "" }))}>
                      <option value="">{L("কী বাজেট করবেন…", "What to budget…")}</option>
                      <optgroup label={L("বিক্রি ও ক্রয়মূল্য", "Sales and cost of goods")}>{items.filter((i) => !i.expense && !i.account).map((i) => <option key={i.key} value={i.key}>{i.label}</option>)}</optgroup>
                      <optgroup label={L("খরচের ধরন", "Expense types")}>{items.filter((i) => i.expense).map((i) => <option key={i.key} value={i.key}>{i.label}</option>)}</optgroup>
                      {items.some((i) => i.account) && <optgroup label={L("জার্নাল খাত", "Journal accounts")}>{items.filter((i) => i.account).map((i) => <option key={i.key} value={i.key}>{`${i.label} (${i.kind === "income" ? L("আয়", "income") : L("খরচ", "expense")})`}</option>)}</optgroup>}
                      {form.id && !items.some((i) => i.key === form.key) && <option value={form.key}>{formItem?.label || form.key}</option>}
                    </select>
                    {form.key.startsWith("exp:") && activeCostCentres(centres).length > 0 && (
                      <select className="pm-input" style={{ width: 200 }} value={form.costCentreId} disabled={saving} onChange={(e) => setForm((f) => ({ ...f, costCentreId: e.target.value }))} title={L("কস্ট সেন্টার (ঐচ্ছিক)", "Cost centre (optional)")}>
                        <option value="">{L("সব সেন্টার", "All centres")}</option>
                        {activeCostCentres(centres).map((c) => <option key={c.id} value={c.id}>{costCentreLabel(c, bn)}</option>)}
                        {form.costCentreId && !activeCostCentres(centres).some((c) => c.id === form.costCentreId) && <option value={form.costCentreId}>{centreName(form.costCentreId)}</option>}
                      </select>
                    )}
                    <input className="pm-input" style={{ width: 120, textAlign: "right" }} inputMode="decimal" value={form.each} disabled={saving} onChange={(e) => setForm((f) => ({ ...f, each: e.target.value }))} placeholder={L("প্রতি মাসে", "Each month")} />
                    <button type="button" className="pm-btn-secondary" disabled={saving || !form.each} onClick={() => setForm((f) => ({ ...f, amounts: Array(12).fill(f.each) }))}>{L("১২ মাসে বসান", "Fill 12 months")}</button>
                  </div>
                  <div className="bg-months">
                    {months.map((m) => (
                      <label key={m.i} style={{ display: "flex", flexDirection: "column", fontSize: 11 }}>
                        <span className="pm-label">{monthName(m)}</span>
                        <input className="pm-input" style={{ textAlign: "right" }} inputMode="decimal" value={form.amounts[m.i]} disabled={saving}
                          onChange={(e) => setForm((f) => ({ ...f, amounts: f.amounts.map((a, i) => (i === m.i ? e.target.value : a)) }))} />
                      </label>
                    ))}
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4, alignItems: "center" }}>
                    <input className="pm-input" style={{ width: mobile ? "100%" : 320 }} value={form.note} disabled={saving} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} placeholder={L("নোট (ঐচ্ছিক)", "Note (optional)")} />
                    <span className="si-muted">{L("বছরে", "Year")}: {cur} {money(monthAmounts(form.amounts).reduce((t, a) => t + a, 0))}</span>
                    <span className="si-toolbar-gap" />
                    <button type="button" className="pm-btn-secondary" disabled={saving} onClick={() => setForm(null)}>{L("বাতিল", "Cancel")}</button>
                    <button type="button" className="pm-btn pm-btn--primary" disabled={saving} onClick={saveLine}>{saving ? L("সেভ হচ্ছে…", "Saving…") : L("সেভ", "Save")}</button>
                  </div>
                </div>
              </fieldset>
            )}
            <div className="si-note">
              {L(
                "বাজেট দোকানের রেকর্ডে থাকে আর সব ডিভাইসে সিঙ্ক হয়। আর্থিক বছর দোকানের সেটিং থেকে। একই খরচ সব সেন্টারে অথবা আলাদা আলাদা সেন্টারে বাজেট করুন - দুটো একসাথে নয়।",
                "The budget is kept on the shop record and syncs to every device. The financial year follows the shop setting. Budget an expense type for all centres or for single centres - not both."
              )}
            </div>
          </>
        )}
      </div>
      <div className="si-statusbar">
        <span>{L("বাজেট লাইন", "Budget lines")} <b>{lines.length}</b></span>
        {rep && rep.count > 0 && tab === "variance" && <span>{L("নিট পার্থক্য", "Net variance")} <b>{money(rep.net.variance)}</b></span>}
      </div>
    </div>
  );
}
