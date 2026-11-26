// Opening & Migration hub: every opening balance on one screen (cash / bank / VAT / capital / loans / other accounts,
// customers, suppliers) as on the start date, filled by hand or from a Tally XML / CSV / Excel file, saved as
// opening journals and opening bills, and checked against the imported figures. Owner only. Rules in openingHub.js.
import React, { useEffect, useMemo, useRef, useState } from "react";
import { PM_CSS } from "../product-master/pmStyles";
import { SI_CSS, usePmFitHeight, usePmMobile } from "../sales-invoice/siSkin";
import { offlineList, offlineUpdate, offlineUpsert, offlineGetById } from "../offline/offlineRepository";
import { loadInvoiceRows, rowsOf } from "../inventory/stockFromInvoices";
import { saveShopRecord } from "../offline/shopService";
import { expenseCategoryLabel } from "../expenses/ExpensesTab.jsx";
import { syncOpeningBill } from "../utils/openingBill.js";
import { logAudit } from "../utils/auditLog.js";
import { periodLockOf } from "./periodLock.js";
import { buildGlobalLedger, balances } from "../ledger/globalLedger.js";
import { shopAccountNature } from "../ledger/accountNature.js";
import { normalizeChart, toSaved, validateAccount } from "../ledger/chartOfAccounts.js";
import { CHART_EXPENSE_NAMES } from "../ledger/ChartOfAccountsScreen.jsx";
import { OPENING_ACCOUNT, currentOpenings, matchImport, natureLabel, openingAccounts, parseOpeningRows, parseTallyLedgers, planOpenings, reconcileOpenings } from "./openingHub.js";

