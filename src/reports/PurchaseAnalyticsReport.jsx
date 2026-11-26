// Purchase Analytics: one screen over the live purchase bills and returns for a period, with filters and export,
// broken down by period, supplier, product, brand / category, payment method and user. Mirror of Sales Analytics.
import React, { useEffect, useMemo, useRef, useState } from "react";
import { PM_CSS } from "../product-master/pmStyles";
import { SI_CSS, usePmFitHeight, usePmMobile } from "../sales-invoice/siSkin";
import { loadInvoiceRows } from "../inventory/stockFromInvoices";
import { printWithSettings } from "../print/printSettings.js";
import { generateStatementHTML } from "../print/printDesign.js";
import { saveTextFile } from "../utils/saveTextFile.js";
import { r2 } from "./reportFilters.js";
import { buildPurchaseAnalytics } from "./purchaseAnalytics.js";
import DateField from "../components/DateField.jsx";

const money = (v) => r2(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const qf = (v) => (Math.round((Number(v) || 0) * 1000) / 1000).toLocaleString("en-US", { maximumFractionDigits: 3 });
const localDay = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const monthStart = () => { const d = new Date(); return localDay(new Date(d.getFullYear(), d.getMonth(), 1)); };
const fmtDay = (d) => (d ? String(d).slice(0, 10).split("-").reverse().join("/") : "");
const fmtPeriod = (p) => (p.length === 7 ? `${p.slice(5, 7)}/${p.slice(0, 4)}` : fmtDay(p));
const csvCell = (v) => { const s = String(v ?? ""); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };

const VIEWS = [
  { id: "period", bn: "সময় অনুযায়ী", en: "By period" },
  { id: "vendor", bn: "সাপ্লায়ার", en: "Suppliers" },
  { id: "product", bn: "প্রোডাক্ট", en: "Products" },
  { id: "group", bn: "ব্র্যান্ড / ক্যাটাগরি", en: "Brand / category" },
  { id: "payment", bn: "পেমেন্ট / ইউজার", en: "Payment / user" },
  { id: "invoices", bn: "বিল তালিকা", en: "Bills" },
];
const METHOD_LABEL = { cash: ["নগদ", "Cash"], cheque: ["চেক", "Cheque"], bank_transfer: ["ব্যাংক ট্রান্সফার", "Bank transfer"], card: ["কার্ড", "Card"], credit: ["বাকি", "Credit"] };
const STATUS_LABEL = { paid: ["পরিশোধিত", "Paid"], partial: ["আংশিক", "Partial"], unpaid: ["বাকি", "Unpaid"] };
// Summary figures wrap instead of being cut off with an ellipsis.
const PA_CSS = `
.pa-kpis { grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); }
.pa-kpis .si-kpi b { white-space: normal; overflow: visible; text-overflow: clip; overflow-wrap: anywhere; font-variant-numeric: tabular-nums; }
.pa-kpis .si-kpi span { white-space: normal; line-height: 1.25; }
.pa-table { width: 100%; border-collapse: collapse; font-size: 11.5px; }
.pa-table th { text-align: left; background: #e8eef7; padding: 3px 5px; border-bottom: 1px solid #8797a9; white-space: nowrap; position: sticky; top: 0; z-index: 1; }
.pa-table td { padding: 3px 5px; border-bottom: 1px solid #e2e8f0; }
.pa-table .num { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
.pa-table tfoot td { font-weight: 700; border-top: 1px solid #7d94b7; background: #f8fafc; }
.pa-table tr.is-link { cursor: pointer; }
.pa-table tr.is-link:hover td { background: #eef4ff; }
.pa-bar { display: inline-block; height: 6px; background: #e8b493; border-radius: 2px; vertical-align: middle; }
`;

export default function PurchaseAnalyticsReport({ lang = "en", shopId, products = [], shopName = "", cur = "AED", toast, canPrint = false, onOpenInvoice }) {
  const bn = lang === "bn";
  const L = (b, e) => (bn ? b : e);
  const [from, setFrom] = useState(monthStart);
  const [to, setTo] = useState(() => localDay());
  const [view, setView] = useState("period");
  const [vendor, setVendor] = useState("");
  const [item, setItem] = useState("");
  const [brand, setBrand] = useState("");
  const [category, setCategory] = useState("");
  const [method, setMethod] = useState("");
  const [user, setUser] = useState("");
  const [status, setStatus] = useState("");
  const [rows, setRows] = useState(null);
  const [error, setError] = useState("");
  const [tick, setTick] = useState(0);
  const mobile = usePmMobile();
  const rootRef = useRef(null);
  const fitH = usePmFitHeight(rootRef, mobile, view);

  useEffect(() => {
    let cancelled = false;
    setError("");
    loadInvoiceRows()
      .then((r) => { if (!cancelled) setRows(r); })
      .catch((err) => { console.warn("[S4 Purchase Analytics] load failed", err); if (!cancelled) setError(String(err?.message || err)); });
    return () => { cancelled = true; };
  }, [shopId, tick]);

  useEffect(() => {
    const refresh = () => { if (document.visibilityState !== "hidden") setTick((v) => v + 1); };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => { window.removeEventListener("focus", refresh); document.removeEventListener("visibilitychange", refresh); };
  }, []);

  const today = localDay();
  const badRange = !!(from && to && from > to);
  const filters = { shopId, from, to, today, vendor, item, brand, category, method, user, status };
  const a = useMemo(() => (rows && !badRange ? buildPurchaseAnalytics({ purchaseInvoices: rows.purchaseInvoices, purchaseReturns: rows.extras?.purchaseReturns || [], products }, filters) : null),
    [rows, products, badRange, shopId, from, to, today, vendor, item, brand, category, method, user, status]); // eslint-disable-line react-hooks/exhaustive-deps
  const anyFilter = !!(vendor || item || brand || category || method || user || status);
  const clearFilters = () => { setVendor(""); setItem(""); setBrand(""); setCategory(""); setMethod(""); setUser(""); setStatus(""); };

  const pick = (map, k) => { const x = map[k]; return x ? L(x[0], x[1]) : k || "-"; };
  const methodName = (k) => pick(METHOD_LABEL, k);
  const statusName = (k) => pick(STATUS_LABEL, k);
  const period = `${from ? fmtDay(from) : L("শুরু", "Start")} — ${to ? fmtDay(to) : L("আজ", "Today")}`;
  const filterLine = [vendor && `${L("সাপ্লায়ার", "Supplier")}: ${vendor}`, item && `${L("প্রোডাক্ট", "Product")}: ${item}`, brand && `${L("ব্র্যান্ড", "Brand")}: ${brand}`,
    category && `${L("ক্যাটাগরি", "Category")}: ${category}`, method && methodName(method), user && `${L("ইউজার", "User")}: ${user}`, status && statusName(status)].filter(Boolean).join(" · ");
  const pct = (v, total) => (total > 0 ? `${((v / total) * 100).toFixed(1)}%` : "");

  // The table of the open view, shared by screen, print and CSV: { title, cols, num, rows, foot }
  const table = () => {
    const k = a.kpi;
    const amountCol = `${L("টাকা (VAT সহ)", "Amount (incl. VAT)")} (${cur})`, netCol = `${L("নিট (VAT ছাড়া)", "Net (excl. VAT)")} (${cur})`;
    if (view === "period") {
      return { title: a.unit === "day" ? L("দিন অনুযায়ী ক্রয়", "PURCHASES BY DAY") : L("মাস অনুযায়ী ক্রয়", "PURCHASES BY MONTH"),
        cols: [a.unit === "day" ? L("দিন", "Day") : L("মাস", "Month"), L("বিল", "Bills"), amountCol, "VAT", netCol, `${L("রিটার্ন (VAT সহ)", "Returns (incl. VAT)")} (${cur})`, `${L("নিট ক্রয় (রিটার্নের পরে)", "Net purchases (after returns)")} (${cur})`], num: [1, 2, 3, 4, 5, 6],
        rows: a.byPeriod.map((r) => [fmtPeriod(r.period), String(r.count), money(r.amount), money(r.vat), money(r.net), r.returns ? money(-r.returns) : "", money(r.netPurchases)]),
        foot: [L("মোট", "Total"), String(k.count), money(k.gross), money(k.vat), money(k.net), k.returnsTotal ? money(-k.returnsTotal) : "", money(k.netPurchases)] };
    }
    if (view === "vendor") {
      return { title: L("সাপ্লায়ার অনুযায়ী ক্রয়", "PURCHASES BY SUPPLIER"),
        cols: [L("সাপ্লায়ার", "Supplier"), L("বিল", "Bills"), amountCol, netCol, L("ভাগ", "Share"), ...(a.lineFilter ? [] : [`${L("এখনো দেনা", "Still payable")} (${cur})`])], num: [1, 2, 3, 4, 5],
        rows: a.byVendor.map((r) => [r.name, String(r.count), money(r.amount), money(r.net), pct(r.amount, k.gross), ...(a.lineFilter ? [] : [money(r.balance)])]),
        foot: [L("মোট", "Total"), String(k.count), money(k.gross), money(k.net), "", ...(a.lineFilter ? [] : [money(k.balance)])] };
    }
    if (view === "product") {
      return { title: L("প্রোডাক্ট অনুযায়ী ক্রয়", "PURCHASES BY PRODUCT"),
        cols: [L("কোড", "Code"), L("প্রোডাক্ট", "Product"), L("ব্র্যান্ড", "Brand"), L("পরিমাণ", "Qty"), L("বিল", "Bills"), netCol, L("ভাগ", "Share")], num: [3, 4, 5, 6],
        rows: a.byProduct.map((r) => [r.code, r.name, r.brand, qf(r.qty), String(r.bills), money(r.net), pct(r.net, k.net)]),
        foot: [L("মোট", "Total"), `${a.byProduct.length}`, "", qf(k.qty), "", money(a.byProduct.reduce((t, r) => t + r.net, 0)), ""] };
    }
    if (view === "group") {
      const rowsOut = [
        ...a.byBrand.map((r) => [L("ব্র্যান্ড", "Brand"), r.key, qf(r.qty), money(r.net), pct(r.net, k.net)]),
        ...a.byCategory.map((r) => [L("ক্যাটাগরি", "Category"), r.key, qf(r.qty), money(r.net), pct(r.net, k.net)]),
      ];
      return { title: L("ব্র্যান্ড / ক্যাটাগরি অনুযায়ী ক্রয়", "PURCHASES BY BRAND / CATEGORY"), cols: [L("ধরন", "Group"), L("নাম", "Name"), L("পরিমাণ", "Qty"), netCol, L("ভাগ", "Share")], num: [2, 3, 4], rows: rowsOut, foot: null };
    }
    if (view === "payment") {
      const rowsOut = [
        ...a.byMethod.map((r) => [L("পেমেন্ট", "Payment"), methodName(r.key), String(r.count), money(r.amount), pct(r.amount, k.gross)]),
        ...a.byUser.map((r) => [L("ইউজার", "User"), r.key, String(r.count), money(r.amount), pct(r.amount, k.gross)]),
      ];
      return { title: L("পেমেন্ট / ইউজার অনুযায়ী ক্রয়", "PURCHASES BY PAYMENT / USER"), cols: [L("ধরন", "Group"), L("নাম", "Name"), L("বিল", "Bills"), amountCol, L("ভাগ", "Share")], num: [2, 3, 4], rows: rowsOut, foot: null };
    }
    return { title: L("ক্রয়ের বিল", "PURCHASE BILLS"),
      cols: [L("তারিখ", "Date"), L("নং", "No"), L("সাপ্লায়ারের বিল নং", "Supplier bill no"), L("সাপ্লায়ার", "Supplier"), L("পেমেন্ট", "Payment"), L("অবস্থা", "Status"), amountCol, "VAT", ...(a.lineFilter ? [] : [L("দেওয়া", "Paid"), L("দেনা", "Payable")])], num: [6, 7, 8, 9],
      rows: a.invoices.map((r) => [fmtDay(r.date), r.no, r.supplierNo, r.vendor, methodName(r.method), statusName(r.status), money(r.amount), money(r.vat), ...(a.lineFilter ? [] : [money(r.paid), money(r.balance)])]),
      foot: ["", `${a.invoices.length}`, "", "", "", "", money(k.gross), money(k.vat), ...(a.lineFilter ? [] : [money(k.paid), money(k.balance)])] };
  };

  const summaryRows = () => {
    const k = a.kpi;
    return [
      [L("বিল", "Bills"), String(k.count)], [L("মোট ক্রয় (VAT সহ)", "Gross purchases (incl. VAT)"), money(k.gross)], [L("ক্রয়ের VAT", "VAT on purchases"), money(k.vat)],
      ...(k.discount != null ? [[L("পাওয়া ডিসকাউন্ট", "Discount received"), money(k.discount)]] : []),
      [L(`পারচেজ রিটার্ন (${k.returnsCount}টি)`, `Purchase returns (${k.returnsCount})`), money(k.returnsTotal)], [L("নিট ক্রয় (VAT ও রিটার্ন বাদে)", "Net purchases (excl. VAT, after returns)"), money(k.netPurchases)],
      [L("গড় বিল", "Average bill"), money(k.avgBill)],
    ];
  };

  const print = () => {
    if (!a) return;
    const t = table();
    const head = summaryRows().map(([label, v]) => [label, ...t.cols.slice(1).map((_, i) => (i === t.cols.length - 2 ? v : ""))]);
    printWithSettings(generateStatementHTML({
      shopName, title: `${L("পারচেজ অ্যানালিটিক্স", "PURCHASE ANALYTICS")} — ${t.title}`, subtitle: period, partyLine: filterLine,
      cols: t.cols.map((label, i) => ({ label, align: t.num.includes(i) ? "right" : undefined })), rows: [...head, t.cols.map(() => ""), ...t.rows], ...(t.foot ? { foot: t.foot } : {}),
    }), { lang });
  };

  const exportCsv = async () => {
    if (!a) return;
    const t = table();
    const out = [[L("পারচেজ অ্যানালিটিক্স", "Purchase Analytics"), period], ...(filterLine ? [[L("ফিল্টার", "Filters"), filterLine]] : []), ...summaryRows(), [], [t.title], t.cols, ...t.rows, ...(t.foot ? [t.foot] : [])];
    const text = "\uFEFF" + out.map((r) => r.map((c) => csvCell(String(c ?? "").trim())).join(",")).join("\r\n");
    try { await saveTextFile(`purchases-${view}-${from || "start"}_${to || "today"}.csv`, text); } catch (e) { toast?.(e.message || String(e), "err"); }
  };

  const quick = [
    ["today", L("আজ", "Today"), today, today],
    ["month", L("এই মাস", "This month"), monthStart(), today],
    ["year", L("এই বছর", "This year"), `${new Date().getFullYear()}-01-01`, today],
    ["all", L("সব সময়", "All time"), "", ""],
  ];
  const activeQuick = quick.find(([, , f, t]) => f === from && t === to)?.[0];
  const kpi = (label, value, color) => (
    <div className="si-kpi" title={`${label}: ${value}`}><span>{label}</span><b style={{ color }}>{value}</b></div>
  );
  const select = (value, onChange, allLabel, list, labelOf = (x) => x, width = 140) => (
    <select className="pm-input" style={{ width: mobile ? "48%" : width }} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">{allLabel}</option>
      {list.map((x) => <option key={x} value={x}>{labelOf(x)}</option>)}
    </select>
  );
  const bar = (v, max) => <span className="pa-bar" style={{ width: `${max > 0 ? Math.max(2, Math.round((v / max) * 80)) : 0}px` }} />;
  const tableBox = { overflow: "auto", maxHeight: mobile ? undefined : 440 };

  const renderTable = () => {
    const t = table();
    const maxOf = (list, key) => list.reduce((m, r) => Math.max(m, r[key] || 0), 0);
    const barCol = view === "period" ? maxOf(a.byPeriod, "amount") : view === "vendor" ? maxOf(a.byVendor, "amount") : view === "product" ? maxOf(a.byProduct, "net") : 0;
    const open = view === "invoices" && onOpenInvoice;
    return (
      <table className="pa-table">
        <thead><tr>{t.cols.map((c, i) => <th key={c} className={t.num.includes(i) ? "num" : undefined}>{c}</th>)}{barCol > 0 && !mobile && <th />}</tr></thead>
        <tbody>
          {t.rows.map((r, ri) => {
            const src = view === "period" ? a.byPeriod[ri] : view === "vendor" ? a.byVendor[ri] : view === "product" ? a.byProduct[ri] : view === "invoices" ? a.invoices[ri] : null;
            return (
              <tr key={`${view}-${ri}`} className={open ? "is-link" : undefined} onClick={open ? () => onOpenInvoice(src.id) : undefined} title={open ? L("বিল খুলুন", "Open bill") : undefined}>
                {r.map((c, i) => <td key={i} className={t.num.includes(i) ? "num" : undefined}>{c}</td>)}
                {barCol > 0 && !mobile && <td>{bar(view === "product" ? src.net : src.amount, barCol)}</td>}
              </tr>
            );
          })}
          {!t.rows.length && <tr><td colSpan={t.cols.length + 1} className="si-empty">{anyFilter ? L("এই ফিল্টারে কিছু নেই", "Nothing matches these filters") : L("এই সময়ে কোনো ক্রয় নেই", "No purchases in this period")}</td></tr>}
        </tbody>
        {t.foot && t.rows.length > 0 && <tfoot><tr>{t.foot.map((c, i) => <td key={i} className={t.num.includes(i) ? "num" : undefined}>{c}</td>)}{barCol > 0 && !mobile && <td />}</tr></tfoot>}
      </table>
    );
  };

  return (
    <div ref={rootRef} className="si-root" style={fitH ? { height: fitH } : undefined}>
      <style>{PM_CSS}</style>
      <style>{SI_CSS}</style>
      <style>{PA_CSS}</style>
      <div className="pm-reference-title">
        <strong> {L("পারচেজ অ্যানালিটিক্স", "Purchase Analytics")}</strong>
        <span>{period}{filterLine ? ` · ${filterLine}` : ""}</span>
      </div>
      <div className="si-toolbar">
        {canPrint && <button type="button" className="pm-btn pm-btn--primary" onClick={print} disabled={!a}> {L("প্রিন্ট", "Print")}</button>}
        {canPrint && <button type="button" className="pm-btn-secondary" onClick={exportCsv} disabled={!a}> Excel</button>}
        <button type="button" className="pm-btn-secondary" onClick={() => setTick((v) => v + 1)}> {L("রিফ্রেশ", "Refresh")}</button>
        <span className="si-toolbar-gap" />
        <div className="si-pills">
          {quick.map(([key, label, f, t]) => (
            <button key={key} type="button" className={`pm-btn-secondary${activeQuick === key ? " is-active" : ""}`} onClick={() => { setFrom(f); setTo(t); }}>{label}</button>
          ))}
        </div>
        <DateField className="pm-input" style={{ width: mobile ? "calc(50% - 2px)" : 120, borderColor: badRange ? "#b91c1c" : undefined }} value={from} onChange={(e) => setFrom(e.target.value)} />
        <DateField className="pm-input" style={{ width: mobile ? "calc(50% - 2px)" : 120, borderColor: badRange ? "#b91c1c" : undefined }} value={to} onChange={(e) => setTo(e.target.value)} />
      </div>
      <div className="si-toolbar">
        <input className="pm-input" style={{ width: mobile ? "100%" : 190 }} value={vendor} onChange={(e) => setVendor(e.target.value)} placeholder={L("সাপ্লায়ার নাম / মোবাইল / বিল নং", "Supplier name / mobile / bill no")} />
        <input className="pm-input" style={{ width: mobile ? "100%" : 170 }} value={item} onChange={(e) => setItem(e.target.value)} placeholder={L("প্রোডাক্ট কোড / নাম", "Product code / name")} />
        {a && a.options.brands.length > 0 && select(brand, setBrand, L("সব ব্র্যান্ড", "All brands"), a.options.brands)}
        {a && a.options.categories.length > 0 && select(category, setCategory, L("সব ক্যাটাগরি", "All categories"), a.options.categories)}
        {a && a.options.methods.length > 1 && select(method, setMethod, L("সব পেমেন্ট", "All payments"), a.options.methods, methodName, 130)}
        {a && a.options.users.length > 1 && select(user, setUser, L("সব ইউজার", "All users"), a.options.users)}
        {select(status, setStatus, L("সব অবস্থা", "Any status"), ["paid", "partial", "unpaid"], statusName, 120)}
        {anyFilter && <button type="button" className="pm-btn-secondary" onClick={clearFilters}>{L("ফিল্টার সরান", "Clear filters")}</button>}
      </div>

      {a && (
        <div className="si-kpis pa-kpis">
          {kpi(L("বিল", "Bills"), String(a.kpi.count))}
          {kpi(L("মোট ক্রয় (VAT সহ)", "Gross purchases (incl. VAT)"), `${cur} ${money(a.kpi.gross)}`)}
          {kpi(L("নিট ক্রয় (VAT ও রিটার্ন বাদে)", "Net purchases (excl. VAT, after returns)"), `${cur} ${money(a.kpi.netPurchases)}`, "#b45309")}
          {kpi(L("গড় বিল", "Average bill"), money(a.kpi.avgBill))}
          {a.kpi.discount != null && kpi(L("পাওয়া ডিসকাউন্ট", "Discount received"), money(a.kpi.discount), "#15803d")}
          {kpi(L(`পারচেজ রিটার্ন (${a.kpi.returnsCount})`, `Purchase returns (${a.kpi.returnsCount})`), money(a.kpi.returnsTotal))}
          {a.kpi.balance != null && kpi(L("এই বিলগুলোতে দেনা", "Still payable on these bills"), money(a.kpi.balance), a.kpi.balance ? "#b91c1c" : undefined)}
        </div>
      )}

      <div className="si-body">
        {error && <div className="si-paid-box is-due">{L("ডেটা পড়া যায়নি: ", "Could not load: ")}{error}</div>}
        {badRange && <div className="si-paid-box is-due">{L("শুরুর তারিখ শেষের তারিখের পরে — তারিখ ঠিক করুন", "The start date is after the end date — fix the dates")}</div>}
        {!rows && !error && <div className="si-empty">{L("লোড হচ্ছে…", "Loading…")}</div>}
        {a && (
          <>
            <div className="si-pills" style={{ padding: "2px 0 4px" }}>
              {VIEWS.map((v) => (
                <button key={v.id} type="button" className={`pm-btn-secondary${view === v.id ? " is-active" : ""}`} onClick={() => setView(v.id)}>{bn ? v.bn : v.en}</button>
              ))}
            </div>
            <fieldset className="pm-panel" style={{ margin: 0 }}>
              <legend className="pm-panel-legend">{table().title}</legend>
              <div className="si-panel-body" style={tableBox}>{renderTable()}</div>
            </fieldset>
            <div className="si-note">
              {L(
                "শুধু confirmed / আংশিক / পরিশোধিত ক্রয় বিল ধরা হয়েছে — draft, বাতিল, ব্রাঞ্চ ট্রান্সফারের ভেতরের বিল আর পার্টির ওপেনিং ব্যালেন্স বিল নয়, লাভ-ক্ষতি পেজের মতোই। নিট ক্রয় = মোট ক্রয় − পারচেজ রিটার্ন − (ক্রয়ের VAT − রিটার্নের VAT), তাই একই সময় ও ফিল্টার ছাড়া লাভ-ক্ষতি পেজের 'নিট ক্রয়'-এর সাথে মিলবে। প্রোডাক্টের টাকা = বিলের নিট (VAT ছাড়া) লাইনগুলোর অনুপাতে ভাগ, তাই বিলের ডিসকাউন্ট / সমন্বয় সহ প্রোডাক্টের যোগফল বিলের যোগফলের সমান। পরিমাণ বেস ইউনিটে। প্রোডাক্ট / ব্র্যান্ড / ক্যাটাগরি ফিল্টার দিলে শুধু মেলা লাইনের অংশ ধরা হয়, তখন ডিসকাউন্ট ও দেনা দেখানো হয় না। 'দেনা' হলো আজকের অবস্থা; পেমেন্ট ভাউচারে চেকে পাওয়া ছাড় এখানে নয়, লাভ-ক্ষতি পেজে আলাদা দেখায়।",
                "Only confirmed / partial / paid purchase bills are counted — not drafts, cancelled bills, branch-transfer bills or party opening-balance bills, as on the P&L page. Net purchases = gross purchases − purchase returns − (VAT on purchases − VAT on returns), so with the same dates and no filters it matches 'Net purchases' on the P&L page. Product amounts = the bill's net (without VAT) shared over its lines, so with bill discount / adjustments the products still add up to the bills. Quantities are in base units. With a product / brand / category filter only the matching lines' share counts, and discount and payables are not shown. 'Payable' is as of today; discount received on payment vouchers is not here, the P&L page shows it separately."
              )}
            </div>
          </>
        )}
      </div>
      <div className="si-statusbar">
        {a && <span>{L("সাপ্লায়ার", "Suppliers")} <b>{a.byVendor.length}</b></span>}
        {a && <span>{L("প্রোডাক্ট", "Products")} <b>{a.byProduct.length}</b></span>}
        {a && <span>{L("পরিমাণ", "Qty")} <b>{qf(a.kpi.qty)}</b></span>}
        <span>{L("উইন্ডোতে ফিরলে নিজে থেকে রিফ্রেশ হয়", "Refreshes automatically when you come back to the window")}</span>
      </div>
    </div>
  );
}
