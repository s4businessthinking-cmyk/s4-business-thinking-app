import React, { useEffect, useMemo, useRef, useState } from "react";
import { PM_CSS } from "../product-master/pmStyles";
import { SI_CSS, usePmFitHeight, usePmMobile } from "../sales-invoice/siSkin";
import { filterProducts, findExactProductMatch } from "../utils/productSearch.js";
import { offlineCreate, offlinePatch, offlineRemove } from "../offline/offlineRepository";
import { subscribeShopCollection } from "../offline/realtimeSync";
import { computeStockMap, loadInvoiceRows } from "../inventory/stockFromInvoices";
import { printWithSettings } from "../print/printSettings.js";
import { generateStatementHTML } from "../print/printDesign.js";
import { logAudit } from "../utils/auditLog.js";
import { useEscapeKey } from "../components/WindowChrome.jsx";
import { countDraftKey, countSheetRows, countSummary, groupValues } from "./stockCount.js";

function readCountDraft(shopId) {
  try { return JSON.parse(localStorage.getItem(countDraftKey(shopId)) || "null") || null; } catch { return null; }
}

const n2 = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const fq = (v) => String(parseFloat(n2(v).toFixed(4)));
const localDay = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export const ADJUST_REASONS = [
  { key: "count", bn: "গোনার পর কম/বেশি", en: "Stock count difference" },
  { key: "damaged", bn: "নষ্ট / ভাঙা", en: "Damaged" },
  { key: "lost", bn: "হারানো / চুরি", en: "Lost / Stolen" },
  { key: "expired", bn: "মেয়াদ শেষ", en: "Expired" },
  { key: "found", bn: "পাওয়া গেছে", en: "Found" },
  { key: "sample", bn: "স্যাম্পল / নিজের ব্যবহার", en: "Sample / Own use" },
  { key: "other", bn: "অন্যান্য", en: "Other" },
];

const ACCENT = "#0891b2";

