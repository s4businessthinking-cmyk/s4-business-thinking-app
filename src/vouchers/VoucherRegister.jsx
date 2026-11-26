// Voucher Register: journal, contra, receipt and payment vouchers in one list with filters, totals, print and CSV.
// Read-only; opening a row hands over to the screen that owns that voucher.
import React, { useEffect, useMemo, useState } from "react";
import { offlineList } from "../offline/offlineRepository";
import { rowsOf } from "../inventory/stockFromInvoices";
import { printWithSettings } from "../print/printSettings.js";
import { generateStatementHTML } from "../print/printDesign.js";
import { saveTextFile } from "../utils/saveTextFile.js";
import { csvText } from "../reports/vatExport.js";
import { REGISTER_TYPES, buildVoucherRegister, registerFileName, registerRows, typeName } from "./voucherRegister.js";
import DateField from "../components/DateField.jsx";

const money = (v) => (Math.round((Number(v) || 0) * 100) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const localDay = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const monthStart = () => { const d = new Date(); return localDay(new Date(d.getFullYear(), d.getMonth(), 1)); };
const fmtDay = (d) => (d ? String(d).slice(0, 10).split("-").reverse().join("/") : "");
const TYPE_LABEL = { journal: ["জার্নাল", "Journal"], contra: ["কন্ট্রা", "Contra"], memo: ["মেমো (হিসাবে নেই)", "Memo (not posted)"], receipt: ["রসিদ", "Receipt"], payment: ["পেমেন্ট", "Payment"] };
const TYPE_COLOR = { journal: "#7c3aed", contra: "#0e7490", memo: "#64748b", receipt: "#15803d", payment: "#b45309" };
const METHOD_LABEL = { cash: ["নগদ", "Cash"], cheque: ["চেক", "Cheque"], bank_transfer: ["ব্যাংক", "Bank"], bank: ["ব্যাংক", "Bank"], card: ["কার্ড", "Card"], credit: ["বাকি", "Credit"] };

export default function VoucherRegister({
  lang = "en", shopId, user, isOwner, include = {}, journalRows = [], canPrint = false, cur = "AED", shopName = "", toast, mobile = false,
  onBack, onOpenVoucher, onOpenReceipts, onOpenPayments,
}) {
  const bn = lang === "bn";
  const L = (b, e) => (bn ? b : e);
  const [from, setFrom] = useState(monthStart);
  const [to, setTo] = useState(() => localDay());
  const [type, setType] = useState("");
  const [status, setStatus] = useState("active");
  const [query, setQuery] = useState("");
  const [moneyDocs, setMoneyDocs] = useState({ receipts: [], payments: [] });
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      include.receipt ? offlineList("salesReceipts").catch(() => []) : Promise.resolve([]),
      include.payment ? offlineList("purchasePayments").catch(() => []) : Promise.resolve([]),
    ]).then(([rc, pm]) => { if (!cancelled) setMoneyDocs({ receipts: rowsOf(rc), payments: rowsOf(pm) }); });
    return () => { cancelled = true; };
  }, [shopId, include.receipt, include.payment, tick]);
  useEffect(() => {
    const refresh = () => { if (document.visibilityState !== "hidden") setTick((v) => v + 1); };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => { window.removeEventListener("focus", refresh); document.removeEventListener("visibilitychange", refresh); };
  }, []);

  const types = REGISTER_TYPES.filter((t) => include[t]);
  const badRange = !!(from && to && from > to);
  const reg = useMemo(() => buildVoucherRegister(
    { accountVouchers: journalRows, receipts: moneyDocs.receipts, payments: moneyDocs.payments },
    { shopId, userId: user?.uid || "", isOwner, include, from: badRange ? "9999" : from, to, type, status, query },
  ), [journalRows, moneyDocs, shopId, user?.uid, isOwner, include, from, to, type, status, query, badRange]);

  const typeLabel = (r) => (r.refund ? (r.kind === "receipt" ? L("কাস্টমারকে রিফান্ড", "Refund to customer") : L("সাপ্লায়ার থেকে রিফান্ড", "Refund from supplier")) : L(...TYPE_LABEL[r.kind]));
  const methodLabel = (m) => (METHOD_LABEL[m] ? L(...METHOD_LABEL[m]) : m || "");
  const period = `${from ? fmtDay(from) : L("শুরু", "Start")} — ${to ? fmtDay(to) : L("আজ", "Today")}`;
  const canOpen = (r) => (r.kind === "receipt" ? !!onOpenReceipts : r.kind === "payment" ? !!onOpenPayments : !!onOpenVoucher);
  const open = (r) => {
    if (r.kind === "receipt") onOpenReceipts?.(r.src);
    else if (r.kind === "payment") onOpenPayments?.(r.src);
    else onOpenVoucher?.(r.src);
  };

  const print = () => {
    const cols = [{ label: "Date" }, { label: "Type" }, { label: "No" }, { label: "Particulars" }, { label: "Narration / Ref" }, { label: `Amount (${cur})`, align: "right" }, { label: "Status" }, { label: "By" }];
    const body = reg.rows.map((r) => [fmtDay(r.date), typeName(r), r.no, r.particulars, [r.ref, r.narration].filter(Boolean).join(" · "), money(r.amount), r.cancelled ? "Cancelled" : "", r.user]);
    const sums = types.map((t) => `${TYPE_LABEL[t][1]} ${reg.kpi[t].count} · ${money(reg.kpi[t].amount)}`).join("   ");
    printWithSettings(generateStatementHTML({
      shopName, title: `VOUCHER REGISTER${type ? ` — ${TYPE_LABEL[type][1].toUpperCase()}` : ""}`, subtitle: period, partyLine: `${sums}${reg.cancelled ? `   Cancelled ${reg.cancelled} (not in totals)` : ""}`,
      cols, rows: body, foot: ["", "", "", "", "TOTAL", money(reg.total.amount), "", ""],
    }), { lang });
  };
  const exportCsv = async () => {
    try { await saveTextFile(registerFileName(type, from, to), csvText(registerRows(reg))); } catch (e) { toast?.(e.message || String(e), "err"); }
  };

  const today = localDay();
  const quick = [
    ["today", L("আজ", "Today"), today, today],
    ["month", L("এই মাস", "This month"), monthStart(), today],
    ["year", L("এই বছর", "This year"), `${new Date().getFullYear()}-01-01`, today],
    ["all", L("সব", "All"), "", ""],
  ];
  const activeQuick = quick.find(([, , f, t]) => f === from && t === to)?.[0];

  return (
    <>
      <div className="pm-reference-title">
        <strong> {L("ভাউচার রেজিস্টার", "Voucher Register")}</strong>
        <span>{period}</span>
      </div>
      <div className="si-toolbar">
        <button type="button" className="pm-btn-secondary" onClick={onBack}>← {L("ভাউচার", "Vouchers")}</button>
        {canPrint && <button type="button" className="pm-btn pm-btn--primary" onClick={print} disabled={!reg.rows.length}> {L("প্রিন্ট", "Print")}</button>}
        {canPrint && <button type="button" className="pm-btn-secondary" onClick={exportCsv} disabled={!reg.rows.length}> Excel</button>}
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
        <div className="si-pills">
          <button type="button" className={`pm-btn-secondary${!type ? " is-active" : ""}`} onClick={() => setType("")}>{L("সব ধরন", "All types")}</button>
          {types.map((t) => <button key={t} type="button" className={`pm-btn-secondary${type === t ? " is-active" : ""}`} onClick={() => setType(t)}>{L(...TYPE_LABEL[t])}</button>)}
        </div>
        <input className="pm-input" style={{ width: mobile ? "100%" : 240 }} value={query} onChange={(e) => setQuery(e.target.value)} placeholder={L("নং, খাত, পার্টি, বিবরণ, রেফারেন্স / চেক নং", "No, account, party, narration, ref / cheque no")} />
        <select className="pm-input" style={{ width: mobile ? "100%" : 150 }} value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="active">{L("চালু ভাউচার", "Active")}</option>
          <option value="cancelled">{L("বাতিল", "Cancelled")}</option>
          <option value="all">{L("সব (বাতিল সহ)", "All (with cancelled)")}</option>
        </select>
      </div>
      <div className="si-kpis" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))" }}>
        <div className="si-kpi"><span>{L("ভাউচার", "Vouchers")}</span><b>{reg.total.count}</b></div>
        {types.map((t) => (
          <div key={t} className="si-kpi" title={`${TYPE_LABEL[t][1]}: ${reg.kpi[t].count}`}><span>{L(...TYPE_LABEL[t])} ({reg.kpi[t].count})</span><b style={{ color: TYPE_COLOR[t] }}>{cur} {money(reg.kpi[t].amount)}</b></div>
        ))}
        <div className="si-kpi"><span>{L("বাতিল (মোটে নেই)", "Cancelled (not in totals)")}</span><b style={{ color: reg.cancelled ? "#6b7280" : undefined }}>{reg.cancelled}</b></div>
      </div>
      {badRange && <div className="si-paid-box is-due">{L("শুরুর তারিখ শেষের তারিখের পরে — তারিখ ঠিক করুন", "The start date is after the end date — fix the dates")}</div>}
      <div className="si-main is-all">
        <div className="si-box">
          {!reg.rows.length ? <div className="si-empty">{L("এই ফিল্টারে কোনো ভাউচার নেই", "No vouchers match these filters")}</div> : mobile ? reg.rows.map((r) => (
            <button key={`${r.kind}:${r.id}`} type="button" className="si-mrow" onClick={canOpen(r) ? () => open(r) : undefined} style={r.cancelled ? { opacity: 0.6 } : undefined}>
              <div className="si-mrow-top"><span>{r.no} · <span style={{ color: TYPE_COLOR[r.kind] }}>{typeLabel(r)}</span></span><span>{cur} {money(r.amount)}</span></div>
              <div className="si-mrow-sub"><span>{fmtDay(r.date)} · {r.particulars}</span><span>{r.cancelled ? L("বাতিল", "Cancelled") : ""}</span></div>
            </button>
          )) : (
            <table className="pm-table">
              <thead><tr>
                <th style={{ width: 80 }}>{L("তারিখ", "Date")}</th><th style={{ width: 120 }}>{L("ধরন", "Type")}</th><th style={{ width: 90 }}>{L("নং", "No")}</th>
                <th>{L("খাত / পার্টি", "Particulars")}</th><th>{L("বিবরণ / রেফারেন্স", "Narration / Ref")}</th><th style={{ width: 80 }}>{L("মাধ্যম", "Method")}</th>
                <th style={{ width: 110 }} className="si-num">{L("টাকা", "Amount")}</th><th style={{ width: 90 }}>{L("অবস্থা", "Status")}</th><th style={{ width: 100 }}>{L("লিখেছেন", "By")}</th>
              </tr></thead>
              <tbody>
                {reg.rows.map((r) => (
                  <tr key={`${r.kind}:${r.id}`} className={canOpen(r) ? "pm-clickable" : undefined} onClick={canOpen(r) ? () => open(r) : undefined} title={canOpen(r) ? L("ভাউচার খুলুন", "Open voucher") : undefined} style={r.cancelled ? { color: "#6b7280" } : undefined}>
                    <td>{fmtDay(r.date)}</td>
                    <td style={{ color: TYPE_COLOR[r.kind], fontWeight: 700 }}>{typeLabel(r)}</td>
                    <td className="si-strong">{r.no}</td>
                    <td title={r.particulars}>{r.particulars}</td>
                    <td title={[r.ref, r.narration].filter(Boolean).join(" · ")}>{[r.ref, r.narration].filter(Boolean).join(" · ")}</td>
                    <td>{methodLabel(r.method)}{r.chequeStatus && r.chequeStatus !== "cleared" ? <span className="si-muted"> ({r.chequeStatus})</span> : null}</td>
                    <td className="si-num si-strong" style={r.cancelled ? { textDecoration: "line-through" } : undefined}>{money(r.amount)}</td>
                    <td>{r.cancelled ? <span className="si-badge" style={{ color: "#6b7280" }}>{L("বাতিল", "Cancelled")}</span> : L("চালু", "Active")}</td>
                    <td>{r.user}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot><tr><td colSpan={6} className="si-strong">{L("মোট (বাতিল বাদে)", "Total (cancelled left out)")}</td><td className="si-num si-strong">{money(reg.total.amount)}</td><td colSpan={2} /></tr></tfoot>
            </table>
          )}
        </div>
      </div>
      <div className="si-note">
        {L(
          "জার্নাল, কন্ট্রা, কাস্টমারের রসিদ আর সাপ্লায়ারের পেমেন্ট এক তালিকায়। টাকা লেজারের মতোই: রসিদ = মোট টাকা, পেমেন্ট = যা দেওয়া হয়েছে (চেকের টাকা, না হলে মোট − ছাড়)। রিফান্ড ভাউচার তার ধরনের নিচে আলাদা নামে। বাতিল ভাউচার দেখানো যায়, কিন্তু মোটে ধরা হয় না। ডেবিট / ক্রেডিট নোট (রিটার্ন) রিটার্ন পেজে।",
          "Journal, contra, customer receipts and supplier payments in one list. Amounts follow the ledger: a receipt is its total, a payment is what was paid (cheque amount, else total less discount). Refund vouchers show under their type with their own name. Cancelled vouchers can be shown but never count in the totals. Debit / credit notes (returns) are on the Returns pages."
        )}
        {!isOwner && include.journal && <div style={{ marginTop: 3 }}>{L("জার্নাল / কন্ট্রা: শুধু আপনার লেখা ভাউচার।", "Journal / contra: only the vouchers you entered.")}</div>}
      </div>
      <div className="si-statusbar">
        <span>{L("দেখাচ্ছে", "Showing")} <b>{reg.rows.length}</b></span>
        <span>{L("মোট", "Total")} <b>{cur} {money(reg.total.amount)}</b></span>
      </div>
    </>
  );
}
