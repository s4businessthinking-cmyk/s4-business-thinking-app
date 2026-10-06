import React, { useEffect, useMemo, useState } from "react";
import { subscribeShopCollection } from "../offline/realtimeSync";
import { AUDIT_ACTIONS, AUDIT_COLLECTION_LABELS } from "../utils/auditLog.js";

const localDay = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const fmtWhen = (iso) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso || "");
  return `${localDay(d)} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

export default function AuditLogTab({ lang = "en", th, shopId, cur = "৳", isDesktop }) {
  const bn = lang === "bn";
  const L = (b, e) => (bn ? b : e);
  const [rows, setRows] = useState([]);
  const [search, setSearch] = useState("");
  const [action, setAction] = useState("all");
  const [coll, setColl] = useState("all");
  const [person, setPerson] = useState("all");
  const [from, setFrom] = useState(() => { const d = new Date(); d.setDate(d.getDate() - 30); return localDay(d); });
  const [to, setTo] = useState(localDay());
  const [limit, setLimit] = useState(200);

  useEffect(() => {
    if (!shopId) return undefined;
    const unsub = subscribeShopCollection({ collectionName: "auditLogs", shopId, onRows: (list) => setRows(list || []) });
    return () => { try { unsub?.(); } catch { /* ignore */ } };
  }, [shopId]);

  const people = useMemo(() => {
    const m = new Map();
    rows.forEach((r) => { if (r.byUid && !m.has(r.byUid)) m.set(r.byUid, r.byName || r.byUid); });
    return [...m.entries()];
  }, [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return [...rows]
      .filter((r) => {
        const day = localDay(new Date(r.createdAt));
        if (from && day < from) return false;
        if (to && day > to) return false;
        if (action !== "all" && r.action !== action) return false;
        if (coll !== "all" && r.collection !== coll) return false;
        if (person !== "all" && r.byUid !== person) return false;
        if (!q) return true;
        return [r.docNo, r.note, r.byName, r.collection].join(" ").toLowerCase().includes(q);
      })
      .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
  }, [rows, search, action, coll, person, from, to]);

  const counts = useMemo(() => {
    const c = { cancel: 0, delete: 0, edit: 0 };
    filtered.forEach((r) => { if (c[r.action] != null) c[r.action] += 1; });
    return c;
  }, [filtered]);

  const collLabel = (key) => (AUDIT_COLLECTION_LABELS[key]?.[bn ? "bn" : "en"]) || key;
  const actMeta = (key) => AUDIT_ACTIONS[key] || { bn: key, en: key, color: th.txtMuted };
  const money = (v) => (v == null ? "" : `${cur}${Number(v).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`);

  const card = { padding: 14, borderRadius: 14, background: th.bgCard, border: `1px solid ${th.border}` };
  const inp = { padding: "9px 10px", borderRadius: 10, border: `1px solid ${th.borderMid || th.border}`, background: th.bgInp, color: th.txtPrimary, fontFamily: "inherit", fontSize: 13, width: "100%", boxSizing: "border-box", outline: "none" };
  const lbl = { fontSize: 10.5, fontWeight: 800, color: th.txtMuted, marginBottom: 4, textTransform: "uppercase" };
  const head = { padding: "8px", fontSize: 11, fontWeight: 800, textTransform: "uppercase", color: "#fff", background: "#2854ad", textAlign: "left", whiteSpace: "nowrap" };
  const cell = { padding: "8px", fontSize: 12.5, color: th.txtPrimary, borderBottom: `1px solid ${th.border}`, verticalAlign: "top" };
  const pill = (key) => {
    const m = actMeta(key);
    return <span style={{ padding: "2px 9px", borderRadius: 20, fontSize: 11, fontWeight: 800, color: m.color, background: `${m.color}1f`, whiteSpace: "nowrap" }}>{bn ? m.bn : m.en}</span>;
  };
  const shown = filtered.slice(0, limit);

  return (
    <div style={{ maxWidth: isDesktop ? 1100 : 660, margin: "0 auto", padding: isDesktop ? "24px 28px 60px" : "18px 14px 60px" }}>
      <div style={{ fontSize: 16, fontWeight: 900, color: "#7c3aed", marginBottom: 4 }}>🕵️ {L("অডিট লগ", "Audit Log")}</div>
      <div style={{ fontSize: 12, color: th.txtMuted, marginBottom: 12 }}>{L("কে কখন কী বাতিল, মুছে বা এডিট করেছে — এটা কেউ বদলাতে বা মুছতে পারে না।", "Who cancelled, deleted or edited what, and when. Nobody can change or delete these entries.")}</div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8, marginBottom: 10 }}>
        {[["cancel", counts.cancel], ["delete", counts.delete], ["edit", counts.edit]].map(([k, v]) => (
          <div key={k} style={{ ...card, padding: "10px 12px" }}>
            <div style={{ fontSize: 11, color: th.txtMuted, fontWeight: 700 }}>{bn ? actMeta(k).bn : actMeta(k).en}</div>
            <div style={{ fontSize: 20, fontWeight: 900, color: actMeta(k).color }}>{v}</div>
          </div>
        ))}
      </div>

      <div style={{ ...card, padding: 10, marginBottom: 10, display: "grid", gridTemplateColumns: isDesktop ? "2fr 1fr 1fr 1fr 1fr 1fr" : "1fr 1fr", gap: 8 }}>
        <div style={{ gridColumn: isDesktop ? undefined : "1 / -1" }}><div style={lbl}>{L("খুঁজুন", "Search")}</div><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={L("নম্বর, নাম, নোট…", "Number, name, note…")} style={inp} /></div>
        <div><div style={lbl}>{L("কাজ", "Action")}</div>
          <select value={action} onChange={(e) => setAction(e.target.value)} style={inp}>
            <option value="all">{L("সব", "All")}</option>
            {Object.entries(AUDIT_ACTIONS).map(([k, m]) => <option key={k} value={k}>{bn ? m.bn : m.en}</option>)}
          </select>
        </div>
        <div><div style={lbl}>{L("ধরন", "Type")}</div>
          <select value={coll} onChange={(e) => setColl(e.target.value)} style={inp}>
            <option value="all">{L("সব", "All")}</option>
            {Object.keys(AUDIT_COLLECTION_LABELS).map((k) => <option key={k} value={k}>{collLabel(k)}</option>)}
          </select>
        </div>
        <div><div style={lbl}>{L("কে", "Who")}</div>
          <select value={person} onChange={(e) => setPerson(e.target.value)} style={inp}>
            <option value="all">{L("সবাই", "Everyone")}</option>
            {people.map(([uid, name]) => <option key={uid} value={uid}>{name}</option>)}
          </select>
        </div>
        <div><div style={lbl}>{L("থেকে", "From")}</div><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={inp} /></div>
        <div><div style={lbl}>{L("পর্যন্ত", "To")}</div><input type="date" value={to} onChange={(e) => setTo(e.target.value)} style={inp} /></div>
      </div>

      {isDesktop ? (
        <div style={{ ...card, padding: 0, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr>
              <th style={head}>{L("সময়", "When")}</th>
              <th style={head}>{L("কে", "Who")}</th>
              <th style={head}>{L("কাজ", "Action")}</th>
              <th style={head}>{L("ধরন", "Type")}</th>
              <th style={head}>{L("নম্বর", "No.")}</th>
              <th style={{ ...head, textAlign: "right" }}>{L("টাকা", "Amount")}</th>
              <th style={head}>{L("বিস্তারিত", "Details")}</th>
            </tr></thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.id}>
                  <td style={{ ...cell, whiteSpace: "nowrap" }}>{fmtWhen(r.createdAt)}</td>
                  <td style={cell}><b>{r.byName || "—"}</b>{r.byRole ? <div style={{ fontSize: 11, color: th.txtMuted }}>{r.byRole}</div> : null}</td>
                  <td style={cell}>{pill(r.action)}</td>
                  <td style={cell}>{collLabel(r.collection)}</td>
                  <td style={{ ...cell, fontWeight: 800 }}>{r.docNo || "—"}</td>
                  <td style={{ ...cell, textAlign: "right", whiteSpace: "nowrap" }}>{money(r.amount)}</td>
                  <td style={{ ...cell, color: th.txtSecondary, overflowWrap: "anywhere" }}>{r.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!shown.length && <div style={{ textAlign: "center", color: th.txtMuted, padding: 30 }}>{L("কিছু পাওয়া যায়নি", "Nothing found")}</div>}
        </div>
      ) : (
        <div style={{ display: "grid", gap: 8 }}>
          {shown.map((r) => (
            <div key={r.id} style={{ ...card, padding: "11px 13px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
                <div style={{ fontWeight: 900, color: th.txtPrimary }}>{collLabel(r.collection)} {r.docNo ? `· ${r.docNo}` : ""}</div>
                {pill(r.action)}
              </div>
              <div style={{ fontSize: 12, color: th.txtMuted, marginTop: 4 }}>👤 {r.byName || "—"} · 🕒 {fmtWhen(r.createdAt)}{r.amount != null ? ` · ${money(r.amount)}` : ""}</div>
              {r.note && <div style={{ fontSize: 12.5, color: th.txtSecondary, marginTop: 4, overflowWrap: "anywhere" }}>{r.note}</div>}
            </div>
          ))}
          {!shown.length && <div style={{ ...card, textAlign: "center", color: th.txtMuted, padding: 30 }}>{L("কিছু পাওয়া যায়নি", "Nothing found")}</div>}
        </div>
      )}
      {filtered.length > limit && (
        <div style={{ textAlign: "center", marginTop: 10 }}>
          <button type="button" onClick={() => setLimit((n) => n + 200)} style={{ padding: "9px 16px", borderRadius: 10, border: `1px solid ${th.border}`, background: th.bgInp, color: th.txtPrimary, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>
            {L(`আরও দেখাও (${filtered.length - limit})`, `Show more (${filtered.length - limit})`)}
          </button>
        </div>
      )}
    </div>
  );
}
