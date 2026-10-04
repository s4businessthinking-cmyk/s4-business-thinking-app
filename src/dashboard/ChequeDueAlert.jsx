import { useState } from "react";
import { bounceVoucher, clearVoucher, postponeCheque } from "../vouchers/PdcWindow.jsx";
import { bounceExpenseCheque, clearExpenseCheque, postponeExpenseCheque } from "../expenses/expenseCheques.js";

const money = (v) => (Math.round((parseFloat(v) || 0) * 100) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDay = (d) => (d ? d.split("-").reverse().join("/") : "");
const addDays = (d, n) => {
  const t = new Date(`${d}T00:00:00`);
  t.setDate(t.getDate() + n);
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
};

export const chequeTypeIcon = (type) => (type === "received" ? "📥" : type === "expense" ? "💸" : "📤");
export const chequeTypeLabel = (type, bn) =>
  type === "received" ? (bn ? "কাস্টমারের চেক" : "Customer cheque")
    : type === "expense" ? (bn ? "খরচের চেক" : "Expense cheque")
      : (bn ? "ভেন্ডরকে দেওয়া চেক" : "Vendor cheque");

const doClear = (c, clearedAt, uid) => (c.type === "expense" ? clearExpenseCheque(c.raw, clearedAt, uid) : clearVoucher(c.type, c.raw, clearedAt, uid));
const doBounce = (c, uid) => (c.type === "expense" ? bounceExpenseCheque(c.raw, uid) : bounceVoucher(c.type, c.raw, uid));
const doPostpone = (c, date, uid) => (c.type === "expense" ? postponeExpenseCheque(c.raw, date, uid) : postponeCheque(c.type, c.raw, date, uid));

// Cheques whose date has arrived: clear, bounce or move the date, right from the dashboard.
// Cheques coming up in the next 7 days are listed below as a heads-up.
export default function ChequeDueAlert({ lang, th, cur = "AED", cheques = [], upcoming = [], today, userId, toast, onOpenPdc }) {
  const bn = lang === "bn";
  const [busyKey, setBusyKey] = useState(null);
  const [postponeKey, setPostponeKey] = useState(null);
  const [postponeDate, setPostponeDate] = useState("");
  const [open, setOpen] = useState(true);

  if (!cheques.length && !upcoming.length) return null;

  const totalIn = cheques.filter((c) => c.type === "received").reduce((a, c) => a + c.amount, 0);
  const totalOut = cheques.filter((c) => c.type !== "received").reduce((a, c) => a + c.amount, 0);
  const sync = () => navigator.onLine && window.S4Offline?.syncNow?.().catch(() => {});

  const run = async (c, fn, okMsg) => {
    setBusyKey(c.key);
    try {
      await fn();
      sync();
      toast?.(okMsg);
    } catch (error) {
      console.warn("[S4 Cheque] update failed", c.no, error);
      toast?.(bn ? `❌ হয়নি: ${error?.message || error}` : `❌ Failed: ${error?.message || error}`, "err");
    } finally {
      setBusyKey(null);
    }
  };

  const onClear = (c) =>
    run(c, () => doClear(c, `${today}T00:00:00.000Z`, userId), bn ? `✅ চেক ${c.chequeNo || c.no} ক্লিয়ার হয়েছে` : `✅ Cheque ${c.chequeNo || c.no} cleared`);

  const onBounce = (c) => {
    const msg = c.type === "expense"
      ? (bn ? `চেক ${c.chequeNo || c.no} বাউন্স হয়েছে?\nখরচটা থাকবে, শুধু চেকটা বাউন্স হিসেবে দেখাবে।` : `Cheque ${c.chequeNo || c.no} bounced?\nThe expense stays; only the cheque is marked bounced.`)
      : bn
        ? `চেক ${c.chequeNo || c.no} বাউন্স হয়েছে?\nভাউচার বাতিল হবে আর বিলের বাকি টাকা আবার ফিরে আসবে।`
        : `Cheque ${c.chequeNo || c.no} bounced?\nThe voucher is cancelled and the bill balances come back.`;
    if (!window.confirm(msg)) return;
    run(c, () => doBounce(c, userId), bn ? `❌ চেক ${c.chequeNo || c.no} বাউন্স হিসেবে রাখা হয়েছে` : `❌ Cheque ${c.chequeNo || c.no} marked bounced`);
  };

  const startPostpone = (c) => {
    setPostponeKey(c.key);
    setPostponeDate(addDays(today, 7));
  };

  const onPostpone = (c) => {
    if (!postponeDate || postponeDate <= today) {
      toast?.(bn ? "আজকের পরের একটা তারিখ দিন" : "Pick a date after today", "err");
      return;
    }
    setPostponeKey(null);
    run(c, () => doPostpone(c, postponeDate, userId), bn ? `📅 চেকের নতুন তারিখ ${fmtDay(postponeDate)}` : `📅 Cheque moved to ${fmtDay(postponeDate)}`);
  };

  const btn = (bg, color) => ({
    padding: "6px 10px", borderRadius: 8, border: "none", background: bg, color, fontSize: 12, fontWeight: 800,
    cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap",
  });

  const headline = cheques.length
    ? (bn ? `${cheques.length}টি চেকের তারিখ হয়েছে — ক্লিয়ার করুন` : `${cheques.length} cheque(s) due — please clear`)
    : (bn ? `${upcoming.length}টি চেকের তারিখ ৭ দিনের মধ্যে` : `${upcoming.length} cheque(s) due within 7 days`);

  return (
    <div style={{ borderRadius: 16, padding: "12px 14px", marginBottom: 16, border: `1px solid ${cheques.length ? "rgba(245,158,11,0.55)" : "rgba(59,130,246,0.45)"}`, background: cheques.length ? "linear-gradient(135deg, rgba(245,158,11,0.16), rgba(239,68,68,0.10))" : "linear-gradient(135deg, rgba(59,130,246,0.14), rgba(14,165,233,0.08))" }}>
      <button type="button" onClick={() => setOpen((v) => !v)} style={{ all: "unset", cursor: "pointer", display: "flex", alignItems: "center", gap: 10, width: "100%" }}>
        <span style={{ fontSize: 22 }}>🔔</span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: "block", fontSize: 14, fontWeight: 900, color: th.txtPrimary }}>{headline}</span>
          <span style={{ display: "block", fontSize: 12, fontWeight: 700, color: th.txtSecondary }}>
            {totalIn > 0 && <>📥 {bn ? "পাবো" : "To receive"} {cur} {money(totalIn)}</>}
            {totalIn > 0 && totalOut > 0 && " · "}
            {totalOut > 0 && <>📤 {bn ? "দিতে হবে" : "To pay"} {cur} {money(totalOut)}</>}
            {cheques.length > 0 && upcoming.length > 0 && <> · ⏳ {bn ? `আরও ${upcoming.length}টি সামনে` : `${upcoming.length} more coming`}</>}
          </span>
        </span>
        <span style={{ fontSize: 14, color: th.txtSecondary }}>{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10 }}>
          {cheques.map((c) => {
            const busy = busyKey === c.key;
            const received = c.type === "received";
            return (
              <div key={c.key} style={{ borderRadius: 12, padding: "9px 11px", background: th.bgCard, border: `1px solid ${th.border}`, opacity: busy ? 0.6 : 1 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 800, color: th.txtPrimary }}>
                      {chequeTypeIcon(c.type)} {c.party || "—"}
                      <span style={{ fontWeight: 700, color: th.txtMuted }}> · {chequeTypeLabel(c.type, bn)}</span>
                    </div>
                    <div style={{ fontSize: 11, color: th.txtMuted, marginTop: 2 }}>
                      {bn ? "চেক নং" : "Cheque"} {c.chequeNo || "—"}{c.bank ? ` · ${c.bank}` : ""} · {c.no}
                    </div>
                    <div style={{ fontSize: 11, fontWeight: 800, marginTop: 2, color: c.daysLate > 0 ? "#ef4444" : "#f59e0b" }}>
                      📅 {fmtDay(c.chequeDate)} · {c.daysLate > 0 ? (bn ? `${c.daysLate} দিন পার হয়েছে` : `${c.daysLate} day(s) overdue`) : (bn ? "আজ" : "Today")}
                    </div>
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 900, color: th.txtPrimary, whiteSpace: "nowrap" }}>{cur} {money(c.amount)}</div>
                </div>

                {postponeKey === c.key ? (
                  <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap", alignItems: "center" }}>
                    <span style={{ fontSize: 12, color: th.txtSecondary, fontWeight: 700 }}>{bn ? "নতুন তারিখ:" : "New date:"}</span>
                    <input type="date" value={postponeDate} min={addDays(today, 1)} onChange={(e) => setPostponeDate(e.target.value)}
                      style={{ padding: "5px 8px", borderRadius: 8, border: `1px solid ${th.borderMid || th.border}`, background: th.bgInp, color: th.txtPrimary, fontFamily: "inherit" }} />
                    <button type="button" disabled={busy} onClick={() => onPostpone(c)} style={btn("#2563eb", "#fff")}>{bn ? "সেভ" : "Save"}</button>
                    <button type="button" onClick={() => setPostponeKey(null)} style={btn("transparent", th.txtSecondary)}>{bn ? "বাতিল" : "Cancel"}</button>
                  </div>
                ) : (
                  <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
                    <button type="button" disabled={busy} onClick={() => onClear(c)} style={btn("#16a34a", "#fff")}>
                      ✅ {received ? (bn ? "টাকা এসেছে · ক্লিয়ার" : "Money received · Clear") : (bn ? "টাকা কেটেছে · ক্লিয়ার" : "Paid out · Clear")}
                    </button>
                    <button type="button" disabled={busy} onClick={() => onBounce(c)} style={btn("#dc2626", "#fff")}>❌ {bn ? "বাউন্স" : "Bounced"}</button>
                    <button type="button" disabled={busy} onClick={() => startPostpone(c)} style={btn("rgba(37,99,235,0.15)", "#3b82f6")}>📅 {bn ? "তারিখ পেছান" : "Postpone"}</button>
                  </div>
                )}
              </div>
            );
          })}

          {upcoming.length > 0 && (
            <div style={{ borderRadius: 12, padding: "8px 11px", background: th.bgCard, border: `1px dashed ${th.border}` }}>
              <div style={{ fontSize: 12, fontWeight: 900, color: "#3b82f6", marginBottom: 4 }}>⏳ {bn ? "সামনের ৭ দিনে যে চেকগুলোর তারিখ" : "Cheques due in the next 7 days"}</div>
              {upcoming.map((c) => {
                const left = -c.daysLate;
                return (
                  <div key={c.key} style={{ display: "flex", justifyContent: "space-between", gap: 8, padding: "5px 0", borderTop: `1px solid ${th.border}`, fontSize: 12 }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 800, color: th.txtPrimary }}>{chequeTypeIcon(c.type)} {c.party || "—"} <span style={{ color: th.txtMuted, fontWeight: 700 }}>· {chequeTypeLabel(c.type, bn)}</span></div>
                      <div style={{ color: th.txtMuted, fontSize: 11 }}>{bn ? "চেক" : "Cheque"} {c.chequeNo || "—"}{c.bank ? ` · ${c.bank}` : ""} · 📅 {fmtDay(c.chequeDate)}</div>
                    </div>
                    <div style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                      <div style={{ fontWeight: 900, color: th.txtPrimary }}>{cur} {money(c.amount)}</div>
                      <div style={{ fontSize: 11, fontWeight: 800, color: left <= 2 ? "#f59e0b" : "#3b82f6" }}>{bn ? `${left} দিন বাকি` : `${left} day(s) left`}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {onOpenPdc && (
            <button type="button" onClick={onOpenPdc} style={{ ...btn("transparent", "#3b82f6"), alignSelf: "flex-start", padding: "2px 0" }}>
              {bn ? "সব চেক দেখুন (PDC) ›" : "View all cheques (PDC) ›"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
