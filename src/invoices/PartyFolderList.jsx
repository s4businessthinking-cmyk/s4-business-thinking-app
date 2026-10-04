import { useMemo } from "react";

const CASH_KEY = "__cash__";
const CASH_NAME_RE = /^(cash|cash customer|walk[- ]?in|ক্যাশ|নগদ)$/i;

const num = (v) => parseFloat(v) || 0;
const fmt = (v) => (Math.round(num(v) * 100) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dateOf = (inv) => String(inv.invoiceDate || inv.createdAt || "").slice(0, 10);

export function groupInvoicesByParty(invoices, { idField, nameField }) {
  const map = new Map();
  for (const inv of invoices) {
    const name = String(inv[nameField] || "").trim();
    const isCash = !name || CASH_NAME_RE.test(name);
    const key = isCash ? CASH_KEY : (inv[idField] ? `id:${inv[idField]}` : `nm:${name.toLowerCase()}`);
    let g = map.get(key);
    if (!g) {
      g = { key, name, isCash, invoices: [], total: 0, due: 0, lastDate: "" };
      map.set(key, g);
    }
    g.invoices.push(inv);
    if (inv.status !== "cancelled" && inv.status !== "draft") {
      g.total += num(inv.grandTotal);
      g.due += Math.max(0, num(inv.balanceDue));
    }
    const d = dateOf(inv);
    if (d > g.lastDate) { g.lastDate = d; if (name && !isCash) g.name = name; }
  }
  for (const g of map.values()) {
    g.invoices.sort((a, b) => dateOf(b).localeCompare(dateOf(a)) || String(b.invoiceNo || "").localeCompare(String(a.invoiceNo || "")));
  }
  return [...map.values()].sort((a, b) =>
    (a.isCash === b.isCash ? 0 : a.isCash ? -1 : 1) || b.lastDate.localeCompare(a.lastDate) || a.name.localeCompare(b.name));
}

function formatDay(d, lang) {
  if (!d) return lang === "bn" ? "তারিখ নেই" : "No date";
  const dt = new Date(`${d}T00:00:00`);
  if (Number.isNaN(dt.getTime())) return d;
  return dt.toLocaleDateString(lang === "bn" ? "bn-BD" : "en-GB", { day: "numeric", month: "short", year: "numeric", weekday: "short" });
}

export default function PartyFolderList({
  invoices, idField, nameField, openKey, onOpenKey, renderCard,
  lang, th, cur = "AED", accent = "#f97316", partyWord,
}) {
  const bn = lang === "bn";
  const groups = useMemo(() => groupInvoicesByParty(invoices, { idField, nameField }), [invoices, idField, nameField]);
  const open = openKey ? groups.find((g) => g.key === openKey) : null;
  const cashName = bn ? "💵 ক্যাশ (নাম ছাড়া)" : "💵 Cash (no name)";

  if (open) {
    const days = [];
    for (const inv of open.invoices) {
      const d = dateOf(inv);
      if (!days.length || days[days.length - 1].date !== d) days.push({ date: d, list: [] });
      days[days.length - 1].list.push(inv);
    }
    return (
      <div>
        <button onClick={() => onOpenKey(null)}
          style={{ display: "flex", alignItems: "center", gap: 6, background: "transparent", border: "none", color: accent, cursor: "pointer", fontSize: 13, fontWeight: 800, padding: "0 0 10px 0", fontFamily: "inherit" }}>
          ← {bn ? `সব ${partyWord}` : `All ${partyWord}`}
        </button>
        <div style={{ background: th.bgCard, border: `1px solid ${th.border}`, borderLeft: `4px solid ${accent}`, borderRadius: 12, padding: "10px 12px", marginBottom: 12 }}>
          <div style={{ fontSize: 16, fontWeight: 900, color: th.txtPrimary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {open.isCash ? cashName : `📁 ${open.name}`}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 14px", marginTop: 4, fontSize: 12, fontWeight: 700, color: th.txtMuted }}>
            <span>{bn ? `${open.invoices.length}টি ইনভয়েস` : `${open.invoices.length} invoices`}</span>
            <span>{bn ? "মোট" : "Total"}: <b style={{ color: th.txtPrimary }}>{cur} {fmt(open.total)}</b></span>
            {open.due > 0.01 && <span>{bn ? "বাকি" : "Due"}: <b style={{ color: "#ef4444" }}>{cur} {fmt(open.due)}</b></span>}
          </div>
        </div>
        {days.map((day) => (
          <div key={day.date || "none"}>
            <div style={{ fontSize: 11, fontWeight: 900, color: accent, textTransform: "uppercase", letterSpacing: 0.5, margin: "10px 2px 6px" }}>
              📅 {formatDay(day.date, lang)} · {day.list.length}
            </div>
            {day.list.map(renderCard)}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {groups.map((g) => (
        <button key={g.key} onClick={() => onOpenKey(g.key)}
          style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", boxSizing: "border-box", padding: "11px 12px", borderRadius: 12, border: `1px solid ${th.border}`, background: th.bgCard, cursor: "pointer", fontFamily: "inherit", textAlign: "left", color: th.txtPrimary }}>
          <span style={{ fontSize: 26, flexShrink: 0 }}>{g.isCash ? "💵" : "📁"}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {g.isCash ? cashName.replace(/^💵 /, "") : g.name}
            </div>
            <div style={{ fontSize: 11, fontWeight: 700, color: th.txtMuted, marginTop: 2 }}>
              {bn ? `${g.invoices.length}টি ইনভয়েস` : `${g.invoices.length} invoices`}
              {g.lastDate ? ` · ${bn ? "শেষ" : "last"} ${g.lastDate}` : ""}
            </div>
          </div>
          <div style={{ textAlign: "right", flexShrink: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 900 }}>{cur} {fmt(g.total)}</div>
            {g.due > 0.01 && <div style={{ fontSize: 11, fontWeight: 800, color: "#ef4444" }}>{bn ? "বাকি" : "Due"} {fmt(g.due)}</div>}
          </div>
          <span style={{ color: th.txtMuted, fontSize: 18 }}>›</span>
        </button>
      ))}
    </div>
  );
}

export function FolderToggle({ value, onChange, lang, th, accent = "#f97316" }) {
  const bn = lang === "bn";
  const opts = [
    { key: "folders", label: bn ? "📁 নাম অনুযায়ী" : "📁 By name" },
    { key: "all", label: bn ? "📋 সব ইনভয়েস" : "📋 All invoices" },
  ];
  return (
    <div style={{ display: "flex", gap: 0, marginBottom: 10, background: th.bgInp, borderRadius: 10, padding: 3 }}>
      {opts.map((o) => (
        <button key={o.key} onClick={() => onChange(o.key)}
          style={{ flex: 1, padding: "7px 8px", borderRadius: 8, border: "none", cursor: "pointer", fontFamily: "inherit", fontWeight: 800, fontSize: 12, background: value === o.key ? accent : "transparent", color: value === o.key ? "#fff" : th.txtMuted }}>
          {o.label}
        </button>
      ))}
    </div>
  );
}
