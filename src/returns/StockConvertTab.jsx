import React, { useEffect, useMemo, useRef, useState } from "react";
import { PM_CSS } from "../product-master/pmStyles";
import { SI_CSS, usePmFitHeight, usePmMobile } from "../sales-invoice/siSkin";
import ProductPicker from "../components/ProductPicker.jsx";
import { offlineCreate, offlinePatch, offlineRemove } from "../offline/offlineRepository";
import { subscribeShopCollection } from "../offline/realtimeSync";
import { computeStockMap, loadInvoiceRows } from "../inventory/stockFromInvoices";
import { printWithSettings } from "../print/printSettings.js";
import { generateStatementHTML } from "../print/printDesign.js";
import { logAudit } from "../utils/auditLog.js";
import { useEscapeKey } from "../components/WindowChrome.jsx";
import { buildConvertItems, lastRecipe, CONVERT_KINDS } from "./stockConvert.js";

const n2 = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const fq = (v) => String(parseFloat(n2(v).toFixed(4)));
const fm = (v) => n2(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const localDay = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const costOf = (p) => n2(p?.landingCost) || n2(p?.averageCost);

const TEXT = {
  loosen: {
    title: ["📦 পণ্য খোলা (Loosening)", "📦 Product Loosening"],
    newBtn: ["নতুন খোলা", "New Loosening"],
    single: ["যে পণ্য খুলবেন (stock থেকে বের হবে)", "Product to open (goes out of stock)"],
    multi: ["খুলে যা পাবেন (stock-এ ঢুকবে)", "What you get (comes into stock)"],
    per: ["প্রতি ১টিতে কত", "Per 1 opened"],
    hint: ["যেমন: ১ Box খুললে ১০ Pcs পাবেন — Box কমবে, Pcs বাড়বে", "e.g. open 1 Box to get 10 Pcs — Box goes down, Pcs goes up"],
    empty: ["এখনো কোনো পণ্য খোলা হয়নি", "No loosening yet"],
    print: "PRODUCT LOOSENING",
  },
  bundle: {
    title: ["🧰 পণ্য জোড়া / কিট (Bundling)", "🧰 Product Bundling"],
    newBtn: ["নতুন কিট বানান", "New Bundle"],
    single: ["যে কিট / সেট বানাবেন (stock-এ ঢুকবে)", "Kit / set to make (comes into stock)"],
    multi: ["কিটে যা যা লাগবে (stock থেকে বের হবে)", "Parts needed (go out of stock)"],
    per: ["প্রতি ১টি কিটে কত", "Per 1 kit"],
    hint: ["যেমন: ১টি Service Kit = ১ Filter + ৪ Litre Oil — পার্টস কমবে, কিট বাড়বে", "e.g. 1 Service Kit = 1 Filter + 4 L Oil — parts go down, kit goes up"],
    empty: ["এখনো কোনো কিট বানানো হয়নি", "No bundles yet"],
    print: "PRODUCT BUNDLING",
  },
};

export default function StockConvertTab({ kind = "loosen", lang = "en", shopId, user, profile, isOwner, canManage, products = [], toast, shopName = "", makeNo, leaveGuard = null }) {
  const bn = lang === "bn";
  const L = (b, e) => (bn ? b : e);
  const T = (key) => TEXT[kind][key][bn ? 0 : 1];
  const ACCENT = kind === "loosen" ? "#b45309" : "#7c3aed";
  const meta = CONVERT_KINDS[kind];

  const [allRows, setAllRows] = useState([]);
  const [view, setView] = useState("list");
  const [sel, setSel] = useState(null);
  const [search, setSearch] = useState("");
  const [showCancelled, setShowCancelled] = useState(false);
  const [saving, setSaving] = useState(false);
  const [stockMap, setStockMap] = useState(null);
  const [date, setDate] = useState(localDay());
  const [note, setNote] = useState("");
  const [single, setSingle] = useState(null);
  const [singleQty, setSingleQty] = useState("1");
  const [lines, setLines] = useState([]);
  const mobile = usePmMobile();
  const rootRef = useRef(null);
  const fitH = usePmFitHeight(rootRef, mobile, view);

  useEffect(() => {
    if (!shopId) return undefined;
    const unsub = subscribeShopCollection({ collectionName: "stockAdjustments", shopId, onRows: (list) => setAllRows(list || []) });
    return () => { try { unsub?.(); } catch { /* ignore */ } };
  }, [shopId]);
  const rows = useMemo(() => allRows.filter((r) => r.kind === kind), [allRows, kind]);

  useEffect(() => {
    let cancelled = false;
    loadInvoiceRows()
      .then((r) => { if (!cancelled) setStockMap(computeStockMap(products, r.purchaseInvoices, r.salesInvoices, shopId, r.deliveryNotes, r.extras)); })
      .catch((err) => console.warn("[S4 Convert] stock load failed", err));
    return () => { cancelled = true; };
  }, [view, products, shopId, allRows]);
  const stockOf = (id) => (stockMap?.has(id) ? stockMap.get(id) : null);
  const productOf = (id) => products.find((p) => p.id === id);

  const dirty = view === "form" && (single || lines.length);
  const leaveOk = () => !dirty || window.confirm(L("এটা সেভ হয়নি। তবুও চলে যাবেন?", "This is not saved. Leave anyway?"));
  const backToList = () => { if (leaveOk()) { setSel(null); setView("list"); } };
  useEffect(() => {
    if (!leaveGuard || view === "list") return undefined;
    const guard = { leave: () => leaveOk(), back: () => { backToList(); return true; } };
    leaveGuard.current = guard;
    return () => { if (leaveGuard.current === guard) leaveGuard.current = null; };
  });
  useEscapeKey(backToList, { enabled: view !== "list", level: view === "form" ? 2 : 1 });

  const lineOf = (p, per = "") => ({ productId: p.id, name: p.name || "", code: p.code || "", unit: p.unit || "Pcs", per: String(per) });
  const pickSingle = (p) => {
    setSingle(lineOf(p));
    const recipe = lastRecipe(rows, kind, p.id);
    if (recipe.length && !lines.length) {
      setLines(recipe.map((r) => { const prod = productOf(r.productId); return prod ? lineOf(prod, r.per) : null; }).filter(Boolean));
    }
  };
  const addLine = (p) => setLines((ls) => [...ls, lineOf(p)]);
  const updLine = (id, per) => setLines((ls) => ls.map((l) => (l.productId === id ? { ...l, per } : l)));
  const removeLine = (id) => setLines((ls) => ls.filter((l) => l.productId !== id));

  const openNew = () => { setDate(localDay()); setNote(""); setSingle(null); setSingleQty("1"); setLines([]); setView("form"); };

  const save = async () => {
    if (saving) return;
    if (!date) return toast?.(L("❌ তারিখ দিন", "❌ Pick a date"), "err");
    const built = buildConvertItems(kind, single, singleQty, lines, stockMap);
    if (built.error) {
      const msg = {
        noSingle: L("❌ উপরের পণ্যটা বেছে নিন", "❌ Pick the product at the top"),
        noQty: L("❌ কতটা লিখুন", "❌ Enter how many"),
        noLines: L("❌ নিচে অন্তত একটা পণ্য ও পরিমাণ দিন", "❌ Add at least one product with a quantity below"),
        same: L("❌ একই পণ্য দুই দিকে রাখা যাবে না", "❌ The same product can't be on both sides"),
      }[built.error];
      return toast?.(msg, "err");
    }
    const short = built.items.filter((it) => it.direction === "out" && it.stockBefore != null && it.qty > it.stockBefore + 1e-9);
    if (short.length && !window.confirm(L(
      `${short.map((it) => `${it.name}: আছে ${fq(it.stockBefore)}, লাগবে ${fq(it.qty)}`).join("\n")}\n\nস্টক মাইনাস হয়ে যাবে। তবুও সেভ করবেন?`,
      `${short.map((it) => `${it.name}: have ${fq(it.stockBefore)}, need ${fq(it.qty)}`).join("\n")}\n\nStock will go negative. Save anyway?`,
    ))) return;
    setSaving(true);
    try {
      const adjustNo = await makeNo(meta.serial, meta.prefix, rows.map((r) => r.adjustNo));
      const nowIso = new Date().toISOString();
      const payload = {
        shopId, kind, adjustNo, adjustDate: date, reason: kind, note: note.trim(), status: "confirmed",
        singleProductId: single.productId, singleQty: n2(singleQty),
        items: built.items,
        createdAt: nowIso, createdBy: user?.uid || "", createdByName: profile?.personName || "",
      };
      const res = await offlineCreate("stockAdjustments", payload);
      const created = { ...res.data, id: res.documentId };
      logAudit({ shopId, user, profile, action: "create", collection: "stockAdjustments", docId: created.id, docNo: adjustNo, note: `${T("title")} · ${single.name} × ${fq(singleQty)}` });
      setAllRows((list) => [created, ...list.filter((r) => r.id !== created.id)]);
      toast?.(L(`✅ ${adjustNo} সেভ হয়েছে`, `✅ ${adjustNo} saved`));
      if (navigator.onLine) window.S4Offline?.syncNow?.().catch(() => {});
      setSel(created); setView("detail");
    } catch (e) {
      toast?.(`❌ ${e?.message || e}`, "err");
    } finally {
      setSaving(false);
    }
  };

  const canCancel = (r) => r.status !== "cancelled" && (isOwner || (canManage && r.createdBy === user?.uid));
  const cancelDoc = async (r) => {
    if (!canCancel(r)) return;
    if (!window.confirm(L(`${r.adjustNo} বাতিল করবেন? স্টক আগের মতো হয়ে যাবে।`, `Cancel ${r.adjustNo}? Stock goes back to before.`))) return;
    try {
      const nowIso = new Date().toISOString();
      const patch = { status: "cancelled", cancelledAt: nowIso, cancelledBy: user?.uid || "", updatedAt: nowIso, updatedBy: user?.uid || "" };
      await offlinePatch("stockAdjustments", r.id, patch, r);
      const updated = { ...r, ...patch };
      setAllRows((list) => list.map((x) => (x.id === r.id ? updated : x)));
      setSel((s) => (s?.id === r.id ? updated : s));
      logAudit({ shopId, user, profile, action: "cancel", collection: "stockAdjustments", docId: r.id, docNo: r.adjustNo });
      toast?.(L("🚫 বাতিল হয়েছে", "🚫 Cancelled"), "err");
      if (navigator.onLine) window.S4Offline?.syncNow?.().catch(() => {});
    } catch (e) {
      toast?.(`❌ ${e?.message || e}`, "err");
    }
  };
  const deleteDoc = async (r) => {
    if (!isOwner || r.status !== "cancelled") return;
    if (!window.confirm(L(`${r.adjustNo} একেবারে মুছে ফেলবেন?`, `Delete ${r.adjustNo} permanently?`))) return;
    try {
      await offlineRemove("stockAdjustments", r.id);
      setAllRows((list) => list.filter((x) => x.id !== r.id));
      logAudit({ shopId, user, profile, action: "delete", collection: "stockAdjustments", docId: r.id, docNo: r.adjustNo });
      toast?.(L("🗑️ মুছে ফেলা হয়েছে", "🗑️ Deleted"), "err");
      setSel(null); setView("list");
      if (navigator.onLine) window.S4Offline?.syncNow?.().catch(() => {});
    } catch (e) {
      toast?.(`❌ ${e?.message || e}`, "err");
    }
  };

  const fmtDay = (d) => (d ? String(d).slice(0, 10).split("-").reverse().join("/") : "");
  const singleItem = (r) => (r.items || []).find((it) => it.role === "single") || {};
  const multiItems = (r) => (r.items || []).filter((it) => it.role !== "single");
  const summary = (r) => {
    const s = singleItem(r);
    const parts = multiItems(r).map((it) => `${it.name} ${fq(it.qty)}`).join(" + ");
    return kind === "loosen" ? `${s.name || ""} × ${fq(s.qty)} → ${parts}` : `${parts} → ${s.name || ""} × ${fq(s.qty)}`;
  };
  const print = (r) => {
    const cols = [{ label: "#" }, { label: "Item" }, { label: "Out", align: "right" }, { label: "In", align: "right" }, { label: "Unit" }];
    const body = (r.items || []).map((it, i) => [String(i + 1), [it.name, it.code].filter(Boolean).join(" · "), it.direction === "out" ? fq(it.qty) : "", it.direction === "in" ? fq(it.qty) : "", it.unit || ""]);
    const subtitle = [r.adjustNo, fmtDay(r.adjustDate), r.note, r.status === "cancelled" ? "CANCELLED" : ""].filter(Boolean).join(" · ");
    printWithSettings(generateStatementHTML({ shopName, title: TEXT[kind].print, subtitle, cols, rows: body }), { lang });
  };
  const badge = (r) => (
    <span className="si-badge" style={{ color: r.status === "cancelled" ? "#6b7280" : ACCENT }}>
      {r.status === "cancelled" ? L("বাতিল", "Cancelled") : L("সম্পন্ন", "Done")}
    </span>
  );
  const shell = (titleLeft, titleRight, children) => (
    <div ref={rootRef} className="si-root" style={fitH ? { height: fitH } : undefined}>
      <style>{PM_CSS}</style>
      <style>{SI_CSS}</style>
      <div className="pm-reference-title"><strong style={{ color: ACCENT }}>{titleLeft}</strong><span>{titleRight}</span></div>
      {children}
    </div>
  );

  if (view === "form") {
    const sq = n2(singleQty);
    const singleOut = kind === "loosen";
    const sStock = single ? stockOf(single.productId) : null;
    const exclude = [single?.productId, ...lines.map((l) => l.productId)].filter(Boolean);
    const partsCost = lines.reduce((t, l) => t + n2(l.per) * costOf(productOf(l.productId)), 0);
    const totalPer = lines.reduce((t, l) => t + n2(l.per), 0);
    const singleCost = single ? costOf(productOf(single.productId)) : 0;
    const dirColor = (out) => (out ? "#b91c1c" : "#15803d");
    return shell(T("newBtn"), T("title"), (
      <>
        <div className="si-body">
          <div className="si-hint" style={{ padding: "2px 4px" }}>💡 {T("hint")}</div>
          <fieldset className="pm-panel" style={{ margin: 0 }}>
            <legend className="pm-panel-legend">{L("তথ্য", "Details")}</legend>
            <div className={mobile ? "si-panel-body" : "si-grid2"} style={mobile ? undefined : { gridTemplateColumns: "140px minmax(0,1fr)", paddingTop: 3 }}>
              <div className="si-field"><span className="pm-label">{L("তারিখ", "Date")} *</span><input type="date" className="pm-input" value={date} onChange={(e) => setDate(e.target.value)} /></div>
              <div className="si-field"><span className="pm-label">{L("নোট", "Note")}</span><input className="pm-input" value={note} onChange={(e) => setNote(e.target.value)} /></div>
            </div>
          </fieldset>

          <fieldset className="pm-panel" style={{ margin: 0 }}>
            <legend className="pm-panel-legend" style={{ color: dirColor(singleOut) }}>{singleOut ? "−" : "+"} {T("single")}</legend>
            <div className="si-panel-body">
              {!single && <ProductPicker products={products} exclude={exclude} stockOf={stockOf} onPick={pickSingle} autoFocus={!mobile} mobile={mobile} lang={lang}
                placeholder={L("নাম, কোড বা বারকোড লিখুন / স্ক্যান করুন…", "Type or scan name, code or barcode…")} />}
              {single && (
                <div style={{ display: "grid", gridTemplateColumns: mobile ? "1fr" : "minmax(0,1fr) 130px 150px auto", gap: 6, alignItems: "center" }}>
                  <div><b>{single.name}</b>{single.code ? <span className="si-muted"> · {single.code}</span> : null}
                    <div className="si-muted">{L("এখন স্টক", "Stock now")}: <b>{sStock == null ? "…" : fq(sStock)}</b> {single.unit}{singleCost > 0 ? ` · ${L("খরচ", "Cost")} ${fm(singleCost)}` : ""}</div>
                  </div>
                  <input type="number" min="0" step="any" inputMode="decimal" className="pm-input" style={{ textAlign: "right" }} value={singleQty} onChange={(e) => setSingleQty(e.target.value)} placeholder={L("কতটা", "How many")} />
                  <div style={{ fontWeight: 800, color: dirColor(singleOut) }}>{singleOut ? "−" : "+"}{fq(sq)} {single.unit}
                    {sStock != null && sq > 0 && <div className="si-muted" style={{ fontWeight: 400 }}>{L("পরে", "After")}: {fq(sStock + (singleOut ? -sq : sq))}</div>}
                  </div>
                  <button type="button" className="pm-btn-secondary pm-btn--danger" onClick={() => setSingle(null)}>✕ {L("বদলান", "Change")}</button>
                </div>
              )}
            </div>
          </fieldset>

          <fieldset className="pm-panel" style={{ margin: 0, flex: mobile ? undefined : 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
            <legend className="pm-panel-legend" style={{ color: dirColor(!singleOut) }}>{singleOut ? "+" : "−"} {T("multi")}</legend>
            <div className="si-panel-body" style={{ display: "flex", flexDirection: "column", gap: 4, minHeight: 0, flex: 1 }}>
              <ProductPicker products={products} exclude={exclude} stockOf={stockOf} onPick={addLine} mobile={mobile} lang={lang}
                placeholder={L("পণ্য যোগ করুন — নাম, কোড বা বারকোড…", "Add product — name, code or barcode…")} />
              <div className="si-box" style={{ flex: mobile ? undefined : 1, minHeight: 90 }}>
                {!lines.length && <div className="si-empty">{L("উপরে খুঁজে পণ্য যোগ করুন", "Search above and add products")}</div>}
                {lines.length > 0 && (
                  <table className="pm-table">
                    <thead><tr>
                      <th style={{ width: 26 }} className="si-center">#</th>
                      <th>{L("পণ্য", "Item")}</th>
                      {!mobile && <th style={{ width: 90 }} className="si-num">{L("এখন স্টক", "Stock now")}</th>}
                      <th style={{ width: mobile ? 80 : 120 }} className="si-num">{T("per")}</th>
                      <th style={{ width: mobile ? 70 : 100 }} className="si-num">{L("মোট", "Total")}</th>
                      {!mobile && <th style={{ width: 90 }} className="si-num">{L("পরে", "After")}</th>}
                      <th style={{ width: 28 }} />
                    </tr></thead>
                    <tbody>
                      {lines.map((l, i) => {
                        const cur = stockOf(l.productId);
                        const total = n2(l.per) * sq;
                        const after = cur == null ? null : cur + (singleOut ? total : -total);
                        return (
                          <tr key={l.productId}>
                            <td className="si-center">{i + 1}</td>
                            <td className="si-strong" title={l.name}>{l.name}{l.code ? <span className="si-muted"> · {l.code}</span> : null}</td>
                            {!mobile && <td className="si-num">{cur == null ? "…" : fq(cur)} {l.unit}</td>}
                            <td style={{ padding: "1px 2px" }}><input type="number" min="0" step="any" inputMode="decimal" className="pm-input" style={{ textAlign: "right" }} value={l.per} onChange={(e) => updLine(l.productId, e.target.value)} /></td>
                            <td className="si-num si-strong" style={{ color: dirColor(!singleOut) }}>{total > 0 ? `${singleOut ? "+" : "−"}${fq(total)}` : "—"}</td>
                            {!mobile && <td className="si-num" style={after != null && after < 0 ? { color: "#b91c1c", fontWeight: 700 } : undefined}>{after != null && total > 0 ? fq(after) : "—"}</td>}
                            <td className="si-center"><button type="button" className="pm-btn-secondary pm-btn--danger" style={{ minHeight: 17, padding: "0 5px" }} onClick={() => removeLine(l.productId)}>✕</button></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
              {kind === "bundle" && partsCost > 0 && <div className="si-muted">{L("১টি কিটের পার্টসের খরচ", "Parts cost of 1 kit")}: <b>{fm(partsCost)}</b>{sq > 0 ? ` · ${L("মোট", "Total")} ${fm(partsCost * sq)}` : ""}</div>}
              {kind === "loosen" && singleCost > 0 && totalPer > 0 && lines.length === 1 && <div className="si-muted">{L("খোলার পর প্রতি পিসের খরচ পড়বে", "Cost of each piece after opening")}: <b>{fm(singleCost / totalPer)}</b></div>}
            </div>
          </fieldset>
        </div>
        <div className={`si-actions${mobile ? " si-sticky-actions" : ""}`}>
          <button type="button" className="pm-btn-secondary" disabled={saving} onClick={backToList}>← {L("তালিকা", "List")}</button>
          <span className="si-toolbar-gap" />
          <button type="button" className="pm-btn pm-btn--primary" disabled={saving || !single || !lines.length} onClick={save}>
            {saving ? L("সেভ হচ্ছে…", "Saving…") : `💾 ${L("সেভ করুন", "Save")}`}
          </button>
        </div>
      </>
    ));
  }

  if (view === "detail" && sel) {
    const r = rows.find((x) => x.id === sel.id) || sel;
    return shell(<>{r.adjustNo} {badge(r)}</>, T("title"), (
      <>
        <div className="si-body">
          <fieldset className="pm-panel" style={{ margin: 0 }}>
            <legend className="pm-panel-legend">{L("তথ্য", "Details")}</legend>
            <div className="si-panel-body" style={{ paddingTop: 3 }}>
              <div><b style={{ color: ACCENT }}>{r.adjustNo}</b> · {fmtDay(r.adjustDate)} · {r.createdByName || ""}</div>
              {r.note && <div className="si-muted">{r.note}</div>}
              <div style={{ fontWeight: 700 }}>{summary(r)}</div>
              {r.status === "cancelled" && <div style={{ color: "#b91c1c" }}>{L("বাতিল", "Cancelled")} {fmtDay(r.cancelledAt)}</div>}
            </div>
          </fieldset>
          <div className="si-box">
            <table className="pm-table">
              <thead><tr>
                <th style={{ width: 26 }} className="si-center">#</th>
                <th>{L("পণ্য", "Item")}</th>
                <th style={{ width: 90 }} className="si-num">{L("আগে", "Before")}</th>
                <th style={{ width: 90 }} className="si-num">{L("বের হলো", "Out")}</th>
                <th style={{ width: 90 }} className="si-num">{L("ঢুকলো", "In")}</th>
                <th style={{ width: 60 }}>{L("একক", "Unit")}</th>
              </tr></thead>
              <tbody>
                {(r.items || []).map((it, i) => (
                  <tr key={i}>
                    <td className="si-center">{i + 1}</td>
                    <td className="si-strong" title={it.name}>{it.name}{it.code ? <span className="si-muted"> · {it.code}</span> : null}</td>
                    <td className="si-num">{it.stockBefore == null ? "—" : fq(it.stockBefore)}</td>
                    <td className="si-num si-strong" style={{ color: "#b91c1c" }}>{it.direction === "out" ? `−${fq(it.qty)}` : ""}</td>
                    <td className="si-num si-strong" style={{ color: "#15803d" }}>{it.direction === "in" ? `+${fq(it.qty)}` : ""}</td>
                    <td>{it.unit || ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className={`si-actions${mobile ? " si-sticky-actions" : ""}`}>
          <button type="button" className="pm-btn-secondary" onClick={backToList}>← {L("তালিকা", "List")}</button>
          <button type="button" className="pm-btn-secondary" onClick={() => print(r)}>🖨️ {L("প্রিন্ট", "Print")}</button>
          <span className="si-toolbar-gap" />
          {canCancel(r) && <button type="button" className="pm-btn-secondary pm-btn--danger" onClick={() => cancelDoc(r)}>⛔ {L("বাতিল করুন", "Cancel")}</button>}
          {isOwner && r.status === "cancelled" && <button type="button" className="pm-btn-secondary pm-btn--danger" onClick={() => deleteDoc(r)}>🗑️ {L("মুছুন", "Delete")}</button>}
        </div>
      </>
    ));
  }

  const sorted = [...rows].sort((a, b) => String(b.adjustDate || b.createdAt || "").localeCompare(String(a.adjustDate || a.createdAt || "")));
  const filtered = sorted.filter((r) => {
    if (!showCancelled && r.status === "cancelled") return false;
    const q = search.trim().toLowerCase();
    return !q || [r.adjustNo, r.note, summary(r)].join(" ").toLowerCase().includes(q);
  });
  const liveCount = rows.filter((r) => r.status !== "cancelled").length;
  return shell(T("title"), `${liveCount} ${L("টি", "entries")}`, (
    <>
      <div className="si-toolbar">
        {canManage && <button type="button" className="pm-btn pm-btn--primary" onClick={openNew}>+ {T("newBtn")}</button>}
        <span className="si-toolbar-gap" />
        <div className="si-search" style={{ minWidth: mobile ? "100%" : 260 }}>
          <input className="pm-input" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={L("নম্বর, নোট বা পণ্য…", "Number, note or item…")} />
          {search && <button type="button" onClick={() => setSearch("")}>✕</button>}
        </div>
        <label className="pm-check"><input type="checkbox" checked={showCancelled} onChange={(e) => setShowCancelled(e.target.checked)} /> {L("বাতিলগুলোও", "Show cancelled")}</label>
      </div>
      <div className="si-main is-all">
        <div className="si-box">
          {filtered.length > 0 && (mobile ? filtered.map((r) => (
            <button key={r.id} type="button" className="si-mrow" onClick={() => { setSel(r); setView("detail"); }} style={r.status === "cancelled" ? { opacity: 0.6 } : undefined}>
              <div className="si-mrow-top"><span style={{ color: ACCENT }}>{r.adjustNo}</span>{badge(r)}</div>
              <div className="si-mrow-sub"><span>{fmtDay(r.adjustDate)}</span><span>{r.createdByName || ""}</span></div>
              <div className="si-mrow-sub"><span>{summary(r)}</span></div>
            </button>
          )) : (
            <table className="pm-table">
              <thead><tr>
                <th style={{ width: 80 }}>{L("তারিখ", "Date")}</th>
                <th style={{ width: 90 }}>{L("নম্বর", "No")}</th>
                <th>{L("কী থেকে কী", "Conversion")}</th>
                <th style={{ width: 160 }}>{L("নোট", "Note")}</th>
                <th style={{ width: 100 }}>{L("লিখেছেন", "By")}</th>
                <th style={{ width: 76 }} className="si-center">{L("অবস্থা", "Status")}</th>
              </tr></thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.id} className="pm-clickable" onClick={() => { setSel(r); setView("detail"); }} style={r.status === "cancelled" ? { color: "#6b7280" } : undefined}>
                    <td>{fmtDay(r.adjustDate)}</td>
                    <td className="si-strong" style={{ color: r.status === "cancelled" ? undefined : ACCENT }}>{r.adjustNo}</td>
                    <td title={summary(r)}>{summary(r)}</td>
                    <td title={r.note || ""}>{r.note || ""}</td>
                    <td>{r.createdByName || ""}</td>
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
