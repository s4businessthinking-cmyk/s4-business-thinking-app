// Cost centres: expenses split by branch / department / job for a period, with a branch centre's own sales and gross
// profit beside its costs, print and Excel; and the owner's list of centres. Rules in accounts/costCentres.js.
import React, { useEffect, useMemo, useRef, useState } from "react";
import { v4 as uuidv4 } from "uuid";
import { PM_CSS } from "../product-master/pmStyles";
import { SI_CSS, usePmFitHeight, usePmMobile } from "../sales-invoice/siSkin";
import { offlineList } from "../offline/offlineRepository";
import { saveShopRecord } from "../offline/shopService";
import { loadInvoiceRows, rowsOf } from "../inventory/stockFromInvoices";
import { expenseCategoryLabel } from "../expenses/ExpensesTab.jsx";
import { printWithSettings } from "../print/printSettings.js";
import { generateStatementHTML } from "../print/printDesign.js";
import { saveTextFile } from "../utils/saveTextFile.js";
import { logAudit } from "../utils/auditLog.js";
import { BRANCH_TRANSFER_COLLECTIONS } from "../branch-transfer/branchTransferService.js";
import { computeAccounts } from "./accountsCalc.js";
import { fifoRun, unitCostsAt, valuationMethodOf } from "./stockValuation.js";
import { branchColumns, branchData } from "./groupView.js";
import { csvText } from "./vatExport.js";
import { r2 } from "./reportFilters.js";
import {
  COST_CENTRE_TYPES, buildCostCentreReport, costCentreFileName, costCentreProblem, costCentreRequired, costCentreRows, costCentresOf,
} from "../accounts/costCentres.js";
import DateField from "../components/DateField.jsx";

