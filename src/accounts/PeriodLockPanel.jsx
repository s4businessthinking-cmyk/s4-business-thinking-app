import { useState } from "react";
import { periodLockOf } from "./periodLock.js";

const pad = (n) => String(n).padStart(2, "0");
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export default function PeriodLockPanel({ lang = "bn", th, s, shop, user, profile, onSave, toast }) {
  const L = (bn, en) => (lang === "bn" ? bn : en);
  const current = periodLockOf(shop);
  const [date, setDate] = useState(current.lockDate || "");
  const [note, setNote] = useState(current.note || "");
  const [busy, setBusy] = useState(false);

  const now = new Date();
  const lastMonthEnd = ymd(new Date(now.getFullYear(), now.getMonth(), 0));
  const lastYearEnd = `${now.getFullYear() - 1}-12-31`;
  const today = ymd(now);

  const save = async (lockDate) => {
    if (lockDate && lockDate > today) return toast?.(L("ভবিষ্যতের তারিখ লক করা যাবে না", "You cannot lock a future date"), "err");
    const msg = lockDate
      ? L(`${lockDate} পর্যন্ত সব হিসাব বন্ধ হবে। এই তারিখ বা তার আগের বিল, রিসিট, পেমেন্ট, খরচ, ভাউচার, রিটার্ন, স্টক সমন্বয় আর কেউ যোগ / এডিট / বাতিল / মুছতে পারবে না (মালিকও না, যতক্ষণ লক থাকে)। চালিয়ে যাবেন?`,
        `All books up to ${lockDate} will be closed. Nobody (owner included, while locked) can add, edit, cancel or delete bills, receipts, payments, expenses, vouchers, returns or stock adjustments dated on or before it. Continue?`)
      : L("লক খুলে দিলে পুরোনো এন্ট্রি আবার এডিট করা যাবে। খুলবেন?", "Unlocking lets old entries be edited again. Unlock?");
    if (!window.confirm(msg)) return;
    setBusy(true);
    try {
      const history = Array.isArray(current.history) ? current.history.slice(-19) : [];
      const at = new Date().toISOString();
      const by = profile?.personName || user?.email || "";
      await onSave({
        lockDate: lockDate || "",
        note: lockDate ? note.trim() : "",
        lockedAt: at,
        lockedBy: user?.uid || "",
        lockedByName: by,
        history: [...history, { lockDate: lockDate || "", at, by, note: note.trim() }],
      });
      setDate(lockDate || "");
      toast?.(lockDate ? L(`🔒 ${lockDate} পর্যন্ত হিসাব বন্ধ করা হলো`, `🔒 Books locked up to ${lockDate}`) : L("🔓 লক খুলে দেওয়া হলো", "🔓 Lock removed"));
    } catch (e) {
      toast?.(e?.message || String(e), "err");
    } finally {
      setBusy(false);
    }
  };

  const quick = (label, value) => (
    <button type="button" style={{ ...s.addCoBtn, padding: "6px 10px", fontSize: 12 }} onClick={() => setDate(value)}>{label}</button>
  );

  return (
    <div>
      <div style={{ ...s.card, marginBottom: 12, border: current.lockDate ? "1px solid #16a34a" : `1px solid ${th.border}` }}>
        <div style={s.settingsLbl}>{L("বর্তমান অবস্থা", "Current status")}</div>
        {current.lockDate ? (
          <div style={{ fontSize: 14, color: th.txtPrimary, lineHeight: 1.6 }}>
            🔒 <b>{current.lockDate}</b> {L("পর্যন্ত হিসাব বন্ধ", "— books closed up to this date")}
            <div style={{ fontSize: 12, color: "#71717a" }}>
              {current.lockedByName && `${L("করেছেন", "By")}: ${current.lockedByName} · `}{String(current.lockedAt || "").slice(0, 10)}
              {current.note && ` · ${current.note}`}
            </div>
          </div>
        ) : (
          <div style={{ fontSize: 13, color: "#71717a" }}>🔓 {L("কোনো লক নেই — যেকোনো তারিখের এন্ট্রি এডিট করা যায়।", "Not locked — entries of any date can be edited.")}</div>
        )}
      </div>

      <div style={{ ...s.card, marginBottom: 12 }}>
        <div style={s.settingsLbl}>{L("হিসাব বন্ধের তারিখ", "Close books up to")}</div>
        <div style={{ fontSize: 12, color: "#71717a", marginBottom: 10, lineHeight: 1.5 }}>
          {L("বছর / মাস শেষে হিসাব মিলিয়ে ফেলার পর তারিখটা লক করুন, যাতে পুরোনো হিসাব কেউ ভুল করে বা ইচ্ছা করে বদলাতে না পারে। পুরোনো বিলে নতুন টাকা জমা নেওয়া (রিসিট) চলবে — শুধু বিলটা বদলানো / বাতিল করা যাবে না।",
            "After closing a year or month, lock it so old figures cannot be changed by mistake or on purpose. New receipts against old bills still work — only the old bill itself cannot be changed or cancelled.")}
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
          {quick(L(`গত মাস শেষ (${lastMonthEnd})`, `Last month end (${lastMonthEnd})`), lastMonthEnd)}
          {quick(L(`গত বছর শেষ (${lastYearEnd})`, `Last year end (${lastYearEnd})`), lastYearEnd)}
        </div>
        <input type="date" style={{ ...s.inp, marginBottom: 8 }} value={date} max={today} onChange={(e) => setDate(e.target.value)} />
        <input style={{ ...s.inp, marginBottom: 10 }} placeholder={L("নোট (যেমন: ২০২৫ সালের হিসাব অডিট শেষ)", "Note (e.g. 2025 audit finished)")} value={note} onChange={(e) => setNote(e.target.value)} />
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button type="button" style={{ ...s.sendBtn, flex: 1 }} disabled={busy || !date} onClick={() => save(date)}>🔒 {L("হিসাব বন্ধ / লক করুন", "Close / lock books")}</button>
          {current.lockDate && (
            <button type="button" style={{ ...s.addCoBtn, borderColor: "#450a0a", color: "#ef4444" }} disabled={busy} onClick={() => save("")}>🔓 {L("লক খুলুন", "Unlock")}</button>
          )}
        </div>
      </div>

      {Array.isArray(current.history) && current.history.length > 0 && (
        <div style={s.card}>
          <div style={s.settingsLbl}>{L("লকের ইতিহাস", "Lock history")}</div>
          {[...current.history].reverse().map((h, i) => (
            <div key={i} style={{ fontSize: 12, color: th.txtPrimary, padding: "6px 0", borderTop: i ? `1px solid ${th.border}` : "none" }}>
              {h.lockDate ? `🔒 ${h.lockDate}` : `🔓 ${L("খোলা", "Unlocked")}`} · <span style={{ color: "#71717a" }}>{String(h.at || "").slice(0, 16).replace("T", " ")} · {h.by}{h.note ? ` · ${h.note}` : ""}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