export default function StockAdjustmentTab({ lang = "en", th, shopId, user, profile, isOwner, canManage, products = [], isDesktop, toast, shopName = "", makeNo, leaveGuard = null }) {
  const bn = lang === "bn";
  const L = (b, e) => (bn ? b : e);
  const reasonLabel = (key) => (ADJUST_REASONS.find((r) => r.key === key) || ADJUST_REASONS[ADJUST_REASONS.length - 1])[bn ? "bn" : "en"];

  const [rows, setRows] = useState([]);
  const [view, setView] = useState("list");
  const [sel, setSel] = useState(null);
  const [search, setSearch] = useState("");
  const [showCancelled, setShowCancelled] = useState(false);
  const [saving, setSaving] = useState(false);
  const [stockMap, setStockMap] = useState(null);

  const [date, setDate] = useState(localDay());
  const [reason, setReason] = useState("count");
  const [note, setNote] = useState("");
  const [prodQ, setProdQ] = useState("");
  const [lines, setLines] = useState([]);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [counted, setCounted] = useState({});
  const [countDate, setCountDate] = useState(localDay());
  const [countBy, setCountBy] = useState("");
  const [countVal, setCountVal] = useState("");
  const [countQ, setCountQ] = useState("");
  const [onlyInStock, setOnlyInStock] = useState(false);
  const [onlyDiff, setOnlyDiff] = useState(false);
  const [countLimit, setCountLimit] = useState(300);
  const mobile = usePmMobile();
  const rootRef = useRef(null);
  const fitH = usePmFitHeight(rootRef, mobile, view);

  useEffect(() => {
    if (view !== "count") return;
    try {
      const hasAny = Object.values(counted).some((v) => String(v ?? "").trim() !== "");
      if (hasAny) localStorage.setItem(countDraftKey(shopId), JSON.stringify({ date: countDate, counted, savedAt: new Date().toISOString() }));
      else localStorage.removeItem(countDraftKey(shopId));
    } catch { /* storage full or blocked */ }
  }, [view, counted, countDate, shopId]);

  useEffect(() => {
    if (!shopId) return undefined;
    const unsub = subscribeShopCollection({ collectionName: "stockAdjustments", shopId, onRows: (list) => setRows((list || []).filter((r) => !r.kind)) });
    return () => { try { unsub?.(); } catch { /* ignore */ } };
  }, [shopId]);

  const leaveOk = () => view !== "form" || !lines.length || window.confirm(L("এই সমন্বয় সেভ হয়নি। তবুও চলে যাবেন?", "This adjustment is not saved. Leave anyway?"));
  useEffect(() => {
    if (!leaveGuard || view === "list") return undefined;
    const guard = {
      leave: () => leaveOk(),
      back: () => { if (leaveOk()) { setSel(null); setView("list"); } return true; },
    };
    leaveGuard.current = guard;
    return () => { if (leaveGuard.current === guard) leaveGuard.current = null; };
  });
  useEscapeKey(() => { if (leaveOk()) { setSel(null); setView("list"); } }, { enabled: view !== "list", level: view === "form" ? 2 : 1 });

  useEffect(() => {
    if (view !== "form" && view !== "count") return undefined;
    let cancelled = false;
    loadInvoiceRows()
      .then((r) => { if (!cancelled) setStockMap(computeStockMap(products, r.purchaseInvoices, r.salesInvoices, shopId, r.deliveryNotes, r.extras)); })
      .catch((err) => console.warn("[S4 Adjust] stock load failed", err));
    return () => { cancelled = true; };
  }, [view, products, shopId, rows]);

  const sorted = useMemo(() => [...rows].sort((a, b) => String(b.adjustDate || b.createdAt || "").localeCompare(String(a.adjustDate || a.createdAt || ""))), [rows]);
  const filtered = sorted.filter((r) => {
    if (!showCancelled && r.status === "cancelled") return false;
    const day = String(r.adjustDate || r.createdAt || "").slice(0, 10);
    if ((from && day < from) || (to && day > to)) return false;
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return [r.adjustNo, r.note, reasonLabel(r.reason), ...(r.items || []).map((it) => `${it.name} ${it.code || ""}`)].join(" ").toLowerCase().includes(q);
  });

  const prodMatches = useMemo(() => {
    if (!prodQ.trim()) return [];
    const taken = new Set(lines.map((l) => l.productId));
    return filterProducts(products.filter((p) => p && !p.isDeleted && !p.deleted && p.name && !taken.has(p.id)), prodQ, { limit: 20 });
  }, [prodQ, products, lines]);

  const stockOf = (id) => (stockMap?.has(id) ? stockMap.get(id) : null);
  const addProduct = (p) => {
    setLines((ls) => [...ls, { productId: p.id, name: p.name || "", code: p.code || "", unit: p.unit || p.baseUnit || "Pcs", mode: "count", counted: "", direction: "out", qty: "" }]);
    setProdQ("");
  };
  const updLine = (id, patch) => setLines((ls) => ls.map((l) => (l.productId === id ? { ...l, ...patch } : l)));
  const resolved = (l) => {
    if (l.mode === "count") {
      if (String(l.counted).trim() === "") return null;
      const cur = stockOf(l.productId);
      if (cur == null) return null;
      const diff = parseFloat((n2(l.counted) - cur).toFixed(4));
      if (Math.abs(diff) < 1e-9) return { direction: "in", qty: 0 };
      return { direction: diff > 0 ? "in" : "out", qty: Math.abs(diff) };
    }
    return n2(l.qty) > 0 ? { direction: l.direction, qty: n2(l.qty) } : null;
  };

  const save = async () => {
    if (saving) return;
    if (!date) return toast?.(L("❌ তারিখ দিন", "❌ Pick a date"), "err");
    const counting = lines.filter((l) => l.mode === "count" && String(l.counted).trim() !== "");
    if (counting.length && !stockMap) return toast?.(L("⏳ স্টক এখনো লোড হচ্ছে, একটু পরে সেভ করুন", "⏳ Stock is still loading, save again in a moment"), "err");
    const negative = lines.find((l) => (l.mode === "count" ? n2(l.counted) < 0 : n2(l.qty) < 0));
    if (negative) return toast?.(L(`❌ "${negative.name}": সংখ্যা মাইনাস হতে পারে না`, `❌ "${negative.name}": quantity can't be negative`), "err");
    const built = lines.map((l) => ({ l, r: resolved(l) })).filter(({ r }) => r && r.qty > 0);
    if (!built.length) return toast?.(L("❌ অন্তত একটা পণ্যের কম/বেশি লিখুন", "❌ Enter a change for at least one product"), "err");
    setSaving(true);
    try {
      const adjustNo = await makeNo("lastSASerial", "SA", rows.map((r) => r.adjustNo));
      const nowIso = new Date().toISOString();
      const payload = {
        shopId, adjustNo, adjustDate: date, reason, note: note.trim(), status: "confirmed",
        items: built.map(({ l, r }) => ({
          productId: l.productId, name: l.name, code: l.code, unit: l.unit, unitFactor: 1,
          direction: r.direction, qty: r.qty, stockBefore: stockOf(l.productId), countedQty: l.mode === "count" ? n2(l.counted) : null,
        })),
        createdAt: nowIso, createdBy: user?.uid || "", createdByName: profile?.personName || "",
      };
      const res = await offlineCreate("stockAdjustments", payload);
      const created = { ...res.data, id: res.documentId };
      logAudit({ shopId, user, profile, action: "create", collection: "stockAdjustments", docId: created.id, docNo: adjustNo, note: `${payload.items.length} item(s) · ${reasonLabel(reason)}` });
      setRows((list) => [created, ...list.filter((r) => r.id !== created.id)]);
      toast?.(L(`✅ ${adjustNo} সেভ হয়েছে`, `✅ ${adjustNo} saved`));
      if (navigator.onLine) window.S4Offline?.syncNow?.().catch(() => {});
      setSel(created); setView("detail");
    } catch (e) {
      toast?.(`❌ ${e?.message || e}`, "err");
    } finally {
      setSaving(false);
    }
  };

  const openCount = () => {
    const draft = readCountDraft(shopId);
    setCounted(draft?.counted || {});
    setCountDate(draft?.date || localDay());
    setCountQ(""); setOnlyDiff(false);
    if (draft?.counted && Object.keys(draft.counted).length) {
      toast?.(L(`📋 আগের অসমাপ্ত গণনা খোলা হলো (${Object.keys(draft.counted).length}টি পণ্য)`, `📋 Resumed the unfinished count (${Object.keys(draft.counted).length} items)`));
    }
    setView("count");
  };

  const saveCount = async () => {
    if (saving) return;
    if (!countDate) return toast?.(L("❌ তারিখ দিন", "❌ Pick a date"), "err");
    if (!stockMap) return toast?.(L("⏳ স্টক এখনো লোড হচ্ছে, একটু পরে সেভ করুন", "⏳ Stock is still loading, save again in a moment"), "err");
    const sum = countSummary(products, counted, stockOf);
    const negative = Object.entries(counted).find(([, v]) => String(v ?? "").trim() !== "" && n2(v) < 0);
    if (negative) return toast?.(L("❌ গোনা সংখ্যা মাইনাস হতে পারে না", "❌ Counted quantity can't be negative"), "err");
    if (!sum.entered) return toast?.(L("❌ অন্তত একটা পণ্যের গোনা সংখ্যা লিখুন", "❌ Enter the count for at least one product"), "err");
    if (!sum.diffs.length) {
      if (!window.confirm(L(`${sum.entered}টি পণ্য গোনা হয়েছে, সব সিস্টেমের সাথে মিলে গেছে — কোনো সমন্বয় লাগবে না। গণনাটা শেষ করে মুছে দেব?`, `${sum.entered} items counted and all match the system — no adjustment needed. Finish and clear this count?`))) return;
      setCounted({}); try { localStorage.removeItem(countDraftKey(shopId)); } catch { /* ignore */ }
      setView("list");
      return;
    }
    if (!window.confirm(L(
      `${sum.entered}টি পণ্য গোনা হয়েছে। ${sum.diffs.length}টিতে পার্থক্য: ${sum.short}টি কম, ${sum.extra}টি বেশি। এগুলো একটা স্টক সমন্বয় হিসেবে সেভ হবে আর স্টক গোনা সংখ্যার সমান হয়ে যাবে। চালিয়ে যাবেন?`,
      `${sum.entered} items counted. ${sum.diffs.length} differ: ${sum.short} short, ${sum.extra} extra. They will be saved as one stock adjustment and stock will match the count. Continue?`
    ))) return;
    setSaving(true);
    try {
      const adjustNo = await makeNo("lastSASerial", "SA", rows.map((r) => r.adjustNo));
      const nowIso = new Date().toISOString();
      const payload = {
        shopId, adjustNo, adjustDate: countDate, reason: "count", physicalCount: true,
        note: L(`ফিজিক্যাল স্টক গণনা · ${sum.entered}টি পণ্য গোনা`, `Physical stock count · ${sum.entered} items counted`), status: "confirmed",
        countedItems: sum.entered,
        items: sum.diffs.map((d) => ({
          productId: d.product.id, name: d.product.name || "", code: d.product.code || "", unit: d.product.unit || d.product.baseUnit || "Pcs", unitFactor: 1,
          direction: d.diff > 0 ? "in" : "out", qty: Math.abs(d.diff), stockBefore: d.system, countedQty: d.counted,
        })),
        createdAt: nowIso, createdBy: user?.uid || "", createdByName: profile?.personName || "",
      };
      const res = await offlineCreate("stockAdjustments", payload);
      const created = { ...res.data, id: res.documentId };
      logAudit({ shopId, user, profile, action: "create", collection: "stockAdjustments", docId: created.id, docNo: adjustNo, note: `Physical count · ${payload.items.length} difference(s)` });
      setRows((list) => [created, ...list.filter((r) => r.id !== created.id)]);
      setCounted({}); try { localStorage.removeItem(countDraftKey(shopId)); } catch { /* ignore */ }
      toast?.(L(`✅ ${adjustNo} সেভ হয়েছে — স্টক গোনা সংখ্যার সাথে মিলিয়ে দেওয়া হলো`, `✅ ${adjustNo} saved — stock now matches the count`));
      if (navigator.onLine) window.S4Offline?.syncNow?.().catch(() => {});
      setSel(created); setView("detail");
    } catch (e) {
      toast?.(`❌ ${e?.message || e}`, "err");
    } finally {
      setSaving(false);
    }
  };

  const printCountSheet = (sheetRows, withNumbers) => {
    const cols = [{ label: "#" }, { label: "Item" }, { label: "Code" }, { label: "Rack" }, { label: "System", align: "right" }, { label: "Counted", align: "right" }, { label: "Diff", align: "right" }];
    const body = sheetRows.map((p, i) => {
      const sys = stockOf(p.id);
      const c = counted[p.id];
      const has = withNumbers && String(c ?? "").trim() !== "";
      const diff = has && sys != null ? parseFloat((n2(c) - sys).toFixed(4)) : null;
      return [String(i + 1), p.name || "", p.code || "", p.rackLocation || "", sys == null ? "—" : fq(sys), has ? fq(c) : "____________", diff == null ? "" : `${diff > 0 ? "+" : ""}${fq(diff)}`];
    });
    const subtitle = [countDate, countBy && countVal ? `${countVal}` : "", withNumbers ? "Count result" : "Blank count sheet"].filter(Boolean).join(" · ");
    printWithSettings(generateStatementHTML({ shopName, title: "PHYSICAL STOCK COUNT", subtitle, cols, rows: body }), { lang });
  };

  const canCancel = (r) => r.status !== "cancelled" && (isOwner || (canManage && r.createdBy === user?.uid));

  const cancelAdj = async (r) => {
    if (!canCancel(r)) return;
    if (!window.confirm(L(`${r.adjustNo} বাতিল করবেন? স্টক আগের মতো হয়ে যাবে।`, `Cancel ${r.adjustNo}? Stock goes back to before.`))) return;
    try {
      const nowIso = new Date().toISOString();
      const patch = { status: "cancelled", cancelledAt: nowIso, cancelledBy: user?.uid || "", updatedAt: nowIso, updatedBy: user?.uid || "" };
      await offlinePatch("stockAdjustments", r.id, patch, r);
      const updated = { ...r, ...patch };
      setRows((list) => list.map((x) => (x.id === r.id ? updated : x)));
      setSel((s) => (s?.id === r.id ? updated : s));
      logAudit({ shopId, user, profile, action: "cancel", collection: "stockAdjustments", docId: r.id, docNo: r.adjustNo });
      toast?.(L("🚫 বাতিল হয়েছে", "🚫 Cancelled"), "err");
      if (navigator.onLine) window.S4Offline?.syncNow?.().catch(() => {});
    } catch (e) {
      toast?.(`❌ ${e?.message || e}`, "err");
    }
  };

  const deleteAdj = async (r) => {
    if (!isOwner || r.status !== "cancelled") return;
    if (!window.confirm(L(`${r.adjustNo} একেবারে মুছে ফেলবেন?`, `Delete ${r.adjustNo} permanently?`))) return;
    try {
      await offlineRemove("stockAdjustments", r.id);
      setRows((list) => list.filter((x) => x.id !== r.id));
      logAudit({ shopId, user, profile, action: "delete", collection: "stockAdjustments", docId: r.id, docNo: r.adjustNo });
      toast?.(L("🗑️ মুছে ফেলা হয়েছে", "🗑️ Deleted"), "err");
      setSel(null); setView("list");
      if (navigator.onLine) window.S4Offline?.syncNow?.().catch(() => {});
    } catch (e) {
      toast?.(`❌ ${e?.message || e}`, "err");
    }
  };

  const print = (r) => {
    const cols = [{ label: "#" }, { label: "Item" }, { label: "Before", align: "right" }, { label: "Change", align: "right" }, { label: "Unit" }];
    const body = (r.items || []).map((it, i) => [String(i + 1), [it.name, it.code].filter(Boolean).join(" · "), it.stockBefore == null ? "—" : fq(it.stockBefore), `${it.direction === "out" ? "-" : "+"}${fq(it.qty)}`, it.unit || ""]);
    const subtitle = [r.adjustNo, r.adjustDate, reasonLabel(r.reason), r.note, r.status === "cancelled" ? "CANCELLED" : ""].filter(Boolean).join(" · ");
    printWithSettings(generateStatementHTML({ shopName, title: "STOCK ADJUSTMENT", subtitle, cols, rows: body }), { lang });
  };

  const fmtDay = (d) => (d ? String(d).slice(0, 10).split("-").reverse().join("/") : "");
  const backToList = () => { if (leaveOk()) { setSel(null); setView("list"); } };
  const openNew = () => { setDate(localDay()); setReason("count"); setNote(""); setLines([]); setProdQ(""); setView("form"); };
  const removeLine = (id) => setLines((ls) => ls.filter((x) => x.productId !== id));
  const onProdKey = (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const taken = new Set(lines.map((l) => l.productId));
    const exact = findExactProductMatch(products.filter((p) => p && !p.isDeleted && !taken.has(p.id)), { code: prodQ });
    const pick = exact || (prodMatches.length === 1 ? prodMatches[0] : null);
    if (pick) addProduct(pick);
    else if (lines.some((l) => findExactProductMatch([products.find((p) => p.id === l.productId)].filter(Boolean), { code: prodQ }))) {
      toast?.(L("এই পণ্য আগেই তালিকায় আছে", "This product is already in the list"));
      setProdQ("");
    }
  };
  const badge = (r) => (
    <span className="si-badge" style={{ color: r.status === "cancelled" ? "#6b7280" : ACCENT }}>
      {r.status === "cancelled" ? L("বাতিল", "Cancelled") : L("সম্পন্ন", "Done")}
    </span>
  );
  const vRow = (label, value, opts = {}) => (
    <div className="pm-form-row">
      <span className="pm-label">{label}</span>
      <div className={`si-val${opts.strong ? " is-strong" : ""}`} style={opts.color ? { color: opts.color } : undefined}>{value}</div>
    </div>
  );
  const changeText = (r) => (!r ? "—" : r.qty === 0 ? L("পরিবর্তন নেই", "No change") : `${r.direction === "out" ? "−" : "+"}${fq(r.qty)}`);
  const changeColor = (r) => (!r || r.qty === 0 ? "#64748b" : r.direction === "out" ? "#b91c1c" : "#15803d");
  const shell = (titleLeft, titleRight, children) => (
    <div ref={rootRef} className="si-root" style={fitH ? { height: fitH } : undefined}>
      <style>{PM_CSS}</style>
      <style>{SI_CSS}</style>
      <div className="pm-reference-title">
        <strong style={{ color: ACCENT }}>{titleLeft}</strong>
        <span>{titleRight}</span>
      </div>
      {children}
    </div>
  );

  if (view === "form") {
    const counting = lines.some((l) => l.mode === "count");
    const modeButtons = (l) => (
      <div className="si-pills" style={{ flexWrap: "nowrap" }}>
        <button type="button" className={`pm-btn-secondary${l.mode === "count" ? " is-active" : ""}`} onClick={() => updLine(l.productId, { mode: "count" })}>{L("গুনে পাওয়া", "Counted")}</button>
        <button type="button" className={`pm-btn-secondary${l.mode === "change" && l.direction === "out" ? " is-active" : ""}`} onClick={() => updLine(l.productId, { mode: "change", direction: "out" })}>− {L("কমান", "Reduce")}</button>
        <button type="button" className={`pm-btn-secondary${l.mode === "change" && l.direction === "in" ? " is-active" : ""}`} onClick={() => updLine(l.productId, { mode: "change", direction: "in" })}>+ {L("বাড়ান", "Add")}</button>
      </div>
    );
    const qtyInput = (l) => (l.mode === "count"
      ? <input type="number" min="0" step="any" inputMode="decimal" className="pm-input" value={l.counted} onChange={(e) => updLine(l.productId, { counted: e.target.value })} placeholder={L("আসলে কত আছে", "Actually there")} style={{ textAlign: "right" }} />
      : <input type="number" min="0" step="any" inputMode="decimal" className="pm-input" value={l.qty} onChange={(e) => updLine(l.productId, { qty: e.target.value })} placeholder={L("কতটা", "How many")} style={{ textAlign: "right" }} />);

    return shell(L("নতুন স্টক সমন্বয়", "New Stock Adjustment"), L("⚖️ স্টক সমন্বয়", "⚖️ Stock Adjustment"), (
      <>
        <div className="si-body">
          <fieldset className="pm-panel" style={{ margin: 0 }}>
            <legend className="pm-panel-legend">{L("তথ্য", "Details")}</legend>
            <div className={mobile ? "si-panel-body" : "si-grid2"} style={mobile ? undefined : { gridTemplateColumns: "140px 220px minmax(0,1fr)", paddingTop: 3 }}>
              <div className="si-field"><span className="pm-label">{L("তারিখ", "Date")} *</span><input type="date" className="pm-input" value={date} onChange={(e) => setDate(e.target.value)} /></div>
              <div className="si-field"><span className="pm-label">{L("কারণ", "Reason")}</span>
                <select className="pm-input" value={reason} onChange={(e) => setReason(e.target.value)}>{ADJUST_REASONS.map((r) => <option key={r.key} value={r.key}>{bn ? r.bn : r.en}</option>)}</select>
              </div>
              <div className="si-field"><span className="pm-label">{L("নোট", "Note")}</span><input className="pm-input" value={note} onChange={(e) => setNote(e.target.value)} /></div>
            </div>
          </fieldset>

          <fieldset className="pm-panel" style={{ margin: 0 }}>
            <legend className="pm-panel-legend">{L("পণ্য যোগ করুন", "Add product")}</legend>
            <div className="si-panel-body">
              <div className="si-search" style={{ position: "relative" }}>
                <input className="pm-input" value={prodQ} onChange={(e) => setProdQ(e.target.value)} onKeyDown={onProdKey} autoFocus={!mobile}
                  placeholder={L("নাম, কোড বা বারকোড লিখুন / স্ক্যান করুন…", "Type or scan name, code or barcode…")} />
              </div>
              {prodMatches.length > 0 && (
                <div className="si-box" style={{ maxHeight: mobile ? 260 : 170 }}>
                  {prodMatches.map((p) => (
                    <button key={p.id} type="button" className="si-mrow" style={{ display: "flex", justifyContent: "space-between", gap: 8, width: "100%", padding: mobile ? undefined : "3px 6px", border: 0, borderBottom: "1px solid #e2e8f0", background: "#fff", cursor: "pointer", font: "inherit", textAlign: "left" }} onClick={() => addProduct(p)}>
                      <span><b>{p.name}</b>{p.code ? <span className="si-muted"> · {p.code}</span> : null}{p.brand ? <span className="si-muted"> · {p.brand}</span> : null}</span>
                      <span style={{ color: ACCENT, fontWeight: 700, whiteSpace: "nowrap" }}>{stockOf(p.id) == null ? "…" : fq(stockOf(p.id))} {p.unit || ""}</span>
                    </button>
                  ))}
                </div>
              )}
              {prodQ.trim() && !prodMatches.length && <div className="si-muted">{L("কোনো পণ্য পাওয়া যায়নি", "No product found")}</div>}
            </div>
          </fieldset>

          <div className="si-box" style={{ flex: mobile ? undefined : 1, minHeight: 120 }}>
            {!lines.length && <div className="si-empty">{L("উপরে পণ্য খুঁজে যোগ করুন", "Search above and add products")}</div>}
            {lines.length > 0 && (mobile ? lines.map((l) => {
              const cur = stockOf(l.productId);
              const r = resolved(l);
              const after = cur == null || !r ? null : cur + (r.direction === "out" ? -r.qty : r.qty);
              return (
                <div key={l.productId} className="si-mrow" style={{ cursor: "default" }}>
                  <div className="si-mrow-top">
                    <span>{l.name}</span>
                    <button type="button" className="pm-btn-secondary pm-btn--danger" onClick={() => removeLine(l.productId)}>✕</button>
                  </div>
                  <div className="si-mrow-sub"><span>{l.code || ""}</span><span>{L("এখন", "Now")} <b>{cur == null ? "…" : fq(cur)}</b> {l.unit}</span></div>
                  <div style={{ marginTop: 4 }}>{modeButtons(l)}</div>
                  <div className="si-grid2" style={{ marginTop: 4, alignItems: "center" }}>
                    {qtyInput(l)}
                    <div style={{ textAlign: "right", fontWeight: 700, color: changeColor(r) }}>
                      {changeText(r)}
                      {after != null && r?.qty > 0 && <div className="si-muted" style={{ fontWeight: 400 }}>{L("পরে", "After")}: {fq(after)}</div>}
                    </div>
                  </div>
                </div>
              );
            }) : (
              <table className="pm-table">
                <thead><tr>
                  <th style={{ width: 28 }} className="si-center">#</th>
                  <th>{L("পণ্য", "Item")}</th>
                  <th style={{ width: 110 }}>{L("কোড", "Code")}</th>
                  <th style={{ width: 90 }} className="si-num">{L("এখন স্টক", "Stock now")}</th>
                  <th style={{ width: 210 }}>{L("ধরন", "Mode")}</th>
                  <th style={{ width: 100 }} className="si-num">{L("সংখ্যা", "Qty")}</th>
                  <th style={{ width: 90 }} className="si-num">{L("পরিবর্তন", "Change")}</th>
                  <th style={{ width: 80 }} className="si-num">{L("পরে", "After")}</th>
                  <th style={{ width: 30 }} />
                </tr></thead>
                <tbody>
                  {lines.map((l, i) => {
                    const cur = stockOf(l.productId);
                    const r = resolved(l);
                    const after = cur == null || !r ? null : cur + (r.direction === "out" ? -r.qty : r.qty);
                    return (
                      <tr key={l.productId} className={r?.qty > 0 ? "is-editing" : undefined}>
                        <td className="si-center">{i + 1}</td>
                        <td className="si-strong" title={l.name}>{l.name}</td>
                        <td>{l.code || ""}</td>
                        <td className="si-num">{cur == null ? "…" : fq(cur)} {l.unit}</td>
                        <td style={{ padding: "1px 2px" }}>{modeButtons(l)}</td>
                        <td style={{ padding: "1px 2px" }}>{qtyInput(l)}</td>
                        <td className="si-num si-strong" style={{ color: changeColor(r) }}>{changeText(r)}</td>
                        <td className="si-num" style={after != null && after < 0 ? { color: "#b91c1c", fontWeight: 700 } : undefined}>{after != null && r?.qty > 0 ? fq(after) : "—"}</td>
                        <td className="si-center"><button type="button" className="pm-btn-secondary pm-btn--danger" style={{ minHeight: 17, padding: "0 5px" }} onClick={() => removeLine(l.productId)}>✕</button></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ))}
          </div>
        </div>
        <div className={`si-actions${mobile ? " si-sticky-actions" : ""}`}>
          <button type="button" className="pm-btn-secondary" disabled={saving} onClick={backToList}>← {L("তালিকা", "List")}</button>
          {counting && !stockMap && <span className="si-hint">⏳ {L("স্টক লোড হচ্ছে…", "Loading stock…")}</span>}
          <span className="si-toolbar-gap" />
          <button type="button" className="pm-btn pm-btn--primary" disabled={saving || !lines.length || (counting && !stockMap)} onClick={save}>
            {saving ? L("সেভ হচ্ছে…", "Saving…") : `💾 ${L("সমন্বয় সেভ", "Save Adjustment")}`}
          </button>
        </div>
      </>
    ));
  }

  if (view === "count") {
    const groupOpts = countBy ? groupValues(products, countBy) : [];
    const sheetAll = countSheetRows(products, { by: countBy, value: countVal, q: countQ, onlyInStock, stockOf });
    const diffOf = (p) => {
      const c = counted[p.id];
      const sys = stockOf(p.id);
      if (String(c ?? "").trim() === "" || sys == null) return null;
      return parseFloat((n2(c) - sys).toFixed(4));
    };
    const sheet = onlyDiff ? sheetAll.filter((p) => { const d = diffOf(p); return d != null && Math.abs(d) > 1e-9; }) : sheetAll;
    const shown = sheet.slice(0, countLimit);
    const sum = countSummary(products, counted, stockOf);
    const setC = (id, v) => setCounted((c) => ({ ...c, [id]: v }));
    const diffCell = (p) => {
      const d = diffOf(p);
      if (d == null) return <span className="si-muted">—</span>;
      if (Math.abs(d) < 1e-9) return <span style={{ color: "#15803d", fontWeight: 700 }}>✓ {L("মিলেছে", "OK")}</span>;
      return <span style={{ color: d < 0 ? "#b91c1c" : "#15803d", fontWeight: 800 }}>{d > 0 ? "+" : "−"}{fq(Math.abs(d))}</span>;
    };
    const onCountKey = (e, idx) => {
      if (e.key !== "Enter" && e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
      e.preventDefault();
      const next = rootRef.current?.querySelector(`[data-count-idx="${idx + (e.key === "ArrowUp" ? -1 : 1)}"]`);
      if (next) { next.focus(); next.select?.(); }
    };
    const countInput = (p, idx) => (
      <input type="number" min="0" step="any" inputMode="decimal" className="pm-input" data-count-idx={idx}
        value={counted[p.id] ?? ""} onChange={(e) => setC(p.id, e.target.value)} onKeyDown={(e) => onCountKey(e, idx)}
        placeholder={L("গোনা", "Count")} style={{ textAlign: "right" }} />
    );

    return shell(L("📋 ফিজিক্যাল স্টক গণনা", "📋 Physical Stock Count"), L("⚖️ স্টক সমন্বয়", "⚖️ Stock Adjustment"), (
      <>
        <div className="si-toolbar">
          <input type="date" className="pm-input" style={{ width: 130 }} value={countDate} onChange={(e) => setCountDate(e.target.value)} />
          <select className="pm-input" style={{ width: mobile ? "calc(50% - 2px)" : 130 }} value={countBy} onChange={(e) => { setCountBy(e.target.value); setCountVal(""); }}>
            <option value="">{L("সব পণ্য", "All products")}</option>
            <option value="company">{L("কোম্পানি / ব্র্যান্ড ধরে", "By company / brand")}</option>
            <option value="category">{L("ক্যাটাগরি ধরে", "By category")}</option>
            <option value="rack">{L("র‍্যাক ধরে", "By rack")}</option>
          </select>
          {countBy && (
            <select className="pm-input" style={{ width: mobile ? "calc(50% - 2px)" : 170 }} value={countVal} onChange={(e) => setCountVal(e.target.value)}>
              <option value="">{L("— বেছে নিন —", "— Pick —")}</option>
              {groupOpts.map((g) => <option key={g} value={g}>{g}</option>)}
            </select>
          )}
          <div className="si-search" style={{ minWidth: 160, flex: 1 }}>
            <input className="pm-input" value={countQ} onChange={(e) => setCountQ(e.target.value)} placeholder={L("নাম, কোড বা বারকোড…", "Name, code or barcode…")} />
            {countQ && <button type="button" onClick={() => setCountQ("")}>✕</button>}
          </div>
          <label className="pm-check"><input type="checkbox" checked={onlyInStock} onChange={(e) => setOnlyInStock(e.target.checked)} /> {L("শুধু যেগুলোর স্টক আছে", "Only items in stock")}</label>
          <label className="pm-check"><input type="checkbox" checked={onlyDiff} onChange={(e) => setOnlyDiff(e.target.checked)} /> {L("শুধু পার্থক্য", "Only differences")}</label>
        </div>
        <div className="si-kpis">
          <div className="si-kpi"><span>{L("তালিকায়", "On sheet")}</span><b>{sheet.length}</b></div>
          <div className="si-kpi"><span>{L("গোনা হয়েছে", "Counted")}</span><b>{sum.entered}</b></div>
          <div className="si-kpi"><span>{L("কম পাওয়া", "Short")}</span><b style={{ color: "#b91c1c" }}>{sum.short}{sum.shortValue > 0 ? ` · ${fq(sum.shortValue)}` : ""}</b></div>
          <div className="si-kpi"><span>{L("বেশি পাওয়া", "Extra")}</span><b style={{ color: "#15803d" }}>{sum.extra}{sum.extraValue > 0 ? ` · ${fq(sum.extraValue)}` : ""}</b></div>
        </div>
        <div className="si-main is-all">
          <div className="si-box">
            {!stockMap && <div className="si-empty">⏳ {L("স্টক লোড হচ্ছে…", "Loading stock…")}</div>}
            {stockMap && !sheet.length && <div className="si-empty">{L("এই ফিল্টারে কোনো পণ্য নেই", "No products for this filter")}</div>}
            {stockMap && sheet.length > 0 && (mobile ? shown.map((p, idx) => (
              <div key={p.id} className="si-mrow" style={{ cursor: "default" }}>
                <div className="si-mrow-top"><span>{p.name}</span>{diffCell(p)}</div>
                <div className="si-mrow-sub"><span>{[p.code, p.rackLocation].filter(Boolean).join(" · ")}</span><span>{L("সিস্টেম", "System")} <b>{stockOf(p.id) == null ? "…" : fq(stockOf(p.id))}</b> {p.unit || ""}</span></div>
                <div style={{ marginTop: 4 }}>{countInput(p, idx)}</div>
              </div>
            )) : (
              <table className="pm-table">
                <thead><tr>
                  <th style={{ width: 36 }} className="si-center">#</th>
                  <th>{L("পণ্য", "Item")}</th>
                  <th style={{ width: 120 }}>{L("কোড", "Code")}</th>
                  <th style={{ width: 90 }}>{L("র‍্যাক", "Rack")}</th>
                  <th style={{ width: 100 }} className="si-num">{L("সিস্টেম স্টক", "System")}</th>
                  <th style={{ width: 120 }} className="si-num">{L("গুনে পাওয়া", "Counted")}</th>
                  <th style={{ width: 100 }} className="si-num">{L("পার্থক্য", "Difference")}</th>
                  <th style={{ width: 60 }}>{L("একক", "Unit")}</th>
                </tr></thead>
                <tbody>
                  {shown.map((p, idx) => (
                    <tr key={p.id} className={diffOf(p) ? "is-editing" : undefined}>
                      <td className="si-center">{idx + 1}</td>
                      <td className="si-strong" title={p.name}>{p.name}</td>
                      <td>{p.code || ""}</td>
                      <td>{p.rackLocation || ""}</td>
                      <td className="si-num">{stockOf(p.id) == null ? "…" : fq(stockOf(p.id))}</td>
                      <td style={{ padding: "1px 2px" }}>{countInput(p, idx)}</td>
                      <td className="si-num">{diffCell(p)}</td>
                      <td>{p.unit || ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ))}
            {sheet.length > shown.length && (
              <div style={{ padding: 8, textAlign: "center" }}>
                <button type="button" className="pm-btn-secondary" onClick={() => setCountLimit((x) => x + 300)}>
                  {L(`আরও দেখাও (${sheet.length - shown.length}টি বাকি)`, `Show more (${sheet.length - shown.length} left)`)}
                </button>
              </div>
            )}
          </div>
        </div>
        <div className={`si-actions${mobile ? " si-sticky-actions" : ""}`}>
          <button type="button" className="pm-btn-secondary" disabled={saving} onClick={backToList}>← {L("তালিকা", "List")}</button>
          <button type="button" className="pm-btn-secondary" disabled={!stockMap} onClick={() => printCountSheet(sheet, false)}>🖨️ {L("খালি গণনা শীট", "Blank count sheet")}</button>
          <button type="button" className="pm-btn-secondary" disabled={!stockMap || !sum.entered} onClick={() => printCountSheet(sheet, true)}>🖨️ {L("ফলাফল প্রিন্ট", "Print result")}</button>
          {sum.entered > 0 && (
            <button type="button" className="pm-btn-secondary pm-btn--danger" disabled={saving} onClick={() => {
              if (window.confirm(L("সব গোনা সংখ্যা মুছে নতুন করে শুরু করবেন?", "Clear all counted numbers and start over?"))) setCounted({});
            }}>🧹 {L("মুছে নতুন", "Clear")}</button>
          )}
          <span className="si-hint">💾 {L("গোনা সংখ্যা এই ডিভাইসে নিজে থেকে সেভ থাকে — পরে এসে বাকিটা গুনতে পারবেন", "Counts are kept on this device — you can come back and finish later")}</span>
          <span className="si-toolbar-gap" />
          <button type="button" className="pm-btn pm-btn--primary" disabled={saving || !stockMap || !sum.entered} onClick={saveCount}>
            {saving ? L("সেভ হচ্ছে…", "Saving…") : `✅ ${L(`গণনা শেষ — ${sum.diffs.length}টি পার্থক্য সমন্বয় করুন`, `Finish — adjust ${sum.diffs.length} difference(s)`)}`}
          </button>
        </div>
      </>
    ));
  }

  if (view === "detail" && sel) {
    const r = rows.find((x) => x.id === sel.id) || sel;
    const afterOf = (it) => (it.stockBefore == null ? null : n2(it.stockBefore) + (it.direction === "out" ? -n2(it.qty) : n2(it.qty)));
    return shell(<>{r.adjustNo} {badge(r)}</>, L("⚖️ স্টক সমন্বয়", "⚖️ Stock Adjustment"), (
      <>
        <div className="si-body">
          <fieldset className="pm-panel" style={{ margin: 0 }}>
            <legend className="pm-panel-legend">{L("তথ্য", "Details")}</legend>
            <div className={mobile ? "si-panel-body" : "si-cols"} style={{ paddingTop: 3 }}>
              <div className="si-panel-body" style={{ paddingTop: 0 }}>
                {vRow(L("নম্বর", "No"), r.adjustNo, { strong: true, color: ACCENT })}
                {vRow(L("তারিখ", "Date"), fmtDay(r.adjustDate))}
                {vRow(L("কারণ", "Reason"), reasonLabel(r.reason))}
              </div>
              <div className="si-panel-body" style={{ paddingTop: 0 }}>
                {vRow(L("নোট", "Note"), r.note || "—")}
                {vRow(L("লিখেছেন", "By"), r.createdByName || "—")}
                {r.status === "cancelled" && vRow(L("বাতিল", "Cancelled"), fmtDay(r.cancelledAt), { color: "#b91c1c" })}
              </div>
            </div>
          </fieldset>
          <div className="si-box">
            {mobile ? (r.items || []).map((it, i) => (
              <div key={i} className="si-mrow" style={{ cursor: "default" }}>
                <div className="si-mrow-top"><span>{i + 1}. {it.name}</span><span style={{ color: it.direction === "out" ? "#b91c1c" : "#15803d" }}>{it.direction === "out" ? "−" : "+"}{fq(it.qty)} {it.unit}</span></div>
                <div className="si-mrow-sub"><span>{it.code || ""}</span><span>{L("আগে", "Before")} <b>{it.stockBefore == null ? "—" : fq(it.stockBefore)}</b>{afterOf(it) != null ? <> → <b>{fq(afterOf(it))}</b></> : null}</span></div>
              </div>
            )) : (
              <table className="pm-table">
                <thead><tr>
                  <th style={{ width: 28 }} className="si-center">#</th>
                  <th>{L("পণ্য", "Item")}</th>
                  <th style={{ width: 120 }}>{L("কোড", "Code")}</th>
                  <th style={{ width: 90 }} className="si-num">{L("আগে", "Before")}</th>
                  <th style={{ width: 90 }} className="si-num">{L("গুনে পাওয়া", "Counted")}</th>
                  <th style={{ width: 90 }} className="si-num">{L("পরিবর্তন", "Change")}</th>
                  <th style={{ width: 90 }} className="si-num">{L("পরে", "After")}</th>
                  <th style={{ width: 60 }}>{L("একক", "Unit")}</th>
                </tr></thead>
                <tbody>
                  {(r.items || []).map((it, i) => (
                    <tr key={i}>
                      <td className="si-center">{i + 1}</td>
                      <td className="si-strong" title={it.name}>{it.name}</td>
                      <td>{it.code || ""}</td>
                      <td className="si-num">{it.stockBefore == null ? "—" : fq(it.stockBefore)}</td>
                      <td className="si-num">{it.countedQty == null ? "—" : fq(it.countedQty)}</td>
                      <td className="si-num si-strong" style={{ color: it.direction === "out" ? "#b91c1c" : "#15803d" }}>{it.direction === "out" ? "−" : "+"}{fq(it.qty)}</td>
                      <td className="si-num">{afterOf(it) == null ? "—" : fq(afterOf(it))}</td>
                      <td>{it.unit || ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
        <div className={`si-actions${mobile ? " si-sticky-actions" : ""}`}>
          <button type="button" className="pm-btn-secondary" onClick={backToList}>← {L("তালিকা", "List")}</button>
          <button type="button" className="pm-btn-secondary" onClick={() => print(r)}>🖨️ {L("প্রিন্ট", "Print")}</button>
          <span className="si-toolbar-gap" />
          {canCancel(r) && <button type="button" className="pm-btn-secondary pm-btn--danger" onClick={() => cancelAdj(r)}>⛔ {L("বাতিল করুন", "Cancel")}</button>}
          {isOwner && r.status === "cancelled" && <button type="button" className="pm-btn-secondary pm-btn--danger" onClick={() => deleteAdj(r)}>🗑️ {L("মুছুন", "Delete")}</button>}
        </div>
      </>
    ));
  }

  const today = localDay();
  const d0 = new Date();
  const monthStart = `${d0.getFullYear()}-${String(d0.getMonth() + 1).padStart(2, "0")}-01`;
  const quick = [
    ["all", L("সব", "All"), "", ""],
    ["today", L("আজ", "Today"), today, today],
    ["month", L("এই মাস", "This month"), monthStart, today],
    ["year", L("এই বছর", "This year"), `${d0.getFullYear()}-01-01`, today],
  ];
  const activeQuick = quick.find(([, , f, t]) => f === from && t === to)?.[0];
  const liveShown = filtered.filter((r) => r.status !== "cancelled");
  const sumDir = (dir) => liveShown.reduce((t, r) => t + (r.items || []).filter((it) => it.direction === dir).length, 0);
  const openDetail = (r) => { setSel(r); setView("detail"); };
  const itemSummary = (r) => `${(r.items || []).slice(0, 3).map((it) => `${it.name} ${it.direction === "out" ? "−" : "+"}${fq(it.qty)}`).join(" · ")}${(r.items || []).length > 3 ? ` +${r.items.length - 3}` : ""}`;

  return shell(L("⚖️ স্টক সমন্বয়", "⚖️ Stock Adjustment"), `${liveShown.length} ${L("টি", "entries")}`, (
    <>
      <div className="si-toolbar">
        {canManage && <button type="button" className="pm-btn pm-btn--primary" onClick={openNew}>+ {L("নতুন সমন্বয়", "New Adjustment")}</button>}
        {canManage && <button type="button" className="pm-btn-secondary" onClick={openCount}>📋 {L("ফিজিক্যাল স্টক গণনা", "Physical stock count")}{readCountDraft(shopId) ? " •" : ""}</button>}
        <span className="si-toolbar-gap" />
        <div className="si-pills">
          {quick.map(([key, label, f, t]) => (
            <button key={key} type="button" className={`pm-btn-secondary${activeQuick === key ? " is-active" : ""}`} onClick={() => { setFrom(f); setTo(t); }}>{label}</button>
          ))}
        </div>
        <input type="date" className="pm-input" style={{ width: mobile ? "calc(50% - 2px)" : 120 }} value={from} onChange={(e) => setFrom(e.target.value)} />
        <input type="date" className="pm-input" style={{ width: mobile ? "calc(50% - 2px)" : 120 }} value={to} onChange={(e) => setTo(e.target.value)} />
      </div>
      <div className="si-kpis">
        <div className="si-kpi"><span>{L("সমন্বয়", "Adjustments")}</span><b>{liveShown.length}</b></div>
        <div className="si-kpi"><span>{L("পণ্য লাইন", "Item lines")}</span><b>{liveShown.reduce((t, r) => t + (r.items || []).length, 0)}</b></div>
        <div className="si-kpi"><span>{L("কমানো লাইন", "Reduced lines")}</span><b style={{ color: "#b91c1c" }}>{sumDir("out")}</b></div>
        <div className="si-kpi"><span>{L("বাড়ানো লাইন", "Added lines")}</span><b style={{ color: "#15803d" }}>{sumDir("in")}</b></div>
      </div>
      <div className="si-filters">
        <div className="si-search">
          <input className="pm-input" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={L("নম্বর, কারণ, নোট বা পণ্য…", "Number, reason, note or item…")} />
          {search && <button type="button" onClick={() => setSearch("")}>✕</button>}
        </div>
        <label className="pm-check"><input type="checkbox" checked={showCancelled} onChange={(e) => setShowCancelled(e.target.checked)} /> {L("বাতিলগুলোও দেখাও", "Show cancelled")}</label>
      </div>
      <div className="si-main is-all">
        <div className="si-box">
          {mobile ? filtered.map((r) => (
            <button key={r.id} type="button" className="si-mrow" onClick={() => openDetail(r)} style={r.status === "cancelled" ? { opacity: 0.6 } : undefined}>
              <div className="si-mrow-top"><span style={{ color: ACCENT }}>{r.adjustNo}</span>{badge(r)}</div>
              <div className="si-mrow-sub"><span>{fmtDay(r.adjustDate)} · {reasonLabel(r.reason)}</span><span>{(r.items || []).length} {L("টি পণ্য", "items")}</span></div>
              <div className="si-mrow-sub"><span>{itemSummary(r)}</span></div>
            </button>
          )) : filtered.length > 0 && (
            <table className="pm-table">
              <thead><tr>
                <th style={{ width: 80 }}>{L("তারিখ", "Date")}</th>
                <th style={{ width: 90 }}>{L("নম্বর", "No")}</th>
                <th style={{ width: 170 }}>{L("কারণ", "Reason")}</th>
                <th>{L("পণ্য", "Items")}</th>
                <th style={{ width: 56 }} className="si-center">{L("লাইন", "Lines")}</th>
                <th style={{ width: 160 }}>{L("নোট", "Note")}</th>
                <th style={{ width: 100 }}>{L("লিখেছেন", "By")}</th>
                <th style={{ width: 76 }} className="si-center">{L("অবস্থা", "Status")}</th>
              </tr></thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.id} className="pm-clickable" onClick={() => openDetail(r)} style={r.status === "cancelled" ? { color: "#6b7280" } : undefined}>
                    <td>{fmtDay(r.adjustDate)}</td>
                    <td className="si-strong" style={{ color: r.status === "cancelled" ? undefined : ACCENT }}>{r.adjustNo}</td>
                    <td>{reasonLabel(r.reason)}</td>
                    <td title={itemSummary(r)}>{itemSummary(r)}</td>
                    <td className="si-center">{(r.items || []).length}</td>
                    <td title={r.note || ""}>{r.note || ""}</td>
                    <td>{r.createdByName || ""}</td>
                    <td className="si-center">{badge(r)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {!filtered.length && (
            <div className="si-empty">
              {rows.length ? L("এই ফিল্টারে কিছু নেই", "Nothing matches these filters") : L("এখনো কোনো সমন্বয় নেই", "No adjustments yet")}
            </div>
          )}
        </div>
      </div>
      <div className="si-statusbar">
        <span>{L("দেখাচ্ছে", "Showing")} <b>{filtered.length}</b> / {rows.length}</span>
        <span>{L("স্টক সমন্বয় করলে সাথে সাথে স্টকে যোগ/বিয়োগ হয়; বাতিল করলে আগের মতো হয়", "Adjustments change stock immediately; cancelling puts it back")}</span>
      </div>
    </>
  ));
}
