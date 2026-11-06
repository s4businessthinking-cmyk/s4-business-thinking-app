import React, { useEffect, useMemo, useRef, useState } from "react";
import { PM_CSS } from "../product-master/pmStyles";
import { SI_CSS, usePmFitHeight, usePmMobile } from "../sales-invoice/siSkin";
import ProductPicker from "../components/ProductPicker.jsx";
import { offlineCreate, offlineGetById, offlinePatch, offlineRemove } from "../offline/offlineRepository";
import { subscribeShopCollection } from "../offline/realtimeSync";
import { computeStockMap, invalidateInvoiceRowsCache, loadInvoiceRows } from "../inventory/stockFromInvoices";
import { printWithSettings } from "../print/printSettings.js";
import { generateStatementHTML } from "../print/printDesign.js";
import { logAudit } from "../utils/auditLog.js";
import { useEscapeKey } from "../components/WindowChrome.jsx";
import { donePatch } from "../reminders/reminders.js";
import {
  REMINDER_DAY_PRESETS, WARRANTY_META, WARRANTY_REASONS, WARRANTY_STATUSES,
  addDaysYmd, buildWarrantyReminder, canAdvance, claimSummary, warrantyReasonLabel, warrantyStatusLabel, ymd,
} from "./warrantyClaim.js";

const n2 = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const fq = (v) => String(parseFloat(n2(v).toFixed(4)));
const ACCENT = "#b45309";