const money = (v) => r2(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const localDay = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const monthStart = () => { const d = new Date(); return localDay(new Date(d.getFullYear(), d.getMonth(), 1)); };
const fmtDay = (d) => (d ? String(d).slice(0, 10).split("-").reverse().join("/") : "");
const CC_CSS = `
.cc-table { width: 100%; border-collapse: collapse; font-size: 12px; }
.cc-table th { text-align: left; background: #e8eef7; padding: 4px 6px; border-bottom: 1px solid #8797a9; white-space: nowrap; position: sticky; top: 0; }
.cc-table td { padding: 4px 6px; border-bottom: 1px solid #e2e8f0; vertical-align: top; }
.cc-table .num { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
.cc-table tr.is-total td { font-weight: 800; background: #f4f7fc; }
.cc-table tr.is-off td { color: #94a3b8; }
.cc-table tr.is-click { cursor: pointer; }
.cc-table tr.is-click:hover td, .cc-table tr.is-sel td { background: #eaf2ff; }
`;
const PROBLEM = {
  code: ["কোড দিন", "Enter a code"], name: ["নাম দিন", "Enter a name"], type: ["ধরন বাছুন", "Pick a type"],
  dupCode: ["এই কোড আগে থেকেই আছে", "This code is already used"], dupBranch: ["এই ব্রাঞ্চের জন্য আরেকটি সেন্টার আছে", "Another centre already holds this branch"],
};
const blankCentre = () => ({ id: "", code: "", name: "", nameBn: "", type: "department", branchId: "", active: true });

export default function CostCentreReport({ lang = "en", shopId, shop = null, user = null, profile = null, isOwner = false, products = [], shopName = "", cur = "AED", toast, canPrint = false, onShopUpdated }) {
  const bn = lang === "bn";
  const L = (b, e) => (bn ? b : e);
  const [from, setFrom] = useState(monthStart);
  const [to, setTo] = useState(() => localDay());
  const [view, setView] = useState("report");
  const [data, setData] = useState(null);
  const [branches, setBranches] = useState([]);
  const [error, setError] = useState("");
  const [tick, setTick] = useState(0);
  const [sel, setSel] = useState("");
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const mobile = usePmMobile();
  const rootRef = useRef(null);
  const fitH = usePmFitHeight(rootRef, mobile);

  useEffect(() => {
    let cancelled = false;
    setError("");
    Promise.all([loadInvoiceRows(), offlineList("expenses"), offlineList(BRANCH_TRANSFER_COLLECTIONS.BRANCHES).catch(() => [])])
      .then(([rows, ex, br]) => {
        if (cancelled) return;
        setData({ ...rows, expenses: rowsOf(ex) });
        setBranches(rowsOf(br).filter((b) => b && !b.isDeleted && (!shopId || !b.shopId || b.shopId === shopId)));
      })
      .catch((err) => { console.warn("[S4 Cost centres] load failed", err); if (!cancelled) setError(String(err?.message || err)); });
    return () => { cancelled = true; };
  }, [shopId, tick]);
  useEffect(() => {
    const refresh = () => { if (document.visibilityState !== "hidden") setTick((v) => v + 1); };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => { window.removeEventListener("focus", refresh); document.removeEventListener("visibilitychange", refresh); };
  }, []);

  const centres = useMemo(() => costCentresOf(shop), [shop]);
  const required = costCentreRequired(shop);
  const badRange = !!(from && to && from > to);
  // branch list for linking a centre: the main shop, the branch master, and any branch seen on a sale
  const branchList = useMemo(() => (data ? branchColumns(branches, data.salesInvoices, data.deliveryNotes) : branchColumns(branches, [], [])), [data, branches]);
  const branchName = (id) => { const b = branchList.find((x) => x.id === id); return b ? (bn ? b.nameBn || b.name : b.name) : id; };
  // each branch's own sales and gross profit, the same split the group view uses
  const branchPl = useMemo(() => {
    const m = new Map();
    if (!data || badRange) return m;
    // FIFO: one run of the whole shop's stock, each branch taking the cost of its own sales from it (as the group view)
    const method = valuationMethodOf(shop);
    const fifoShared = method === "fifo" ? fifoRun(products, data, { shopId, upTo: to }) : null;
    branchList.forEach((b) => {
      const pl = computeAccounts({ ...branchData(data, b.id), expenses: [] }, { products, shopId, from, to, bn, method, fifoShared });
      if (pl && (pl.count || pl.salesReturnCount)) m.set(b.id, pl);
    });
    return m;
  }, [data, branchList, products, shopId, from, to, bn, badRange, shop?.stockValuationMethod]);
  const rep = useMemo(() => (data && !badRange ? buildCostCentreReport({ expenses: data.expenses, centres, branchPl, shopId, from, to, expenseLabel: (e) => expenseCategoryLabel(e, bn).trim() }) : null),
    [data, centres, branchPl, shopId, from, to, bn, badRange]);
  const typeName = (t) => { const x = COST_CENTRE_TYPES.find((y) => y.id === t); return x ? (bn ? x.bn : x.en) : t; };
  const centreName = (c) => (bn && c.nameBn) || c.name;
  const selRow = sel === "unallocated" ? { byCategory: rep?.unallocated.byCategory || [], name: L("বরাদ্দ হয়নি", "Not allocated") } : rep?.rows.find((r) => r.id === sel);
  const subtitle = `${from ? fmtDay(from) : L("শুরু", "Start")} — ${to ? fmtDay(to) : L("আজ", "Today")}`;

  const print = () => {
    if (!rep) return;
    const rows = costCentreRows(rep, { bn, branchName });
    printWithSettings(generateStatementHTML({
      shopName, title: L("কস্ট সেন্টার হিসাব", "COST CENTRES"), subtitle,
      partyLine: L("খরচ VAT ছাড়া, যে সেন্টার বিলে বাছা হয়েছে সেখানে; ব্রাঞ্চ সেন্টারে সেই ব্রাঞ্চের নিজের বিক্রি। Draft ও বাতিল বাদ।", "Expenses without VAT, on the centre chosen on the bill; a branch centre shows that branch's own sales. Drafts and cancelled left out."),
      cols: rows[0].map((label, i) => ({ label, align: i >= 3 ? "right" : undefined })), rows: rows.slice(1),
    }), { lang });
  };
  const exportCsv = async () => {
    if (!rep) return;
    try { await saveTextFile(costCentreFileName(from, to), csvText(costCentreRows(rep, { bn: false, branchName }))); } catch (e) { toast?.(e.message || String(e), "err"); }
  };

  // owner: the list of centres and the "required on expenses" switch, kept on the shop record
  const saveShop = async (patch, note) => {
    setSaving(true);
    try {
      const updated = await saveShopRecord(shopId, patch, { ownerUid: user?.uid || shop?.ownerUid });
      onShopUpdated?.(updated);
      logAudit({ shopId, user, profile, action: "edit", collection: "shops", docId: shopId, docNo: "Cost centres", note });
      return true;
    } catch (e) { toast?.(e.message || String(e), "err"); return false; } finally { setSaving(false); }
  };
  const saveCentre = async () => {
    if (!isOwner || !form || saving) return;
    const c = { ...form, id: form.id || uuidv4(), code: form.code.trim(), name: form.name.trim(), nameBn: form.nameBn.trim(), branchId: form.type === "branch" ? form.branchId : "" };
    const problem = costCentreProblem(c, centres);
    if (problem) { toast?.(L(PROBLEM[problem][0], PROBLEM[problem][1]), "err"); return; }
    const next = form.id ? centres.map((x) => (x.id === c.id ? c : x)) : [...centres, c];
    if (await saveShop({ costCentres: next }, `${form.id ? "Changed" : "Added"} ${c.code} ${c.name}`)) {
      toast?.(L("সেন্টার সেভ হয়েছে", "Centre saved"));
      setForm(null);
    }
  };
  const toggleActive = async (c) => {
    if (!isOwner || saving) return;
    const next = centres.map((x) => (x.id === c.id ? { ...x, active: !x.active } : x));
    if (c.active === false) {
      const problem = costCentreProblem({ ...c, active: true }, centres);
      if (problem) { toast?.(L(PROBLEM[problem][0], PROBLEM[problem][1]), "err"); return; }
    }
    await saveShop({ costCentres: next }, `${c.active ? "Stopped" : "Started again"} ${c.code} ${c.name}`);
  };
  const setRequired = async (on) => {
    if (!isOwner || saving) return;
    await saveShop({ costCentreRequired: on }, on ? "Cost centre required on expenses" : "Cost centre optional on expenses");
  };

  const kpi = (labelText, value, color) => (
    <div className="si-kpi" title={`${labelText}: ${cur} ${money(value)}`}><span>{labelText}</span><b style={{ color }}>{cur} {money(value)}</b></div>
  );

  return (
    <div ref={rootRef} className="si-root" style={fitH ? { height: fitH } : undefined}>
      <style>{PM_CSS}</style>
      <style>{SI_CSS}</style>
      <style>{CC_CSS}</style>
      <div className="pm-reference-title">
        <strong> {L("কস্ট সেন্টার", "Cost Centres")}</strong>
        <span>{view === "report" ? subtitle : L(`${centres.length}টি সেন্টার`, `${centres.length} centre(s)`)}</span>
      </div>
      <div className="si-toolbar">
        <div className="si-pills">
          <button type="button" className={`pm-btn-secondary${view === "report" ? " is-active" : ""}`} onClick={() => setView("report")}>{L("রিপোর্ট", "Report")}</button>
          <button type="button" className={`pm-btn-secondary${view === "centres" ? " is-active" : ""}`} onClick={() => setView("centres")}>{L("সেন্টারের তালিকা", "Centres")}</button>
        </div>
        {view === "report" && canPrint && <button type="button" className="pm-btn pm-btn--primary" onClick={print} disabled={!rep}> {L("প্রিন্ট", "Print")}</button>}
        {view === "report" && canPrint && <button type="button" className="pm-btn-secondary" onClick={exportCsv} disabled={!rep}> Excel</button>}
        <button type="button" className="pm-btn-secondary" onClick={() => setTick((v) => v + 1)}> {L("রিফ্রেশ", "Refresh")}</button>
        <span className="si-toolbar-gap" />
        {view === "report" && (
          <>
            <DateField className="pm-input" style={{ width: mobile ? "calc(50% - 2px)" : 130, borderColor: badRange ? "#b91c1c" : undefined }} value={from} onChange={(e) => setFrom(e.target.value)} />
            <DateField className="pm-input" style={{ width: mobile ? "calc(50% - 2px)" : 130, borderColor: badRange ? "#b91c1c" : undefined }} value={to} onChange={(e) => setTo(e.target.value)} />
          </>
        )}
      </div>
      {view === "report" && rep && (
        <div className="si-kpis">
          {kpi(L("ব্রাঞ্চের মোট লাভ", "Branch gross profit"), rep.totals.grossProfit, "#15803d")}
          {kpi(L("সেন্টারে বরাদ্দ খরচ", "Expenses allocated"), rep.totals.allocated, "#1d4ed8")}
          {kpi(L("বরাদ্দ হয়নি", "Not allocated"), rep.unallocated.expenses, rep.unallocated.expenses > 0 ? "#b45309" : undefined)}
          {kpi(L("মোট খরচ", "Total expenses"), rep.totals.expenses, "#b91c1c")}
        </div>
      )}
      <div className="si-body">
        {error && <div className="si-paid-box is-due">{L("ডেটা পড়া যায়নি: ", "Could not load: ")}{error}</div>}
        {view === "report" && !rep && !error && <div className="si-empty">{badRange ? L("শুরুর তারিখ শেষের পরে", "From is after To") : L("লোড হচ্ছে…", "Loading…")}</div>}
        {view === "report" && rep && (
          <>
            {!centres.length && <div className="si-paid-box" style={{ display: "block" }}>{L("এখনো কোনো কস্ট সেন্টার নেই - সব খরচ বরাদ্দ হয়নি ঘরে। মালিক \"সেন্টারের তালিকা\"-তে যোগ করতে পারেন।", "No cost centres yet - every expense is under Not allocated. The owner can add them under Centres.")}</div>}
            <div className={mobile || !selRow ? "" : "si-cols"} style={mobile || !selRow ? { display: "flex", flexDirection: "column", gap: 4 } : { alignItems: "start" }}>
              <fieldset className="pm-panel" style={{ margin: 0 }}>
                <legend className="pm-panel-legend">{L("সেন্টার অনুযায়ী", "By cost centre")}</legend>
                <div className="si-panel-body" style={{ overflow: "auto" }}>
                  <table className="cc-table">
                    <thead><tr><th>{L("কোড", "Code")}</th><th>{L("সেন্টার", "Centre")}</th><th>{L("ধরন", "Type")}</th><th className="num">{L("নিট বিক্রি", "Net sales")}</th><th className="num">{L("মোট লাভ", "Gross profit")}</th><th className="num">{L("খরচ", "Expenses")}</th><th className="num">{L("নিট", "Net")}</th></tr></thead>
                    <tbody>
                      {rep.rows.map((r) => (
                        <tr key={r.id} className={`is-click${r.active ? "" : " is-off"}${sel === r.id ? " is-sel" : ""}`} onClick={() => setSel(sel === r.id ? "" : r.id)}>
                          <td>{r.code}</td>
                          <td>{centreName(r)}{!r.active ? <span className="si-muted"> ({L("বন্ধ", "stopped")})</span> : null}{r.type === "branch" && r.branchId ? <span className="si-muted"> · {branchName(r.branchId)}</span> : null}</td>
                          <td>{typeName(r.type)}</td>
                          <td className="num">{r.hasSales ? money(r.netSales) : ""}</td>
                          <td className="num">{r.hasSales ? money(r.grossProfit) : ""}</td>
                          <td className="num">{money(r.expenses)} <span className="si-muted">({r.count})</span></td>
                          <td className="num" style={{ color: r.net < 0 ? "#b91c1c" : "#15803d" }}>{money(r.net)}</td>
                        </tr>
                      ))}
                      <tr className={`is-click${sel === "unallocated" ? " is-sel" : ""}`} onClick={() => setSel(sel === "unallocated" ? "" : "unallocated")}>
                        <td /><td style={{ color: "#b45309" }}>{L("বরাদ্দ হয়নি", "Not allocated")}</td><td /><td /><td />
                        <td className="num" style={{ color: "#b45309" }}>{money(rep.unallocated.expenses)} <span className="si-muted">({rep.unallocated.count})</span></td>
                        <td className="num" style={{ color: rep.unallocated.expenses > 0 ? "#b91c1c" : undefined }}>{money(-rep.unallocated.expenses)}</td>
                      </tr>
                      {rep.unlinkedSales.map((s) => (
                        <tr key={`b-${s.branchId}`}>
                          <td /><td className="si-muted">{L("ব্রাঞ্চের বিক্রি, সেন্টার নেই", "Branch sales without a centre")}: {branchName(s.branchId)}</td><td />
                          <td className="num">{money(s.netSales)}</td><td className="num">{money(s.grossProfit)}</td><td /><td className="num">{money(s.grossProfit)}</td>
                        </tr>
                      ))}
                      <tr className="is-total">
                        <td /><td>{L("মোট", "Total")}</td><td />
                        <td className="num">{money(rep.totals.netSales)}</td><td className="num">{money(rep.totals.grossProfit)}</td>
                        <td className="num">{money(rep.totals.expenses)}</td><td className="num">{money(rep.totals.net)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </fieldset>
              {selRow && (
                <fieldset className="pm-panel" style={{ margin: 0 }}>
                  <legend className="pm-panel-legend">{selRow.code ? `${selRow.code} - ` : ""}{selRow.nameBn && bn ? selRow.nameBn : selRow.name}</legend>
                  <div className="si-panel-body">
                    <table className="cc-table">
                      <thead><tr><th>{L("খরচের ধরন", "Expense type")}</th><th className="num">{L("টাকা", "Amount")}</th></tr></thead>
                      <tbody>
                        {selRow.byCategory.map(([label, amt]) => <tr key={label}><td>{label}</td><td className="num">{money(amt)}</td></tr>)}
                        {!selRow.byCategory.length && <tr><td colSpan={2} className="si-empty">{L("এই সময়ে খরচ নেই", "No expenses in this period")}</td></tr>}
                      </tbody>
                    </table>
                    <div style={{ marginTop: 4 }}><button type="button" className="pm-btn-secondary" onClick={() => setSel("")}>{L("বন্ধ", "Close")}</button></div>
                  </div>
                </fieldset>
              )}
            </div>
            <div className="si-note">
              {L(
                "খরচ (VAT ছাড়া) সেই সেন্টারে যা খরচের বিলে বাছা হয়েছে; বাছা না থাকলে \"বরাদ্দ হয়নি\"। ব্রাঞ্চ সেন্টারে সেই ব্রাঞ্চ থেকে হওয়া বিক্রি আর মোট লাভ (গ্রুপ ভিউয়ের একই হিসাব); অন্য সেন্টারে বিক্রি ভাগ করা হয় না। জার্নাল, সাপ্লায়ারের ছাড় আর স্টক অ্যাডজাস্টমেন্ট সেন্টারে নেই - পুরো দোকানের নিট লাভ হিসাব নিকাশ (P&L)-এ। Draft ও বাতিল বাদ।",
                "Expenses (without VAT) go to the centre chosen on the expense bill; none chosen shows as Not allocated. A branch centre shows the sales and gross profit made at that branch (the same split as the group view); sales are not split for other centres. Journals, supplier discounts and stock adjustments are not on centres - the whole shop's net profit is in the Accounts (P&L) report. Drafts and cancelled left out."
              )}
            </div>
          </>
        )}
        {view === "centres" && (
          <>
            <fieldset className="pm-panel" style={{ margin: 0 }}>
              <legend className="pm-panel-legend">{L("কস্ট সেন্টার", "Cost centres")}</legend>
              <div className="si-panel-body" style={{ overflow: "auto" }}>
                <label style={{ display: "inline-flex", gap: 6, alignItems: "center", fontSize: 12, marginBottom: 6 }}>
                  <input type="checkbox" checked={required} disabled={!isOwner || saving} onChange={(e) => setRequired(e.target.checked)} />
                  {L("খরচের বিলে কস্ট সেন্টার বাধ্যতামূলক (চালু সেন্টার থাকলে)", "Require a cost centre on expenses (when an active centre exists)")}
                </label>
                {centres.length ? (
                  <table className="cc-table">
                    <thead><tr><th>{L("কোড", "Code")}</th><th>{L("নাম", "Name")}</th><th>{L("বাংলা নাম", "Bangla name")}</th><th>{L("ধরন", "Type")}</th><th>{L("ব্রাঞ্চ", "Branch")}</th><th>{L("অবস্থা", "Status")}</th>{isOwner && <th />}</tr></thead>
                    <tbody>
                      {centres.map((c) => (
                        <tr key={c.id} className={c.active ? undefined : "is-off"}>
                          <td>{c.code}</td><td>{c.name}</td><td>{c.nameBn || "-"}</td><td>{typeName(c.type)}</td>
                          <td>{c.type === "branch" && c.branchId ? branchName(c.branchId) : "-"}</td>
                          <td>{c.active ? L("চালু", "Active") : L("বন্ধ", "Stopped")}</td>
                          {isOwner && (
                            <td style={{ whiteSpace: "nowrap" }}>
                              <button type="button" className="pm-btn-secondary" disabled={saving} onClick={() => setForm({ ...c })}>{L("বদলান", "Edit")}</button>{" "}
                              <button type="button" className="pm-btn-secondary" disabled={saving} onClick={() => toggleActive(c)}>{c.active ? L("বন্ধ করুন", "Stop") : L("চালু করুন", "Start")}</button>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : <div className="si-empty">{L("এখনো কোনো সেন্টার নেই", "No centres yet")}</div>}
                {isOwner && !form && <div style={{ marginTop: 6 }}><button type="button" className="pm-btn pm-btn--primary" disabled={saving} onClick={() => setForm(blankCentre())}>{L("নতুন সেন্টার", "New centre")}</button></div>}
                {isOwner && form && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4, alignItems: "center", marginTop: 6 }}>
                    <input className="pm-input" style={{ width: 110 }} value={form.code} disabled={saving} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))} placeholder={L("কোড", "Code")} />
                    <input className="pm-input" style={{ width: mobile ? "100%" : 180 }} value={form.name} disabled={saving} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder={L("নাম (ইংরেজি)", "Name")} />
                    <input className="pm-input" style={{ width: mobile ? "100%" : 180 }} value={form.nameBn} disabled={saving} onChange={(e) => setForm((f) => ({ ...f, nameBn: e.target.value }))} placeholder={L("বাংলা নাম (ঐচ্ছিক)", "Bangla name (optional)")} />
                    <select className="pm-input" style={{ width: 150 }} value={form.type} disabled={saving} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}>
                      {COST_CENTRE_TYPES.map((t) => <option key={t.id} value={t.id}>{bn ? t.bn : t.en}</option>)}
                    </select>
                    {form.type === "branch" && (
                      <select className="pm-input" style={{ width: 170 }} value={form.branchId} disabled={saving} onChange={(e) => setForm((f) => ({ ...f, branchId: e.target.value }))} title={L("এই ব্রাঞ্চের বিক্রি সেন্টারে দেখাবে", "This branch's sales show on the centre")}>
                        <option value="">{L("ব্রাঞ্চ লিঙ্ক নেই", "No branch link")}</option>
                        {branchList.map((b) => <option key={b.id} value={b.id}>{bn ? b.nameBn || b.name : b.name}</option>)}
                      </select>
                    )}
                    <button type="button" className="pm-btn pm-btn--primary" disabled={saving} onClick={saveCentre}>{saving ? L("সেভ হচ্ছে…", "Saving…") : L("সেভ", "Save")}</button>
                    <button type="button" className="pm-btn-secondary" disabled={saving} onClick={() => setForm(null)}>{L("বাতিল", "Cancel")}</button>
                  </div>
                )}
                {!isOwner && <div className="si-muted" style={{ marginTop: 4 }}>{L("শুধু মালিক সেন্টার যোগ বা বদল করতে পারেন।", "Only the owner can add or change centres.")}</div>}
              </div>
            </fieldset>
            <div className="si-note">
              {L(
                "সেন্টার দোকানের রেকর্ডে থাকে আর সব ডিভাইসে সিঙ্ক হয়। বন্ধ সেন্টার নতুন খরচে বাছা যায় না, পুরোনো বিলে থেকে যায়। একটি ব্রাঞ্চে একটিই ব্রাঞ্চ সেন্টার।",
                "Centres are kept on the shop record and sync to every device. A stopped centre cannot be picked on new expenses and stays on old bills. One branch centre per branch."
              )}
            </div>
          </>
        )}
      </div>
      <div className="si-statusbar">
        {rep && view === "report" && <span>{L("নিট", "Net")} <b>{money(rep.totals.net)}</b></span>}
        <span>{required ? L("খরচে সেন্টার বাধ্যতামূলক", "Centre required on expenses") : L("খরচে সেন্টার ঐচ্ছিক", "Centre optional on expenses")}</span>
      </div>
    </div>
  );
}
