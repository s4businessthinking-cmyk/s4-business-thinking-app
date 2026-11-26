// Debtors & creditors ageing: what each customer owes and what the shop owes each supplier as at a date,
// split by how old it is. Read-only; balances from the Global Ledger, aged first-in-first-out (see partyAging.js).
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
import { r2 } from "./reportFilters.js";
import { AGE_BUCKETS, buildAging } from "./partyAging.js";
import DateField from "../components/DateField.jsx";

const money = (v) => r2(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const localDay = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const fmtDay = (d) => (d ? String(d).slice(0, 10).split("-").reverse().join("/") : "");
const csvCell = (v) => { const s = String(v ?? ""); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
const BUCKET_COLOR = ["#15803d", "#b45309", "#c2410c", "#b91c1c"];

const SIDES = [
  { id: "customer", bn: "ডেটরস (কাস্টমারের কাছে পাওনা)", en: "Debtors (customers owe you)" },
  { id: "vendor", bn: "ক্রেডিটরস (সাপ্লায়ারের দেনা)", en: "Creditors (you owe suppliers)" },
];
// Summary figures wrap instead of being cut off with an ellipsis.
const AG_CSS = `
.ag-kpis { grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); }
.ag-kpis .si-kpi b { white-space: normal; overflow: visible; text-overflow: clip; overflow-wrap: anywhere; font-variant-numeric: tabular-nums; }
.ag-table { width: 100%; border-collapse: collapse; font-size: 11.5px; }
.ag-table th { text-align: left; background: #e8eef7; padding: 3px 5px; border-bottom: 1px solid #8797a9; white-space: nowrap; position: sticky; top: 0; }
.ag-table td { padding: 3px 5px; border-bottom: 1px solid #e2e8f0; }
.ag-table .num { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
.ag-table tfoot td { font-weight: 700; border-top: 1px solid #7d94b7; background: #f8fafc; }
`;

export default function PartyAgingReport({ lang = "en", shopId, customers = [], vendors = [], shopName = "", cur = "AED", toast, canPrint = false }) {
  const bn = lang === "bn";
  const L = (b, e) => (bn ? b : e);
  const [side, setSide] = useState("customer");
  const [asOf, setAsOf] = useState(() => localDay());
  const [search, setSearch] = useState("");
  const [minBucket, setMinBucket] = useState(0);
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
    }).catch((err) => { console.warn("[S4 Ageing] load failed", err); if (!cancelled) setError(String(err?.message || err)); });
    return () => { cancelled = true; };
  }, [shopId, tick]);

  useEffect(() => {
    const refresh = () => { if (document.visibilityState !== "hidden") setTick((v) => v + 1); };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => { window.removeEventListener("focus", refresh); document.removeEventListener("visibilitychange", refresh); };
  }, []);

  const day = asOf || localDay();
  const ledger = useMemo(
    () => (data ? buildGlobalLedger(data, { shopId, customers, vendors, expenseLabel: (e) => expenseCategoryLabel(e, false) }) : null),
    [data, shopId, customers, vendors],
  );
  const aging = useMemo(() => (ledger ? buildAging(ledger.postings, ledger.accounts, { side, asOf: day }) : null), [ledger, side, day]);

  // Search by party name; "older than" keeps parties with money in that bucket or an older one.
  const q = search.trim().toLowerCase();
  const rows = useMemo(() => (aging ? aging.rows.filter((r) => (!q || r.name.toLowerCase().includes(q))
    && (!minBucket || r.buckets.slice(minBucket).some((v) => v > 0.005))) : []), [aging, q, minBucket]);
  const advances = useMemo(() => (aging ? aging.advances.filter((r) => !q || r.name.toLowerCase().includes(q)) : []), [aging, q]);
  const filtered = !!(q || minBucket);
  const shown = useMemo(() => ({
    due: r2(rows.reduce((t, r) => t + r.due, 0)),
    buckets: AGE_BUCKETS.map((_, i) => r2(rows.reduce((t, r) => t + r.buckets[i], 0))),
    advance: r2(advances.reduce((t, r) => t + r.amount, 0)),
  }), [rows, advances]);

  const isCustomer = side === "customer";
  const sideLabel = (s) => (bn ? s.bn : s.en);
  const title = isCustomer ? L("ডেটরস এজিং", "Debtors Ageing") : L("ক্রেডিটরস এজিং", "Creditors Ageing");
  const partyCol = isCustomer ? L("কাস্টমার", "Customer") : L("সাপ্লায়ার", "Supplier");
  const bucketLabel = (b) => `${b[2]} ${L("দিন", "days")}`;
  const subtitle = `${L("পর্যন্ত", "As at")} ${fmtDay(day)}${filtered ? ` · ${L("ফিল্টার করা", "filtered")}` : ""}`;
  const advanceLabel = isCustomer ? L("কাস্টমারের অগ্রিম (জমা বেশি)", "Customer advances (paid in advance)") : L("সাপ্লায়ারকে অগ্রিম (বেশি দেওয়া)", "Advances to suppliers (paid in advance)");

  const tableHead = [partyCol, `${L("মোট বাকি", "Total due")} (${cur})`, ...AGE_BUCKETS.map(bucketLabel), L("সবচেয়ে পুরনো (দিন)", "Oldest (days)")];
  const tableRows = () => rows.map((r) => [r.name, money(r.due), ...r.buckets.map((v) => (v ? money(v) : "")), String(r.oldestDays)]);
  const footRow = [L("মোট", "Total"), money(shown.due), ...shown.buckets.map(money), ""];

  const print = () => {
    if (!aging) return;
    const rowsOut = [...tableRows()];
    if (advances.length) {
      rowsOut.push(["", "", "", "", "", "", ""]);
      rowsOut.push([advanceLabel.toUpperCase(), "", "", "", "", "", ""]);
      advances.forEach((a) => rowsOut.push([`   ${a.name}`, money(-a.amount), "", "", "", "", ""]));
      rowsOut.push([`   ${L("মোট অগ্রিম", "Total advances")}`, money(-shown.advance), "", "", "", "", ""]);
      rowsOut.push([L("নিট (বাকি − অগ্রিম)", "Net (due − advances)"), money(shown.due - shown.advance), "", "", "", "", ""]);
    }
    printWithSettings(generateStatementHTML({
      shopName, title: title.toUpperCase(), subtitle,
      cols: tableHead.map((label, i) => ({ label, align: i === 0 ? undefined : "right" })), rows: rowsOut, foot: footRow,
    }), { lang });
  };

  const exportCsv = async () => {
    if (!aging) return;
    const out = [tableHead, ...tableRows(), footRow];
    if (advances.length) {
      out.push([], [advanceLabel, `${L("টাকা", "Amount")} (${cur})`]);
      advances.forEach((a) => out.push([a.name, money(a.amount)]));
      out.push([L("মোট অগ্রিম", "Total advances"), money(shown.advance)], [L("নিট (বাকি − অগ্রিম)", "Net (due − advances)"), money(shown.due - shown.advance)]);
    }
    const text = "\uFEFF" + out.map((r) => r.map((c) => csvCell(String(c ?? "").trim())).join(",")).join("\r\n");
    try { await saveTextFile(`${isCustomer ? "debtors" : "creditors"}-ageing-${day}.csv`, text); } catch (e) { toast?.(e.message || String(e), "err"); }
  };

  const kpi = (label, value, color) => (
    <div className="si-kpi" title={`${label}: ${cur} ${money(value)}`}><span>{label}</span><b style={{ color }}>{cur} {money(value)}</b></div>
  );

  return (
    <div ref={rootRef} className="si-root" style={fitH ? { height: fitH } : undefined}>
      <style>{PM_CSS}</style>
      <style>{SI_CSS}</style>
      <style>{AG_CSS}</style>
      <div className="pm-reference-title">
        <strong> {title}</strong>
        <span>{subtitle}</span>
      </div>
      <div className="si-toolbar">
        {canPrint && <button type="button" className="pm-btn pm-btn--primary" onClick={print} disabled={!aging}> {L("প্রিন্ট", "Print")}</button>}
        {canPrint && <button type="button" className="pm-btn-secondary" onClick={exportCsv} disabled={!aging}> Excel</button>}
        <button type="button" className="pm-btn-secondary" onClick={() => setTick((v) => v + 1)}> {L("রিফ্রেশ", "Refresh")}</button>
        <div className="si-pills">
          {SIDES.map((s) => (
            <button key={s.id} type="button" className={`pm-btn-secondary${side === s.id ? " is-active" : ""}`} onClick={() => setSide(s.id)}>{sideLabel(s)}</button>
          ))}
        </div>
        <span className="si-toolbar-gap" />
        <input className="pm-input" style={{ width: mobile ? "100%" : 180 }} value={search} onChange={(e) => setSearch(e.target.value)} placeholder={L("পার্টির নাম খুঁজুন", "Search party name")} />
        <select className="pm-input" style={{ width: mobile ? "48%" : 150 }} value={minBucket} onChange={(e) => setMinBucket(Number(e.target.value))} title={L("কত দিনের পুরনো", "How old")}>
          <option value={0}>{L("সব বাকি", "All dues")}</option>
          {AGE_BUCKETS.slice(1).map((b, i) => <option key={b[2]} value={i + 1}>{L(`${b[0] - 1} দিনের বেশি পুরনো বাকি আছে`, `Has dues over ${b[0] - 1} days`)}</option>)}
        </select>
        <button type="button" className={`pm-btn-secondary${day === localDay() ? " is-active" : ""}`} onClick={() => setAsOf(localDay())}>{L("আজ", "Today")}</button>
        <DateField className="pm-input" style={{ width: mobile ? "48%" : 130 }} value={asOf} onChange={(e) => setAsOf(e.target.value)} title={L("যে তারিখ পর্যন্ত", "As at date")} />
      </div>
      {aging && (
        <div className="si-kpis ag-kpis">
          {kpi(L("মোট বাকি", "Total due"), shown.due, isCustomer ? "#15803d" : "#b91c1c")}
          {AGE_BUCKETS.map((b, i) => <React.Fragment key={b[2]}>{kpi(bucketLabel(b), shown.buckets[i], BUCKET_COLOR[i])}</React.Fragment>)}
          {kpi(isCustomer ? L("কাস্টমারের অগ্রিম", "Customer advances") : L("সাপ্লায়ারকে অগ্রিম", "Supplier advances"), shown.advance, "#475569")}
        </div>
      )}
      <div className="si-body">
        {error && <div className="si-paid-box is-due">{L("ডেটা পড়া যায়নি: ", "Could not load: ")}{error}</div>}
        {!aging && !error ? (
          <div className="si-empty">{L("লোড হচ্ছে…", "Loading…")}</div>
        ) : aging && (
          <>
            <fieldset className="pm-panel" style={{ margin: 0 }}>
              <legend className="pm-panel-legend">{sideLabel(SIDES.find((s) => s.id === side))} ({rows.length})</legend>
              <div className="si-panel-body" style={{ overflow: "auto", maxHeight: mobile ? undefined : 420 }}>
                <table className="ag-table">
                  <thead>
                    <tr>
                      <th>{partyCol}</th><th className="num">{L("মোট বাকি", "Total due")}</th>
                      {AGE_BUCKETS.map((b) => <th key={b[2]} className="num">{bucketLabel(b)}</th>)}
                      <th className="num">{L("পুরনো (দিন)", "Oldest (days)")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.key}>
                        <td>{r.name}</td>
                        <td className="num" style={{ fontWeight: 700 }}>{money(r.due)}</td>
                        {r.buckets.map((v, i) => <td key={AGE_BUCKETS[i][2]} className="num" style={{ color: v ? BUCKET_COLOR[i] : "#94a3b8" }}>{v ? money(v) : "-"}</td>)}
                        <td className="num" style={{ color: r.oldestDays > 90 ? "#b91c1c" : undefined }}>{r.oldestDays}</td>
                      </tr>
                    ))}
                    {!rows.length && <tr><td colSpan={AGE_BUCKETS.length + 3} className="si-empty">{filtered ? L("এই ফিল্টারে কিছু নেই", "Nothing matches this filter") : L("কোনো বাকি নেই", "Nothing due")}</td></tr>}
                  </tbody>
                  {rows.length > 0 && (
                    <tfoot>
                      <tr>
                        <td>{L("মোট", "Total")}</td><td className="num">{money(shown.due)}</td>
                        {shown.buckets.map((v, i) => <td key={AGE_BUCKETS[i][2]} className="num">{money(v)}</td>)}
                        <td />
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </fieldset>

            {advances.length > 0 && (
              <fieldset className="pm-panel" style={{ margin: 0 }}>
                <legend className="pm-panel-legend">{advanceLabel} ({advances.length})</legend>
                <div className="si-panel-body" style={{ overflow: "auto", maxHeight: mobile ? undefined : 200 }}>
                  <table className="ag-table">
                    <thead><tr><th>{partyCol}</th><th className="num">{L("টাকা", "Amount")} ({cur})</th></tr></thead>
                    <tbody>{advances.map((a) => <tr key={a.key}><td>{a.name}</td><td className="num">{money(a.amount)}</td></tr>)}</tbody>
                    <tfoot>
                      <tr><td>{L("মোট অগ্রিম", "Total advances")}</td><td className="num">{money(shown.advance)}</td></tr>
                      <tr><td>{L("নিট (বাকি − অগ্রিম)", "Net (due − advances)")}</td><td className="num">{money(shown.due - shown.advance)}</td></tr>
                    </tfoot>
                  </table>
                </div>
              </fieldset>
            )}

            <div className="si-note">
              {L(
                "প্রতিটি পার্টির বাকি গ্লোবাল লেজার থেকে নেওয়া, তাই পার্টি লেজার, ব্যালেন্স শিট ও ট্রায়াল ব্যালেন্সের সাথে মিলবে। পুরনো বিল আগে শোধ ধরা হয় (FIFO): রসিদ / পেমেন্ট, রিটার্ন ও জার্নাল আগে সবচেয়ে পুরনো বিল কাটে, তাই যা বাকি তা নতুন বিলগুলোর ওপর। বয়স = বিলের তারিখ থেকে যে তারিখ পর্যন্ত দেখছেন সেই পর্যন্ত দিন; ভাগগুলো পার্টি লেজারের আউটস্ট্যান্ডিং স্টেটমেন্টের মতোই (0-30 / 31-60 / 61-90 / 90+)। ভাউচারে নির্দিষ্ট বিলে টাকা মিলিয়ে থাকলে পার্টি লেজারের বিল-ভিত্তিক হিসাব থেকে ভাগ সামান্য আলাদা হতে পারে, মোট একই থাকবে। Draft ও বাতিল বিল ধরা হয়নি। যাদের জমা বেশি (অগ্রিম) তাদের বয়স ধরা হয়নি, আলাদা তালিকায় আছে। চেক ক্লিয়ার না হলেও রসিদ / পেমেন্ট হিসেবে ধরা আছে।",
                "Each party's balance comes from the Global Ledger, so it agrees with the party ledger, Balance Sheet and trial balance. Older bills are treated as settled first (FIFO): receipts / payments, returns and journals clear the oldest bills, so what is due sits on the newest ones. Age = days from the bill date to the as-at date; the buckets are the same as the party ledger's outstanding statement (0-30 / 31-60 / 61-90 / 90+). Where a voucher was matched to a specific bill, the split can differ slightly from the bill-by-bill party ledger view; the total stays the same. Drafts and cancelled bills are not counted. Parties in credit (advances) are not aged and are listed separately. A cheque counts as received / paid even before it clears."
              )}
            </div>
          </>
        )}
      </div>
      <div className="si-statusbar">
        {aging && <span>{L("পার্টি", "Parties")} <b>{rows.length}</b>{filtered ? ` / ${aging.rows.length}` : ""}</span>}
        {aging && <span>{L("নিট", "Net")} <b>{money(shown.due - shown.advance)}</b></span>}
        <span>{L("উইন্ডোতে ফিরলে নিজে থেকে রিফ্রেশ হয়", "Refreshes automatically when you come back to the window")}</span>
      </div>
    </div>
  );
}
