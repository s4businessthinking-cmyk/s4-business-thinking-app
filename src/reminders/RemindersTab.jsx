import { useEffect, useMemo, useRef, useState } from "react";
import { PM_CSS } from "../product-master/pmStyles";
import { SI_CSS, usePmFitHeight, usePmMobile } from "../sales-invoice/siSkin";
import { offlineCreate, offlinePatch, offlineRemove } from "../offline/offlineRepository";
import { subscribeShopCollection } from "../offline/realtimeSync";
import { REPEATS, addDays, canSee, donePatch, dueState, ymd } from "./reminders.js";

const ACCENT = "#db2777";
const emptyForm = () => ({ title: "", note: "", dueDate: ymd(new Date()), dueTime: "", repeat: "none", remindBefore: "0", assignedTo: "", private: false });
const STATE_STYLE = {
  overdue: { color: "#b91c1c", bn: "সময় পার", en: "Overdue" },
  today: { color: "#c2410c", bn: "আজ", en: "Today" },
  soon: { color: "#0369a1", bn: "আসছে", en: "Soon" },
  later: { color: "#475569", bn: "পরে", en: "Later" },
  done: { color: "#15803d", bn: "শেষ", en: "Done" },
};

export default function RemindersTab({ lang = "bn", shopId, user, profile, isOwner, team = [], toast }) {
  const L = (bn, en) => (lang === "bn" ? bn : en);
  const uid = user?.uid || "";
  const [rows, setRows] = useState([]);
  const [filter, setFilter] = useState("open");
  const [q, setQ] = useState("");
  const [form, setForm] = useState(null);
  const [editId, setEditId] = useState("");
  const [busy, setBusy] = useState(false);
  const mobile = usePmMobile();
  const rootRef = useRef(null);
  const fitH = usePmFitHeight(rootRef, mobile, form ? "form" : "list");
  const today = ymd(new Date());
  const nowTime = `${String(new Date().getHours()).padStart(2, "0")}:${String(new Date().getMinutes()).padStart(2, "0")}`;

  useEffect(() => {
    if (!shopId) return undefined;
    const unsub = subscribeShopCollection({ collectionName: "reminders", shopId, onRows: (list) => setRows(list || []) });
    return () => { try { unsub?.(); } catch { /* ignore */ } };
  }, [shopId]);

  const memberName = (id) => {
    const m = team.find((x) => (x.uid || x.id) === id);
    return m?.personName || m?.username || "";
  };
  const visible = useMemo(() => rows.filter((r) => canSee(r, uid)), [rows, uid]);
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return visible
      .map((r) => ({ r, state: dueState(r, today, nowTime) }))
      .filter(({ r, state }) => {
        if (filter === "open" && state === "done") return false;
        if (filter === "due" && !["overdue", "today", "soon"].includes(state)) return false;
        if (filter === "mine" && (state === "done" || (r.assignedTo && r.assignedTo !== uid && r.createdBy !== uid))) return false;
        if (filter === "done" && state !== "done") return false;
        return !needle || `${r.title} ${r.note || ""}`.toLowerCase().includes(needle);
      })
      .sort((a, b) => (a.state === "done") - (b.state === "done") || String(a.r.dueDate).localeCompare(String(b.r.dueDate)) || String(a.r.dueTime || "").localeCompare(String(b.r.dueTime || "")));
  }, [visible, filter, q, today, nowTime, uid]);
  const counts = useMemo(() => {
    const c = { overdue: 0, today: 0, soon: 0, open: 0 };
    for (const r of visible) {
      const st = dueState(r, today, nowTime);
      if (st !== "done") c.open += 1;
      if (c[st] !== undefined) c[st] += 1;
    }
    return c;
  }, [visible, today, nowTime]);

  const canEdit = (r) => r.createdBy === uid || isOwner;
  const canMarkDone = (r) => canEdit(r) || !r.assignedTo || r.assignedTo === uid;
  const sync = () => { if (navigator.onLine) window.S4Offline?.syncNow?.().catch(() => {}); };

  const openNew = () => { setEditId(""); setForm(emptyForm()); };
  const openEdit = (r) => {
    setEditId(r.id);
    setForm({ title: r.title || "", note: r.note || "", dueDate: r.dueDate || today, dueTime: r.dueTime || "", repeat: r.repeat || "none", remindBefore: String(r.remindBefore || 0), assignedTo: r.assignedTo || "", private: !!r.private });
  };

  const save = async () => {
    if (!form.title.trim()) return toast?.(L("❌ কী মনে করাতে হবে লিখুন", "❌ Write what to remind"), "err");
    if (!form.dueDate) return toast?.(L("❌ তারিখ দিন", "❌ Pick a date"), "err");
    setBusy(true);
    try {
      const at = new Date().toISOString();
      const data = {
        title: form.title.trim(), note: form.note.trim(), dueDate: form.dueDate, dueTime: form.dueTime || "",
        repeat: form.repeat, remindBefore: Math.max(0, Math.min(60, parseInt(form.remindBefore, 10) || 0)),
        assignedTo: form.private ? "" : form.assignedTo, assignedToName: form.private ? "" : memberName(form.assignedTo), private: !!form.private,
        updatedAt: at, updatedBy: uid,
      };
      if (editId) {
        const r = rows.find((x) => x.id === editId);
        await offlinePatch("reminders", editId, { ...data, status: "open", snoozedUntil: "" }, r);
      } else {
        await offlineCreate("reminders", { ...data, shopId, status: "open", createdAt: at, createdBy: uid, createdByName: profile?.personName || "" });
      }
      toast?.(L("✅ রিমাইন্ডার সেভ হয়েছে", "✅ Reminder saved"));
      setForm(null); setEditId("");
      sync();
    } catch (e) {
      toast?.(`❌ ${e?.message || e}`, "err");
    } finally {
      setBusy(false);
    }
  };

  const markDone = async (r) => {
    try {
      const patch = donePatch(r, { uid, name: profile?.personName || "" });
      await offlinePatch("reminders", r.id, patch, r);
      toast?.(patch.status === "done" ? L("✅ শেষ হিসেবে রাখা হলো", "✅ Marked done") : L(`✅ হয়েছে — পরের বার ${patch.dueDate}`, `✅ Done — next on ${patch.dueDate}`));
      sync();
    } catch (e) { toast?.(`❌ ${e?.message || e}`, "err"); }
  };
  const snooze = async (r, days) => {
    try {
      const at = new Date().toISOString();
      await offlinePatch("reminders", r.id, { snoozedUntil: addDays(today, days), updatedAt: at, updatedBy: uid }, r);
      toast?.(L(`😴 ${days} দিন পরে আবার মনে করাবে`, `😴 Will remind again in ${days} day(s)`));
      sync();
    } catch (e) { toast?.(`❌ ${e?.message || e}`, "err"); }
  };
  const reopen = async (r) => {
    try {
      await offlinePatch("reminders", r.id, { status: "open", doneAt: "", updatedAt: new Date().toISOString(), updatedBy: uid }, r);
      sync();
    } catch (e) { toast?.(`❌ ${e?.message || e}`, "err"); }
  };
  const remove = async (r) => {
    if (!window.confirm(L(`"${r.title}" মুছে ফেলবেন?`, `Delete "${r.title}"?`))) return;
    try { await offlineRemove("reminders", r.id); sync(); } catch (e) { toast?.(`❌ ${e?.message || e}`, "err"); }
  };

  const fmt = (d) => String(d || "").slice(0, 10).split("-").reverse().join("/");
  const repeatLabel = (k) => (REPEATS.find((x) => x.key === k) || REPEATS[0])[lang] || "";
  const badge = (state) => <span className="si-badge" style={{ color: STATE_STYLE[state].color }}>{STATE_STYLE[state][lang] || STATE_STYLE[state].en}</span>;
  const actions = (r, state) => (
    <div style={{ display: "flex", gap: 4, flexWrap: "wrap", justifyContent: "flex-end" }}>
      {state !== "done" && canMarkDone(r) && <button type="button" className="pm-btn-secondary" onClick={(e) => { e.stopPropagation(); markDone(r); }}>✅ {L("হয়েছে", "Done")}</button>}
      {state !== "done" && (state === "overdue" || state === "today") && <button type="button" className="pm-btn-secondary" onClick={(e) => { e.stopPropagation(); snooze(r, 1); }}>😴 {L("কাল", "Tomorrow")}</button>}
      {state === "done" && canEdit(r) && <button type="button" className="pm-btn-secondary" onClick={(e) => { e.stopPropagation(); reopen(r); }}>↩️ {L("আবার খুলুন", "Reopen")}</button>}
      {canEdit(r) && <button type="button" className="pm-btn-secondary pm-btn--danger" onClick={(e) => { e.stopPropagation(); remove(r); }}>🗑️</button>}
    </div>
  );

  if (form) {
    const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
    return (
      <div ref={rootRef} className="si-root" style={fitH ? { height: fitH } : undefined}>
        <style>{PM_CSS}</style><style>{SI_CSS}</style>
        <div className="pm-reference-title"><strong style={{ color: ACCENT }}>{editId ? L("রিমাইন্ডার এডিট", "Edit reminder") : L("নতুন রিমাইন্ডার", "New reminder")}</strong><span>🔔 {L("রিমাইন্ডার", "Reminders")}</span></div>
        <div className="si-body">
          <fieldset className="pm-panel" style={{ margin: 0 }}>
            <legend className="pm-panel-legend">{L("কী মনে করাবে", "What to remind")}</legend>
            <div className="si-panel-body" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <input className="pm-input" autoFocus value={form.title} onChange={(e) => set("title", e.target.value)} placeholder={L("যেমন: দোকান ভাড়া দিতে হবে / ট্রেড লাইসেন্স নবায়ন", "e.g. Pay shop rent / renew trade licence")} />
              <textarea className="pm-input" rows={3} value={form.note} onChange={(e) => set("note", e.target.value)} placeholder={L("বিস্তারিত (ঐচ্ছিক)", "Details (optional)")} style={{ resize: "vertical", minHeight: 60 }} />
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                <label className="si-field" style={{ minWidth: 140 }}><span className="pm-label">{L("তারিখ", "Date")} *</span><input type="date" className="pm-input" value={form.dueDate} onChange={(e) => set("dueDate", e.target.value)} /></label>
                <label className="si-field" style={{ minWidth: 100 }}><span className="pm-label">{L("সময় (ঐচ্ছিক)", "Time (optional)")}</span><input type="time" className="pm-input" value={form.dueTime} onChange={(e) => set("dueTime", e.target.value)} /></label>
                <label className="si-field" style={{ minWidth: 120 }}><span className="pm-label">{L("পুনরাবৃত্তি", "Repeat")}</span>
                  <select className="pm-input" value={form.repeat} onChange={(e) => set("repeat", e.target.value)}>{REPEATS.map((r) => <option key={r.key} value={r.key}>{r[lang] || r.en}</option>)}</select>
                </label>
                <label className="si-field" style={{ minWidth: 120 }}><span className="pm-label">{L("কত দিন আগে জানাবে", "Notify days before")}</span><input type="number" min="0" max="60" className="pm-input" value={form.remindBefore} onChange={(e) => set("remindBefore", e.target.value)} /></label>
              </div>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
                {!form.private && (
                  <label className="si-field" style={{ minWidth: 180 }}><span className="pm-label">{L("কাকে মনে করাবে", "Remind whom")}</span>
                    <select className="pm-input" value={form.assignedTo} onChange={(e) => set("assignedTo", e.target.value)}>
                      <option value="">{L("সবাইকে (দোকানের সবাই)", "Everyone in the shop")}</option>
                      {team.filter((m) => m.status !== "disabled").map((m) => <option key={m.uid || m.id} value={m.uid || m.id}>{m.personName || m.username}</option>)}
                    </select>
                  </label>
                )}
                <label className="pm-check"><input type="checkbox" checked={form.private} onChange={(e) => set("private", e.target.checked)} /> 🔒 {L("শুধু আমি দেখব (প্রাইভেট)", "Only me (private)")}</label>
              </div>
            </div>
          </fieldset>
        </div>
        <div className={`si-actions${mobile ? " si-sticky-actions" : ""}`}>
          <button type="button" className="pm-btn-secondary" disabled={busy} onClick={() => { setForm(null); setEditId(""); }}>← {L("তালিকা", "List")}</button>
          <span className="si-toolbar-gap" />
          <button type="button" className="pm-btn pm-btn--primary" disabled={busy} onClick={save}>{busy ? L("সেভ হচ্ছে…", "Saving…") : `💾 ${L("সেভ", "Save")}`}</button>
        </div>
      </div>
    );
  }

  const filters = [["open", L("চলমান", "Open")], ["due", L("এখন দেখতে হবে", "Due now")], ["mine", L("আমার", "Mine")], ["done", L("শেষ", "Done")], ["all", L("সব", "All")]];
  return (
    <div ref={rootRef} className="si-root" style={fitH ? { height: fitH } : undefined}>
      <style>{PM_CSS}</style><style>{SI_CSS}</style>
      <div className="pm-reference-title"><strong style={{ color: ACCENT }}>🔔 {L("রিমাইন্ডার", "Reminders")}</strong><span>{counts.open} {L("টি চলমান", "open")}</span></div>
      <div className="si-toolbar">
        <button type="button" className="pm-btn pm-btn--primary" onClick={openNew}>+ {L("নতুন রিমাইন্ডার", "New reminder")}</button>
        <span className="si-toolbar-gap" />
        <div className="si-pills">
          {filters.map(([k, label]) => <button key={k} type="button" className={`pm-btn-secondary${filter === k ? " is-active" : ""}`} onClick={() => setFilter(k)}>{label}</button>)}
        </div>
      </div>
      <div className="si-kpis">
        <div className="si-kpi"><span>{L("সময় পার", "Overdue")}</span><b style={{ color: "#b91c1c" }}>{counts.overdue}</b></div>
        <div className="si-kpi"><span>{L("আজ", "Today")}</span><b style={{ color: "#c2410c" }}>{counts.today}</b></div>
        <div className="si-kpi"><span>{L("আসছে", "Soon")}</span><b style={{ color: "#0369a1" }}>{counts.soon}</b></div>
        <div className="si-kpi"><span>{L("চলমান", "Open")}</span><b>{counts.open}</b></div>
      </div>
      <div className="si-filters">
        <div className="si-search">
          <input className="pm-input" value={q} onChange={(e) => setQ(e.target.value)} placeholder={L("খুঁজুন…", "Search…")} />
          {q && <button type="button" onClick={() => setQ("")}>✕</button>}
        </div>
      </div>
      <div className="si-main is-all">
        <div className="si-box">
          {!shown.length && <div className="si-empty">{visible.length ? L("এই ফিল্টারে কিছু নেই", "Nothing here") : L("এখনো কোনো রিমাইন্ডার নেই। ভাড়া, লাইসেন্স নবায়ন, কাউকে ফোন করা — যা মনে রাখতে হবে লিখে রাখুন।", "No reminders yet. Rent, licence renewals, calls to make — note anything you must not forget.")}</div>}
          {shown.map(({ r, state }) => (
            <div key={r.id} className="si-mrow" style={{ cursor: canEdit(r) ? "pointer" : "default", opacity: state === "done" ? 0.65 : 1 }} onClick={() => canEdit(r) && openEdit(r)}>
              <div className="si-mrow-top">
                <span>{r.private ? "🔒 " : ""}{r.title}</span>
                {badge(state)}
              </div>
              <div className="si-mrow-sub">
                <span>📅 {fmt(r.dueDate)}{r.dueTime ? ` ${r.dueTime}` : ""}{r.repeat && r.repeat !== "none" ? ` · 🔁 ${repeatLabel(r.repeat)}` : ""}{r.assignedTo ? ` · 👤 ${r.assignedToName || memberName(r.assignedTo)}` : ""}</span>
                <span className="si-muted">{r.createdByName || ""}</span>
              </div>
              {r.note && <div className="si-mrow-sub"><span>{r.note}</span></div>}
              <div style={{ marginTop: 4 }}>{actions(r, state)}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
