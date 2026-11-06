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
import {
  EXCHANGE_META, EXCHANGE_REASONS, buildExchangeItems, exchangeReasonLabel, exchangeSummary,
} from "./productExchange.js";

const n2 = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const fq = (v) => String(parseFloat(n2(v).toFixed(4)));
const localDay = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const ACCENT = "#c2410c";
const KIND = EXCHANGE_META.kind;

export default function ProductExchangeTab({
  lang = "en", shopId, user, profile, isOwner, canManage, canDelete = false, canPrint = false,
  products = [], toast, shopName = "", makeNo, leaveGuard = null,
}) {
  const bn = lang === "bn";
  const L = (b, e) => (bn ? b : e);

  const [allRows, setAllRows] = useState([]);
  const [view, setView] = useState("list");
  const [sel, setSel] = useState(null);
  const [search, setSearch] = useState("");
  const [showCancelled, setShowCancelled] = useState(false);
  const [saving, setSaving] = useState(false);
  const [stockMap, setStockMap] = useState(null);

  const [date, setDate] = useState(localDay());
  const [reason, setReason] = useState("wrong");
  const [note, setNote] = useState("");
  const [out, setOut] = useState(null);
  const [outQty, setOutQty] = useState("1");
  const [into, setInto] = useState(null);
  const [inQty, setInQty] = useState("1");

  const mobile = usePmMobile();
  const rootRef = useRef(null);
  const fitH = usePmFitHeight(rootRef, mobile, view);

  useEffect(() => {
    if (!shopId) return undefined;
    const unsub = subscribeShopCollection({
      collectionName: "stockAdjustments",
      shopId,
      onRows: (list) => setAllRows(list || []),
    });
    return () => { try { unsub?.(); } catch { /* ignore */ } };
  }, [shopId]);

  const rows = useMemo(() => allRows.filter((r) => r.kind === KIND), [allRows]);

  useEffect(() => {
    let cancelled = false;
    loadInvoiceRows()
      .then((r) => {
        if (!cancelled) {
          setStockMap(computeStockMap(products, r.purchaseInvoices, r.salesInvoices, shopId, r.deliveryNotes, r.extras));
        }
      })
      .catch((err) => console.warn("[S4 Exchange] stock load failed", err));
    return () => { cancelled = true; };
  }, [view, products, shopId, allRows]);

  const stockOf = (id) => (stockMap?.has(id) ? stockMap.get(id) : null);

  const dirty = view === "form" && (out || into || note.trim());
  const leaveOk = () => !dirty || window.confirm(L("এটা সেভ হয়নি। তবুও চলে যাবেন?", "This is not saved. Leave anyway?"));
  const backToList = () => { if (leaveOk()) { setSel(null); setView("list"); } };
  useEffect(() => {
    if (!leaveGuard || view === "list") return undefined;
    const guard = { leave: () => leaveOk(), back: () => { backToList(); return true; } };
    leaveGuard.current = guard;
    return () => { if (leaveGuard.current === guard) leaveGuard.current = null; };
  });
  useEscapeKey(backToList, { enabled: view !== "list", level: view === "form" ? 2 : 1 });

  const lineOf = (p) => ({ productId: p.id, name: p.name || "", code: p.code || "", unit: p.unit || "Pcs" });
  const openNew = () => {
    setDate(localDay()); setReason("wrong"); setNote("");
    setOut(null); setOutQty("1"); setInto(null); setInQty("1");
    setView("form");
  };

  const save = async () => {
    if (saving) return;
    if (!date) return toast?.(L("❌ তারিখ দিন", "❌ Pick a date"), "err");
    const built = buildExchangeItems({ out, outQty, into, inQty, stockMap });
    if (built.error) {
      const msg = {
        noOut: L("❌ যে পণ্য বের করবেন সেটা বেছে নিন", "❌ Pick the product leaving stock"),
        noIn: L("❌ যে পণ্য ঢুকাবেন সেটা বেছে নিন", "❌ Pick the product coming into stock"),
        same: L("❌ একই পণ্য দুই দিকে রাখা যাবে না — ভিন্ন পণ্য দিন", "❌ Both sides can't be the same product"),
        noOutQty: L("❌ বের হওয়া পরিমাণ লিখুন", "❌ Enter the outgoing quantity"),
        noInQty: L("❌ ঢোকা পরিমাণ লিখুন", "❌ Enter the incoming quantity"),
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
      const adjustNo = await makeNo(EXCHANGE_META.serial, EXCHANGE_META.prefix, rows.map((r) => r.adjustNo));
      const nowIso = new Date().toISOString();
      const payload = {
        shopId,
        kind: KIND,
        adjustNo,
        adjustDate: date,
        reason,
        note: note.trim(),
        status: "confirmed",
        outProductId: out.productId,
        inProductId: into.productId,
        outQty: n2(outQty),
        inQty: n2(inQty),
        items: built.items,
        createdAt: nowIso,
        createdBy: user?.uid || "",
        createdByName: profile?.personName || "",
      };
      const res = await offlineCreate("stockAdjustments", payload);
      const created = { ...res.data, id: res.documentId };
      logAudit({
        shopId, user, profile, action: "create", collection: "stockAdjustments",
        docId: created.id, docNo: adjustNo,
        note: `Product exchange · ${exchangeSummary(created)} · ${exchangeReasonLabel(reason)}`,
      });
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
    if (!canDelete || r.status !== "cancelled") return;
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
  const sorted = useMemo(
    () => [...rows].sort((a, b) => String(b.adjustDate || b.createdAt || "").localeCompare(String(a.adjustDate || a.createdAt || ""))),
    [rows],
  );
  const filtered = useMemo(() => sorted.filter((r) => {
    if (!showCancelled && r.status === "cancelled") return false;
    const q = search.trim().toLowerCase();
    return !q || [r.adjustNo, r.note, r.reason, exchangeSummary(r), exchangeReasonLabel(r.reason)].join(" ").toLowerCase().includes(q);
  }), [sorted, showCancelled, search]);
  const liveCount = useMemo(() => rows.filter((r) => r.status !== "cancelled").length, [rows]);

  const print = (r) => {
    const cols = [{ label: "#" }, { label: "Item" }, { label: "Out", align: "right" }, { label: "In", align: "right" }, { label: "Unit" }];
    const body = (r.items || []).map((it, i) => [
      String(i + 1),
      [it.name, it.code].filter(Boolean).join(" · "),
      it.direction === "out" ? fq(it.qty) : "",
      it.direction === "in" ? fq(it.qty) : "",
      it.unit || "",
    ]);
    const subtitle = [r.adjustNo, fmtDay(r.adjustDate), exchangeReasonLabel(r.reason), r.note, r.status === "cancelled" ? "CANCELLED" : ""].filter(Boolean).join(" · ");
    printWithSettings(generateStatementHTML({ shopName, title: "PRODUCT EXCHANGE", subtitle, cols, rows: body }), { lang });
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

  const pickedCard = (side, p, qty, setQty, onClear, outSide) => {
    const st = stockOf(p.productId);
    const q = n2(qty);
    const after = st == null ? null : st + (outSide ? -q : q);
    return (
      <div style={{ display: "grid", gridTemplateColumns: mobile ? "1fr" : "minmax(0,1fr) 120px 140px auto", gap: 6, alignItems: "center" }}>
        <div>
          <b>{p.name}</b>{p.code ? <span className="si-muted"> · {p.code}</span> : null}
          <div className="si-muted">{L("এখন স্টক", "Stock now")}: <b>{st == null ? "…" : fq(st)}</b> {p.unit}</div>
        </div>
        <input type="number" min="0" step="any" inputMode="decimal" className="pm-input" style={{ textAlign: "right" }}
          value={qty} onChange={(e) => setQty(e.target.value)} placeholder={L("কতটা", "Qty")} />
        <div style={{ fontWeight: 800, color: outSide ? "#b91c1c" : "#15803d" }}>
          {outSide ? "−" : "+"}{fq(q)} {p.unit}
          {after != null && q > 0 && <div className="si-muted" style={{ fontWeight: 400 }}>{L("পরে", "After")}: {fq(after)}</div>}
        </div>
        <button type="button" className="pm-btn-secondary pm-btn--danger" onClick={onClear}>✕ {L("বদলান", "Change")}</button>
      </div>
    );
  };

  if (view === "form") {
    const exclude = [out?.productId, into?.productId].filter(Boolean);
    return shell(L("নতুন পণ্য বদল", "New Product Exchange"), L("🔄 পণ্য বদল (Exchange)", "🔄 Product Exchange"), (
      <>
        <div className="si-body">
          <div className="si-hint" style={{ padding: "6px 8px", background: "#fff7ed", border: "1px solid #fdba74", borderRadius: 8 }}>
            💡 {L("দোকানের ভুল/নষ্ট পণ্য ↔ সঠিক পণ্য স্টক বদল।", "Shop stock swap: wrong/damaged ↔ correct product.")}
            <br />
            <b style={{ color: "#9a3412" }}>{L("ব্যাটারি গ্যারান্টি / কোম্পানি চেঞ্জ এখানে নয় — মেনু › গ্যারান্টি ক্লেইম ব্যবহার করুন (নইলে স্টক ডাবল হবে)।", "Battery guarantee / company change: use menu › Warranty Claim (or stock will double).")}</b>
          </div>
          <fieldset className="pm-panel" style={{ margin: 0 }}>
            <legend className="pm-panel-legend">{L("তথ্য", "Details")}</legend>
            <div className={mobile ? "si-panel-body" : "si-grid2"} style={mobile ? undefined : { gridTemplateColumns: "140px 180px minmax(0,1fr)", paddingTop: 3 }}>
              <div className="si-field"><span className="pm-label">{L("তারিখ", "Date")} *</span>
                <input type="date" className="pm-input" value={date} onChange={(e) => setDate(e.target.value)} /></div>
              <div className="si-field"><span className="pm-label">{L("কারণ", "Reason")} *</span>
                <select className="pm-input" value={reason} onChange={(e) => setReason(e.target.value)}>
                  {EXCHANGE_REASONS.map((r) => <option key={r.key} value={r.key}>{r[bn ? "bn" : "en"]}</option>)}
                </select>
              </div>
              <div className="si-field"><span className="pm-label">{L("নোট", "Note")}</span>
                <input className="pm-input" value={note} onChange={(e) => setNote(e.target.value)} placeholder={L("ঐচ্ছিক", "Optional")} /></div>
            </div>
          </fieldset>

          <fieldset className="pm-panel" style={{ margin: 0 }}>
            <legend className="pm-panel-legend" style={{ background: "linear-gradient(180deg,#ef4444,#b91c1c)" }}>
              − {L("বের হবে (ভুল / নষ্ট / ফিটিং)", "Out (wrong / damaged / fitting)")}
            </legend>
            <div className="si-panel-body">
              {!out && (
                <ProductPicker products={products} exclude={exclude} stockOf={stockOf} onPick={(p) => setOut(lineOf(p))}
                  autoFocus={!mobile} mobile={mobile} lang={lang}
                  placeholder={L("নাম, কোড বা বারকোড…", "Name, code or barcode…")} />
              )}
              {out && pickedCard("out", out, outQty, setOutQty, () => setOut(null), true)}
            </div>
          </fieldset>

          <fieldset className="pm-panel" style={{ margin: 0 }}>
            <legend className="pm-panel-legend" style={{ background: "linear-gradient(180deg,#22c55e,#15803d)" }}>
              + {L("ঢুকবে (সঠিক পণ্য)", "In (correct product)")}
            </legend>
            <div className="si-panel-body">
              {!into && (
                <ProductPicker products={products} exclude={exclude} stockOf={stockOf} onPick={(p) => setInto(lineOf(p))}
                  mobile={mobile} lang={lang}
                  placeholder={L("সঠিক পণ্য খুঁজুন…", "Find the correct product…")} />
              )}
              {into && pickedCard("in", into, inQty, setInQty, () => setInto(null), false)}
            </div>
          </fieldset>
        </div>
        <div className={`si-actions${mobile ? " si-sticky-actions" : ""}`}>
          <button type="button" className="pm-btn-secondary" disabled={saving} onClick={backToList}>← {L("তালিকা", "List")}</button>
          <span className="si-toolbar-gap" />
          <button type="button" className="pm-btn pm-btn--primary" disabled={saving || !out || !into} onClick={save}>
            {saving ? L("সেভ হচ্ছে…", "Saving…") : `💾 ${L("সেভ করুন", "Save")}`}
          </button>
        </div>
      </>
    ));
  }

  if (view === "detail" && sel) {
    const r = rows.find((x) => x.id === sel.id) || sel;
    return shell(<>{r.adjustNo} {badge(r)}</>, L("🔄 পণ্য বদল", "🔄 Product Exchange"), (
      <>
        <div className="si-body">
          <fieldset className="pm-panel" style={{ margin: 0 }}>
            <legend className="pm-panel-legend">{L("তথ্য", "Details")}</legend>
            <div className="si-panel-body" style={{ paddingTop: 3 }}>
              <div><b style={{ color: ACCENT }}>{r.adjustNo}</b> · {fmtDay(r.adjustDate)} · {exchangeReasonLabel(r.reason, bn)} · {r.createdByName || ""}</div>
              {r.note && <div className="si-muted">{r.note}</div>}
              <div style={{ fontWeight: 700 }}>{exchangeSummary(r)}</div>
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
          {canPrint && <button type="button" className="pm-btn-secondary" onClick={() => print(r)}>🖨️ {L("প্রিন্ট", "Print")}</button>}
          <span className="si-toolbar-gap" />
          {canCancel(r) && <button type="button" className="pm-btn-secondary pm-btn--danger" onClick={() => cancelDoc(r)}>⛔ {L("বাতিল করুন", "Cancel")}</button>}
          {canDelete && r.status === "cancelled" && <button type="button" className="pm-btn-secondary pm-btn--danger" onClick={() => deleteDoc(r)}>🗑️ {L("মুছুন", "Delete")}</button>}
        </div>
      </>
    ));
  }

  return shell(L("🔄 পণ্য বদল (Exchange)", "🔄 Product Exchange"), `${liveCount} ${L("টি", "entries")}`, (
    <>
      <div className="si-toolbar">
        {canManage && <button type="button" className="pm-btn pm-btn--primary" onClick={openNew}>+ {L("নতুন বদল", "New Exchange")}</button>}
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
              <div className="si-mrow-sub"><span>{fmtDay(r.adjustDate)} · {exchangeReasonLabel(r.reason, bn)}</span><span>{r.createdByName || ""}</span></div>
              <div className="si-mrow-sub"><span>{exchangeSummary(r)}</span></div>
            </button>
          )) : (
            <table className="pm-table">
              <thead><tr>
                <th style={{ width: 80 }}>{L("তারিখ", "Date")}</th>
                <th style={{ width: 90 }}>{L("নম্বর", "No")}</th>
                <th style={{ width: 120 }}>{L("কারণ", "Reason")}</th>
                <th>{L("কী থেকে কী", "Exchange")}</th>
                <th style={{ width: 140 }}>{L("নোট", "Note")}</th>
                <th style={{ width: 100 }}>{L("লিখেছেন", "By")}</th>
                <th style={{ width: 76 }} className="si-center">{L("অবস্থা", "Status")}</th>
              </tr></thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.id} className="pm-clickable" onClick={() => { setSel(r); setView("detail"); }} style={r.status === "cancelled" ? { color: "#6b7280" } : undefined}>
                    <td>{fmtDay(r.adjustDate)}</td>
                    <td className="si-strong" style={{ color: r.status === "cancelled" ? undefined : ACCENT }}>{r.adjustNo}</td>
                    <td>{exchangeReasonLabel(r.reason, bn)}</td>
                    <td title={exchangeSummary(r)}>{exchangeSummary(r)}</td>
                    <td title={r.note || ""}>{r.note || ""}</td>
                    <td>{r.createdByName || ""}</td>
                    <td className="si-center">{badge(r)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ))}
          {!filtered.length && (
            <div className="si-empty">
              {rows.length
                ? L("এই ফিল্টারে কিছু নেই", "Nothing matches")
                : L("এখনো কোনো পণ্য বদল হয়নি — ভুল/নষ্ট/ফিটিং বদলাতে নতুন বদল চাপুন", "No exchanges yet — tap New Exchange for wrong / damaged / fitting swaps")}
            </div>
          )}
        </div>
      </div>
      <div className="si-statusbar">
        <span>{L("দেখাচ্ছে", "Showing")} <b>{filtered.length}</b> / {rows.length}</span>
        <span>{L("স্টক থেকে ভুলটা বের, সঠিকটা ঢোকে", "Wrong item leaves stock; correct item enters")}</span>
      </div>
    </>
  ));
}
