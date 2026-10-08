import { useEffect, useState } from "react";

export const START_TABS = [
  ["dashboard", "🏠 ড্যাশবোর্ড", "🏠 Dashboard"],
  ["sales", "🧾 বিক্রয় ইনভয়েস", "🧾 Sales invoice"],
  ["quotation", "📄 কোটেশন", "📄 Quotation"],
  ["delivery", "🚚 ডেলিভারি নোট", "🚚 Delivery note"],
  ["products", "📦 পণ্য", "📦 Products"],
  ["purchase", "🛒 ক্রয়", "🛒 Purchase"],
  ["customers", "👥 কাস্টমার", "👥 Customers"],
  ["expenses", "💸 খরচ", "💸 Expenses"],
  ["stockAdjust", "⚖️ স্টক সমন্বয়", "⚖️ Stock adjustment"],
  ["jobCard", "🔧 জব কার্ড", "🔧 Job card"],
  ["shop", "📋 অর্ডার", "📋 Orders"],
];

// Per-login defaults: who the bill is credited to, how it is paid, the bill type and the first screen.
export default function UserDefaultsEditor({ lang = "bn", th, s, member, team = [], employees = [], payOptions = {}, onSave }) {
  const L = (bn, en) => (lang === "bn" ? bn : en);
  const [d, setD] = useState(member?.defaults || {});
  const [busy, setBusy] = useState(false);
  const memberId = member?.uid || member?.id;
  useEffect(() => { setD(member?.defaults || {}); }, [memberId]); // eslint-disable-line react-hooks/exhaustive-deps

  const dirty = JSON.stringify(d) !== JSON.stringify(member?.defaults || {});
  const salesmen = team.filter((m) => m.status !== "disabled");
  const liveEmployees = employees.filter((e) => e && e.id && e.name && e.status !== "left" && e.status !== "inactive" && !e.isDeleted);
  const sel = { ...s.sel, flex: "unset", width: "100%", fontSize: 12, padding: "6px 8px" };
  const row = (label, control) => (
    <label style={{ display: "grid", gridTemplateColumns: "minmax(110px,40%) 1fr", alignItems: "center", gap: 8, padding: "4px 0" }}>
      <span style={{ fontSize: 12, color: th.txtPrimary }}>{label}</span>
      {control}
    </label>
  );

  const save = async () => {
    setBusy(true);
    try { await onSave(d); } finally { setBusy(false); }
  };

  return (
    <div>
      <div style={{ fontSize: 10, color: "#71717a", marginBottom: 6, textTransform: "uppercase", fontWeight: 700 }}>⚙️ {L("এই ইউজারের ডিফল্ট", "Defaults for this user")}</div>
      {row(L("কর্মচারী রেকর্ড", "Employee record"), (
        <select style={sel} value={d.employeeId || ""} onChange={(e) => {
          const emp = liveEmployees.find((x) => x.id === e.target.value);
          setD((p) => ({ ...p, employeeId: emp?.id || "", employeeName: emp?.name || "" }));
        }}>
          <option value="">{L("— যুক্ত নেই —", "— Not linked —")}</option>
          {d.employeeId && !liveEmployees.some((x) => x.id === d.employeeId) && <option value={d.employeeId}>{d.employeeName || d.employeeId}</option>}
          {liveEmployees.map((e) => <option key={e.id} value={e.id}>{e.name}{e.designation ? ` · ${e.designation}` : ""}</option>)}
        </select>
      ))}
      {row(L("বিলে সেলসম্যান", "Salesman on bills"), (
        <select style={sel} value={d.salesmanId || ""} onChange={(e) => {
          const m = salesmen.find((x) => (x.uid || x.id) === e.target.value);
          setD((p) => ({ ...p, salesmanId: e.target.value, salesmanName: m?.personName || "" }));
        }}>
          <option value="">{L("— নিজে (যিনি লগইন করেছেন) —", "— Themselves (logged-in user) —")}</option>
          {salesmen.map((m) => <option key={m.uid || m.id} value={m.uid || m.id}>{m.personName || m.username}</option>)}
        </select>
      ))}
      {row(L("পেমেন্টের ধরন", "Payment method"), (
        <select style={sel} value={d.paymentMethod || ""} onChange={(e) => setD((p) => ({ ...p, paymentMethod: e.target.value }))}>
          <option value="">{L("— সাধারণ (নগদ) —", "— Standard (cash) —")}</option>
          {Object.entries(payOptions).map(([k, v]) => <option key={k} value={k}>{v.icon} {v[lang] || v.en}</option>)}
        </select>
      ))}
      {row(L("বিলের ধরন", "Bill type"), (
        <select style={sel} value={d.billType || ""} onChange={(e) => setD((p) => ({ ...p, billType: e.target.value }))}>
          <option value="">{L("— প্রিন্ট সেটিং অনুযায়ী —", "— From print settings —")}</option>
          <option value="tax">{L("ট্যাক্স ইনভয়েস", "Tax invoice")}</option>
          <option value="regular">{L("সাধারণ বিল", "Regular bill")}</option>
        </select>
      ))}
      {row(L("লগইনের পর প্রথম পাতা", "First screen after login"), (
        <select style={sel} value={d.startTab || ""} onChange={(e) => setD((p) => ({ ...p, startTab: e.target.value }))}>
          <option value="">{L("— ড্যাশবোর্ড —", "— Dashboard —")}</option>
          {START_TABS.filter(([k]) => k !== "dashboard").map(([k, bn, en]) => <option key={k} value={k}>{lang === "bn" ? bn : en}</option>)}
        </select>
      ))}
      {dirty && (
        <button type="button" style={{ ...s.savBtn, width: "100%", marginTop: 6 }} disabled={busy} onClick={save}>
          {busy ? "..." : `💾 ${L("ডিফল্ট সেভ", "Save defaults")}`}
        </button>
      )}
    </div>
  );
}