export default function WarrantyClaimTab({
  lang = "en", shopId, user, profile, isOwner, canManage, canDelete = false, canPrint = false,
  products = [], customers = [], vendors = [], toast, shopName = "", makeNo, leaveGuard = null,
  openClaimId = null, onOpenClaimHandled = null,
}) {
  const bn = lang === "bn";
  const L = (b, e) => (bn ? b : e);

  const [rows, setRows] = useState([]);
  const [view, setView] = useState("list");
  const [sel, setSel] = useState(null);
  const [search, setSearch] = useState("");
  const [statusF, setStatusF] = useState("open");
  const [saving, setSaving] = useState(false);
  const [stockMap, setStockMap] = useState(null);

  const [date, setDate] = useState(ymd(new Date()));
  const [reason, setReason] = useState("battery");
  const [note, setNote] = useState("");
  const [qty, setQty] = useState("1");
  const [serialNo, setSerialNo] = useState("");
  const [reminderDays, setReminderDays] = useState(15);
  const [product, setProduct] = useState(null);
  const [customerQ, setCustomerQ] = useState("");
  const [customer, setCustomer] = useState(null);
  const [vendorQ, setVendorQ] = useState("");
  const [vendor, setVendor] = useState(null);

  const mobile = usePmMobile();
  const rootRef = useRef(null);
  const fitH = usePmFitHeight(rootRef, mobile, view);

  useEffect(() => {
    if (!shopId) return undefined;
    const unsub = subscribeShopCollection({ collectionName: "warrantyClaims", shopId, onRows: (list) => setRows(list || []) });
    return () => { try { unsub?.(); } catch { /* ignore */ } };
  }, [shopId]);

  useEffect(() => {
    if (!openClaimId) return;
    const hit = rows.find((r) => r.id === openClaimId);
    if (hit) { setSel(hit); setView("detail"); }
    onOpenClaimHandled?.();
  }, [openClaimId, rows]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    let cancelled = false;
    loadInvoiceRows()
      .then((r) => {
        if (!cancelled) setStockMap(computeStockMap(products, r.purchaseInvoices, r.salesInvoices, shopId, r.deliveryNotes, r.extras));
      })
      .catch((err) => console.warn("[S4 Warranty] stock load failed", err));
    return () => { cancelled = true; };
  }, [view, products, shopId, rows]);

  const stockOf = (id) => (stockMap?.has(id) ? stockMap.get(id) : null);

  const dirty = view === "form" && (product || customer || vendor || note.trim());
  const leaveOk = () => !dirty || window.confirm(L("এটা সেভ হয়নি। তবুও চলে যাবেন?", "This is not saved. Leave anyway?"));
  const backToList = () => { if (leaveOk()) { setSel(null); setView("list"); } };
  useEffect(() => {
    if (!leaveGuard || view === "list") return undefined;
    const guard = { leave: () => leaveOk(), back: () => { backToList(); return true; } };
    leaveGuard.current = guard;
    return () => { if (leaveGuard.current === guard) leaveGuard.current = null; };
  });
  useEscapeKey(backToList, { enabled: view !== "list", level: view === "form" ? 2 : 1 });

  const openNew = () => {
    setDate(ymd(new Date())); setReason("battery"); setNote(""); setQty("1"); setSerialNo("");
    setReminderDays(15); setProduct(null); setCustomer(null); setCustomerQ(""); setVendor(null); setVendorQ("");
    setView("form");
  };

  const custHits = useMemo(() => {
    const q = customerQ.trim().toLowerCase();
    if (!q) return [];
    return (customers || []).filter((c) => !c.isDeleted && !c.deleted && [c.customerName, c.mobileNumber, c.whatsappNumber, c.customerCode].join(" ").toLowerCase().includes(q)).slice(0, 12);
  }, [customers, customerQ]);
  const vendHits = useMemo(() => {
    const q = vendorQ.trim().toLowerCase();
    if (!q) return [];
    return (vendors || []).filter((v) => !v.isDeleted && !v.deleted && [v.vendorName, v.mobileNumber, v.whatsappNumber, v.vendorCode].join(" ").toLowerCase().includes(q)).slice(0, 12);
  }, [vendors, vendorQ]);

  const saveNew = async () => {
    if (saving) return;
    if (!product?.productId) return toast?.(L("❌ পণ্য বেছে নিন", "❌ Pick the product"), "err");
    if (!vendor?.id && !String(vendorQ || "").trim()) return toast?.(L("❌ কোম্পানি / সাপ্লায়ার বেছে নিন", "❌ Pick the company / supplier"), "err");
    const q = n2(qty);
    if (!(q > 0)) return toast?.(L("❌ পরিমাণ লিখুন", "❌ Enter quantity"), "err");
    const days = Math.max(1, Math.min(365, Number(reminderDays) || 15));
    setSaving(true);
    try {
      const claimNo = await makeNo(WARRANTY_META.serial, WARRANTY_META.prefix, rows.map((r) => r.claimNo));
      const nowIso = new Date().toISOString();
      const vName = vendor?.vendorName || vendorQ.trim();
      const cName = customer?.customerName || customerQ.trim();
      const payload = {
        shopId, claimNo, claimDate: date, status: "received", reason,
        productId: product.productId, productName: product.name || "", productCode: product.code || "",
        qty: q, unit: product.unit || "Pcs", serialNo: serialNo.trim(),
        customerId: customer?.id || null, customerName: cName, customerMobile: customer?.mobileNumber || customer?.whatsappNumber || "",
        vendorId: vendor?.id || null, vendorName: vName,
        reminderDays: days, reminderDueDate: "", reminderId: null,
        note: note.trim(),
        createdAt: nowIso, createdBy: user?.uid || "", createdByName: profile?.personName || "",
        updatedAt: nowIso, updatedBy: user?.uid || "",
      };
      const res = await offlineCreate("warrantyClaims", payload);
      const created = { ...res.data, id: res.documentId };
      logAudit({ shopId, user, profile, action: "create", collection: "warrantyClaims", docId: created.id, docNo: claimNo, note: claimSummary(created) });
      setRows((list) => [created, ...list.filter((r) => r.id !== created.id)]);
      toast?.(L(`✅ ${claimNo} খোলা হয়েছে — এখন কোম্পানিতে পাঠান`, `✅ ${claimNo} opened — now send to company`));
      if (navigator.onLine) window.S4Offline?.syncNow?.().catch(() => {});
      setSel(created); setView("detail");
    } catch (e) {
      toast?.(`❌ ${e?.message || e}`, "err");
    } finally {
      setSaving(false);
    }
  };

  const patchClaim = async (r, patch, auditNote) => {
    const nowIso = new Date().toISOString();
    const full = { ...patch, updatedAt: nowIso, updatedBy: user?.uid || "" };
    await offlinePatch("warrantyClaims", r.id, full, r);
    const updated = { ...r, ...full };
    setRows((list) => list.map((x) => (x.id === r.id ? updated : x)));
    setSel((s) => (s?.id === r.id ? updated : s));
    logAudit({ shopId, user, profile, action: "update", collection: "warrantyClaims", docId: r.id, docNo: r.claimNo, note: auditNote });
    if (navigator.onLine) window.S4Offline?.syncNow?.().catch(() => {});
    return updated;
  };

  const closeReminder = async (r) => {
    if (!r.reminderId) return;
    try {
      const stored = await offlineGetById("reminders", r.reminderId).catch(() => null);
      const rem = stored?.data ? { ...stored.data, id: r.reminderId } : null;
      if (!rem || rem.status === "done") return;
      const patch = donePatch(rem, { uid: user?.uid || "", name: profile?.personName || "", stop: true });
      await offlinePatch("reminders", r.reminderId, patch, rem);
    } catch (err) {
      console.warn("[S4 Warranty] reminder close failed", err);
    }
  };

  const sendToCompany = async (r) => {
    if (!canAdvance(r.status, "send") || saving) return;
    const days = Math.max(1, Math.min(365, Number(r.reminderDays) || reminderDays || 15));
    const sentDate = ymd(new Date());
    const due = addDaysYmd(sentDate, days);
    if (!window.confirm(L(
      `${r.claimNo} কোম্পানিতে পাঠাবেন?\n\n${days} দিনের মধ্যে চেঞ্জ না এলে জোরে রিমাইন্ডার আসবে (${due.split("-").reverse().join("/")})।\nস্টক এখন বাড়বে না — কোম্পানি নতুন দিলে বাড়বে।`,
      `Send ${r.claimNo} to company?\n\nA loud reminder fires if no change within ${days} day(s) (due ${due}).\nStock does NOT increase yet — only when company gives the new unit.`,
    ))) return;
    setSaving(true);
    try {
      // Claim first so a failed send never leaves an orphan reminder.
      const updated = await patchClaim(r, {
        status: "sent", sentAt: new Date().toISOString(), sentDate,
        reminderDays: days, reminderDueDate: due,
      }, `Sent to company · remind ${due}`);
      let reminderId = updated.reminderId || null;
      const remPayload = buildWarrantyReminder({
        claim: updated, claimNo: updated.claimNo, dueDate: due, shopId, user, profile,
      });
      if (reminderId) {
        await offlinePatch("reminders", reminderId, {
          title: remPayload.title, note: remPayload.note, dueDate: due, dueTime: "09:00",
          status: "open", snoozedUntil: "", remindBefore: 1, updatedAt: remPayload.updatedAt, updatedBy: remPayload.updatedBy,
        }, { id: reminderId, status: "open" });
      } else {
        const res = await offlineCreate("reminders", remPayload);
        reminderId = res.documentId;
        await patchClaim(updated, { reminderId }, `Reminder linked ${reminderId}`);
      }
      toast?.(L(`📤 পাঠানো হয়েছে · রিমাইন্ডার ${due.split("-").reverse().join("/")}`, `📤 Sent · reminder ${due}`), "err");
    } catch (e) {
      toast?.(`❌ ${e?.message || e}`, "err");
    } finally {
      setSaving(false);
    }
  };

  const markReplaced = async (r) => {
    if (!canAdvance(r.status, "replace") || saving) return;
    if (!window.confirm(L(
      `${r.claimNo}: কোম্পানি নতুন পণ্য দিয়েছে?\n\nস্টকে +${fq(r.qty)} ${r.productName} যোগ হবে।\nকাস্টমারকে দিলে পরে “কাস্টমারকে দিয়েছি” চাপুন — তখন স্টক কমবে।`,
      `${r.claimNo}: company gave the new unit?\n\nStock +${fq(r.qty)} ${r.productName}.\nWhen you hand it to the customer, mark Delivered — stock goes down.`,
    ))) return;
    setSaving(true);
    try {
      const updated = await patchClaim(r, {
        status: "replaced",
        replacedAt: new Date().toISOString(),
        replacedDate: ymd(new Date()),
        replacedProductId: r.productId,
        replacedProductName: r.productName,
      }, "Company replaced · stock +");
      await closeReminder(updated);
      invalidateInvoiceRowsCache();
      toast?.(L(`✅ নতুন পণ্য স্টকে যোগ · এখন কাস্টমারকে দিতে পারেন`, `✅ New unit in stock · you can give it to the customer`));
    } catch (e) {
      toast?.(`❌ ${e?.message || e}`, "err");
    } finally {
      setSaving(false);
    }
  };

  const markDelivered = async (r) => {
    if (!canAdvance(r.status, "deliver") || saving) return;
    if (!window.confirm(L(
      `${r.claimNo}: কাস্টমারকে নতুন পণ্য দিয়ে দিলেন?\n\nস্টক থেকে −${fq(r.qty)} কমবে (নেট শূন্য — কোম্পানি দিয়েছিল, কাস্টমার নিল)।`,
      `${r.claimNo}: gave the new unit to the customer?\n\nStock −${fq(r.qty)} (net zero — company in, customer out).`,
    ))) return;
    setSaving(true);
    try {
      await patchClaim(r, {
        status: "delivered",
        deliveredAt: new Date().toISOString(),
        deliveredDate: ymd(new Date()),
      }, "Delivered to customer · stock −");
      invalidateInvoiceRowsCache();
      toast?.(L("✅ কাস্টমারকে দেওয়া হয়েছে", "✅ Delivered to customer"));
    } catch (e) {
      toast?.(`❌ ${e?.message || e}`, "err");
    } finally {
      setSaving(false);
    }
  };

  const cancelClaim = async (r) => {
    if (!canAdvance(r.status, "cancel")) return;
    if (!window.confirm(L(`${r.claimNo} বাতিল করবেন? স্টক হিসাব আগের অবস্থায় ফিরবে।`, `Cancel ${r.claimNo}? Stock effect reverses.`))) return;
    setSaving(true);
    try {
      const updated = await patchClaim(r, {
        status: "cancelled",
        cancelledAt: new Date().toISOString(),
        cancelledBy: user?.uid || "",
      }, "Cancelled");
      await closeReminder(updated);
      if (r.status === "replaced") invalidateInvoiceRowsCache();
      toast?.(L("🚫 বাতিল", "🚫 Cancelled"), "err");
    } catch (e) {
      toast?.(`❌ ${e?.message || e}`, "err");
    } finally {
      setSaving(false);
    }
  };

  const deleteClaim = async (r) => {
    if (!canDelete || r.status !== "cancelled") return;
    if (!window.confirm(L(`${r.claimNo} একেবারে মুছবেন?`, `Delete ${r.claimNo} permanently?`))) return;
    try {
      await closeReminder(r);
      await offlineRemove("warrantyClaims", r.id);
      setRows((list) => list.filter((x) => x.id !== r.id));
      logAudit({ shopId, user, profile, action: "delete", collection: "warrantyClaims", docId: r.id, docNo: r.claimNo });
      toast?.(L("🗑️ মুছে ফেলা হয়েছে", "🗑️ Deleted"), "err");
      setSel(null); setView("list");
    } catch (e) {
      toast?.(`❌ ${e?.message || e}`, "err");
    }
  };

  const fmtDay = (d) => (d ? String(d).slice(0, 10).split("-").reverse().join("/") : "");
  const badge = (r) => {
    const st = WARRANTY_STATUSES[r.status] || WARRANTY_STATUSES.received;
    return <span className="si-badge" style={{ color: st.tone }}>{st[bn ? "bn" : "en"]}</span>;
  };

  const sorted = useMemo(() => [...rows].sort((a, b) => String(b.claimDate || b.createdAt || "").localeCompare(String(a.claimDate || a.createdAt || ""))), [rows]);
  const filtered = useMemo(() => sorted.filter((r) => {
    if (statusF === "open" && ["delivered", "cancelled"].includes(r.status)) return false;
    if (statusF === "sent" && r.status !== "sent") return false;
    if (statusF === "done" && !["delivered", "cancelled"].includes(r.status)) return false;
    if (statusF !== "all" && statusF !== "open" && statusF !== "sent" && statusF !== "done" && r.status !== statusF) return false;
    const q = search.trim().toLowerCase();
    return !q || [r.claimNo, r.productName, r.productCode, r.customerName, r.vendorName, r.serialNo, r.note, claimSummary(r)].join(" ").toLowerCase().includes(q);
  }), [sorted, statusF, search]);
  const liveOpen = useMemo(() => rows.filter((r) => !["delivered", "cancelled"].includes(r.status)).length, [rows]);
  const overdue = useMemo(() => {
    const today = ymd(new Date());
    return rows.filter((r) => r.status === "sent" && r.reminderDueDate && String(r.reminderDueDate).slice(0, 10) <= today).length;
  }, [rows]);

  const print = (r) => {
    const cols = [{ label: "Field" }, { label: "Value" }];
    const body = [
      ["No", r.claimNo], ["Date", fmtDay(r.claimDate)], ["Status", warrantyStatusLabel(r.status)],
      ["Reason", warrantyReasonLabel(r.reason)], ["Product", `${r.productName || ""} ${r.productCode || ""}`.trim()],
      ["Qty", fq(r.qty)], ["Serial", r.serialNo || "—"], ["Customer", r.customerName || "—"],
      ["Company", r.vendorName || "—"], ["Remind days", String(r.reminderDays || "")],
      ["Remind due", fmtDay(r.reminderDueDate)], ["Note", r.note || ""],
    ];
    printWithSettings(generateStatementHTML({
      shopName, title: "WARRANTY / GUARANTEE CLAIM", subtitle: [r.claimNo, fmtDay(r.claimDate), r.status].join(" · "),
      cols, rows: body,
    }), { lang });
  };

  const shell = (titleLeft, titleRight, children) => (
    <div ref={rootRef} className="si-root" style={fitH ? { height: fitH } : undefined}>
      <style>{PM_CSS}</style>
      <style>{SI_CSS}</style>
      <div className="pm-reference-title"><strong style={{ color: ACCENT }}>{titleLeft}</strong><span>{titleRight}</span></div>
      {children}
    </div>
  );

  if (view === "form") {
    return shell(L("নতুন গ্যারান্টি ক্লেইম", "New Warranty Claim"), L("🔋 ব্যাটারি / পণ্য গ্যারান্টি", "🔋 Battery / Product Guarantee"), (
      <>
        <div className="si-body">
          <div className="si-hint" style={{ padding: "4px 6px", background: "#fff7ed", border: "1px solid #fdba74", borderRadius: 8 }}>
            <b>{L("স্টক নিয়ম (জরুরি)", "Stock rule (important)")}:</b>{" "}
            {L("কাস্টমার থেকে নিলে বা কোম্পানিতে পাঠালে স্টক বাড়বে না। কোম্পানি নতুন দিলে +স্টক, কাস্টমারকে দিলে −স্টক। সাধারণ Product Exchange ব্যবহার করবেন না — ডাবল স্টক হবে।",
              "Receiving from customer or sending to company does NOT raise stock. Company replacement = +stock; give to customer = −stock. Do not use Product Exchange here — that double-counts.")}
          </div>
          <fieldset className="pm-panel" style={{ margin: 0 }}>
            <legend className="pm-panel-legend">{L("তথ্য", "Details")}</legend>
            <div className={mobile ? "si-panel-body" : "si-grid2"} style={mobile ? undefined : { gridTemplateColumns: "1fr 1fr 1fr", paddingTop: 3, gap: 8 }}>
              <div className="si-field"><span className="pm-label">{L("তারিখ", "Date")} *</span>
                <input type="date" className="pm-input" value={date} onChange={(e) => setDate(e.target.value)} /></div>
              <div className="si-field"><span className="pm-label">{L("কারণ", "Reason")} *</span>
                <select className="pm-input" value={reason} onChange={(e) => setReason(e.target.value)}>
                  {WARRANTY_REASONS.map((r) => <option key={r.key} value={r.key}>{r[bn ? "bn" : "en"]}</option>)}
                </select>
              </div>
              <div className="si-field"><span className="pm-label">{L("চেঞ্জ না এলে কত দিনে রিমাইন্ডার", "Remind after (days)")} *</span>
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                  <input type="number" min="1" max="365" className="pm-input" style={{ width: 72 }} value={reminderDays}
                    onChange={(e) => setReminderDays(e.target.value)} />
                  {REMINDER_DAY_PRESETS.map((d) => (
                    <button key={d} type="button" className="pm-btn-secondary" style={{ minHeight: 28, padding: "0 8px", fontWeight: reminderDays == d ? 900 : 600 }}
                      onClick={() => setReminderDays(d)}>{d}d</button>
                  ))}
                </div>
              </div>
            </div>
          </fieldset>

          <fieldset className="pm-panel" style={{ margin: 0 }}>
            <legend className="pm-panel-legend">− {L("পণ্য (কাস্টমার ফেরত এনেছে)", "Product (customer returned)")}</legend>
            <div className="si-panel-body">
              {!product && <ProductPicker products={products} stockOf={stockOf} onPick={(p) => setProduct({ productId: p.id, name: p.name || "", code: p.code || "", unit: p.unit || "Pcs" })}
                autoFocus={!mobile} mobile={mobile} lang={lang} placeholder={L("নাম / কোড / বারকোড…", "Name / code / barcode…")} />}
              {product && (
                <div style={{ display: "grid", gridTemplateColumns: mobile ? "1fr" : "minmax(0,1fr) 100px 140px auto", gap: 6, alignItems: "center" }}>
                  <div><b>{product.name}</b>{product.code ? <span className="si-muted"> · {product.code}</span> : null}
                    <div className="si-muted">{L("দোকান স্টক", "Shop stock")}: {stockOf(product.productId) == null ? "…" : fq(stockOf(product.productId))}</div>
                  </div>
                  <input type="number" min="0" step="any" className="pm-input" style={{ textAlign: "right" }} value={qty} onChange={(e) => setQty(e.target.value)} />
                  <input className="pm-input" placeholder={L("সিরিয়াল / ব্যাচ", "Serial / batch")} value={serialNo} onChange={(e) => setSerialNo(e.target.value)} />
                  <button type="button" className="pm-btn-secondary pm-btn--danger" onClick={() => setProduct(null)}>✕</button>
                </div>
              )}
            </div>
          </fieldset>

          <fieldset className="pm-panel" style={{ margin: 0 }}>
            <legend className="pm-panel-legend">{L("কাস্টমার (ঐচ্ছিক)", "Customer (optional)")}</legend>
            <div className="si-panel-body">
              {customer ? (
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
                  <b>{customer.customerName}</b>
                  <button type="button" className="pm-btn-secondary" onClick={() => { setCustomer(null); setCustomerQ(""); }}>{L("বদলান", "Change")}</button>
                </div>
              ) : (
                <>
                  <input className="pm-input" value={customerQ} onChange={(e) => setCustomerQ(e.target.value)} placeholder={L("নাম বা মোবাইল…", "Name or mobile…")} />
                  {custHits.map((c) => (
                    <button key={c.id} type="button" className="si-mrow" style={{ width: "100%", textAlign: "left", border: 0, borderBottom: "1px solid #e2e8f0", background: "#fff", cursor: "pointer" }}
                      onClick={() => { setCustomer(c); setCustomerQ(""); }}>{c.customerName} <span className="si-muted">{c.mobileNumber || ""}</span></button>
                  ))}
                </>
              )}
            </div>
          </fieldset>

          <fieldset className="pm-panel" style={{ margin: 0 }}>
            <legend className="pm-panel-legend">{L("কোম্পানি / সাপ্লায়ার *", "Company / Supplier *")}</legend>
            <div className="si-panel-body">
              {vendor ? (
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
                  <b>{vendor.vendorName}</b>
                  <button type="button" className="pm-btn-secondary" onClick={() => { setVendor(null); setVendorQ(""); }}>{L("বদলান", "Change")}</button>
                </div>
              ) : (
                <>
                  <input className="pm-input" value={vendorQ} onChange={(e) => setVendorQ(e.target.value)} placeholder={L("কোম্পানির নাম…", "Company name…")} />
                  {vendHits.map((v) => (
                    <button key={v.id} type="button" className="si-mrow" style={{ width: "100%", textAlign: "left", border: 0, borderBottom: "1px solid #e2e8f0", background: "#fff", cursor: "pointer" }}
                      onClick={() => { setVendor(v); setVendorQ(""); }}>{v.vendorName}</button>
                  ))}
                </>
              )}
            </div>
          </fieldset>

          <fieldset className="pm-panel" style={{ margin: 0 }}>
            <legend className="pm-panel-legend">{L("নোট", "Note")}</legend>
            <div className="si-panel-body">
              <input className="pm-input" value={note} onChange={(e) => setNote(e.target.value)} placeholder={L("ঐচ্ছিক", "Optional")} />
            </div>
          </fieldset>
        </div>
        <div className={`si-actions${mobile ? " si-sticky-actions" : ""}`}>
          <button type="button" className="pm-btn-secondary" disabled={saving} onClick={backToList}>← {L("তালিকা", "List")}</button>
          <span className="si-toolbar-gap" />
          <button type="button" className="pm-btn pm-btn--primary" disabled={saving || !product} onClick={saveNew}>
            {saving ? "…" : `💾 ${L("ক্লেইম খুলুন", "Open claim")}`}
          </button>
        </div>
      </>
    ));
  }

  if (view === "detail" && sel) {
    const r = rows.find((x) => x.id === sel.id) || sel;
    const st = WARRANTY_STATUSES[r.status] || WARRANTY_STATUSES.received;
    const today = ymd(new Date());
    const isOverdue = r.status === "sent" && r.reminderDueDate && String(r.reminderDueDate).slice(0, 10) <= today;
    return shell(<>{r.claimNo} {badge(r)}</>, L("🔋 গ্যারান্টি ক্লেইম", "🔋 Warranty Claim"), (
      <>
        <div className="si-body">
          {isOverdue && (
            <div style={{ padding: 12, marginBottom: 8, borderRadius: 10, background: "#fef2f2", border: "2px solid #dc2626", color: "#991b1b", fontWeight: 800 }}>
              🚨 {L("কোম্পানি এখনো চেঞ্জ দেয়নি — এখনই ফলো-আপ করুন!", "Company has not replaced yet — follow up NOW!")}
              <div style={{ fontWeight: 600, marginTop: 4 }}>{L("রিমাইন্ডার তারিখ", "Reminder date")}: {fmtDay(r.reminderDueDate)}</div>
            </div>
          )}
          <fieldset className="pm-panel" style={{ margin: 0 }}>
            <legend className="pm-panel-legend" style={{ background: st.tone }}>{st[bn ? "bn" : "en"]}</legend>
            <div className="si-panel-body" style={{ paddingTop: 4, display: "grid", gap: 4 }}>
              <div><b style={{ color: ACCENT }}>{r.claimNo}</b> · {fmtDay(r.claimDate)} · {warrantyReasonLabel(r.reason, bn)}</div>
              <div style={{ fontSize: 16, fontWeight: 800 }}>{r.productName}{r.productCode ? ` · ${r.productCode}` : ""} × {fq(r.qty)} {r.unit || ""}</div>
              {r.serialNo && <div className="si-muted">{L("সিরিয়াল", "Serial")}: {r.serialNo}</div>}
              <div>{L("কাস্টমার", "Customer")}: <b>{r.customerName || "—"}</b>{r.customerMobile ? ` · ${r.customerMobile}` : ""}</div>
              <div>{L("কোম্পানি", "Company")}: <b>{r.vendorName || "—"}</b></div>
              <div>{L("রিমাইন্ডার", "Reminder")}: <b>{r.reminderDays || "—"} {L("দিন", "days")}</b>
                {r.reminderDueDate ? ` · ${L("শেষ তারিখ", "due")} ${fmtDay(r.reminderDueDate)}` : ` · ${L("কোম্পানিতে পাঠালে শুরু", "starts when sent")}`}</div>
              {r.note && <div className="si-note">📝 {r.note}</div>}
              <div className="si-muted" style={{ marginTop: 6 }}>
                {L("স্টক: পাঠানো = ০ · কোম্পানি দিলে = + · কাস্টমারকে দিলে = −", "Stock: sent = 0 · company replaced = + · delivered = −")}
              </div>
            </div>
          </fieldset>
        </div>
        <div className={`si-actions${mobile ? " si-sticky-actions" : ""}`} style={{ flexWrap: "wrap" }}>
          <button type="button" className="pm-btn-secondary" onClick={backToList}>← {L("তালিকা", "List")}</button>
          {canPrint && <button type="button" className="pm-btn-secondary" onClick={() => print(r)}>🖨️</button>}
          <span className="si-toolbar-gap" />
          {canManage && canAdvance(r.status, "send") && (
            <button type="button" className="pm-btn pm-btn--primary" disabled={saving} onClick={() => sendToCompany(r)}>
              📤 {L("কোম্পানিতে পাঠালাম", "Sent to company")}
            </button>
          )}
          {canManage && canAdvance(r.status, "replace") && (
            <button type="button" className="pm-btn pm-btn--primary" disabled={saving} onClick={() => markReplaced(r)}
              style={{ background: "#15803d" }}>
              ✅ {L("কোম্পানি নতুন দিয়েছে (+স্টক)", "Company replaced (+stock)")}
            </button>
          )}
          {canManage && canAdvance(r.status, "deliver") && (
            <button type="button" className="pm-btn pm-btn--primary" disabled={saving} onClick={() => markDelivered(r)}
              style={{ background: "#0f766e" }}>
              👤 {L("কাস্টমারকে দিয়েছি (−স্টক)", "Given to customer (−stock)")}
            </button>
          )}
          {canManage && canAdvance(r.status, "cancel") && (
            <button type="button" className="pm-btn-secondary pm-btn--danger" disabled={saving} onClick={() => cancelClaim(r)}>⛔ {L("বাতিল", "Cancel")}</button>
          )}
          {canDelete && r.status === "cancelled" && (
            <button type="button" className="pm-btn-secondary pm-btn--danger" onClick={() => deleteClaim(r)}>🗑️</button>
          )}
        </div>
      </>
    ));
  }

  return shell(L("🔋 গ্যারান্টি / চেঞ্জ ক্লেইম", "🔋 Warranty / Change Claims"), `${liveOpen} ${L("খোলা", "open")}${overdue ? ` · 🚨 ${overdue}` : ""}`, (
    <>
      <div className="si-toolbar">
        {canManage && <button type="button" className="pm-btn pm-btn--primary" onClick={openNew}>+ {L("নতুন ক্লেইম", "New Claim")}</button>}
        <span className="si-toolbar-gap" />
        <div className="si-search" style={{ minWidth: mobile ? "100%" : 240 }}>
          <input className="pm-input" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={L("নম্বর, পণ্য, কাস্টমার, কোম্পানি…", "No, product, customer, company…")} />
          {search && <button type="button" onClick={() => setSearch("")}>✕</button>}
        </div>
        <select className="pm-input" style={{ width: mobile ? "100%" : 160 }} value={statusF} onChange={(e) => setStatusF(e.target.value)}>
          <option value="open">{L("চলমান", "In progress")}</option>
          <option value="sent">{L("কোম্পানিতে বাকি", "Waiting on company")}</option>
          <option value="done">{L("শেষ / বাতিল", "Done / cancelled")}</option>
          <option value="all">{L("সব", "All")}</option>
        </select>
      </div>
      {overdue > 0 && (
        <div style={{ margin: "0 8px 8px", padding: 10, borderRadius: 10, background: "#fef2f2", border: "2px solid #dc2626", fontWeight: 800, color: "#991b1b" }}>
          🚨 {L(`${overdue}টি ক্লেইমে কোম্পানি এখনো চেঞ্জ দেয়নি — বেল/নোটিফ দেখুন`, `${overdue} claim(s) still waiting on company change — check bell/notify`)}
        </div>
      )}
      <div className="si-main is-all">
        <div className="si-box">
          {filtered.length > 0 && (mobile ? filtered.map((r) => (
            <button key={r.id} type="button" className="si-mrow" onClick={() => { setSel(r); setView("detail"); }}
              style={r.status === "cancelled" ? { opacity: 0.55 } : r.status === "sent" && r.reminderDueDate && String(r.reminderDueDate) <= ymd(new Date()) ? { borderLeft: "4px solid #dc2626" } : undefined}>
              <div className="si-mrow-top"><span style={{ color: ACCENT }}>{r.claimNo}</span>{badge(r)}</div>
              <div className="si-mrow-sub"><span>{fmtDay(r.claimDate)} · {warrantyReasonLabel(r.reason, bn)}</span><span>{r.vendorName || ""}</span></div>
              <div className="si-mrow-sub"><span>{claimSummary(r)}</span></div>
            </button>
          )) : (
            <table className="pm-table">
              <thead><tr>
                <th style={{ width: 78 }}>{L("তারিখ", "Date")}</th>
                <th style={{ width: 88 }}>{L("নম্বর", "No")}</th>
                <th style={{ width: 110 }}>{L("কারণ", "Reason")}</th>
                <th>{L("পণ্য / পার্টি", "Product / parties")}</th>
                <th style={{ width: 90 }}>{L("রিমাইন্ডার", "Remind")}</th>
                <th style={{ width: 130 }} className="si-center">{L("অবস্থা", "Status")}</th>
              </tr></thead>
              <tbody>
                {filtered.map((r) => {
                  const late = r.status === "sent" && r.reminderDueDate && String(r.reminderDueDate).slice(0, 10) <= ymd(new Date());
                  return (
                    <tr key={r.id} className="pm-clickable" onClick={() => { setSel(r); setView("detail"); }}
                      style={r.status === "cancelled" ? { color: "#6b7280" } : late ? { background: "#fef2f2" } : undefined}>
                      <td>{fmtDay(r.claimDate)}</td>
                      <td className="si-strong" style={{ color: r.status === "cancelled" ? undefined : ACCENT }}>{r.claimNo}</td>
                      <td>{warrantyReasonLabel(r.reason, bn)}</td>
                      <td title={claimSummary(r)}>{claimSummary(r)}</td>
                      <td style={late ? { color: "#b91c1c", fontWeight: 800 } : undefined}>
                        {r.reminderDueDate ? fmtDay(r.reminderDueDate) : `${r.reminderDays || "—"}d`}
                        {late ? " 🚨" : ""}
                      </td>
                      <td className="si-center">{badge(r)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ))}
          {!filtered.length && (
            <div className="si-empty">
              {rows.length
                ? L("এই ফিল্টারে কিছু নেই", "Nothing matches")
                : L("ব্যাটারি/পণ্য গ্যারান্টি ক্লেইম এখানে — কাস্টমার → কোম্পানি → নতুন পণ্য", "Battery/product guarantee claims here — customer → company → new unit")}
            </div>
          )}
        </div>
      </div>
      <div className="si-statusbar">
        <span>{L("দেখাচ্ছে", "Showing")} <b>{filtered.length}</b> / {rows.length}</span>
        <span>{L("এক্সচেঞ্জ ≠ গ্যারান্টি — এখানে স্টক নিরাপদ", "Exchange ≠ warranty — stock-safe here")}</span>
      </div>
    </>
  ));
}
