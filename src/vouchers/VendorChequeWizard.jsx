import React, { useEffect, useMemo, useState } from "react";
import { useEscapeKey } from "../components/WindowChrome.jsx";

const n2 = (v) => Number.parseFloat(v) || 0;
const f2 = (v) => n2(v).toFixed(2);
const pad = (n) => String(n).padStart(2, "0");
const todayIso = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const day = (v) => String(v || "").slice(0, 10);
const fmtDate = (v) => { const [y, m, d] = day(v).split("-"); return y && m && d ? `${d}/${m}/${y}` : day(v); };
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function useIsMobile() {
  const query = "(max-width: 759px)";
  const [mobile, setMobile] = useState(() => !!window.matchMedia?.(query).matches);
  useEffect(() => {
    const mq = window.matchMedia?.(query);
    if (!mq) return undefined;
    const on = () => setMobile(mq.matches);
    mq.addEventListener?.("change", on);
    return () => mq.removeEventListener?.("change", on);
  }, []);
  return mobile;
}

// Reduces the last allocations first so the oldest invoices stay fully paid.
export function trimAllocationsTo(allocations, target) {
  let excess = Math.round((allocations.reduce((s, a) => s + n2(a.amount), 0) - n2(target)) * 100) / 100;
  const out = allocations.map((a) => ({ ...a }));
  for (let i = out.length - 1; i >= 0 && excess > 0.001; i -= 1) {
    const cut = Math.min(n2(out[i].amount), excess);
    out[i].amount = Math.round((n2(out[i].amount) - cut) * 100) / 100;
    excess = Math.round((excess - cut) * 100) / 100;
  }
  return out.filter((a) => n2(a.amount) > 0.001);
}

