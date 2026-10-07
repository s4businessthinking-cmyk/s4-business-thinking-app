import React, { useEffect, useMemo, useRef, useState } from "react";
import { offlineCreate, offlineUpdate } from "../offline/offlineRepository";
import { PM_CSS } from "../product-master/pmStyles";
import { SI_CSS, usePmFitHeight, usePmMobile } from "../sales-invoice/siSkin";
import { subscribeShopCollection } from "../offline/realtimeSync";
import { printWithSettings } from "../print/printSettings.js";
import { generateStatementHTML } from "../print/printDesign.js";
import { ATTENDANCE_STATUSES, statusInfo, monthDates, marksByDate, summarizeMonth, payableFor, hoursBetween, wagesPaidByEmployee } from "./attendance.js";

const n = (v) => parseFloat(String(v ?? "").replace(/,/g, "")) || 0;
const money = (v) => (Math.round((n(v) + Number.EPSILON) * 100) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const localDay = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const fmtDay = (d) => (d ? String(d).slice(0, 10).split("-").reverse().join("/") : "");
const sameMarks = (a, b) => JSON.stringify(a || {}) === JSON.stringify(b || {});

export default function AttendanceTab({ lang = "en", shopId, user, profile, canManage, cur = "AED", toast, shopName = "", leaveGuard = null }) {
  const bn = lang === "bn";
  const L = (b, e) => (bn ? b : e);
  const [employees, setEmployees] = useState([]);
  const [docs, setDocs] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [view, setView] = useState("day");
  const [date, setDate] = useState(() => localDay());
  const [month, setMonth] = useState(() => localDay().slice(0, 7));
  const [draft, setDraft] = useState({});
  const [saving, setSaving] = useState(false);
  const mobile = usePmMobile();
  const rootRef = useRef(null);
  const fitH = usePmFitHeight(rootRef, mobile);

  useEffect(() => {
    if (!shopId) return undefined;
    const u1 = subscribeShopCollection({ collectionName: "employees", shopId, onRows: (list) => setEmployees((list || []).filter((e) => e && !e.isDeleted && e.shopId === shopId)) });
    const u2 = subscribeShopCollection({ collectionName: "attendance", shopId, onRows: (list) => setDocs(list || []) });
    const u3 = subscribeShopCollection({ collectionName: "expenses", shopId, onRows: (list) => setExpenses(list || []) });
    return () => { try { u1?.(); u2?.(); u3?.(); } catch { /* ignore */ } };
  }, [shopId]);

  const byDate = useMemo(() => marksByDate(docs, shopId), [docs, shopId]);
  const staffOn = (d) => employees
    .filter((e) => (!e.joinDate || e.joinDate <= d) && (e.status !== "inactive" || (e.leftDate && e.leftDate >= d)))
    .sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
  const dayStaff = useMemo(() => staffOn(date), [employees, date]); // eslint-disable-line react-hooks/exhaustive-deps
  const saved = byDate.get(date)?.marks || {};

  useEffect(() => { setDraft(byDate.get(date)?.marks || {}); }, [date]); // eslint-disable-line react-hooks/exhaustive-deps
  const dirty = !sameMarks(Object.fromEntries(Object.entries(draft).filter(([, v]) => v?.s)), Object.fromEntries(Object.entries(saved).filter(([, v]) => v?.s)));

  useEffect(() => {
    if (!leaveGuard || !dirty) return undefined;
    const guard = { leave: () => window.confirm(L("হাজিরা সেভ করা হয়নি। চলে যাবেন?", "Attendance is not saved. Leave anyway?")), back: () => false };
    leaveGuard.current = guard;
    return () => { if (leaveGuard.current === guard) leaveGuard.current = null; };
  });

  const setMark = (id, patch) => setDraft((d) => {
    const next = { ...(d[id] || {}), ...patch };
    if (patch.in !== undefined || patch.out !== undefined) {
      const hrs = hoursBetween(next.in, next.out);
      if (hrs > 0 && !next.s) next.s = "P";
    }
    return { ...d, [id]: next };
  });
  const markAll = (s) => setDraft((d) => {
    const next = { ...d };
    dayStaff.forEach((e) => { if (!next[e.id]?.s || s === "H") next[e.id] = { ...(next[e.id] || {}), s }; });
    return next;
  });

  const saveDay = async () => {
    if (saving || !canManage) return;
    const marks = {};
    Object.entries(draft).forEach(([id, m]) => {
      if (!m?.s) return;
      marks[id] = { s: m.s, ...(m.in ? { in: m.in } : {}), ...(m.out ? { out: m.out } : {}), ...(n(m.ot) > 0 ? { ot: n(m.ot) } : {}), ...(m.note?.trim() ? { note: m.note.trim() } : {}) };
    });
    setSaving(true);
    const nowIso = new Date().toISOString();
    const existing = byDate.get(date);
    try {
      if (existing?.docIds?.length) {
        const id = existing.docIds[existing.docIds.length - 1];
        const raw = docs.find((d) => d.id === id) || {};
        const patch = { ...raw, marks, updatedAt: nowIso, updatedBy: user?.uid || "" };
        await offlineUpdate("attendance", id, patch);
        const others = existing.docIds.slice(0, -1);
        for (const oid of others) {
          const o = docs.find((d) => d.id === oid);
          if (o) await offlineUpdate("attendance", oid, { ...o, marks: {}, updatedAt: nowIso, updatedBy: user?.uid || "" });
        }
        setDocs((list) => list.map((d) => (d.id === id ? patch : others.includes(d.id) ? { ...d, marks: {}, updatedAt: nowIso } : d)));
      } else {
        const payload = { shopId, date, marks, createdBy: user?.uid || "", createdByName: profile?.personName || "", createdAt: nowIso, updatedAt: nowIso, updatedBy: user?.uid || "" };
        const res = await offlineCreate("attendance", payload);
        setDocs((list) => [...list, { ...payload, id: res.documentId }]);
      }
      toast?.(L(`✅ ${fmtDay(date)} এর হাজিরা সেভ হয়েছে`, `✅ Attendance for ${fmtDay(date)} saved`));
      if (navigator.onLine) window.S4Offline?.syncNow?.().catch(() => {});
    } catch (e) {
      toast?.(`❌ ${e?.message || e}`, "err");
    } finally {
      setSaving(false);
    }
  };

  const shiftDate = (days) => {
    if (dirty && !window.confirm(L("হাজিরা সেভ করা হয়নি। অন্য দিনে যাবেন?", "Attendance is not saved. Switch day anyway?"))) return;
    const d = new Date(`${date}T12:00:00`); d.setDate(d.getDate() + days); setDate(localDay(d));
  };
  const pickDate = (v) => {
    if (!v) return;
    if (dirty && !window.confirm(L("হাজিরা সেভ করা হয়নি। অন্য দিনে যাবেন?", "Attendance is not saved. Switch day anyway?"))) return;
    setDate(v);
  };

  const dates = useMemo(() => monthDates(month), [month]);
  const monthStaff = useMemo(() => staffOn(`${month}-${String(dates.length || 28).padStart(2, "0")}`).filter((e) => !e.leftDate || e.leftDate >= `${month}-01`), [employees, month, dates.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const paidByEmp = useMemo(() => wagesPaidByEmployee(expenses, shopId, month), [expenses, shopId, month]);
  const monthRows = useMemo(() => monthStaff.map((e) => {
    const sum = summarizeMonth(byDate, e.id, month, e.joinDate || "", e.status === "inactive" ? e.leftDate || "" : "");
    const pay = payableFor(e, sum, month);
    const paid = paidByEmp.get(e.id) || 0;
    return { e, sum, pay, paid, due: Math.round((pay.total - paid) * 100) / 100 };
  }), [monthStaff, byDate, month, paidByEmp]);

  const printMonth = () => {
    const cols = [{ label: "Employee" }, ...ATTENDANCE_STATUSES.map((s) => ({ label: s.key, align: "right" })), { label: "OT h", align: "right" }, { label: "Paid days", align: "right" }, { label: `Payable (${cur})`, align: "right" }, { label: `Paid (${cur})`, align: "right" }, { label: `Due (${cur})`, align: "right" }];
    const rows = monthRows.map(({ e, sum, pay, paid, due }) => [e.name, ...ATTENDANCE_STATUSES.map((s) => String(sum[s.key] || "")), sum.otHours ? String(sum.otHours) : "", String(sum.paidDays), money(pay.total), money(paid), money(due)]);
    const tot = monthRows.reduce((t, r) => ({ pay: t.pay + r.pay.total, paid: t.paid + r.paid, due: t.due + r.due }), { pay: 0, paid: 0, due: 0 });
    printWithSettings(generateStatementHTML({
      shopName, title: "ATTENDANCE REGISTER", subtitle: month,
      partyLine: ATTENDANCE_STATUSES.map((s) => `${s.key} = ${s.en}`).join(" · "),
      cols, rows, foot: ["TOTAL", ...ATTENDANCE_STATUSES.map(() => ""), "", "", money(tot.pay), money(tot.paid), money(tot.due)],
    }), { lang });
  };

  const printDay = () => {
    const cols = [{ label: "Employee" }, { label: "Status" }, { label: "In" }, { label: "Out" }, { label: "Hours", align: "right" }, { label: "OT", align: "right" }, { label: "Note" }];
    const rows = dayStaff.map((e) => { const m = saved[e.id] || {}; return [e.name, statusInfo(m.s)?.en || "—", m.in || "", m.out || "", hoursBetween(m.in, m.out) || "", m.ot || "", m.note || ""]; });
    printWithSettings(generateStatementHTML({ shopName, title: "DAILY ATTENDANCE", subtitle: fmtDay(date), cols, rows }), { lang });
  };

  const counts = ATTENDANCE_STATUSES.map((s) => [s, dayStaff.filter((e) => draft[e.id]?.s === s.key).length]);
  const unmarked = dayStaff.filter((e) => !draft[e.id]?.s).length;

  const statusButtons = (e) => (
    <div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
      {ATTENDANCE_STATUSES.map((s) => {
        const on = draft[e.id]?.s === s.key;
        return (
          <button key={s.key} type="button" disabled={!canManage} title={bn ? s.bn : s.en} onClick={() => setMark(e.id, { s: on ? "" : s.key })}
            style={{ minWidth: 34, padding: "3px 6px", borderRadius: 6, fontWeight: 800, fontSize: 12, cursor: canManage ? "pointer" : "default", border: `1px solid ${s.color}`, background: on ? s.color : "#fff", color: on ? "#fff" : s.color }}>
            {s.key}
          </button>
        );
      })}
    </div>
  );

  const dayView = (
    <>
      <div className="si-toolbar">
        <button type="button" className="pm-btn-secondary" onClick={() => shiftDate(-1)}>◀</button>
        <input type="date" className="pm-input" style={{ width: 140 }} value={date} onChange={(e) => pickDate(e.target.value)} />
        <button type="button" className="pm-btn-secondary" onClick={() => shiftDate(1)}>▶</button>
        <button type="button" className="pm-btn-secondary" onClick={() => pickDate(localDay())}>{L("আজ", "Today")}</button>
        <span className="si-toolbar-gap" />
        {canManage && <button type="button" className="pm-btn-secondary" onClick={() => markAll("P")}>✔ {L("বাকি সবাই উপস্থিত", "Rest all present")}</button>}
        {canManage && <button type="button" className="pm-btn-secondary" onClick={() => markAll("H")}>🏖️ {L("আজ সবার ছুটি", "Holiday for all")}</button>}
        <button type="button" className="pm-btn-secondary" onClick={printDay} disabled={!dayStaff.length}>🖨️ {L("প্রিন্ট", "Print")}</button>
        {canManage && <button type="button" className="pm-btn pm-btn--primary" disabled={saving || !dirty} onClick={saveDay}>{saving ? L("সেভ হচ্ছে…", "Saving…") : `💾 ${L("হাজিরা সেভ", "Save attendance")}`}</button>}
      </div>
      <div className="si-kpis">
        {counts.map(([s, c]) => <div key={s.key} className="si-kpi"><span>{bn ? s.bn : s.en}</span><b style={{ color: s.color }}>{c}</b></div>)}
        <div className="si-kpi"><span>{L("বাকি", "Not marked")}</span><b style={{ color: unmarked ? "#b45309" : undefined }}>{unmarked}</b></div>
      </div>
      <div className="si-main is-all">
        <div className="si-box">
          {!dayStaff.length ? (
            <div className="si-empty">{employees.length ? L("এই তারিখে কোনো কর্মচারী কাজে ছিলেন না", "No employees on this date") : L("আগে Employees মাস্টারে কর্মচারী যোগ করুন", "Add employees in the Employees master first")}</div>
          ) : mobile ? dayStaff.map((e) => {
            const m = draft[e.id] || {};
            return (
              <div key={e.id} className="si-mrow" style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <div className="si-mrow-top"><span>👷 {e.name}</span><span style={{ color: statusInfo(m.s)?.color }}>{statusInfo(m.s) ? (bn ? statusInfo(m.s).bn : statusInfo(m.s).en) : "—"}</span></div>
                {statusButtons(e)}
                <div style={{ display: "flex", gap: 4 }}>
                  <input type="time" className="pm-input" disabled={!canManage} value={m.in || ""} onChange={(ev) => setMark(e.id, { in: ev.target.value })} />
                  <input type="time" className="pm-input" disabled={!canManage} value={m.out || ""} onChange={(ev) => setMark(e.id, { out: ev.target.value })} />
                  <input className="pm-input" inputMode="decimal" disabled={!canManage} placeholder="OT h" value={m.ot ?? ""} onChange={(ev) => setMark(e.id, { ot: ev.target.value })} style={{ width: 64 }} />
                </div>
              </div>
            );
          }) : (
            <table className="pm-table">
              <thead><tr>
                <th>{L("কর্মচারী", "Employee")}</th>
                <th style={{ width: 250 }}>{L("হাজিরা", "Status")}</th>
                <th style={{ width: 100 }}>{L("এসেছেন", "In")}</th>
                <th style={{ width: 100 }}>{L("গেছেন", "Out")}</th>
                <th style={{ width: 60 }} className="si-num">{L("ঘণ্টা", "Hours")}</th>
                <th style={{ width: 70 }} className="si-num">{L("ওভারটাইম", "OT h")}</th>
                <th>{L("নোট", "Note")}</th>
              </tr></thead>
              <tbody>
                {dayStaff.map((e) => {
                  const m = draft[e.id] || {};
                  const hrs = hoursBetween(m.in, m.out);
                  return (
                    <tr key={e.id}>
                      <td className="si-strong">{e.name}{e.designation ? <span style={{ color: "#64748b", fontWeight: 400 }}> · {e.designation}</span> : null}</td>
                      <td>{statusButtons(e)}</td>
                      <td><input type="time" className="pm-input" disabled={!canManage} value={m.in || ""} onChange={(ev) => setMark(e.id, { in: ev.target.value })} /></td>
                      <td><input type="time" className="pm-input" disabled={!canManage} value={m.out || ""} onChange={(ev) => setMark(e.id, { out: ev.target.value })} /></td>
                      <td className="si-num">{hrs || ""}</td>
                      <td><input className="pm-input" inputMode="decimal" disabled={!canManage} value={m.ot ?? ""} onChange={(ev) => setMark(e.id, { ot: ev.target.value })} style={{ textAlign: "right" }} /></td>
                      <td><input className="pm-input" disabled={!canManage} value={m.note || ""} onChange={(ev) => setMark(e.id, { note: ev.target.value })} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </>
  );

  const today = localDay();
  const monthView = (
    <>
      <div className="si-toolbar">
        <input type="month" className="pm-input" style={{ width: 150 }} value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} />
        <span className="si-toolbar-gap" />
        <button type="button" className="pm-btn-secondary" onClick={printMonth} disabled={!monthRows.length}>🖨️ {L("রেজিস্টার প্রিন্ট", "Print register")}</button>
      </div>
      <div className="si-hint" style={{ margin: "2px 4px" }}>
        {ATTENDANCE_STATUSES.map((s) => <span key={s.key} style={{ marginRight: 10 }}><b style={{ color: s.color }}>{s.key}</b> = {bn ? s.bn : s.en}</span>)}
        · {L("কোনো ঘরে চাপ দিলে সেই দিনের হাজিরা খুলবে", "Click a cell to open that day")}
      </div>
      <div className="si-main is-all">
        <div className="si-box" style={{ overflow: "auto" }}>
          {!monthRows.length ? <div className="si-empty">{L("এই মাসে কোনো কর্মচারী নেই", "No employees in this month")}</div> : (
            <table className="pm-table" style={{ minWidth: 900 }}>
              <thead><tr>
                <th style={{ position: "sticky", left: 0, background: "#f8fafc", minWidth: 130 }}>{L("কর্মচারী", "Employee")}</th>
                {dates.map((d) => <th key={d} style={{ width: 24, textAlign: "center", padding: "2px 1px", color: new Date(`${d}T12:00:00`).getDay() === 5 ? "#b91c1c" : undefined }}>{Number(d.slice(8))}</th>)}
                <th className="si-num">{L("কাজের দিন", "Paid days")}</th>
                <th className="si-num">OT</th>
                <th className="si-num">{L("পাওনা", "Payable")}</th>
                <th className="si-num">{L("দেওয়া", "Paid")}</th>
                <th className="si-num">{L("বাকি", "Due")}</th>
              </tr></thead>
              <tbody>
                {monthRows.map(({ e, sum, pay, paid, due }) => (
                  <tr key={e.id}>
                    <td className="si-strong" style={{ position: "sticky", left: 0, background: "#fff" }}>{e.name}</td>
                    {dates.map((d) => {
                      const s = statusInfo(byDate.get(d)?.marks?.[e.id]?.s);
                      const out = (e.joinDate && d < e.joinDate) || (e.status === "inactive" && e.leftDate && d > e.leftDate);
                      return (
                        <td key={d} onClick={() => { setDate(d); setView("day"); }} title={`${fmtDay(d)}${s ? ` · ${bn ? s.bn : s.en}` : ""}`}
                          style={{ textAlign: "center", padding: "2px 1px", cursor: "pointer", fontWeight: 800, fontSize: 11, color: s?.color || "#cbd5e1", background: out ? "#f1f5f9" : undefined }}>
                          {out ? "" : s ? s.key : d <= today ? "·" : ""}
                        </td>
                      );
                    })}
                    <td className="si-num">{sum.paidDays}</td>
                    <td className="si-num">{sum.otHours || ""}</td>
                    <td className="si-num" title={`${L("বেসিক", "Basic")} ${money(pay.basic)} + OT ${money(pay.ot)}`}>{money(pay.total)}</td>
                    <td className="si-num">{paid ? money(paid) : ""}</td>
                    <td className="si-num si-strong" style={{ color: due > 0 ? "#b91c1c" : "#15803d" }}>{money(due)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
      <div className="si-hint" style={{ margin: "2px 4px" }}>
        {L("পাওনা = মাসিক বেতন ÷ মাসের দিন × কাজের দিন + ওভারটাইম ঘণ্টা × রেট। \"দেওয়া\" আসে কর্মচারীর খরচ (Employee Expense) থেকে।", "Payable = monthly salary ÷ days in month × paid days + OT hours × rate. \"Paid\" comes from Employee Expenses for this month.")}
      </div>
    </>
  );

  return (
    <div ref={rootRef} className="si-root" style={fitH ? { height: fitH } : undefined}>
      <style>{PM_CSS}</style>
      <style>{SI_CSS}</style>
      <div className="pm-reference-title">
        <strong>🗓️ {L("হাজিরা খাতা", "Attendance Register")}</strong>
        <span>{view === "day" ? fmtDay(date) : month}</span>
      </div>
      <div className="si-pills" style={{ margin: "4px 0" }}>
        <button type="button" className={`pm-btn-secondary${view === "day" ? " is-active" : ""}`} onClick={() => setView("day")}>📝 {L("দৈনিক হাজিরা", "Daily marking")}</button>
        <button type="button" className={`pm-btn-secondary${view === "month" ? " is-active" : ""}`} onClick={() => { if (dirty && !window.confirm(L("হাজিরা সেভ করা হয়নি। চলে যাবেন?", "Attendance is not saved. Leave anyway?"))) return; setDraft(saved); setView("month"); }}>📅 {L("মাসিক রেজিস্টার", "Monthly register")}</button>
      </div>
      {view === "day" ? dayView : monthView}
    </div>
  );
}