const lc = (v) => String(v || "").trim().toLowerCase();
const money = (v) => (Math.round((Number(v) || 0) * 100) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const num = (v) => { const n = Number(String(v ?? "").replace(/,/g, "")); return Number.isFinite(n) ? n : 0; };
const fmtDay = (d) => (d ? String(d).slice(0, 10).split("-").reverse().join("/") : "");
const localDay = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const OH_CSS = `
.oh-table { width: 100%; border-collapse: collapse; font-size: 11.5px; }
.oh-table th { text-align: left; background: #e8eef7; padding: 3px 5px; border-bottom: 1px solid #8797a9; white-space: nowrap; position: sticky; top: 0; z-index: 1; }
.oh-table td { padding: 2px 5px; border-bottom: 1px solid #e2e8f0; }
.oh-table .num { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
.oh-table input.pm-input { height: 24px; text-align: right; width: 110px; }
.oh-kpis { grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); }
`;
const MATCH_LABEL = {
  account: ["খাত", "Account"], customer: ["কাস্টমার", "Customer"], vendor: ["সাপ্লায়ার", "Supplier"], newAccount: ["নতুন খাত", "New account"],
  missingParty: ["পার্টি নেই", "Party not in S4"], pl: ["আয় / খরচ - বাদ", "Income / expense - skipped"], stock: ["স্টক - বাদ", "Stock - skipped"],
  invalid: ["ভুল অঙ্ক", "Bad amount"], zero: ["শূন্য", "Zero"],
};

export default function OpeningHub({ lang = "en", shopId, shop, user, profile, isOwner = false, customers = [], vendors = [], cur = "AED", toast, onShopUpdated, onPartiesChanged }) {
  const bn = lang === "bn";
  const L = (b, e) => (bn ? b : e);
  const [data, setData] = useState(null);
  const [tick, setTick] = useState(0);
  const [date, setDate] = useState("");
  const [values, setValues] = useState(null); // key -> { dr, cr } (strings as typed)
  const [section, setSection] = useState("account");
  const [query, setQuery] = useState("");
  const [onlyFilled, setOnlyFilled] = useState(false);
  const [imported, setImported] = useState(null); // { file, matched }
  const [tallySigns, setTallySigns] = useState(true);
  const [addNew, setAddNew] = useState(() => new Set());
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);
  const mobile = usePmMobile();
  const rootRef = useRef(null);
  const fitH = usePmFitHeight(rootRef, mobile);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      loadInvoiceRows(), offlineList("salesReceipts"), offlineList("purchasePayments"), offlineList("expenses"),
      offlineList("accountVouchers").catch(() => []), offlineList("partnerEntries").catch(() => []), offlineList("bankReconciliations").catch(() => []),
    ]).then(([rows, rc, pm, ex, av, pe, br]) => {
      if (cancelled) return;
      const mine = (list) => list.filter((d) => !d.shopId || d.shopId === shopId);
      setData({
        salesInvoices: mine(rows.salesInvoices), purchaseInvoices: mine(rows.purchaseInvoices), salesReturns: rows.extras?.salesReturns || [], purchaseReturns: rows.extras?.purchaseReturns || [],
        receipts: rowsOf(rc), payments: rowsOf(pm), expenses: rowsOf(ex), accountVouchers: mine(rowsOf(av)), partnerEntries: rowsOf(pe),
        bankEntries: rowsOf(br).filter((d) => d?.kind === "entry"),
      });
    }).catch((err) => { console.warn("[S4 Opening] load failed", err); toast?.(String(err?.message || err), "err"); });
    return () => { cancelled = true; };
  }, [shopId, tick]); // eslint-disable-line react-hooks/exhaustive-deps

  const chart = useMemo(() => normalizeChart(shop?.chartOfAccounts, { expenseNames: CHART_EXPENSE_NAMES, coaGroups: shop?.coaGroups }), [shop?.chartOfAccounts, shop?.coaGroups]);
  const accounts = useMemo(() => openingAccounts(chart), [chart]);
  const custList = useMemo(() => customers.filter((c) => c?.id && !c.isDeleted && !c.mergedInto), [customers]);
  const vendList = useMemo(() => vendors.filter((v) => v?.id && !v.isDeleted && !v.mergedInto), [vendors]);
  const existing = useMemo(() => (data ? currentOpenings(data, { customers: custList, vendors: vendList }) : null), [data, custList, vendList]);
  const lockDate = periodLockOf(shop).lockDate || "";

  // the table starts from what is saved
  useEffect(() => {
    if (!existing || values) return;
    const v = {};
    const put = (key, net) => { if (Math.abs(net) >= 0.005) v[key] = net > 0 ? { dr: String(net), cr: "" } : { dr: "", cr: String(-net) }; };
    existing.accounts.forEach((net, name) => put(`a:${name}`, net));
    existing.customers.forEach((net, id) => put(`c:${id}`, net));
    existing.vendors.forEach((net, id) => put(`v:${id}`, net));
    setValues(v);
    setDate(existing.date || date || localDay());
  }, [existing]); // eslint-disable-line react-hooks/exhaustive-deps

  const netOf = (key) => { const v = values?.[key]; return v ? Math.round((num(v.dr) - num(v.cr)) * 100) / 100 : 0; };
  const setCell = (key, side, val) => setValues((prev) => ({ ...prev, [key]: { ...(prev?.[key] || { dr: "", cr: "" }), [side]: val, [side === "dr" ? "cr" : "dr"]: val ? "" : (prev?.[key]?.[side === "dr" ? "cr" : "dr"] || "") } }));
  const allRows = useMemo(() => [
    ...accounts.map((a) => ({ kind: "account", key: `a:${lc(a.name)}`, name: a.name, sub: natureLabel(a.group, bn), code: a.code })),
    ...custList.map((c) => ({ kind: "customer", key: `c:${c.id}`, id: c.id, name: c.customerName || "-", sub: c.customerCode || "", code: c.customerCode || "" })),
    ...vendList.map((v) => ({ kind: "vendor", key: `v:${v.id}`, id: v.id, name: v.vendorName || "-", sub: v.vendorCode || "", code: v.vendorCode || "" })),
  ], [accounts, custList, vendList, bn]);
  const entered = values ? allRows.map((r) => ({ ...r, net: netOf(r.key) })) : [];
  const planRows = entered.filter((r) => Math.abs(r.net) >= 0.005 || (r.kind === "account" ? existing?.accounts.has(lc(r.name)) : (r.kind === "customer" ? existing?.customers : existing?.vendors)?.has(r.id)));
  const totals = { dr: entered.reduce((t, r) => t + Math.max(0, r.net), 0), cr: entered.reduce((t, r) => t + Math.max(0, -r.net), 0) };
  const diff = Math.round((totals.dr - totals.cr) * 100) / 100;

  const q = lc(query);
  const shown = entered.filter((r) => r.kind === section && (!q || lc(r.name).includes(q) || lc(r.code).includes(q)) && (!onlyFilled || Math.abs(r.net) >= 0.005));

  // ── import ──
  const readFile = async (file) => {
    if (!file) return;
    try {
      let items;
      if (/\.xml$/i.test(file.name)) items = parseTallyLedgers(await file.text(), { tallySigns });
      else {
        const XLSX = await import("xlsx");
        const wb = /\.csv$/i.test(file.name) ? XLSX.read(await file.text(), { type: "string" }) : XLSX.read(await file.arrayBuffer(), { type: "array" });
        const res = parseOpeningRows(XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: "" }));
        if (res.error) { toast?.(res.error === "noName" ? L("নামের কলাম পাওয়া যায়নি (Name / Ledger / Account)", "No name column found (Name / Ledger / Account)") : L("অঙ্কের কলাম পাওয়া যায়নি (Debit / Credit বা Opening)", "No amount column found (Debit / Credit or Opening)"), "err"); return; }
        items = res.items;
      }
      const matched = matchImport(items, { chart, customers: custList, vendors: vendList });
      setImported({ file: file.name, matched });
      setAddNew(new Set(matched.filter((m) => m.match === "newAccount").map((m) => m.name)));
    } catch (e) { toast?.(L("ফাইল পড়া যায়নি: ", "Could not read the file: ") + (e?.message || e), "err"); }
    finally { if (fileRef.current) fileRef.current.value = ""; }
  };
  const importCounts = imported ? imported.matched.reduce((m, x) => { m[x.match] = (m[x.match] || 0) + 1; return m; }, {}) : {};
  const fillFromImport = async () => {
    if (!imported) return;
    // new accounts first, so their rows exist in the table
    const wanted = imported.matched.filter((m) => m.match === "newAccount" && addNew.has(m.name));
    let nextChart = chart;
    const failed = [];
    wanted.forEach((m) => {
      const res = validateAccount({ name: m.name, code: "", active: true }, nextChart, { expenseNames: CHART_EXPENSE_NAMES, partyNames: [...custList.map((c) => c.customerName), ...vendList.map((v) => v.vendorName)] });
      if (res.ok) nextChart = [...nextChart, { ...res.account, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }];
      else failed.push(m.name);
    });
    if (nextChart !== chart) {
      try { onShopUpdated?.(await saveShopRecord(shopId, { chartOfAccounts: toSaved(nextChart) })); }
      catch (e) { toast?.(e.message || String(e), "err"); return; }
    }
    const added = new Set(wanted.filter((m) => !failed.includes(m.name)).map((m) => lc(m.name)));
    setValues((prev) => {
      const next = { ...(prev || {}) };
      imported.matched.forEach((m) => {
        const key = m.match === "account" ? `a:${lc(m.target)}` : m.match === "customer" ? `c:${m.id}` : m.match === "vendor" ? `v:${m.id}` : m.match === "newAccount" && added.has(lc(m.name)) ? `a:${lc(m.name)}` : "";
        if (!key) return;
        next[key] = m.opening > 0 ? { dr: String(m.opening), cr: "" } : { dr: "", cr: String(-m.opening) };
      });
      return next;
    });
    toast?.(L("টেবিলে বসানো হয়েছে - দেখে নিয়ে সেভ করুন", "Filled into the table - check it, then save") + (failed.length ? ` (${L("যোগ হয়নি", "not added")}: ${failed.join(", ")})` : ""));
  };

  // ── save ──
  const blockerText = (b) => ({
    date: L("শুরুর তারিখ দিন", "Enter the opening date"),
    locked: L(`হিসাব ${fmtDay(lockDate)} পর্যন্ত বন্ধ - শুরুর তারিখ তার পরে দিন বা লক তুলুন`, `The books are closed up to ${fmtDay(lockDate)} - use a later opening date or lift the lock`),
    duplicate: L(`একই খাত দুবার: ${(b.names || []).join(", ")}`, `Same account twice: ${(b.names || []).join(", ")}`),
    openingAccount: L(`"${OPENING_ACCOUNT}"-এ সরাসরি অঙ্ক দেওয়া যায় না`, `"${OPENING_ACCOUNT}" can't be entered directly`),
    paid: L(`শুরুর বিল থেকে আগেই বেশি পরিশোধ হয়েছে: ${(b.names || []).join(", ")}`, `More was already paid on the opening bill of: ${(b.names || []).join(", ")}`),
  }[b.code] || b.code);
  const billsMap = useMemo(() => ({
    customers: new Map((data?.salesInvoices || []).filter((b) => b.source === "openingBalance" && b.customerId).map((b) => [b.customerId, b])),
    vendors: new Map((data?.purchaseInvoices || []).filter((b) => b.source === "openingBalance" && b.vendorId).map((b) => [b.vendorId, b])),
  }), [data]);
  const who = profile?.personName || profile?.username || user?.email || "";
  const plan = existing && values ? planOpenings(planRows, { date, existing, bills: billsMap, lockDate, uid: user?.uid || "", by: who, shopId }) : null;
  const changes = plan ? plan.journals.length + plan.parties.length : 0;

  const save = async () => {
    if (!isOwner || !plan || plan.blockers.length || busy || !changes) return;
    const ok = window.confirm(L(
      `${fmtDay(date)} তারিখের শুরুর ব্যালেন্স সেভ হবে (${changes}টি পরিবর্তন)। ডেবিট ${money(totals.dr)} / ক্রেডিট ${money(totals.cr)}${Math.abs(diff) >= 0.005 ? `, পার্থক্য ${money(diff)} "${OPENING_ACCOUNT}"-এ থাকবে` : ""}। চালাবেন?`,
      `Save the opening balances as on ${fmtDay(date)} (${changes} change(s))? Debit ${money(totals.dr)} / credit ${money(totals.cr)}${Math.abs(diff) >= 0.005 ? `, the difference ${money(diff)} stays in "${OPENING_ACCOUNT}"` : ""}.`,
    ));
    if (!ok) return;
    setBusy(true);
    let done = 0;
    try {
      for (const j of plan.journals) {
        if (j.cancel) {
          const cur0 = await offlineGetById("accountVouchers", j.id).catch(() => null);
          if (cur0?.data && cur0.data.status !== "cancelled") await offlineUpdate("accountVouchers", j.id, { status: "cancelled", cancelledAt: new Date().toISOString(), cancelledBy: user?.uid || "", cancelReason: "Opening balance removed" });
        } else {
          const cur0 = await offlineGetById("accountVouchers", j.id).catch(() => null);
          if (cur0?.data) await offlineUpdate("accountVouchers", j.id, { ...j.doc, createdAt: cur0.data.createdAt || j.doc.createdAt, createdBy: cur0.data.createdBy || j.doc.createdBy, createdByName: cur0.data.createdByName || j.doc.createdByName });
          else await offlineUpsert("accountVouchers", j.id, j.doc);
        }
        done += 1;
      }
      for (const p of plan.parties) {
        const col = p.kind === "customer" ? "customers" : "vendors";
        const party = (p.kind === "customer" ? custList : vendList).find((x) => x.id === p.id);
        await offlineUpdate(col, p.id, { openingBalance: p.amount, updatedAt: new Date().toISOString(), updatedBy: user?.uid || "" });
        await syncOpeningBill({ kind: col, partyId: p.id, party: { ...party, openingBalance: p.amount }, shopId, uid: user?.uid || "", actorName: who, bn, date });
        done += 1;
      }
      await logAudit({ shopId, user, profile, action: "opening", collection: "accountVouchers", docNo: date, note: `Opening balances as on ${date}: ${changes} change(s), Dr ${money(totals.dr)} / Cr ${money(totals.cr)}` });
      toast?.(L("শুরুর ব্যালেন্স সেভ হয়েছে", "Opening balances saved"));
      if (plan.parties.some((p) => p.kind === "customer")) onPartiesChanged?.("customer");
      if (plan.parties.some((p) => p.kind === "vendor")) onPartiesChanged?.("vendor");
      if (navigator.onLine) window.S4Offline?.syncNow?.().catch(() => {});
    } catch (e) {
      toast?.(L(`${done} / ${changes} সেভের পর থেমেছে: `, `Stopped after ${done} of ${changes}: `) + (e?.message || e) + L(" - আবার সেভ চাপলে বাকিটা হবে", " - press Save again to finish"), "err");
    } finally {
      setBusy(false);
      setTick((v) => v + 1);
    }
  };

  // ── reconcile (S4 balance on the opening day vs the imported figure) ──
  const recon = useMemo(() => {
    if (!imported || !data || !date) return null;
    const ledger = buildGlobalLedger(data, { shopId, customers: custList, vendors: vendList, natureOf: shopAccountNature(shop), expenseLabel: (e) => expenseCategoryLabel(e, false) });
    const bal = balances(ledger.postings, date);
    const byName = new Map();
    ledger.accounts.forEach((a) => byName.set(lc(a.name), (byName.get(lc(a.name)) || 0) + (bal.get(a.key) || 0)));
    return reconcileOpenings(imported.matched, byName);
  }, [imported, data, date, shopId, custList, vendList]);
  const reconBad = recon ? recon.filter((r) => Math.abs(r.difference) >= 0.005) : [];

  if (!isOwner) return <div className="si-root"><style>{PM_CSS}</style><style>{SI_CSS}</style><div className="si-empty">{L("শুরুর ব্যালেন্স শুধু মালিক দিতে পারেন", "Only the owner can enter opening balances")}</div></div>;

  return (
    <div ref={rootRef} className="si-root" style={fitH ? { height: fitH } : undefined}>
      <style>{PM_CSS}</style>
      <style>{SI_CSS}</style>
      <style>{OH_CSS}</style>
      <div className="pm-reference-title">
        <strong> {L("শুরুর ব্যালেন্স ও মাইগ্রেশন", "Opening & Migration")}</strong>
        <span>{L("শুরুর তারিখ", "As on")} {fmtDay(date)}</span>
      </div>
      <div className="si-toolbar">
        <label style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>{L("শুরুর তারিখ", "Opening as on")}
          <input type="date" className="pm-input" style={{ width: 140 }} value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <button type="button" className="pm-btn pm-btn--primary" onClick={save} disabled={busy || !plan || !!plan.blockers.length || !changes}>{busy ? "..." : L(`সেভ (${changes})`, `Save (${changes})`)}</button>
        <button type="button" className="pm-btn-secondary" onClick={() => { setValues(null); setTick((v) => v + 1); }} disabled={busy}>{L("সেভ করা অবস্থায় ফেরত", "Reload saved")}</button>
        <span className="si-toolbar-gap" />
        <input ref={fileRef} type="file" accept=".xml,.csv,.xlsx,.xls" style={{ display: "none" }} onChange={(e) => readFile(e.target.files?.[0])} />
        <label style={{ display: "inline-flex", alignItems: "center", gap: 4 }} title={L("Tally XML-এ ডেবিট ব্যালেন্স মাইনাস লেখা থাকে", "Tally XML writes debit balances as negative numbers")}>
          <input type="checkbox" checked={tallySigns} onChange={(e) => setTallySigns(e.target.checked)} /> {L("Tally চিহ্ন (ডেবিট = মাইনাস)", "Tally signs (debit = minus)")}
        </label>
        <button type="button" className="pm-btn-secondary" onClick={() => fileRef.current?.click()}>{L("Tally XML / Excel থেকে আনুন", "Import Tally XML / Excel")}</button>
      </div>
      <div className="si-kpis oh-kpis">
        <div className="si-kpi"><span>{L("মোট ডেবিট", "Total debit")}</span><b>{cur} {money(totals.dr)}</b></div>
        <div className="si-kpi"><span>{L("মোট ক্রেডিট", "Total credit")}</span><b>{cur} {money(totals.cr)}</b></div>
        <div className="si-kpi"><span>{L(`পার্থক্য ("${OPENING_ACCOUNT}"-এ)`, `Difference (to "${OPENING_ACCOUNT}")`)}</span><b style={{ color: Math.abs(diff) < 0.005 ? "#15803d" : "#b45309" }}>{Math.abs(diff) < 0.005 ? L("মিলেছে", "Balanced") : `${cur} ${money(diff)}`}</b></div>
      </div>
      <div className="si-body">
        {!data && <div className="si-empty">{L("লোড হচ্ছে…", "Loading…")}</div>}
        {plan?.blockers.length > 0 && <div className="si-paid-box is-due">{plan.blockers.map((b) => <div key={b.code}>{blockerText(b)}</div>)}</div>}

        {imported && (
          <fieldset className="pm-panel" style={{ margin: 0 }}>
            <legend className="pm-panel-legend">{L("ফাইল", "File")}: {imported.file} ({imported.matched.length})</legend>
            <div className="si-panel-body" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <div>{Object.entries(importCounts).map(([k, n]) => `${(MATCH_LABEL[k] || [k, k])[bn ? 0 : 1]}: ${n}`).join("  |  ")}</div>
              <div style={{ overflow: "auto", maxHeight: mobile ? undefined : 240 }}>
                <table className="oh-table">
                  <thead><tr><th>{L("ফাইলের নাম", "Name in file")}</th><th>{L("গ্রুপ", "Group")}</th><th className="num">{L("ব্যালেন্স", "Balance")}</th><th>{L("S4-এ", "In S4")}</th></tr></thead>
                  <tbody>
                    {imported.matched.map((m, i) => (
                      <tr key={`${m.name}-${i}`}>
                        <td>{m.name}</td><td className="si-muted">{m.parent}</td>
                        <td className="num">{Number.isFinite(m.opening) ? `${money(Math.abs(m.opening))} ${m.opening >= 0 ? "Dr" : "Cr"}` : "-"}</td>
                        <td style={{ color: ["account", "customer", "vendor"].includes(m.match) ? "#15803d" : m.match === "newAccount" ? "#1d4ed8" : "#92400e" }}>
                          {m.match === "newAccount"
                            ? <label style={{ display: "inline-flex", gap: 4, alignItems: "center" }}><input type="checkbox" checked={addNew.has(m.name)} onChange={() => setAddNew((s) => { const n = new Set(s); if (n.has(m.name)) n.delete(m.name); else n.add(m.name); return n; })} /> {L("খাত হিসেবে যোগ", "Add as account")}</label>
                            : <>{(MATCH_LABEL[m.match] || [m.match, m.match])[bn ? 0 : 1]}{m.target && m.target !== m.name ? ` - ${m.target}` : ""}</>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                <button type="button" className="pm-btn pm-btn--primary" onClick={fillFromImport}>{L("টেবিলে বসান", "Fill the table")}</button>
                <button type="button" className="pm-btn-secondary" onClick={() => setImported(null)}>{L("বাদ দিন", "Discard")}</button>
              </div>
              {(importCounts.missingParty || 0) > 0 && <div className="si-muted">{L("যে কাস্টমার / সাপ্লায়ার S4-এ নেই তাদের আগে কাস্টমার / ভেন্ডর মাস্টারে আনুন (Excel import), তারপর ফাইলটা আবার দিন।", "Bring customers / suppliers that are not in S4 into the customer / vendor master first (Excel import), then load the file again.")}</div>}
              {recon && (
                <div>
                  <b>{L("মেলানো: ফাইল বনাম S4 (শুরুর তারিখে)", "Check: file vs S4 (on the opening date)")}</b>{" "}
                  {reconBad.length ? <span style={{ color: "#b91c1c" }}>{L(`${reconBad.length}টি মেলেনি`, `${reconBad.length} do not match`)}</span> : <span style={{ color: "#15803d" }}>{L("সব মিলেছে", "All match")}</span>}
                  {reconBad.length > 0 && (
                    <table className="oh-table" style={{ marginTop: 4 }}>
                      <thead><tr><th>{L("নাম", "Name")}</th><th className="num">{L("ফাইল", "File")}</th><th className="num">S4</th><th className="num">{L("পার্থক্য", "Difference")}</th></tr></thead>
                      <tbody>{reconBad.map((r) => <tr key={r.name}><td>{r.target}</td><td className="num">{money(r.imported)}</td><td className="num">{money(r.s4)}</td><td className="num" style={{ color: "#b91c1c" }}>{money(r.difference)}</td></tr>)}</tbody>
                    </table>
                  )}
                </div>
              )}
            </div>
          </fieldset>
        )}

        <div className="si-toolbar" style={{ padding: 0 }}>
          <div className="si-pills">
            {[["account", L("খাত", "Accounts")], ["customer", L("কাস্টমার", "Customers")], ["vendor", L("সাপ্লায়ার", "Suppliers")]].map(([k, label]) => (
              <button key={k} type="button" className={`pm-btn-secondary${section === k ? " is-active" : ""}`} onClick={() => setSection(k)}>{label} ({entered.filter((r) => r.kind === k && Math.abs(r.net) >= 0.005).length})</button>
            ))}
          </div>
          <input className="pm-input" style={{ width: mobile ? "100%" : 200 }} value={query} onChange={(e) => setQuery(e.target.value)} placeholder={L("নাম বা কোড খুঁজুন", "Search name or code")} />
          <label style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><input type="checkbox" checked={onlyFilled} onChange={(e) => setOnlyFilled(e.target.checked)} /> {L("শুধু যেগুলোতে অঙ্ক আছে", "Only with an amount")}</label>
        </div>
        <fieldset className="pm-panel" style={{ margin: 0 }}>
          <div className="si-panel-body" style={{ overflow: "auto", maxHeight: mobile ? undefined : 420 }}>
            {values && (
              <table className="oh-table">
                <thead><tr><th>{L("নাম", "Name")}</th><th>{section === "account" ? L("ভাগ", "Side") : L("কোড", "Code")}</th><th className="num">{L("ডেবিট", "Debit")}</th><th className="num">{L("ক্রেডিট", "Credit")}</th></tr></thead>
                <tbody>
                  {shown.map((r) => (
                    <tr key={r.key}>
                      <td>{r.name}</td><td className="si-muted">{r.sub}</td>
                      <td className="num"><input className="pm-input" inputMode="decimal" value={values[r.key]?.dr || ""} onChange={(e) => setCell(r.key, "dr", e.target.value)} /></td>
                      <td className="num"><input className="pm-input" inputMode="decimal" value={values[r.key]?.cr || ""} onChange={(e) => setCell(r.key, "cr", e.target.value)} /></td>
                    </tr>
                  ))}
                  {!shown.length && <tr><td colSpan={4} className="si-muted">{L("কিছু নেই", "Nothing here")}</td></tr>}
                </tbody>
              </table>
            )}
          </div>
        </fieldset>
        <div className="si-note">
          {L(
            "একটা তারিখে (S4 শুরুর আগের দিন) সব শুরুর ব্যালেন্স। ক্যাশ / ব্যাংক / VAT / মূলধন / ঋণ / অন্যান্য খাত প্রতিটা একটা শুরুর জার্নালে যায় (\"Opening Balance\"-এর বিপরীতে) - ভাউচার তালিকায় দেখা যায়। কাস্টমারের পাওনা আর সাপ্লায়ারের দেনা তাদের শুরুর বিলে যায় (মাস্টারের Opening balance-এর মতোই, রিসিপ্ট / পেমেন্টে মেটানো যায়), তারিখ এই শুরুর তারিখ; অগ্রিম থাকলে জার্নালে। আয় / খরচের খাতে শুরুর ব্যালেন্স হয় না (বছরের শুরু থেকে চালু করুন, না হলে এ পর্যন্ত লাভ মূলধনে দিন); স্টক আসে প্রোডাক্টের শুরুর স্টক থেকে। ডেবিট আর ক্রেডিট না মিললে পার্থক্য \"Opening Balance\" (মূলধনের ভাগ)-এ থাকে - পুরো মাইগ্রেশনে এটা ০ হওয়া উচিত (শুরুর স্টকের মূল্য ছাড়া)। আবার সেভ করলে আগেরটাই বদলায়, দুবার হয় না। শুধু মালিক।",
            "Every opening balance on one date (the day before S4 starts). Each cash / bank / VAT / capital / loan / other account goes into one opening journal (against \"Opening Balance\") - it shows in the voucher list. What customers owe and what is owed to suppliers goes on their opening bill (the same as the opening balance on the master, settled by receipts / payments), dated this opening day; an advance goes into a journal. Income / expense accounts take no opening (start on a year start, or put the profit so far into Capital); stock comes from the products' opening stock. If debits and credits differ the difference stays in \"Opening Balance\" (part of equity) - for a full migration it should be 0 (apart from the opening stock value). Saving again changes the same entries, nothing is doubled. Owner only."
          )}
        </div>
      </div>
      <div className="si-statusbar">
        {lockDate && <span>{L("পিরিয়ড লক", "Period lock")} {fmtDay(lockDate)}</span>}
        <span>{L("পরিবর্তন", "Changes")} <b>{changes}</b></span>
      </div>
    </div>
  );
}