export default function VendorChequeWizard({
  lang = "en", cur = "AED", vendors = [], banks = [], getOpenInvoices, amountWords = () => "",
  initialVendorId = null, saving = false, onSave, onPrintCheque, onPrintVoucher, onHandover, onClose,
}) {
  const bn = lang === "bn";
  const mobile = useIsMobile();
  const [vendor, setVendor] = useState(() => (initialVendorId && vendors.find((v) => v.id === initialVendorId || v.name === initialVendorId)) || null);
  const [vendorQ, setVendorQ] = useState("");
  const [basis, setBasis] = useState("month");
  const [month, setMonth] = useState(() => todayIso().slice(0, 7));
  const [from, setFrom] = useState(() => `${todayIso().slice(0, 7)}-01`);
  const [to, setTo] = useState(todayIso);
  const [picked, setPicked] = useState({});
  const [chequeNo, setChequeNo] = useState("");
  const [chequeDate, setChequeDate] = useState(todayIso);
  const [chequeBank, setChequeBank] = useState("");
  const [receivedBy, setReceivedBy] = useState("");
  const [vendorReceiptNo, setVendorReceiptNo] = useState("");
  const [note, setNote] = useState("");
  const [noteTouched, setNoteTouched] = useState(false);
  const [chequeAmt, setChequeAmt] = useState("");
  const [chequeAmtTouched, setChequeAmtTouched] = useState(false);
  const [diffMode, setDiffMode] = useState("discount");
  const [created, setCreated] = useState(null);

  useEscapeKey(() => { if (!saving) onClose?.(); }, { level: 5 });

  const openInvoices = useMemo(() => (vendor ? getOpenInvoices(vendor) || [] : []), [vendor, getOpenInvoices]);
  const shown = useMemo(() => {
    if (basis === "month") return openInvoices.filter((i) => day(i.invoiceDate).startsWith(month));
    if (basis === "range") return openInvoices.filter((i) => (!from || day(i.invoiceDate) >= from) && (!to || day(i.invoiceDate) <= to));
    return openInvoices;
  }, [openInvoices, basis, month, from, to]);

  // Month and date-range modes select every matching invoice at full balance; invoice mode starts empty.
  const shownKey = `${basis}|${shown.map((i) => i.id).join(",")}`;
  useEffect(() => {
    const next = {};
    if (basis !== "invoices") shown.forEach((i) => { next[i.id] = f2(i.balanceDue); });
    setPicked(next);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shownKey]);

  const rows = shown.filter((i) => picked[i.id] !== undefined);
  const total = Math.round(rows.reduce((s, i) => s + n2(picked[i.id]), 0) * 100) / 100;
  const chequeAmount = chequeAmtTouched ? n2(chequeAmt) : total;
  const diff = Math.round((total - chequeAmount) * 100) / 100;

  useEffect(() => {
    if (noteTouched) return;
    if (basis === "month" && month) {
      const [y, m] = month.split("-");
      setNote(`Cheque for ${MONTHS[Number(m) - 1] || ""} ${y} invoices`);
    } else if (basis === "range") setNote(`Cheque for invoices ${fmtDate(from)} - ${fmtDate(to)}`);
    else setNote("");
  }, [basis, month, from, to, noteTouched]);

  const toggle = (inv) => setPicked((p) => {
    const next = { ...p };
    if (next[inv.id] !== undefined) delete next[inv.id];
    else next[inv.id] = f2(inv.balanceDue);
    return next;
  });
  const setRowAmt = (inv, v) => setPicked((p) => ({ ...p, [inv.id]: v }));

  const save = async () => {
    if (!vendor) { alert(bn ? "ভেন্ডর বাছাই করুন" : "Select a vendor"); return; }
    if (!rows.length || total <= 0) { alert(bn ? "অন্তত একটা ইনভয়েস বাছাই করুন" : "Select at least one invoice"); return; }
    for (const inv of rows) {
      const a = n2(picked[inv.id]);
      if (a <= 0 || a > n2(inv.balanceDue) + 0.01) {
        alert(bn ? `${inv.supplierInvoiceNo || inv.invoiceNo}: অঙ্ক বাকির (${f2(inv.balanceDue)}) মধ্যে হতে হবে` : `${inv.supplierInvoiceNo || inv.invoiceNo}: amount must be within the balance ${f2(inv.balanceDue)}`);
        return;
      }
    }
    if (!chequeNo.trim()) { alert(bn ? "চেক নম্বর লিখুন" : "Enter the cheque number"); return; }
    if (chequeAmount <= 0 || chequeAmount > total + 0.001) { alert(bn ? "চেকের অঙ্ক শূন্য বা মোটের চেয়ে বেশি হতে পারবে না" : "Cheque amount must be above zero and not more than the total"); return; }

    let allocations = rows.map((inv) => ({
      invoiceId: inv.id, invoiceNo: inv.invoiceNo, supplierInvoiceNo: inv.supplierInvoiceNo || "",
      invoiceDate: inv.invoiceDate || "", amount: Math.round(n2(picked[inv.id]) * 100) / 100,
    }));
    if (diff > 0.001 && diffMode === "balance") allocations = trimAllocationsTo(allocations, chequeAmount);

    const result = await onSave?.({
      vendorId: vendor.id || null, vendorName: vendor.name, vendorMobile: vendor.mobile || "",
      method: "cheque", paymentDate: todayIso(),
      chequeNo: chequeNo.trim(), chequeBank, chequeDate, chequeReceivedBy: receivedBy.trim(),
      vendorReceiptNo: vendorReceiptNo.trim(), note: note.trim(), allocations,
      chequeAmount,
    });
    if (result) setCreated(result);
  };

  const filteredVendors = vendors.filter((v) => (v.name || "").toLowerCase().includes(vendorQ.trim().toLowerCase())).slice(0, 40);

  const field = { width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid #cbd5e1", fontSize: 14, boxSizing: "border-box", fontFamily: "inherit", background: "#fff", color: "#0f172a" };
  const lbl = { fontSize: 11, fontWeight: 800, color: "#334155", marginBottom: 4, display: "block" };
  const card = { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: 12, marginBottom: 10 };
  const chip = (on) => ({ flex: 1, padding: "9px 6px", borderRadius: 9, border: `1.5px solid ${on ? "#2563eb" : "#cbd5e1"}`, background: on ? "#eff6ff" : "#fff", color: on ? "#1d4ed8" : "#475569", fontWeight: 800, fontSize: 12, cursor: "pointer" });
  const bigBtn = (bg, color = "#fff", border = "none") => ({ width: "100%", padding: 13, borderRadius: 10, border, background: bg, color, fontWeight: 900, fontSize: 14, cursor: "pointer", marginBottom: 8 });

  const body = created ? (
    <div style={{ padding: 16 }}>
      <div style={{ ...card, textAlign: "center", padding: 18 }}>
        <div style={{ fontSize: 34 }}>✅</div>
        <div style={{ fontWeight: 900, fontSize: 16, marginTop: 4 }}>{bn ? "চেক ভাউচার সেভ হয়েছে" : "Cheque voucher saved"}</div>
        <div style={{ fontSize: 13, color: "#475569", marginTop: 4 }}>{created.paymentNo} · {created.vendorName}</div>
        <div style={{ fontSize: 22, fontWeight: 900, color: "#15803d", marginTop: 6 }}>{cur} {f2(created.chequeAmount ?? created.totalAmount)}</div>
        {n2(created.discountAmount) > 0 && <div style={{ fontSize: 12, color: "#b45309", marginTop: 2 }}>{bn ? "ছাড়" : "Discount"}: {cur} {f2(created.discountAmount)}</div>}
      </div>
      {onPrintCheque && <button type="button" style={bigBtn("linear-gradient(135deg,#f97316,#ea580c)")} onClick={() => onPrintCheque(created)}>🖨️ {bn ? "চেক প্রিন্ট করুন" : "Print Cheque"}</button>}
      <button type="button" style={bigBtn("#eff6ff", "#1d4ed8", "1px solid #2563eb")} onClick={() => onPrintVoucher?.(created)}>📄 {bn ? "চেক পেমেন্ট ভাউচার প্রিন্ট" : "Print Cheque Payment Voucher"}</button>
      <button type="button" style={bigBtn("#f0fdf4", "#15803d", "1px solid #16a34a")} onClick={() => onHandover?.(created)}>🪪 {bn ? "হস্তান্তর ডকুমেন্ট (আইডি + সই)" : "Handover document (ID + signature)"}</button>
      <button type="button" style={bigBtn("#fff", "#475569", "1px solid #cbd5e1")} onClick={onClose}>{bn ? "বন্ধ করুন" : "Close"}</button>
    </div>
  ) : (
    <div style={{ padding: 12 }}>
      <div style={card}>
        <span style={lbl}>{bn ? "ভেন্ডর" : "Vendor"}</span>
        {vendor ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "9px 12px", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 9 }}>
            <div style={{ fontWeight: 900 }}>🏭 {vendor.name}</div>
            <button type="button" onClick={() => { setVendor(null); setVendorQ(""); }} style={{ border: "1px solid #cbd5e1", background: "#fff", borderRadius: 8, padding: "5px 10px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>{bn ? "বদলান" : "Change"}</button>
          </div>
        ) : (
          <>
            <input style={field} autoFocus placeholder={bn ? "ভেন্ডরের নাম খুঁজুন..." : "Search vendor..."} value={vendorQ} onChange={(e) => setVendorQ(e.target.value)} />
            <div style={{ maxHeight: 240, overflowY: "auto", marginTop: 6, border: "1px solid #e2e8f0", borderRadius: 9 }}>
              {filteredVendors.map((v) => (
                <div key={v.key || v.id || v.name} onClick={() => setVendor(v)} style={{ padding: "9px 12px", borderBottom: "1px solid #f1f5f9", cursor: "pointer", fontSize: 13, fontWeight: 700 }}>
                  🏭 {v.name} {v.pending ? <span style={{ fontSize: 11, color: "#b45309", fontWeight: 700 }}>· {v.pending} {bn ? "বাকি ইনভয়েস" : "open"}</span> : null}
                </div>
              ))}
              {!filteredVendors.length && <div style={{ padding: 12, fontSize: 12, color: "#64748b" }}>{bn ? "কোনো ভেন্ডর নেই" : "No vendor found"}</div>}
            </div>
          </>
        )}
      </div>

      {vendor && (<>
        <div style={card}>
          <span style={lbl}>{bn ? "কীভাবে হিসাব করবেন" : "Calculate by"}</span>
          <div style={{ display: "flex", gap: 6 }}>
            <button type="button" style={chip(basis === "month")} onClick={() => setBasis("month")}>📅 {bn ? "মাসিক" : "Monthly"}</button>
            <button type="button" style={chip(basis === "range")} onClick={() => setBasis("range")}>🗓️ {bn ? "তারিখ ধরে" : "Date range"}</button>
            <button type="button" style={chip(basis === "invoices")} onClick={() => setBasis("invoices")}>🧾 {bn ? "ইনভয়েস ধরে" : "Invoices"}</button>
          </div>
          {basis === "month" && <input type="month" style={{ ...field, marginTop: 8 }} value={month} onChange={(e) => setMonth(e.target.value)} />}
          {basis === "range" && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 8 }}>
              <div><span style={lbl}>{bn ? "থেকে" : "From"}</span><input type="date" style={field} value={from} onChange={(e) => setFrom(e.target.value)} /></div>
              <div><span style={lbl}>{bn ? "পর্যন্ত" : "To"}</span><input type="date" style={field} value={to} onChange={(e) => setTo(e.target.value)} /></div>
            </div>
          )}
        </div>

        <div style={card}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <span style={{ ...lbl, marginBottom: 0 }}>{bn ? "বাকি ইনভয়েস" : "Open invoices"} ({shown.length})</span>
            {shown.length > 0 && (
              <button type="button" onClick={() => setPicked(rows.length === shown.length ? {} : Object.fromEntries(shown.map((i) => [i.id, f2(i.balanceDue)])))}
                style={{ border: "none", background: "none", color: "#2563eb", fontWeight: 800, fontSize: 12, cursor: "pointer" }}>
                {rows.length === shown.length ? (bn ? "সব বাদ" : "Clear all") : (bn ? "সব বাছাই" : "Select all")}
              </button>
            )}
          </div>
          {!shown.length && <div style={{ padding: 14, textAlign: "center", fontSize: 12, color: "#64748b" }}>{bn ? "এই সময়ে কোনো বাকি ইনভয়েস নেই" : "No open invoices in this period"}</div>}
          {shown.map((inv) => {
            const on = picked[inv.id] !== undefined;
            return (
              <div key={inv.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 6px", borderBottom: "1px solid #f1f5f9", background: on ? "#f0f9ff" : "transparent", borderRadius: 6 }}>
                <input type="checkbox" checked={on} onChange={() => toggle(inv)} style={{ width: 18, height: 18, flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }} onClick={() => toggle(inv)}>
                  <div style={{ fontWeight: 800, fontSize: 13, color: "#0f172a" }}>{inv.supplierInvoiceNo || inv.invoiceNo}{inv.supplierInvoiceNo ? <span style={{ fontSize: 11, color: "#64748b", fontWeight: 600 }}> · {inv.invoiceNo}</span> : null}</div>
                  <div style={{ fontSize: 11, color: "#64748b" }}>{fmtDate(inv.invoiceDate)} · {bn ? "বাকি" : "Due"} <b style={{ color: "#dc2626" }}>{f2(inv.balanceDue)}</b></div>
                </div>
                <input inputMode="decimal" disabled={!on} value={on ? picked[inv.id] : ""} placeholder="0.00" onChange={(e) => setRowAmt(inv, e.target.value)}
                  style={{ ...field, width: mobile ? 92 : 120, flex: "0 0 auto", textAlign: "right", fontWeight: 800, padding: "8px 8px", background: on ? "#fff" : "#f1f5f9" }} />
              </div>
            );
          })}
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, fontWeight: 900, fontSize: 15 }}>
            <span>{bn ? "মোট" : "Total"} ({rows.length})</span><span style={{ color: "#0f172a" }}>{cur} {f2(total)}</span>
          </div>
        </div>

        <div style={card}>
          <div style={{ display: "grid", gridTemplateColumns: mobile ? "1fr 1fr" : "1fr 1fr 1fr", gap: 8 }}>
            <div><span style={lbl}>{bn ? "চেক নম্বর *" : "Cheque No *"}</span><input style={{ ...field, fontFamily: "monospace" }} value={chequeNo} onChange={(e) => setChequeNo(e.target.value)} /></div>
            <div><span style={lbl}>{bn ? "চেকের তারিখ" : "Cheque date"}</span><input type="date" style={field} value={chequeDate} onChange={(e) => setChequeDate(e.target.value)} /></div>
            <div style={{ gridColumn: mobile ? "1 / -1" : "auto" }}><span style={lbl}>{bn ? "ব্যাংক" : "Bank"}</span>
              <select style={field} value={chequeBank} onChange={(e) => setChequeBank(e.target.value)}>
                <option value="">—</option>
                {banks.map((b) => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>
            <div><span style={lbl}>{bn ? "চেক গ্রহণকারী (ঐচ্ছিক)" : "Received by (optional)"}</span><input style={field} value={receivedBy} onChange={(e) => setReceivedBy(e.target.value)} /></div>
            <div><span style={lbl}>{bn ? "ভেন্ডর রিসিট নং (ঐচ্ছিক)" : "Vendor receipt no (optional)"}</span><input style={field} value={vendorReceiptNo} onChange={(e) => setVendorReceiptNo(e.target.value)} /></div>
            <div style={{ gridColumn: mobile ? "1 / -1" : "auto" }}><span style={lbl}>{bn ? "বিবরণ" : "Narration"}</span><input style={field} value={note} onChange={(e) => { setNote(e.target.value); setNoteTouched(true); }} /></div>
          </div>
        </div>

        <div style={card}>
          <span style={lbl}>{bn ? "চেকের অঙ্ক" : "Cheque amount"} ({cur})</span>
          <input inputMode="decimal" style={{ ...field, fontSize: 20, fontWeight: 900, color: "#15803d" }} value={chequeAmtTouched ? chequeAmt : f2(total)}
            onChange={(e) => { setChequeAmt(e.target.value); setChequeAmtTouched(true); }} />
          <div style={{ fontSize: 12, color: "#475569", marginTop: 4, fontStyle: "italic" }}>{chequeAmount > 0 ? `${amountWords(chequeAmount)} Only` : ""}</div>
          {chequeAmtTouched && <button type="button" onClick={() => { setChequeAmtTouched(false); setChequeAmt(""); }} style={{ border: "none", background: "none", color: "#2563eb", fontSize: 12, fontWeight: 700, cursor: "pointer", padding: 0, marginTop: 4 }}>{bn ? "↺ মোটের সমান করুন" : "↺ Match the total"}</button>}
          {diff > 0.001 && (
            <div style={{ marginTop: 10, padding: 10, borderRadius: 10, background: "#fffbeb", border: "1px solid #f59e0b" }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: "#92400e", marginBottom: 6 }}>
                {bn ? `মোটের চেয়ে ${cur} ${f2(diff)} কম — এটা কী হবে?` : `${cur} ${f2(diff)} less than the total — what is it?`}
              </div>
              <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, fontWeight: 700, marginBottom: 4, cursor: "pointer" }}>
                <input type="radio" checked={diffMode === "discount"} onChange={() => setDiffMode("discount")} />
                {bn ? "ছাড় — ইনভয়েস পুরো পরিশোধ হবে" : "Discount — invoices are settled in full"}
              </label>
              <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                <input type="radio" checked={diffMode === "balance"} onChange={() => setDiffMode("balance")} />
                {bn ? "বাকি থাকবে — ভেন্ডরের কাছে পরে দেব" : "Keep as balance — still owed to the vendor"}
              </label>
            </div>
          )}
        </div>
      </>)}
    </div>
  );

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 10040, background: "rgba(15,23,42,0.55)", display: "flex", alignItems: mobile ? "stretch" : "center", justifyContent: "center", padding: mobile ? 0 : 16 }}>
      <div style={{ width: "100%", maxWidth: mobile ? "none" : 860, height: mobile ? "100dvh" : "auto", maxHeight: mobile ? "100dvh" : "94vh", background: "#f1f5f9", borderRadius: mobile ? 0 : 14, display: "flex", flexDirection: "column", overflow: "hidden", color: "#0f172a", fontFamily: "inherit" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 14px", paddingTop: mobile ? "max(12px, env(safe-area-inset-top))" : 12, background: "linear-gradient(135deg,#c2410c,#f97316)", color: "#fff" }}>
          <div style={{ fontWeight: 900, fontSize: 15 }}>🖨️ {bn ? "ভেন্ডর চেক" : "Vendor Cheque"}</div>
          <button type="button" onClick={onClose} disabled={saving} style={{ border: "none", background: "rgba(255,255,255,0.2)", color: "#fff", width: 34, height: 34, borderRadius: 8, fontSize: 18, cursor: "pointer" }}>✕</button>
        </div>
        <div style={{ flex: 1, overflowY: "auto" }}>{body}</div>
        {!created && vendor && (
          <div style={{ display: "flex", gap: 10, alignItems: "center", padding: 12, paddingBottom: mobile ? "max(12px, env(safe-area-inset-bottom))" : 12, background: "#fff", borderTop: "1px solid #e2e8f0" }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11, color: "#64748b", fontWeight: 700 }}>{bn ? "চেক" : "Cheque"}</div>
              <div style={{ fontSize: 18, fontWeight: 900, color: "#15803d" }}>{cur} {f2(chequeAmount)}</div>
            </div>
            <button type="button" onClick={save} disabled={saving || !rows.length} style={{ flex: 1.4, padding: 13, borderRadius: 10, border: "none", background: saving || !rows.length ? "#94a3b8" : "linear-gradient(135deg,#15803d,#16a34a)", color: "#fff", fontWeight: 900, fontSize: 14, cursor: saving || !rows.length ? "default" : "pointer" }}>
              {saving ? "…" : `💾 ${bn ? "সেভ করে চেক তৈরি" : "Save & create cheque"}`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
