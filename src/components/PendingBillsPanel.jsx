// Pending bills for the Sales / Purchase invoice lists: what is still due, by due date, with days overdue and the
// ageing bucket, a bucket strip, print and CSV. Read-only; rules in utils/pendingBills.js.
import React, { useMemo, useState } from "react";
import { printWithSettings } from "../print/printSettings.js";
import { generateStatementHTML } from "../print/printDesign.js";
import { saveTextFile } from "../utils/saveTextFile.js";
import { csvText } from "../reports/vatExport.js";
import { NOT_DUE, NOT_SET, PENDING_BUCKETS, SOON_DAYS, filterPending, pendingCsvRows, pendingFileName, pendingRows, pendingSummary } from "../utils/pendingBills.js";
import DateField from "./DateField.jsx";

const localDay = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const fmtDay = (d) => (d ? String(d).slice(0, 10).split("-").reverse().join("/") : "");
const BUCKET_COLOR = { [NOT_DUE]: "#15803d", "0-30": "#b45309", "31-60": "#c2410c", "61-90": "#b91c1c", "90+": "#7f1d1d", [NOT_SET]: "#64748b" };

export default function PendingBillsPanel({
  kind = "sales", invoices = [], lang = "en", cur = "", fmt = (v) => String(v), canPrint = false, shopName = "", mobile = false,
  onOpen, onPay, canPayRow = () => false,
}) {
  const bn = lang === "bn";
  const L = (b, e) => (bn ? b : e);
  const [asOf, setAsOf] = useState(() => localDay());
  const [mode, setMode] = useState("pending");
  const [bucket, setBucket] = useState("");
  const [query, setQuery] = useState("");
  const day = asOf || localDay();
  const isSales = kind !== "purchase";
  const partyOf = (inv) => (isSales ? inv.customerName : inv.vendorName) || "";
  const mobileOf = (inv) => (isSales ? inv.customerMobile : inv.vendorMobile) || "";

  const all = useMemo(() => pendingRows(invoices, { kind, asOf: day }), [invoices, kind, day]);
  const allSum = useMemo(() => pendingSummary(all), [all]);
  const byMode = useMemo(() => filterPending(all, { mode, query, partyOf }), [all, mode, query]); // eslint-disable-line react-hooks/exhaustive-deps
  const rows = useMemo(() => (bucket ? byMode.filter((r) => r.bucket === bucket) : byMode), [byMode, bucket]);
  const modeSum = useMemo(() => pendingSummary(byMode), [byMode]);
  const sum = useMemo(() => pendingSummary(rows), [rows]);

  const bucketLabel = (b) => (b === NOT_DUE ? L("মেয়াদ বাকি", "Not due") : b === NOT_SET ? L("তারিখ নেই", "Not set") : `${b} ${L("দিন", "days")}`);
  const daysText = (r) => (r.days == null ? "—" : r.days > 0 ? L(`${r.days} দিন পেরিয়েছে`, `${r.days} days over`) : r.days === 0 ? L("আজ", "Today") : L(`${-r.days} দিন বাকি`, `${-r.days} days left`));
  const daysColor = (r) => (r.days == null ? "#64748b" : r.days > 0 ? "#b91c1c" : r.days === 0 ? "#b45309" : "#15803d");
  const modes = [
    ["pending", L("সব বাকি", "All pending"), allSum.count],
    ["overdue", L("মেয়াদ পেরিয়েছে", "Overdue"), allSum.overdueCount],
    ["today", L("আজ দেওয়ার কথা", "Due today"), allSum.todayCount],
    ["soon", L(`${SOON_DAYS} দিনের মধ্যে`, `Due in ${SOON_DAYS} days`), allSum.soonCount],
    ["notDue", L("মেয়াদ বাকি", "Not due yet"), allSum.buckets[NOT_DUE].count],
  ];
  const title = isSales ? L("কাস্টমারের বাকি বিল", "Pending sales bills") : L("সাপ্লায়ারের বাকি বিল", "Pending purchase bills");

  const print = () => {
    const cols = [{ label: "Date" }, { label: "Invoice No" }, { label: isSales ? "Customer" : "Supplier" }, { label: "Due Date" }, { label: "Days" }, { label: "Bucket" }, { label: `Total (${cur})`, align: "right" }, { label: "Paid", align: "right" }, { label: "Due", align: "right" }];
    const body = rows.map((r) => [fmtDay(r.billDate), r.inv.invoiceNo || "", partyOf(r.inv), fmtDay(r.due), r.days == null ? "" : r.days > 0 ? `${r.days} over` : r.days === 0 ? "today" : `${-r.days} left`,
      r.bucket === NOT_DUE ? "Not due" : r.bucket === NOT_SET ? "Not set" : r.bucket, fmt(r.total), fmt(r.paid), fmt(r.balance)]);
    const strip = [...PENDING_BUCKETS, NOT_SET].filter((b) => sum.buckets[b].count).map((b) => `${b === NOT_DUE ? "Not due" : b === NOT_SET ? "Not set" : b}: ${fmt(sum.buckets[b].amount)} (${sum.buckets[b].count})`).join("   ");
    printWithSettings(generateStatementHTML({
      shopName, title: isSales ? "PENDING SALES BILLS" : "PENDING PURCHASE BILLS", subtitle: `As at ${fmtDay(day)}`, partyLine: strip,
      cols, rows: body, foot: ["", `${sum.count} bill(s)`, "", "", "", "", "", "TOTAL", fmt(sum.due)],
    }), { lang });
  };
  const exportCsv = async () => {
    try { await saveTextFile(pendingFileName(kind, day), csvText(pendingCsvRows(rows, { kind }))); } catch { /* the save dialog was closed */ }
  };

  return (
    <div className="si-box" style={{ display: "flex", flexDirection: "column", gap: 4, padding: 4 }}>
      <div className="si-toolbar" style={{ padding: 0 }}>
        <strong>{title}</strong>
        <span className="si-toolbar-gap" />
        <input className="pm-input" style={{ width: mobile ? "100%" : 200 }} value={query} onChange={(e) => setQuery(e.target.value)} placeholder={isSales ? L("বিল নং, কাস্টমার, মোবাইল", "Bill no, customer, mobile") : L("বিল নং, সাপ্লায়ার, মোবাইল", "Bill no, supplier, mobile")} />
        <span className="pm-label" style={{ margin: 0 }}>{L("যে তারিখ পর্যন্ত", "As at")}</span>
        <DateField className="pm-input" style={{ width: mobile ? "48%" : 125 }} value={asOf} onChange={(e) => setAsOf(e.target.value)} />
        {canPrint && <button type="button" className="pm-btn-secondary" onClick={print} disabled={!rows.length}> {L("প্রিন্ট", "Print")}</button>}
        {canPrint && <button type="button" className="pm-btn-secondary" onClick={exportCsv} disabled={!rows.length}> Excel</button>}
      </div>
      <div className="si-pills">
        {modes.map(([k, label, count]) => (
          <button key={k} type="button" className={`pm-btn-secondary${mode === k ? " is-active" : ""}`} onClick={() => { setMode(k); setBucket(""); }}>{label} ({count})</button>
        ))}
      </div>
      <div className="si-kpis" style={{ gridTemplateColumns: mobile ? "repeat(2, minmax(0, 1fr))" : `repeat(${PENDING_BUCKETS.length + (modeSum.buckets[NOT_SET].count ? 2 : 1)}, minmax(0, 1fr))`, padding: 0 }}>
        <div className={`si-kpi${!bucket ? " is-active" : ""}`} style={{ cursor: "pointer", outline: !bucket ? "2px solid #315eb8" : undefined }} onClick={() => setBucket("")}>
          <span>{L("মোট বাকি", "Total due")} ({modeSum.count})</span><b>{cur} {fmt(modeSum.due)}</b>
        </div>
        {[...PENDING_BUCKETS, ...(modeSum.buckets[NOT_SET].count ? [NOT_SET] : [])].map((b) => (
          <div key={b} className="si-kpi" style={{ cursor: "pointer", outline: bucket === b ? "2px solid #315eb8" : undefined }} onClick={() => setBucket(bucket === b ? "" : b)} title={L("এই ভাগ দিয়ে ফিল্টার", "Filter by this bucket")}>
            <span>{bucketLabel(b)} ({modeSum.buckets[b].count})</span><b style={{ color: BUCKET_COLOR[b] }}>{fmt(modeSum.buckets[b].amount)}</b>
          </div>
        ))}
      </div>
      <div className="si-hint" style={{ margin: "0 2px", fontWeight: 600 }}>
        {L(`দেখাচ্ছে ${sum.count}টি · বাকি ${cur} ${fmt(sum.due)} · মেয়াদ পেরিয়েছে ${sum.overdueCount}টি (${fmt(sum.overdue)})`, `Showing ${sum.count} · due ${cur} ${fmt(sum.due)} · overdue ${sum.overdueCount} (${fmt(sum.overdue)})`)}
      </div>
      <div style={{ overflow: "auto", flex: 1, minHeight: 0 }}>
        {!rows.length ? <div className="si-empty">{L("কোনো বাকি বিল নেই", "No pending bills")}</div> : mobile ? rows.map((r) => (
          <button key={r.inv.id} type="button" className="si-mrow" onClick={() => onOpen?.(r.inv)}>
            <div className="si-mrow-top"><span>{r.inv.invoiceNo} · {partyOf(r.inv)}</span><span>{cur} {fmt(r.balance)}</span></div>
            <div className="si-mrow-sub"><span>{L("দেওয়ার তারিখ", "Due")} {fmtDay(r.due) || "—"}</span><span style={{ color: daysColor(r), fontWeight: 700 }}>{daysText(r)}</span></div>
          </button>
        )) : (
          <table className="pm-table">
            <thead><tr>
              <th style={{ width: 78 }}>{L("তারিখ", "Date")}</th><th style={{ width: 90 }}>{L("বিল নং", "Invoice No")}</th><th>{isSales ? L("কাস্টমার", "Customer") : L("সাপ্লায়ার", "Supplier")}</th>
              <th style={{ width: 90 }}>{L("মোবাইল", "Mobile")}</th><th style={{ width: 84 }}>{L("দেওয়ার তারিখ", "Due date")}</th><th style={{ width: 110 }}>{L("দিন", "Days")}</th><th style={{ width: 80 }}>{L("ভাগ", "Bucket")}</th>
              <th className="si-num" style={{ width: 90 }}>{L("মোট", "Total")}</th><th className="si-num" style={{ width: 90 }}>{L("পেয়েছি / দিয়েছি", "Paid")}</th><th className="si-num" style={{ width: 90 }}>{L("বাকি", "Due")}</th>
              {onPay && <th style={{ width: 90 }} />}
            </tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.inv.id} className="pm-clickable" onClick={() => onOpen?.(r.inv)}>
                  <td>{fmtDay(r.billDate)}</td><td className="si-strong">{r.inv.invoiceNo}</td><td>{partyOf(r.inv)}</td><td>{mobileOf(r.inv)}</td>
                  <td title={r.dueSource === "billDate" ? L("বাকির মেয়াদ নেই — বিলের তারিখেই দেওয়ার কথা", "No credit terms — due on the bill date") : r.dueSource === "terms" ? L("বিলের তারিখ + বাকির দিন", "Bill date + credit days") : undefined}>
                    {fmtDay(r.due) || "—"}{r.dueSource === "billDate" ? <span className="si-muted"> *</span> : null}
                  </td>
                  <td style={{ color: daysColor(r), fontWeight: 700 }}>{daysText(r)}</td>
                  <td style={{ color: BUCKET_COLOR[r.bucket] }}>{bucketLabel(r.bucket)}</td>
                  <td className="si-num">{fmt(r.total)}</td><td className="si-num">{fmt(r.paid)}</td><td className="si-num si-strong">{fmt(r.balance)}</td>
                  {onPay && <td onClick={(e) => e.stopPropagation()}>{canPayRow(r.inv) && <button type="button" className="pm-btn-secondary" onClick={() => onPay(r.inv)}>{isSales ? L("টাকা নিন", "Receive") : L("টাকা দিন", "Pay")}</button>}</td>}
                </tr>
              ))}
            </tbody>
            <tfoot><tr><td colSpan={9} className="si-strong">{L("মোট", "Total")}</td><td className="si-num si-strong">{fmt(sum.due)}</td>{onPay && <td />}</tr></tfoot>
          </table>
        )}
      </div>
      <div className="si-hint" style={{ margin: "0 2px" }}>
        {L(
          `দেওয়ার তারিখ = বিলে লেখা তারিখ, না থাকলে বিলের তারিখ + বাকির দিন; বাকির মেয়াদ না থাকলে বিলের তারিখ (*)। ভাগগুলো (০-৩০ / ৩১-৬০ / ৬১-৯০ / ৯০+) মেয়াদ পেরোনোর দিন ধরে, ডেটরস / ক্রেডিটরস এজিংয়ের মতো। Draft, বাতিল, কোটেশন, ডেলিভারি নোট, ব্রাঞ্চ ট্রান্সফার আর পার্টির ওপেনিং ব্যালেন্স বিল নেই — ওপেনিং ব্যালেন্স পার্টি লেজার ও এজিং রিপোর্টে দেখুন।`,
          `Due date = the date on the bill, else bill date + credit days; with no credit terms, the bill date (*). Buckets (0-30 / 31-60 / 61-90 / 90+) count days past the due date, with the Debtors & Creditors ageing windows. Drafts, cancelled bills, quotations, delivery notes, branch transfers and party opening balances are not listed — see opening balances in the party ledger and the ageing report.`
        )}
      </div>
    </div>
  );
}
