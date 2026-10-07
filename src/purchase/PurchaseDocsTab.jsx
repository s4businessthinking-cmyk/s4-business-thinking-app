import React, { useEffect, useRef, useState } from "react";
import { PM_CSS } from "../product-master/pmStyles";
import { SI_CSS, usePmFitHeight, usePmMobile } from "../sales-invoice/siSkin";
import ProductPicker from "../components/ProductPicker.jsx";
import { offlineCreate, offlinePatch, offlineRemove, offlineUpdate } from "../offline/offlineRepository";
import { subscribeShopCollection } from "../offline/realtimeSync";
import { printWithSettings } from "../print/printSettings.js";
import { generateStatementHTML } from "../print/printDesign.js";
import { logAudit } from "../utils/auditLog.js";
import { useEscapeKey } from "../components/WindowChrome.jsx";
import { orderLines, orderProgress, billOfReceipt, docTotals } from "./purchaseDocs.js";

const n2 = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const fq = (v) => String(parseFloat(n2(v).toFixed(4)));
const fm = (v) => n2(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const localDay = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const fmtDay = (d) => (d ? String(d).slice(0, 10).split("-").reverse().join("/") : "");
const costOf = (p) => n2(p?.landingCost) || n2(p?.averageCost);
const vatOf = (p) => String(p?.purchaseVat ?? p?.salesVat ?? "5");

const KIND = {
  po: {
    col: "purchaseOrders", noKey: "orderNo", dateKey: "orderDate", prefix: "PO", serial: "lastPOSerial", accent: "#1d4ed8",
    title: ["📋 পারচেজ অর্ডার", "📋 Purchase Order"], newBtn: ["নতুন অর্ডার", "New Order"], print: "PURCHASE ORDER",
    empty: ["এখনো কোনো পারচেজ অর্ডার নেই", "No purchase orders yet"],
    hint: ["সাপ্লায়ারকে মাল অর্ডার দিন — স্টক বদলায় না। মাল এলে 'মাল গ্রহণ' বা 'পারচেজ বিল' বানান।", "Order goods from a supplier — stock does not change. When goods arrive make a Goods Received note or a Purchase bill."],
  },
  grn: {
    col: "goodsReceipts", noKey: "grnNo", dateKey: "receiveDate", prefix: "GRN", serial: "lastGRSerial", accent: "#0f766e",
    title: ["📥 মাল গ্রহণ (Delivery Note Received)", "📥 Delivery Note (Received)"], newBtn: ["নতুন মাল গ্রহণ", "New Goods Received"], print: "GOODS RECEIVED NOTE",
    empty: ["এখনো কোনো মাল গ্রহণ নেই", "No goods received yet"],
    hint: ["সাপ্লায়ারের মাল এসেছে কিন্তু বিল আসেনি — এখানে লিখলে সাথে সাথে স্টকে যোগ হয়। বিল এলে 'পারচেজ বিল বানান' চাপুন।", "Goods arrived before the supplier's bill — stock goes up now. When the bill comes press 'Make Purchase Bill'."],
  },
};

const STATUS = {
  open: ["অপেক্ষায়", "Pending", "#0369a1"],
  partial: ["আংশিক এসেছে", "Partly received", "#a16207"],
  received: ["সব এসেছে", "Received", "#15803d"],
  closed: ["বন্ধ", "Closed", "#475569"],
  confirmed: ["স্টকে যোগ হয়েছে", "In stock", "#0f766e"],
  billed: ["বিল হয়েছে", "Billed", "#15803d"],
  cancelled: ["বাতিল", "Cancelled", "#6b7280"],
};

export default function PurchaseDocsTab({ kind = "po", lang = "en", shopId, user, profile, isOwner, canManage, products = [], vendors = [], toast, shopName = "", cur = "AED", makeNo, leaveGuard = null, incoming = null, onIncomingHandled, onMakePurchase, onMakeReceipt }) {
  const bn = lang === "bn";
  const L = (b, e) => (bn ? b : e);
  const K = KIND[kind];
  const T = (key) => K[key][bn ? 0 : 1];
  const isPO = kind === "po";

  const [rows, setRows] = useState([]);
  const [bills, setBills] = useState([]);
  const [receipts, setReceipts] = useState([]);
  const [view, setView] = useState("list");
  const [sel, setSel] = useState(null);
  const [editId, setEditId] = useState(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("active");
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({});
  const [lines, setLines] = useState([]);
  const mobile = usePmMobile();
  const rootRef = useRef(null);
  const fitH = usePmFitHeight(rootRef, mobile, view);

  useEffect(() => {
    if (!shopId) return undefined;
    const subs = [
      subscribeShopCollection({ collectionName: K.col, shopId, onRows: (list) => setRows(list || []) }),
      subscribeShopCollection({ collectionName: "purchaseInvoices", shopId, onRows: (list) => setBills(list || []) }),
      ...(isPO ? [subscribeShopCollection({ collectionName: "goodsReceipts", shopId, onRows: (list) => setReceipts(list || []) })] : []),
    ];
    return () => subs.forEach((u) => { try { u?.(); } catch { /* ignore */ } });
  }, [shopId, K.col, isPO]);

  const noOf = (r) => r?.[K.noKey] || "";
  const stateOf = (r) => {
    if (r.status === "cancelled") return "cancelled";
    if (isPO) return orderProgress(r, bills, receipts);
    return billOfReceipt(r, bills) ? "billed" : "confirmed";
  };
  const badge = (r) => {
    const [b, e, c] = STATUS[stateOf(r)] || STATUS.open;
    return <span className="si-badge" style={{ color: c }}>{bn ? b : e}</span>;
  };

  const emptyForm = () => ({ date: localDay(), extra: "", vendorId: "", vendorName: "", vendorMobile: "", note: "", purchaseOrderId: "", purchaseOrderNo: "" });
  const dirty = view === "form" && lines.length > 0;
  const leaveOk = () => !dirty || window.confirm(L("এটা সেভ হয়নি। তবুও চলে যাবেন?", "This is not saved. Leave anyway?"));
  const backToList = () => { if (leaveOk()) { setSel(null); setEditId(null); setView("list"); } };
  useEffect(() => {
    if (!leaveGuard || view === "list") return undefined;
    const guard = { leave: () => leaveOk(), back: () => { backToList(); return true; } };
    leaveGuard.current = guard;
    return () => { if (leaveGuard.current === guard) leaveGuard.current = null; };
  });
  useEscapeKey(backToList, { enabled: view !== "list", level: view === "form" ? 2 : 1 });

  const lineFromProduct = (p, qty = "", unitCost = null) => ({
    key: `${p.id}-${Date.now()}`, productId: p.id, name: p.name || "", code: p.code || p.barcode || "", brand: p.brand || "", unit: p.unit || "Pcs",
    qty: String(qty), unitCost: unitCost != null ? String(unitCost) : (costOf(p) ? String(costOf(p)) : ""), taxPerc: vatOf(p),
  });
  const openNew = () => { setForm(emptyForm()); setLines([]); setEditId(null); setView("form"); };
  const openEdit = (r) => {
    setForm({ date: r[K.dateKey] || localDay(), extra: isPO ? (r.expectedDate || "") : (r.supplierRef || ""), vendorId: r.vendorId || "", vendorName: r.vendorName || "", vendorMobile: r.vendorMobile || "", note: r.note || "", purchaseOrderId: r.purchaseOrderId || "", purchaseOrderNo: r.purchaseOrderNo || "" });
    setLines((r.items || []).map((it, i) => ({ key: `${it.productId || it.name}-${i}`, productId: it.productId || null, name: it.name || "", code: it.code || "", brand: it.brand || "", unit: it.unit || "Pcs", qty: String(it.qty ?? ""), unitCost: it.unitCost != null ? String(it.unitCost) : "", taxPerc: String(it.taxPerc ?? "5") })));
    setEditId(r.id); setView("form");
  };

  // A purchase order handed over to become a goods received note.
  useEffect(() => {
    if (!incoming?.doc || isPO) return;
    onIncomingHandled?.();
    const { doc, lines: src } = incoming;
    setForm({ ...emptyForm(), vendorId: doc.vendorId || "", vendorName: doc.vendorName || "", vendorMobile: doc.vendorMobile || "", purchaseOrderId: doc.id, purchaseOrderNo: doc.orderNo || "" });
    setLines((src || []).map((l, i) => ({ key: `${l.productId || l.name}-${i}`, productId: l.productId || null, name: l.name || "", code: l.code || "", brand: l.brand || "", unit: l.unit || "Pcs", qty: String(l.qty ?? ""), unitCost: l.unitCost != null ? String(l.unitCost) : "", taxPerc: String(l.taxPerc ?? "5") })));
    setEditId(null); setView("form");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incoming]);

  const setF = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const pickVendorByName = (name) => {
    const v = vendors.find((x) => String(x.vendorName || "").trim().toLowerCase() === String(name).trim().toLowerCase());
    setForm((f) => ({ ...f, vendorName: name, vendorId: v?.id || "", vendorMobile: v?.mobile || v?.vendorMobile || f.vendorMobile }));
  };
  const addProduct = (p) => setLines((ls) => [...ls, lineFromProduct(p, "1")]);
  const updLine = (key, patch) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const removeLine = (key) => setLines((ls) => ls.filter((l) => l.key !== key));

  const save = async () => {
    if (saving) return;
    if (!form.vendorName.trim()) return toast?.(L("❌ সাপ্লায়ারের নাম দিন", "❌ Enter the supplier"), "err");
    if (!form.date) return toast?.(L("❌ তারিখ দিন", "❌ Pick a date"), "err");
    const used = lines.filter((l) => n2(l.qty) > 0);
    if (!used.length) return toast?.(L("❌ অন্তত একটা পণ্য ও পরিমাণ দিন", "❌ Add at least one product with a quantity"), "err");
    const bad = used.find((l) => n2(l.unitCost) < 0 || n2(l.taxPerc) < 0);
    if (bad) return toast?.(L(`❌ "${bad.name}": দাম বা VAT মাইনাস হতে পারে না`, `❌ "${bad.name}": cost or VAT can't be negative`), "err");
    const items = used.map((l) => ({
      productId: l.productId || null, name: l.name, code: l.code || "", brand: l.brand || "", unit: l.unit || "Pcs", unitFactor: 1,
      qty: n2(l.qty), unitCost: n2(l.unitCost), taxPerc: n2(l.taxPerc),
      lineTotal: parseFloat((n2(l.qty) * n2(l.unitCost) * (1 + (isPO ? n2(l.taxPerc) : 0) / 100)).toFixed(2)),
    }));
    const totals = docTotals(items, isPO);
    setSaving(true);
    try {
      const nowIso = new Date().toISOString();
      const base = {
        shopId, [K.dateKey]: form.date, vendorId: form.vendorId || null, vendorName: form.vendorName.trim(), vendorMobile: String(form.vendorMobile || "").trim(),
        note: form.note.trim(), items, subtotal: totals.sub, totalTax: isPO ? totals.tax : 0, grandTotal: isPO ? totals.grand : totals.sub,
        ...(isPO ? { expectedDate: form.extra || "" } : { supplierRef: String(form.extra || "").trim(), ...(form.purchaseOrderId ? { purchaseOrderId: form.purchaseOrderId, purchaseOrderNo: form.purchaseOrderNo } : {}) }),
      };
      let saved;
      if (editId) {
        const prior = rows.find((r) => r.id === editId);
        const res = await offlineUpdate(K.col, editId, { ...prior, ...base, updatedAt: nowIso, updatedBy: user?.uid || "" });
        saved = { ...res.data, id: editId };
        setRows((list) => list.map((r) => (r.id === editId ? saved : r)));
        logAudit({ shopId, user, profile, action: "edit", collection: K.col, docId: editId, docNo: noOf(saved), amount: saved.grandTotal, note: saved.vendorName });
      } else {
        const no = await makeNo(K.serial, K.prefix, rows.map(noOf));
        const payload = { ...base, [K.noKey]: no, status: isPO ? "open" : "confirmed", createdAt: nowIso, createdBy: user?.uid || "", createdByName: profile?.personName || "" };
        const res = await offlineCreate(K.col, payload);
        saved = { ...res.data, id: res.documentId };
        setRows((list) => [saved, ...list.filter((r) => r.id !== saved.id)]);
        logAudit({ shopId, user, profile, action: "create", collection: K.col, docId: saved.id, docNo: no, amount: saved.grandTotal, note: saved.vendorName });
      }
      toast?.(L(`✅ ${noOf(saved)} সেভ হয়েছে`, `✅ ${noOf(saved)} saved`));
      if (navigator.onLine) window.S4Offline?.syncNow?.().catch(() => {});
      setLines([]); setEditId(null); setSel(saved); setView("detail");
    } catch (e) {
      toast?.(`❌ ${e?.message || e}`, "err");
    } finally {
      setSaving(false);
    }
  };

  const mine = (r) => isOwner || (canManage && r.createdBy === user?.uid);
  const setStatus = async (r, status, msg) => {
    try {
      const nowIso = new Date().toISOString();
      const patch = { status, updatedAt: nowIso, updatedBy: user?.uid || "", ...(status === "cancelled" ? { cancelledAt: nowIso, cancelledBy: user?.uid || "" } : {}) };
      await offlinePatch(K.col, r.id, patch, r);
      const updated = { ...r, ...patch };
      setRows((list) => list.map((x) => (x.id === r.id ? updated : x)));
      setSel(updated);
      if (status === "cancelled") logAudit({ shopId, user, profile, action: "cancel", collection: K.col, docId: r.id, docNo: noOf(r), amount: r.grandTotal, note: r.vendorName });
      toast?.(msg, status === "cancelled" ? "err" : undefined);
      if (navigator.onLine) window.S4Offline?.syncNow?.().catch(() => {});
    } catch (e) {
      toast?.(`❌ ${e?.message || e}`, "err");
    }
  };
  const remove = async (r) => {
    if (!window.confirm(L(`${noOf(r)} একেবারে মুছে ফেলবেন?`, `Delete ${noOf(r)} permanently?`))) return;
    try {
      await offlineRemove(K.col, r.id);
      setRows((list) => list.filter((x) => x.id !== r.id));
      logAudit({ shopId, user, profile, action: "delete", collection: K.col, docId: r.id, docNo: noOf(r) });
      toast?.(L("🗑️ মুছে ফেলা হয়েছে", "🗑️ Deleted"), "err");
      setSel(null); setView("list");
      if (navigator.onLine) window.S4Offline?.syncNow?.().catch(() => {});
    } catch (e) {
      toast?.(`❌ ${e?.message || e}`, "err");
    }
  };

  const linkedDocs = (r) => (isPO
    ? [...receipts.filter((g) => g.purchaseOrderId === r.id && g.status !== "cancelled").map((g) => ({ no: g.grnNo, date: g.receiveDate, what: L("মাল গ্রহণ", "Goods received") })),
      ...bills.filter((p) => p.purchaseOrderId === r.id && p.status !== "cancelled").map((p) => ({ no: p.invoiceNo, date: p.invoiceDate, what: L("পারচেজ বিল", "Purchase bill") }))]
    : (() => { const b = billOfReceipt(r, bills); return b ? [{ no: b.invoiceNo, date: b.invoiceDate, what: L("পারচেজ বিল", "Purchase bill") }] : []; })());

  const print = (r) => {
    const showCost = isPO || (r.items || []).some((it) => n2(it.unitCost) > 0);
    const cols = [{ label: "#" }, { label: "Item" }, { label: "Qty", align: "right" }, { label: "Unit" }, ...(showCost ? [{ label: "Rate", align: "right" }, { label: "Amount", align: "right" }] : [])];
    const body = (r.items || []).map((it, i) => [String(i + 1), [it.name, it.code].filter(Boolean).join(" · "), fq(it.qty), it.unit || "", ...(showCost ? [fm(it.unitCost), fm(n2(it.qty) * n2(it.unitCost))] : [])]);
    const t = docTotals(r.items || [], isPO);
    const foot = showCost ? ["", isPO ? `Subtotal ${fm(t.sub)} · VAT ${fm(t.tax)}` : "", "", "", "TOTAL", `${cur} ${fm(isPO ? t.grand : t.sub)}`] : null;
    const subtitle = [noOf(r), fmtDay(r[K.dateKey]), r.vendorName, isPO && r.expectedDate ? `Expected ${fmtDay(r.expectedDate)}` : "", !isPO && r.supplierRef ? `Supplier DN ${r.supplierRef}` : "", r.purchaseOrderNo ? `PO ${r.purchaseOrderNo}` : "", r.status === "cancelled" ? "CANCELLED" : ""].filter(Boolean).join(" · ");
    printWithSettings(generateStatementHTML({ shopName, title: K.print, subtitle, partyLine: r.note || "", cols, rows: body, foot }), { lang });
  };

  const shell = (titleLeft, titleRight, children) => (
    <div ref={rootRef} className="si-root" style={fitH ? { height: fitH } : undefined}>
      <style>{PM_CSS}</style>
      <style>{SI_CSS}</style>
      <div className="pm-reference-title"><strong style={{ color: K.accent }}>{titleLeft}</strong><span>{titleRight}</span></div>
      {children}
    </div>
  );

  if (view === "form") {
    const totals = docTotals(lines.map((l) => ({ qty: l.qty, unitCost: l.unitCost, taxPerc: l.taxPerc })), isPO);
    const activeVendors = vendors.filter((v) => !["inactive", "blocked"].includes(v.status || "active"));
    return shell(editId ? L("এডিট", "Edit") : T("newBtn"), T("title"), (
      <>
        <div className="si-body">
          <div className="si-hint" style={{ padding: "2px 4px" }}>💡 {T("hint")}</div>
          <fieldset className="pm-panel" style={{ margin: 0 }}>
            <legend className="pm-panel-legend">{L("তথ্য", "Details")}{form.purchaseOrderNo ? ` · PO ${form.purchaseOrderNo}` : ""}</legend>
            <div className={mobile ? "si-panel-body" : "si-grid2"} style={mobile ? undefined : { gridTemplateColumns: "140px minmax(220px,1fr) 160px minmax(0,1fr)", paddingTop: 3 }}>
              <div className="si-field"><span className="pm-label">{L("তারিখ", "Date")} *</span><input type="date" className="pm-input" value={form.date || ""} onChange={(e) => setF("date", e.target.value)} /></div>
              <div className="si-field"><span className="pm-label">{L("সাপ্লায়ার", "Supplier")} *</span>
                <input className="pm-input" list={`vendors-${kind}`} value={form.vendorName || ""} onChange={(e) => pickVendorByName(e.target.value)} placeholder={L("নাম লিখুন বা বাছুন", "Type or pick")} />
                <datalist id={`vendors-${kind}`}>{activeVendors.map((v) => <option key={v.id} value={v.vendorName} />)}</datalist>
              </div>
              {isPO
                ? <div className="si-field"><span className="pm-label">{L("কবে আসবে", "Expected on")}</span><input type="date" className="pm-input" value={form.extra || ""} onChange={(e) => setF("extra", e.target.value)} /></div>
                : <div className="si-field"><span className="pm-label">{L("সাপ্লায়ারের DN নং", "Supplier DN No")}</span><input className="pm-input" value={form.extra || ""} onChange={(e) => setF("extra", e.target.value)} /></div>}
              <div className="si-field"><span className="pm-label">{L("নোট", "Note")}</span><input className="pm-input" value={form.note || ""} onChange={(e) => setF("note", e.target.value)} /></div>
            </div>
          </fieldset>
          <fieldset className="pm-panel" style={{ margin: 0, flex: mobile ? undefined : 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
            <legend className="pm-panel-legend">{L("পণ্য", "Items")}</legend>
            <div className="si-panel-body" style={{ display: "flex", flexDirection: "column", gap: 4, minHeight: 0, flex: 1 }}>
              <ProductPicker products={products} onPick={addProduct} mobile={mobile} lang={lang} autoFocus={!mobile && !lines.length}
                placeholder={L("পণ্য যোগ করুন — নাম, কোড বা বারকোড…", "Add product — name, code or barcode…")} />
              <div className="si-box" style={{ flex: mobile ? undefined : 1, minHeight: 100 }}>
                {!lines.length && <div className="si-empty">{L("উপরে খুঁজে পণ্য যোগ করুন", "Search above and add products")}</div>}
                {lines.length > 0 && (
                  <table className="pm-table">
                    <thead><tr>
                      <th style={{ width: 26 }} className="si-center">#</th>
                      <th>{L("পণ্য", "Item")}</th>
                      <th style={{ width: mobile ? 64 : 90 }} className="si-num">{L("পরিমাণ", "Qty")}</th>
                      {!mobile && <th style={{ width: 60 }}>{L("একক", "Unit")}</th>}
                      <th style={{ width: mobile ? 74 : 100 }} className="si-num">{isPO ? L("দাম", "Rate") : L("দাম (ঐচ্ছিক)", "Rate (optional)")}</th>
                      {isPO && !mobile && <th style={{ width: 64 }} className="si-num">VAT %</th>}
                      {!mobile && <th style={{ width: 100 }} className="si-num">{L("মোট", "Amount")}</th>}
                      <th style={{ width: 28 }} />
                    </tr></thead>
                    <tbody>
                      {lines.map((l, i) => (
                        <tr key={l.key}>
                          <td className="si-center">{i + 1}</td>
                          <td className="si-strong" title={l.name}>{l.name}{l.code ? <span className="si-muted"> · {l.code}</span> : null}</td>
                          <td style={{ padding: "1px 2px" }}><input type="number" min="0" step="any" inputMode="decimal" className="pm-input" style={{ textAlign: "right" }} value={l.qty} onChange={(e) => updLine(l.key, { qty: e.target.value })} /></td>
                          {!mobile && <td>{l.unit}</td>}
                          <td style={{ padding: "1px 2px" }}><input type="number" min="0" step="any" inputMode="decimal" className="pm-input" style={{ textAlign: "right" }} value={l.unitCost} onChange={(e) => updLine(l.key, { unitCost: e.target.value })} /></td>
                          {isPO && !mobile && <td style={{ padding: "1px 2px" }}><input type="number" min="0" step="any" inputMode="decimal" className="pm-input" style={{ textAlign: "right" }} value={l.taxPerc} onChange={(e) => updLine(l.key, { taxPerc: e.target.value })} /></td>}
                          {!mobile && <td className="si-num">{fm(n2(l.qty) * n2(l.unitCost) * (1 + (isPO ? n2(l.taxPerc) : 0) / 100))}</td>}
                          <td className="si-center"><button type="button" className="pm-btn-secondary pm-btn--danger" style={{ minHeight: 17, padding: "0 5px" }} onClick={() => removeLine(l.key)}>✕</button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
              <div style={{ display: "flex", gap: 14, justifyContent: "flex-end", fontWeight: 700 }}>
                <span>{L("পণ্য", "Lines")}: {lines.length}</span>
                {isPO && <span>VAT: {fm(totals.tax)}</span>}
                <span style={{ color: K.accent }}>{L("মোট", "Total")}: {cur} {fm(isPO ? totals.grand : totals.sub)}</span>
              </div>
            </div>
          </fieldset>
        </div>
        <div className={`si-actions${mobile ? " si-sticky-actions" : ""}`}>
          <button type="button" className="pm-btn-secondary" disabled={saving} onClick={backToList}>← {L("তালিকা", "List")}</button>
          <span className="si-toolbar-gap" />
          <button type="button" className="pm-btn pm-btn--primary" disabled={saving || !lines.length} onClick={save}>
            {saving ? L("সেভ হচ্ছে…", "Saving…") : `💾 ${L("সেভ করুন", "Save")}`}
          </button>
        </div>
      </>
    ));
  }

  if (view === "detail" && sel) {
    const r = rows.find((x) => x.id === sel.id) || sel;
    const st = stateOf(r);
    const pl = isPO ? orderLines(r, bills, receipts) : (r.items || []);
    const remaining = isPO ? pl.filter((l) => l.remaining > 1e-9).map((l) => ({ ...l, qty: l.remaining })) : (r.items || []);
    const nothingIn = isPO ? pl.every((l) => l.received <= 1e-9) : st !== "billed";
    const live = r.status !== "cancelled";
    const canBill = canManage && live && (isPO ? ["open", "partial"].includes(st) && remaining.length > 0 : st === "confirmed");
    const links = linkedDocs(r);
    const t = docTotals(r.items || [], isPO);
    const forBill = (srcLines) => srcLines.map((l) => {
      const p = products.find((x) => x.id === l.productId);
      return { productId: l.productId, name: l.name, code: l.code, brand: l.brand, unit: l.unit, qty: l.qty, unitCost: n2(l.unitCost) > 0 ? l.unitCost : (costOf(p) || ""), taxPerc: isPO ? l.taxPerc : vatOf(p), salePrice: p?.vatInclusive || p?.mrp || p?.vatExclusive || "" };
    });
    return shell(<>{noOf(r)} {badge(r)}</>, T("title"), (
      <>
        <div className="si-body">
          <fieldset className="pm-panel" style={{ margin: 0 }}>
            <legend className="pm-panel-legend">{L("তথ্য", "Details")}</legend>
            <div className="si-panel-body" style={{ paddingTop: 3, display: "grid", gridTemplateColumns: mobile ? "1fr" : "1fr 1fr", gap: 4 }}>
              <div><b style={{ color: K.accent }}>{noOf(r)}</b> · {fmtDay(r[K.dateKey])}</div>
              <div>{L("সাপ্লায়ার", "Supplier")}: <b>{r.vendorName}</b>{r.vendorMobile ? ` · ${r.vendorMobile}` : ""}</div>
              {isPO && r.expectedDate && <div>{L("কবে আসবে", "Expected on")}: {fmtDay(r.expectedDate)}</div>}
              {!isPO && r.supplierRef && <div>{L("সাপ্লায়ারের DN নং", "Supplier DN No")}: {r.supplierRef}</div>}
              {r.purchaseOrderNo && <div>{L("পারচেজ অর্ডার", "Purchase Order")}: <b>{r.purchaseOrderNo}</b></div>}
              {r.note && <div className="si-muted">{r.note}</div>}
              <div className="si-muted">{L("লিখেছেন", "By")}: {r.createdByName || "—"}</div>
              {links.length > 0 && <div style={{ gridColumn: "1 / -1" }}>{L("যা হয়েছে", "Made from it")}: {links.map((d) => `${d.what} ${d.no} (${fmtDay(d.date)})`).join(" · ")}</div>}
            </div>
          </fieldset>
          <div className="si-box">
            <table className="pm-table">
              <thead><tr>
                <th style={{ width: 26 }} className="si-center">#</th>
                <th>{L("পণ্য", "Item")}</th>
                <th style={{ width: 80 }} className="si-num">{isPO ? L("অর্ডার", "Ordered") : L("এসেছে", "Received")}</th>
                {isPO && <th style={{ width: 80 }} className="si-num">{L("এসেছে", "Received")}</th>}
                {isPO && <th style={{ width: 80 }} className="si-num">{L("বাকি", "Pending")}</th>}
                <th style={{ width: 60 }}>{L("একক", "Unit")}</th>
                <th style={{ width: 90 }} className="si-num">{L("দাম", "Rate")}</th>
                <th style={{ width: 100 }} className="si-num">{L("মোট", "Amount")}</th>
              </tr></thead>
              <tbody>
                {pl.map((it, i) => (
                  <tr key={i}>
                    <td className="si-center">{i + 1}</td>
                    <td className="si-strong" title={it.name}>{it.name}{it.code ? <span className="si-muted"> · {it.code}</span> : null}</td>
                    <td className="si-num">{fq(it.qty)}</td>
                    {isPO && <td className="si-num" style={{ color: "#15803d" }}>{fq(it.received)}</td>}
                    {isPO && <td className="si-num si-strong" style={{ color: it.remaining > 0 ? "#b45309" : "#64748b" }}>{fq(it.remaining)}</td>}
                    <td>{it.unit || ""}</td>
                    <td className="si-num">{n2(it.unitCost) > 0 ? fm(it.unitCost) : "—"}</td>
                    <td className="si-num">{n2(it.unitCost) > 0 ? fm(n2(it.qty) * n2(it.unitCost)) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ display: "flex", gap: 14, justifyContent: "flex-end", fontWeight: 700, padding: 4 }}>
              {isPO && <span>VAT: {fm(t.tax)}</span>}
              <span style={{ color: K.accent }}>{L("মোট", "Total")}: {cur} {fm(isPO ? t.grand : t.sub)}</span>
            </div>
          </div>
        </div>
        <div className={`si-actions${mobile ? " si-sticky-actions" : ""}`}>
          <button type="button" className="pm-btn-secondary" onClick={backToList}>← {L("তালিকা", "List")}</button>
          <button type="button" className="pm-btn-secondary" onClick={() => print(r)}>🖨️ {L("প্রিন্ট", "Print")}</button>
          {canBill && isPO && onMakeReceipt && <button type="button" className="pm-btn" onClick={() => onMakeReceipt({ ...r, docNo: noOf(r) }, forBill(remaining))}>📥 {L("মাল গ্রহণ করুন", "Receive Goods")}</button>}
          {canBill && onMakePurchase && <button type="button" className="pm-btn pm-btn--primary" onClick={() => onMakePurchase(kind, { ...r, docNo: noOf(r) }, forBill(remaining))}>🧾 {L("পারচেজ বিল বানান", "Make Purchase Bill")}</button>}
          <span className="si-toolbar-gap" />
          {mine(r) && live && nothingIn && <button type="button" className="pm-btn-secondary" onClick={() => openEdit(r)}>✏️ {L("এডিট", "Edit")}</button>}
          {mine(r) && isPO && st === "partial" && <button type="button" className="pm-btn-secondary" onClick={() => { if (window.confirm(L("বাকি মাল আর আসবে না — অর্ডারটা বন্ধ করবেন?", "The rest will not come — close this order?"))) setStatus(r, "closed", L("অর্ডার বন্ধ হয়েছে", "Order closed")); }}>🔒 {L("বন্ধ করুন", "Close")}</button>}
          {mine(r) && isPO && r.status === "closed" && <button type="button" className="pm-btn-secondary" onClick={() => setStatus(r, "open", L("অর্ডার আবার খোলা হয়েছে", "Order reopened"))}>🔓 {L("আবার খুলুন", "Reopen")}</button>}
          {mine(r) && live && nothingIn && <button type="button" className="pm-btn-secondary pm-btn--danger" onClick={() => { if (window.confirm(L(`${noOf(r)} বাতিল করবেন?${isPO ? "" : " স্টক থেকে বাদ যাবে।"}`, `Cancel ${noOf(r)}?${isPO ? "" : " Its stock is taken back out."}`))) setStatus(r, "cancelled", L("🚫 বাতিল হয়েছে", "🚫 Cancelled")); }}>⛔ {L("বাতিল", "Cancel")}</button>}
          {!nothingIn && live && !isPO && <span className="si-hint">{L("বিল হয়ে গেছে — বদলাতে আগে পারচেজ বিল বাতিল করুন", "Already billed — cancel the purchase bill first to change it")}</span>}
          {isOwner && !live && <button type="button" className="pm-btn-secondary pm-btn--danger" onClick={() => remove(r)}>🗑️ {L("মুছুন", "Delete")}</button>}
        </div>
      </>
    ));
  }

  const sorted = [...rows].sort((a, b) => String(b[K.dateKey] || b.createdAt || "").localeCompare(String(a[K.dateKey] || a.createdAt || "")) || String(noOf(b)).localeCompare(String(noOf(a))));
  const withState = sorted.map((r) => ({ r, st: stateOf(r) }));
  const pendingStates = isPO ? ["open", "partial"] : ["confirmed"];
  const filtered = withState.filter(({ r, st }) => {
    if (filter === "active" && st === "cancelled") return false;
    if (filter === "pending" && !pendingStates.includes(st)) return false;
    const q = search.trim().toLowerCase();
    return !q || [noOf(r), r.vendorName, r.note, r.supplierRef, r.purchaseOrderNo, ...(r.items || []).map((it) => `${it.name} ${it.code || ""}`)].join(" ").toLowerCase().includes(q);
  });
  const liveRows = withState.filter(({ st }) => st !== "cancelled");
  const pendingCount = withState.filter(({ st }) => pendingStates.includes(st)).length;
  const value = liveRows.reduce((t, { r }) => t + n2(r.grandTotal), 0);
  return shell(T("title"), `${liveRows.length} ${L("টি", "entries")}`, (
    <>
      <div className="si-toolbar">
        {canManage && <button type="button" className="pm-btn pm-btn--primary" onClick={openNew}>+ {T("newBtn")}</button>}
        <span className="si-toolbar-gap" />
        <div className="si-pills">
          {[["active", L("সব", "All")], ["pending", isPO ? L("বাকি আছে", "Pending") : L("বিল হয়নি", "Not billed")], ["cancelledToo", L("বাতিলসহ", "With cancelled")]].map(([k, label]) => (
            <button key={k} type="button" className={`pm-btn-secondary${filter === k ? " is-active" : ""}`} onClick={() => setFilter(k)}>{label}</button>
          ))}
        </div>
        <div className="si-search" style={{ minWidth: mobile ? "100%" : 240 }}>
          <input className="pm-input" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={L("নম্বর, সাপ্লায়ার বা পণ্য…", "Number, supplier or item…")} />
          {search && <button type="button" onClick={() => setSearch("")}>✕</button>}
        </div>
      </div>
      <div className="si-kpis">
        <div className="si-kpi"><span>{L("মোট", "Total")}</span><b>{liveRows.length}</b></div>
        <div className="si-kpi"><span>{isPO ? L("মাল বাকি", "Pending") : L("বিল হয়নি", "Not billed")}</span><b style={{ color: "#b45309" }}>{pendingCount}</b></div>
        <div className="si-kpi"><span>{L("মূল্য", "Value")}</span><b>{cur} {fm(value)}</b></div>
      </div>
      <div className="si-main is-all">
        <div className="si-box">
          {filtered.length > 0 && (mobile ? filtered.map(({ r }) => (
            <button key={r.id} type="button" className="si-mrow" onClick={() => { setSel(r); setView("detail"); }} style={r.status === "cancelled" ? { opacity: 0.6 } : undefined}>
              <div className="si-mrow-top"><span style={{ color: K.accent }}>{noOf(r)}</span>{badge(r)}</div>
              <div className="si-mrow-sub"><span>{fmtDay(r[K.dateKey])} · {r.vendorName}</span><span>{cur} {fm(r.grandTotal)}</span></div>
            </button>
          )) : (
            <table className="pm-table">
              <thead><tr>
                <th style={{ width: 80 }}>{L("তারিখ", "Date")}</th>
                <th style={{ width: 100 }}>{L("নম্বর", "No")}</th>
                <th>{L("সাপ্লায়ার", "Supplier")}</th>
                <th style={{ width: 110 }}>{isPO ? L("কবে আসবে", "Expected") : L("সাপ্লায়ার DN", "Supplier DN")}</th>
                <th style={{ width: 56 }} className="si-center">{L("লাইন", "Lines")}</th>
                <th style={{ width: 110 }} className="si-num">{L("মূল্য", "Value")}</th>
                <th style={{ width: 120 }} className="si-center">{L("অবস্থা", "Status")}</th>
              </tr></thead>
              <tbody>
                {filtered.map(({ r }) => (
                  <tr key={r.id} className="pm-clickable" onClick={() => { setSel(r); setView("detail"); }} style={r.status === "cancelled" ? { color: "#6b7280" } : undefined}>
                    <td>{fmtDay(r[K.dateKey])}</td>
                    <td className="si-strong" style={{ color: r.status === "cancelled" ? undefined : K.accent }}>{noOf(r)}</td>
                    <td title={r.vendorName}>{r.vendorName}</td>
                    <td>{isPO ? fmtDay(r.expectedDate) : (r.supplierRef || "")}</td>
                    <td className="si-center">{(r.items || []).length}</td>
                    <td className="si-num">{fm(r.grandTotal)}</td>
                    <td className="si-center">{badge(r)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ))}
          {!filtered.length && <div className="si-empty">{rows.length ? L("এই ফিল্টারে কিছু নেই", "Nothing matches") : T("empty")}</div>}
        </div>
      </div>
      <div className="si-statusbar">
        <span>{L("দেখাচ্ছে", "Showing")} <b>{filtered.length}</b> / {rows.length}</span>
        <span>{T("hint")}</span>
      </div>
    </>
  ));
}
