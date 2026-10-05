import React, { useEffect, useMemo, useState } from "react";
import { C, inp, lbl, btn, th, td, todayIso, fmtDate } from "../sales-invoice/SalesInvoiceDesktopForm.jsx";
import { offlineGetById, offlineUpdate } from "../offline/offlineRepository";
import { subscribeShopCollection } from "../offline/realtimeSync";
import { printWithSettings } from "../print/printSettings.js";

const n2 = (v) => parseFloat(v) || 0;
const f2 = (n) => (Math.round((parseFloat(n) || 0) * 100) / 100).toFixed(2);
const esc = (v) => String(v ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
// Full timestamps are shown on the local calendar day; "YYYY-MM-DDT00:00:00.000Z" values already carry the chosen day.
const day = (v) => {
  const str = String(v || "");
  if (str.length <= 10 || str.endsWith("T00:00:00.000Z")) return str.slice(0, 10);
  const d = new Date(str);
  if (Number.isNaN(d.getTime())) return str.slice(0, 10);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export const TYPES = {
  issued: { col: "purchasePayments", invCol: "purchaseInvoices", label: "PDC Issued", partyHead: "Issued To", no: "paymentNo", date: "paymentDate", party: "vendorName" },
  received: { col: "salesReceipts", invCol: "salesInvoices", label: "PDC Received", partyHead: "Received From", no: "receiptNo", date: "receiptDate", party: "customerName" },
};

const toRow = (type, v) => {
  const m = TYPES[type];
  return {
    id: v.id, type, no: v[m.no] || "", date: day(v[m.date] || v.createdAt), party: v[m.party] || "",
    chequeNo: v.chequeNo || "", chequeDate: day(v.chequeDate), bank: v.chequeBank || "",
    amount: n2(v.chequeAmount ?? v.totalAmount), chequeStatus: v.chequeStatus || "pending", clearedAt: day(v.clearedAt || v.bouncedAt),
    raw: v,
  };
};

// A bounced cheque cancels its voucher and gives the allocated amounts back to the bills' balances.
export async function bounceVoucher(type, voucher, uid) {
  const m = TYPES[type];
  const nowIso = new Date().toISOString();
  const bills = [];
  for (const a of voucher.allocations || []) {
    const rec = await offlineGetById(m.invCol, a.invoiceId).catch(() => null);
    if (!rec?.data) throw new Error(`Bill ${a.invoiceNo || a.invoiceId} is not on this device yet — sync first, then mark the cheque bounced`);
    bills.push([a, rec.data]);
  }
  for (const [a, inv] of bills) {
    if (inv.status === "cancelled") continue;
    const paid = Math.max(0, parseFloat(f2(n2(inv.amountPaid) - n2(a.amount))));
    const balance = Math.max(0, parseFloat(f2(n2(inv.grandTotal) - paid)));
    const status = balance < 0.01 ? "paid" : paid > 0 ? "partial" : "confirmed";
    await offlineUpdate(m.invCol, a.invoiceId, { ...inv, amountPaid: paid, balanceDue: balance, status, updatedAt: nowIso, updatedBy: uid });
  }
  await offlineUpdate(m.col, voucher.id, {
    ...voucher, status: "cancelled", chequeStatus: "bounced", cancelReason: "cheque_bounced",
    cancelledAt: nowIso, cancelledBy: uid, bouncedAt: nowIso, bouncedBy: uid, updatedAt: nowIso, updatedBy: uid,
  });
}

export async function clearVoucher(type, voucher, clearedAt, uid) {
  const nowIso = new Date().toISOString();
  await offlineUpdate(TYPES[type].col, voucher.id, { ...voucher, chequeStatus: "cleared", clearedAt, clearedBy: uid, updatedAt: nowIso, updatedBy: uid });
}

export async function postponeCheque(type, voucher, newChequeDate, uid) {
  const nowIso = new Date().toISOString();
  await offlineUpdate(TYPES[type].col, voucher.id, {
    ...voucher, chequeDate: newChequeDate, chequeDateBefore: voucher.chequeDate || "", chequePostponedAt: nowIso, chequePostponedBy: uid,
    updatedAt: nowIso, updatedBy: uid,
  });
}

// Old-ERP "Post Dated Cheques" register for both supplier payments (issued) and customer receipts (received).
export default function PdcWindow({ lang = "en", cur = "AED", shopId, userId = "", shopName = "", inline = false, onOpenVoucher, onClose }) {
  const bn = lang === "bn";
  const [type, setType] = useState("received");
  const [bank, setBank] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [includePosted, setIncludePosted] = useState(false);
  const [data, setData] = useState({ issued: [], received: [] });
  const [edits, setEdits] = useState({});
  const [selId, setSelId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [reloadTick, setReloadTick] = useState(0);

  useEffect(() => {
    if (!shopId) return undefined;
    const unsubs = Object.entries(TYPES).map(([key, m]) => subscribeShopCollection({
      collectionName: m.col,
      shopId,
      onRows: (rows) => setData((p) => ({ ...p, [key]: rows || [] })),
    }));
    return () => unsubs.forEach((u) => { try { u?.(); } catch { /* ignore */ } });
  }, [shopId, reloadTick]);

  const allRows = useMemo(() => (data[type] || [])
    .filter((v) => v.method === "cheque" && (!v.status || v.status === "active" || v.chequeStatus === "bounced"))
    .map((v) => toRow(type, v)), [data, type]);

  const banks = useMemo(() => [...new Set(allRows.map((r) => r.bank).filter(Boolean))].sort(), [allRows]);
  const today = todayIso();
  const rows = useMemo(() => allRows
    .filter((r) => includePosted || r.chequeStatus === "pending")
    .filter((r) => !bank || r.bank === bank)
    .filter((r) => { const d = r.chequeDate || r.date; return (!from || d >= from) && (!to || d <= to); })
    .sort((a, b) => String(a.chequeDate || a.date).localeCompare(String(b.chequeDate || b.date)) || String(a.no).localeCompare(String(b.no))),
  [allRows, includePosted, bank, from, to]);

  const edit = (r) => edits[r.id] || { status: r.chequeStatus, postDate: r.clearedAt || today };
  const setEdit = (r, patch) => setEdits((p) => ({ ...p, [r.id]: { ...edit(r), ...patch } }));
  const changed = rows.filter((r) => r.chequeStatus === "pending" && edits[r.id] && edits[r.id].status !== "pending");
  const total = rows.reduce((a, r) => a + r.amount, 0);
  const pendingTotal = rows.filter((r) => r.chequeStatus === "pending").reduce((a, r) => a + r.amount, 0);

  const switchType = (t) => { setType(t); setEdits({}); setSelId(null); setBank(""); };

  const save = async () => {
    if (!changed.length) return;
    const bounces = changed.filter((r) => edits[r.id].status === "bounced");
    if (bounces.length && !window.confirm(bn
      ? `${bounces.map((r) => r.chequeNo || r.no).join(", ")} — চেক বাউন্স?\nভাউচার বাতিল হবে আর বিলের বাকি আবার ফিরে আসবে।`
      : `Cheque ${bounces.map((r) => r.chequeNo || r.no).join(", ")} bounced?\nThe voucher is cancelled and the bills' balances restored.`)) return;
    setSaving(true);
    let cleared = 0, bounced = 0;
    const failed = [];
    for (const r of changed) {
      const e = edits[r.id];
      try {
        if (e.status === "bounced") { await bounceVoucher(type, r.raw, userId); bounced++; }
        else { await clearVoucher(type, r.raw, e.postDate ? `${e.postDate}T00:00:00.000Z` : new Date().toISOString(), userId); cleared++; }
      } catch (err) {
        console.warn("[S4 PDC] update failed", r.no, err);
        failed.push(r.no);
      }
    }
    if (navigator.onLine) window.S4Offline?.syncNow?.().catch(() => {});
    setEdits({});
    setSaving(false);
    setReloadTick((n) => n + 1);
    alert([
      cleared ? (bn ? `✅ ${cleared}টি চেক ক্লিয়ার` : `✅ ${cleared} cheque(s) cleared`) : "",
      bounced ? (bn ? `❌ ${bounced}টি চেক বাউন্স` : `❌ ${bounced} cheque(s) bounced`) : "",
      failed.length ? (bn ? `⚠️ হয়নি: ${failed.join(", ")}` : `⚠️ Failed: ${failed.join(", ")}`) : "",
    ].filter(Boolean).join("\n"));
  };

  const printList = () => {
    const m = TYPES[type];
    const period = from || to ? `${from ? fmtDate(from) : "Start"} — ${to ? fmtDate(to) : "End"}` : "All dates";
    const body = rows.map((r, i) => `<tr><td>${i + 1}</td><td>${esc(r.no)}</td><td>${esc(fmtDate(r.date))}</td><td>${esc(r.party)}</td><td>${esc(r.bank)}</td><td>${esc(r.chequeNo)}</td><td>${esc(fmtDate(r.chequeDate))}</td><td style="text-align:right">${f2(r.amount)}</td><td>${esc(r.clearedAt ? fmtDate(r.clearedAt) : "")}</td><td>${esc(r.chequeStatus.toUpperCase())}</td></tr>`).join("");
    printWithSettings(`<html><head><meta charset="UTF-8"><title>${esc(m.label)}</title><style>body{font-family:Segoe UI,Arial;font-size:12px;padding:18px}h2{margin:0;font-size:16px}h3{margin:4px 0 2px;font-size:13px}p{margin:2px 0 10px;color:#555}table{width:100%;border-collapse:collapse}th,td{border:1px solid #999;padding:4px 6px}th{background:#e5eaf3;text-align:left}tfoot td{font-weight:800;background:#f1f5f9}</style></head><body>
<h2>${esc(shopName)}</h2><h3>POST DATED CHEQUES — ${esc(m.label.toUpperCase())}${bank ? ` — ${esc(bank)}` : ""}</h3><p>${esc(period)}</p>
<table><thead><tr><th>Sl</th><th>Vchr No</th><th>Voucher Date</th><th>${esc(m.partyHead)}</th><th>Bank</th><th>Cheque No</th><th>Cheque Date</th><th style="text-align:right">Amount</th><th>Post Date</th><th>Status</th></tr></thead>
<tbody>${body}</tbody><tfoot><tr><td colspan="7" style="text-align:right">TOTAL</td><td style="text-align:right">${f2(total)}</td><td colspan="2"></td></tr></tfoot></table></body></html>`);
  };

  const sel = rows.find((r) => r.id === selId) || null;
  const cellIn = { ...inp(), height: 22, fontSize: 12, padding: "0 4px" };

  const box = (
    <div style={{ width: "100%", maxWidth: inline ? 1180 : 1000, maxHeight: "100%", margin: inline ? "0 auto" : 0, display: "flex", flexDirection: "column", background: C.bg, border: `1px solid ${C.bar}`, borderRadius: 4, boxShadow: inline ? "none" : "0 18px 40px rgba(0,0,0,0.35)", fontFamily: "Segoe UI, Tahoma, sans-serif", color: C.label }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: C.bar, color: "#fff", padding: "5px 10px", fontWeight: 800, fontSize: 13 }}>
        <span>POST DATED CHEQUES [PDC]</span>
        {onClose && <button type="button" onClick={onClose} style={{ background: "transparent", border: "none", color: "#fff", fontSize: 16, cursor: "pointer" }}>✕</button>}
      </div>

      <div style={{ padding: "10px 12px", display: "grid", gap: 8, minHeight: 0, overflow: "auto" }}>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 10, flexWrap: "wrap" }}>
          <div>
            <div style={lbl}>PDC Type</div>
            <select style={inp({ width: 150, fontWeight: 700 })} value={type} onChange={(e) => switchType(e.target.value)}>
              <option value="issued">PDC Issued</option>
              <option value="received">PDC Received</option>
            </select>
          </div>
          <div>
            <div style={lbl}>Bank</div>
            <select style={inp({ width: 200 })} value={bank} onChange={(e) => setBank(e.target.value)}>
              <option value="">All</option>
              {banks.map((b) => <option key={b} value={b}>{b}</option>)}
            </select>
          </div>
          <div>
            <div style={lbl}>Cheque Date From</div>
            <input type="date" style={inp({ width: 140 })} value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <div style={lbl}>To</div>
            <input type="date" style={inp({ width: 140 })} value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <label style={{ ...lbl, display: "flex", alignItems: "center", gap: 5, cursor: "pointer", marginBottom: 4 }}>
            <input type="checkbox" checked={includePosted} onChange={(e) => setIncludePosted(e.target.checked)} /> Include Posted Cheques
          </label>
          <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
            {onOpenVoucher && <button type="button" onClick={() => sel && onOpenVoucher(sel.raw)} disabled={!sel} style={btn()}><u>V</u>iew</button>}
            <button type="button" onClick={save} disabled={saving || !changed.length} style={btn("#15803d", "#fff")}>{saving ? "…" : <><u>S</u>ave</>}</button>
            <button type="button" onClick={printList} disabled={!rows.length} style={btn()}><u>P</u>rint</button>
            {onClose && <button type="button" onClick={onClose} style={btn()}><u>C</u>lose</button>}
          </div>
        </div>

        <div style={{ border: `1px solid ${C.border}`, maxHeight: inline ? "62vh" : "55vh", overflow: "auto", background: "#fff" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
            <colgroup>
              {[42, 85, 90, null, 120, 90, 90, 95, 44, 120, 110].map((w, i) => <col key={i} style={w ? { width: w } : undefined} />)}
            </colgroup>
            <thead>
              <tr>
                {["Sl.No", "Vchr No", "Voucher Date", TYPES[type].partyHead, "Bank", "Cheque No", "Cheque Date", "Amount", "Post", "Post Date", "Status"].map((h, i) => (
                  <th key={h} style={{ ...th, textAlign: i === 7 ? "right" : "left" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr><td colSpan={11} style={{ ...td, textAlign: "center", color: "#64748b", padding: 16 }}>
                  {includePosted ? (bn ? "কোনো চেক নেই" : "No cheques") : (bn ? "কোনো pending চেক নেই — পোস্ট করা চেক দেখতে 'Include Posted Cheques' টিক দিন" : "No pending cheques — tick 'Include Posted Cheques' to see posted ones")}
                </td></tr>
              )}
              {rows.map((r, i) => {
                const e = edit(r);
                const pending = r.chequeStatus === "pending";
                const due = pending && r.chequeDate && r.chequeDate <= today;
                const statusColor = e.status === "cleared" ? C.green : e.status === "bounced" ? C.red : due ? "#b45309" : C.label;
                return (
                  <tr key={r.id} onClick={() => setSelId(r.id)} onDoubleClick={() => onOpenVoucher?.(r.raw)}
                    style={{ background: selId === r.id ? "#dbe6f5" : due ? "#fff7ed" : "#fff", cursor: "pointer" }}>
                    <td style={td}>{i + 1}</td>
                    <td style={{ ...td, fontWeight: 700 }}>{r.no}</td>
                    <td style={td}>{fmtDate(r.date)}</td>
                    <td style={{ ...td, textAlign: "left", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.party}</td>
                    <td style={{ ...td, textAlign: "left", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.bank}</td>
                    <td style={td}>{r.chequeNo}</td>
                    <td style={{ ...td, color: due ? "#b45309" : td.color, fontWeight: due ? 800 : 400 }}>{fmtDate(r.chequeDate)}</td>
                    <td style={{ ...td, textAlign: "right", fontWeight: 700 }}>{f2(r.amount)}</td>
                    <td style={{ ...td, textAlign: "center" }}>
                      <input type="checkbox" disabled={!pending} checked={e.status === "cleared"}
                        onChange={(ev) => setEdit(r, { status: ev.target.checked ? "cleared" : "pending" })} onClick={(ev) => ev.stopPropagation()} />
                    </td>
                    <td style={td}>
                      {pending
                        ? <input type="date" style={cellIn} disabled={e.status !== "cleared"} value={e.postDate} onChange={(ev) => setEdit(r, { postDate: ev.target.value })} onClick={(ev) => ev.stopPropagation()} />
                        : (r.clearedAt ? fmtDate(r.clearedAt) : "")}
                    </td>
                    <td style={td}>
                      {pending
                        ? (
                          <select style={{ ...cellIn, color: statusColor, fontWeight: 700 }} value={e.status} onChange={(ev) => setEdit(r, { status: ev.target.value })} onClick={(ev) => ev.stopPropagation()}>
                            <option value="pending">{due ? "Due" : "Pending"}</option>
                            <option value="cleared">Cleared</option>
                            <option value="bounced">Bounced</option>
                          </select>
                        )
                        : <span style={{ color: statusColor, fontWeight: 800, textTransform: "uppercase", fontSize: 12 }}>{r.chequeStatus}</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap", justifyContent: "flex-end" }}>
          <span style={{ fontSize: 11.5, color: "#4b5f86", marginRight: "auto" }}>
            {bn ? "Post টিক দিন বা Status বদলান, তারপর Save চাপুন।" : "Tick Post or change Status, then press Save."}
            {onOpenVoucher && (bn ? " ভাউচার দেখতে double click।" : " Double click to view the voucher.")}
            {changed.length > 0 && <b style={{ color: C.green }}> · {changed.length} {bn ? "টি পরিবর্তন" : "change(s)"}</b>}
          </span>
          <span style={lbl}>Pending</span>
          <input readOnly style={inp({ width: 120, textAlign: "right", fontWeight: 800, background: "#f4f7fc", color: "#b45309" })} value={f2(pendingTotal)} />
          <span style={lbl}>TOTAL</span>
          <input readOnly style={inp({ width: 120, textAlign: "right", fontWeight: 800, background: "#f4f7fc" })} value={`${cur} ${f2(total)}`} />
        </div>
      </div>
    </div>
  );

  if (inline) return <div style={{ padding: "16px 12px 40px" }}>{box}</div>;
  return (
    <div data-si-modal-open="" style={{ position: "fixed", inset: 0, zIndex: 1600, background: "rgba(10,25,55,0.35)", display: "flex", alignItems: "center", justifyContent: "center", padding: 8, boxSizing: "border-box" }}>
      {box}
    </div>
  );
}
