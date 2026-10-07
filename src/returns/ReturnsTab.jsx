import React, { useEffect, useMemo, useRef, useState } from "react";
import { PM_CSS } from "../product-master/pmStyles";
import { SI_CSS, usePmFitHeight, usePmMobile } from "../sales-invoice/siSkin";
import { offlineCreate, offlineGetById, offlinePatch, offlineRemove } from "../offline/offlineRepository";
import { subscribeShopCollection } from "../offline/realtimeSync";
import { printWithSettings } from "../print/printSettings.js";
import { generateStatementHTML } from "../print/printDesign.js";
import { logAudit } from "../utils/auditLog.js";
import { useEscapeKey } from "../components/WindowChrome.jsx";
import { isBranchTransferBill } from "../branch-transfer/branchTransferDomain.js";

const n2 = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const r2 = (v) => Math.round((n2(v) + Number.EPSILON) * 100) / 100;
const f2 = (v) => r2(v).toFixed(2);
const localDay = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export const RETURN_KINDS = {
  sales: {
    col: "salesReturns", invCol: "salesInvoices", prefix: "SR", serial: "lastSRSerial",
    partyId: "customerId", partyName: "customerName", partyMobile: "customerMobile", priceKey: "unitPrice", vatKey: "vatAmt",
    accent: "#16a34a", printTitle: "CREDIT NOTE",
    title: { bn: "↩️ সেলস রিটার্ন (ক্রেডিট নোট)", en: "↩️ Sales Return (Credit Note)" },
    party: { bn: "কাস্টমার", en: "Customer" },
    refund: { bn: "কাস্টমারকে টাকা ফেরত", en: "Refund to customer" },
  },
  purchase: {
    col: "purchaseReturns", invCol: "purchaseInvoices", prefix: "PR", serial: "lastPRSerial",
    partyId: "vendorId", partyName: "vendorName", partyMobile: "vendorMobile", priceKey: "unitCost", vatKey: "taxAmt",
    accent: "#ea580c", printTitle: "DEBIT NOTE",
    title: { bn: "↪️ পারচেজ রিটার্ন (ডেবিট নোট)", en: "↪️ Purchase Return (Debit Note)" },
    party: { bn: "সাপ্লায়ার", en: "Supplier" },
    refund: { bn: "সাপ্লায়ার থেকে টাকা ফেরত", en: "Refund from supplier" },
  },
};

const RETURNABLE_STATUSES = ["confirmed", "partial", "paid"];
const REFUND_METHODS = [
  { key: "cash", bn: "নগদ", en: "Cash" },
  { key: "bank_transfer", bn: "ব্যাংক ট্রান্সফার", en: "Bank Transfer" },
  { key: "cheque", bn: "চেক", en: "Cheque" },
  { key: "card", bn: "কার্ড", en: "Card" },
];

// Bill-level discount, adjustment and round off are spread over the lines in proportion to their totals.
function billRatio(inv) {
  const sum = (inv?.items || []).reduce((t, it) => t + n2(it.lineTotal), 0);
  return sum > 0 ? n2(inv.grandTotal) / sum : 1;
}

function lineValue(inv, idx, qty, vatKey) {
  const it = inv.items[idx];
  const soldQty = n2(it.qty);
  if (!soldQty) return { amount: 0, vat: 0, rate: 0 };
  const ratio = billRatio(inv);
  const amount = (n2(it.lineTotal) / soldQty) * qty * ratio;
  const vat = (n2(it[vatKey]) / soldQty) * qty * ratio;
  return { amount: r2(amount), vat: r2(vat), rate: r2((n2(it.lineTotal) / soldQty) * ratio) };
}

export function returnedQtyByLine(returns, invoiceId, exceptId = null) {
  const map = new Map();
  (returns || []).forEach((r) => {
    if (r.invoiceId !== invoiceId || r.status === "cancelled" || r.id === exceptId) return;
    (r.items || []).forEach((it) => map.set(it.lineIndex, (map.get(it.lineIndex) || 0) + n2(it.qty)));
  });
  return map;
}

// Credit/debit notes shown in the party ledger next to receipts/payments.
export function returnsAsLedgerVouchers(returns, kind) {
  const k = RETURN_KINDS[kind];
  return (returns || [])
    .filter((r) => r.status !== "cancelled" && n2(r.appliedToInvoice) > 0.009)
    .map((r) => ({
      id: `ret-${r.id}`, no: r.returnNo, date: String(r.returnDate || "").slice(0, 10),
      partyId: r.partyId || null, partyName: r.partyName || "", partyMobile: r.partyMobile || "",
      method: kind === "sales" ? "Credit Note" : "Debit Note", typeLabel: kind === "sales" ? "Credit Note" : "Debit Note",
      amount: n2(r.appliedToInvoice), status: r.status,
      allocations: [{ invoiceId: r.invoiceId, invoiceNo: r.invoiceNo, amount: n2(r.appliedToInvoice) }],
      raw: { ...r, __return: true }, ref: k.prefix,
    }));
}

export default function ReturnsTab({ kind = "sales", lang = "en", th, shopId, user, profile, isOwner, canManage, cur = "AED", isDesktop, toast, shopName = "", makeNo, leaveGuard = null }) {
  const K = RETURN_KINDS[kind];
  const bn = lang === "bn";
  const L = (b, e) => (bn ? b : e);

  const [returns, setReturns] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [view, setView] = useState("list");
  const [sel, setSel] = useState(null);
  const [search, setSearch] = useState("");
  const [showCancelled, setShowCancelled] = useState(false);
  const [saving, setSaving] = useState(false);

  const [date, setDate] = useState(localDay());
  const [invQ, setInvQ] = useState("");
  const [inv, setInv] = useState(null);
  const [qtys, setQtys] = useState({});
  const [reason, setReason] = useState("");
  const [refundMethod, setRefundMethod] = useState("cash");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const mobile = usePmMobile();
  const rootRef = useRef(null);
  const fitH = usePmFitHeight(rootRef, mobile, view);

  useEffect(() => {
    if (!shopId) return undefined;
    const u1 = subscribeShopCollection({ collectionName: K.col, shopId, onRows: (list) => setReturns(list || []) });
    const u2 = subscribeShopCollection({ collectionName: K.invCol, shopId, onRows: (list) => setInvoices(list || []) });
    return () => { u1?.(); u2?.(); };
  }, [shopId, K.col, K.invCol]);

  const formDirty = () => view === "form" && !!inv && Object.values(qtys).some((q) => n2(q) > 0);
  const leaveOk = () => !formDirty() || window.confirm(L("এই রিটার্ন সেভ হয়নি। তবুও চলে যাবেন?", "This return is not saved. Leave anyway?"));
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

  const ownOnly = kind === "sales" && !isOwner;
  const myInvoiceIds = useMemo(() => new Set(invoices.filter((i) => i.createdBy === user?.uid).map((i) => i.id)), [invoices, user?.uid]);
  const visibleReturns = ownOnly ? returns.filter((r) => r.createdBy === user?.uid || myInvoiceIds.has(r.invoiceId)) : returns;
  const sortedReturns = useMemo(() => [...visibleReturns].sort((a, b) => String(b.returnDate || b.createdAt || "").localeCompare(String(a.returnDate || a.createdAt || ""))), [visibleReturns]);
  const filtered = sortedReturns.filter((r) => {
    if (!showCancelled && r.status === "cancelled") return false;
    const day = String(r.returnDate || r.createdAt || "").slice(0, 10);
    if ((from && day < from) || (to && day > to)) return false;
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return [r.returnNo, r.invoiceNo, r.supplierInvoiceNo, r.partyName, ...(r.items || []).map((it) => `${it.name} ${it.code || ""}`)].join(" ").toLowerCase().includes(q);
  });
  const activeTotal = visibleReturns.filter((r) => r.status !== "cancelled").reduce((t, r) => t + n2(r.total), 0);

  const invMatches = useMemo(() => {
    const q = invQ.trim().toLowerCase();
    return invoices
      .filter((i) => !i.isDeleted && !i.deleted && i.docKind !== "quotation" && !isBranchTransferBill(i) && RETURNABLE_STATUSES.includes(i.status) && (i.items || []).length)
      .filter((i) => !ownOnly || i.createdBy === user?.uid)
      .filter((i) => !q || [i.invoiceNo, i.supplierInvoiceNo, i[K.partyName], i[K.partyMobile]].join(" ").toLowerCase().includes(q))
      .sort((a, b) => String(b.invoiceDate || b.createdAt || "").localeCompare(String(a.invoiceDate || a.createdAt || "")))
      .slice(0, 30);
  }, [invoices, invQ, K.partyName, K.partyMobile, ownOnly, user?.uid]);

  const returnedMap = useMemo(() => (inv ? returnedQtyByLine(returns, inv.id) : new Map()), [returns, inv]);
  const lines = useMemo(() => {
    if (!inv) return [];
    return (inv.items || []).map((it, idx) => {
      const sold = n2(it.qty);
      const already = returnedMap.get(idx) || 0;
      const returnable = Math.max(0, r2(sold - already));
      const qty = Math.min(Math.max(n2(qtys[idx]), 0), returnable);
      const val = lineValue(inv, idx, qty, K.vatKey);
      return { it, idx, sold, already, returnable, qty, ...val };
    });
  }, [inv, qtys, returnedMap, K.vatKey]);
  const total = r2(lines.reduce((t, l) => t + l.amount, 0));
  const totalVat = r2(lines.reduce((t, l) => t + l.vat, 0));
  const due = inv ? Math.max(0, r2(n2(inv.grandTotal) - n2(inv.amountPaid))) : 0;
  const applied = r2(Math.min(total, due));
  const refund = r2(total - applied);

  const resetForm = () => { setDate(localDay()); setInvQ(""); setInv(null); setQtys({}); setReason(""); setRefundMethod("cash"); };
  const openNew = () => { resetForm(); setView("form"); };

  const save = async () => {
    if (saving) return;
    if (!inv) return toast?.(L("❌ আগে বিল বেছে নিন", "❌ Pick the bill first"), "err");
    if (!date) return toast?.(L("❌ রিটার্নের তারিখ দিন", "❌ Pick the return date"), "err");
    const billDay = String(inv.invoiceDate || "").slice(0, 10);
    if (billDay && date < billDay) return toast?.(L(`❌ রিটার্নের তারিখ বিলের তারিখের (${billDay}) আগে হতে পারে না`, `❌ The return date can't be before the bill date (${billDay})`), "err");
    const picked = lines.filter((l) => l.qty > 0);
    if (!picked.length) return toast?.(L("❌ কোন পণ্য কতটা ফেরত, সেটা লিখুন", "❌ Enter the quantity to return"), "err");
    const over = lines.find((l) => n2(qtys[l.idx]) > l.returnable + 1e-9);
    if (over) return toast?.(L(`❌ "${over.it.name}": সর্বোচ্চ ${over.returnable} ফেরত দেওয়া যায়`, `❌ "${over.it.name}": at most ${over.returnable} can be returned`), "err");
    setSaving(true);
    try {
      const stored = await offlineGetById(K.invCol, inv.id).catch(() => null);
      const fresh = stored?.data ? { ...stored.data, id: inv.id } : inv;
      if (!RETURNABLE_STATUSES.includes(fresh.status)) throw new Error(L("এই বিল এখন আর ফেরতযোগ্য নয় (বাতিল/ড্রাফট)", "This bill can no longer be returned (cancelled/draft)"));
      const freshDue = Math.max(0, r2(n2(fresh.grandTotal) - n2(fresh.amountPaid)));
      const appliedNow = r2(Math.min(total, freshDue));
      const refundNow = r2(total - appliedNow);
      const returnNo = await makeNo(K.serial, K.prefix, returns.map((r) => r.returnNo));
      const nowIso = new Date().toISOString();
      const payload = {
        shopId, returnNo, returnDate: date, kind,
        invoiceId: fresh.id, invoiceNo: fresh.invoiceNo || "", supplierInvoiceNo: fresh.supplierInvoiceNo || "", invoiceDate: fresh.invoiceDate || "",
        partyId: fresh[K.partyId] || null, partyName: fresh[K.partyName] || "", partyMobile: fresh[K.partyMobile] || "",
        items: picked.map((l) => ({
          lineIndex: l.idx, productId: l.it.productId || null, name: l.it.name || "", code: l.it.code || "", brand: l.it.brand || "",
          qty: l.qty, unit: l.it.unit || "Pcs", unitFactor: n2(l.it.unitFactor) || 1, rate: l.rate, amount: l.amount, vatAmt: l.vat,
          ...(l.it.batchNo ? { batchNo: l.it.batchNo } : {}),
        })),
        subtotal: r2(total - totalVat), totalVat, total,
        appliedToInvoice: appliedNow, refundAmount: refundNow, refundMethod: refundNow > 0 ? refundMethod : "",
        reason: reason.trim(), status: "confirmed",
        createdAt: nowIso, createdBy: user?.uid || "", createdByName: profile?.personName || "",
      };
      const res = await offlineCreate(K.col, payload);
      const created = { ...res.data, id: res.documentId };
      if (appliedNow > 0) {
        const newPaid = r2(n2(fresh.amountPaid) + appliedNow);
        const balance = Math.max(0, r2(n2(fresh.grandTotal) - newPaid));
        await offlinePatch(K.invCol, fresh.id, { amountPaid: newPaid, balanceDue: balance, status: balance < 0.01 ? "paid" : "partial", updatedAt: nowIso, updatedBy: user?.uid || "" }, fresh);
      }
      logAudit({ shopId, user, profile, action: "create", collection: K.col, docId: created.id, docNo: returnNo, amount: total, note: `${payload.partyName} · ${payload.invoiceNo}` });
      setReturns((list) => [created, ...list.filter((r) => r.id !== created.id)]);
      toast?.(L(`✅ ${returnNo} সেভ হয়েছে`, `✅ ${returnNo} saved`));
      if (navigator.onLine) window.S4Offline?.syncNow?.().catch(() => {});
      setSel(created); setView("detail");
    } catch (e) {
      toast?.(`❌ ${e?.message || e}`, "err");
    } finally {
      setSaving(false);
    }
  };

  const canCancel = (r) => r.status !== "cancelled" && (isOwner || (canManage && r.createdBy === user?.uid));

  const cancelReturn = async (r) => {
    if (!canCancel(r)) return;
    if (!window.confirm(L(`${r.returnNo} বাতিল করবেন? স্টক আর বিলের বাকি আগের মতো হয়ে যাবে।`, `Cancel ${r.returnNo}? Stock and the bill balance go back to before.`))) return;
    setSaving(true);
    try {
      const nowIso = new Date().toISOString();
      if (n2(r.appliedToInvoice) > 0) {
        const stored = await offlineGetById(K.invCol, r.invoiceId).catch(() => null);
        const fresh = stored?.data ? { ...stored.data, id: r.invoiceId } : invoices.find((i) => i.id === r.invoiceId);
        if (fresh && fresh.status !== "cancelled") {
          const newPaid = Math.max(0, r2(n2(fresh.amountPaid) - n2(r.appliedToInvoice)));
          const balance = Math.max(0, r2(n2(fresh.grandTotal) - newPaid));
          const status = balance < 0.01 ? "paid" : newPaid > 0.009 ? "partial" : "confirmed";
          await offlinePatch(K.invCol, fresh.id, { amountPaid: newPaid, balanceDue: balance, status, updatedAt: nowIso, updatedBy: user?.uid || "" }, fresh);
        }
      }
      const patch = { status: "cancelled", cancelledAt: nowIso, cancelledBy: user?.uid || "", updatedAt: nowIso, updatedBy: user?.uid || "" };
      await offlinePatch(K.col, r.id, patch, r);
      const updated = { ...r, ...patch };
      setReturns((list) => list.map((x) => (x.id === r.id ? updated : x)));
      setSel((s) => (s?.id === r.id ? updated : s));
      logAudit({ shopId, user, profile, action: "cancel", collection: K.col, docId: r.id, docNo: r.returnNo, amount: r.total, note: `${r.partyName} · ${r.invoiceNo}` });
      toast?.(L("🚫 রিটার্ন বাতিল হয়েছে", "🚫 Return cancelled"), "err");
      if (navigator.onLine) window.S4Offline?.syncNow?.().catch(() => {});
    } catch (e) {
      toast?.(`❌ ${e?.message || e}`, "err");
    } finally {
      setSaving(false);
    }
  };

  const deleteReturn = async (r) => {
    if (!isOwner || r.status !== "cancelled") return;
    if (!window.confirm(L(`${r.returnNo} একেবারে মুছে ফেলবেন?`, `Delete ${r.returnNo} permanently?`))) return;
    try {
      await offlineRemove(K.col, r.id);
      setReturns((list) => list.filter((x) => x.id !== r.id));
      logAudit({ shopId, user, profile, action: "delete", collection: K.col, docId: r.id, docNo: r.returnNo, amount: r.total, note: `${r.partyName} · ${r.invoiceNo}` });
      toast?.(L("🗑️ মুছে ফেলা হয়েছে", "🗑️ Deleted"), "err");
      setSel(null); setView("list");
      if (navigator.onLine) window.S4Offline?.syncNow?.().catch(() => {});
    } catch (e) {
      toast?.(`❌ ${e?.message || e}`, "err");
    }
  };

  const print = (r) => {
    const cols = [{ label: "#" }, { label: "Item" }, { label: "Qty", align: "right" }, { label: "Rate", align: "right" }, { label: `Amount (${cur})`, align: "right" }];
    const rows = (r.items || []).map((it, i) => [String(i + 1), [it.name, it.code].filter(Boolean).join(" · "), `${it.qty} ${it.unit || ""}`, f2(it.rate), f2(it.amount)]);
    const subtitle = [r.returnNo, r.returnDate, r.partyName, `Against ${r.invoiceNo}${r.supplierInvoiceNo ? ` (${r.supplierInvoiceNo})` : ""}`, r.status === "cancelled" ? "CANCELLED" : ""].filter(Boolean).join(" · ");
    printWithSettings(generateStatementHTML({ shopName, title: K.printTitle, subtitle, cols, rows, foot: ["", "", "", "TOTAL", f2(r.total)] }), { lang });
  };

  const fmtDay = (d) => (d ? String(d).slice(0, 10).split("-").reverse().join("/") : "");
  const methodName = (key) => (REFUND_METHODS.find((m) => m.key === key) || {})[bn ? "bn" : "en"] || key || "";
  const backToList = () => { if (leaveOk()) { setSel(null); setView("list"); } };
  const statusBadge = (r) => (
    <span className="si-badge" style={{ color: r.status === "cancelled" ? "#6b7280" : K.accent }}>
      {r.status === "cancelled" ? L("বাতিল", "Cancelled") : L("সম্পন্ন", "Done")}
    </span>
  );
  const vRow = (label, value, opts = {}) => (
    <div className="pm-form-row">
      <span className="pm-label">{label}</span>
      <div className={`si-val${opts.strong ? " is-strong" : ""}`} style={opts.color ? { color: opts.color } : undefined}>{value}</div>
    </div>
  );
  const totalRow = (label, value, opts = {}) => (
    <div className={`si-total-row${opts.grand ? " is-grand" : ""}`} style={opts.color ? { color: opts.color } : undefined}>
      <span>{label}</span><b>{value}</b>
    </div>
  );
  const shell = (titleLeft, titleRight, children) => (
    <div ref={rootRef} className="si-root" style={fitH ? { height: fitH } : undefined}>
      <style>{PM_CSS}</style>
      <style>{SI_CSS}</style>
      <div className="pm-reference-title">
        <strong style={{ color: K.accent }}>{titleLeft}</strong>
        <span>{titleRight}</span>
      </div>
      {children}
    </div>
  );

  if (view === "form") {
    const billDay = inv ? String(inv.invoiceDate || "").slice(0, 10) : "";
    const dateBad = !!inv && (!date || (billDay && date < billDay));
    return shell(L("নতুন রিটার্ন", "New Return"), K.title[bn ? "bn" : "en"], (
      <>
        <div className="si-body">
          <fieldset className="pm-panel" style={{ margin: 0 }}>
            <legend className="pm-panel-legend">{L("বিল", "Bill")}</legend>
            <div className="si-panel-body">
              <div className={mobile ? "si-panel-body" : "si-grid2"} style={mobile ? { padding: 0 } : { gridTemplateColumns: "150px minmax(0,1fr)" }}>
                <div className="si-field">
                  <span className="pm-label">{L("রিটার্নের তারিখ", "Return date")} *</span>
                  <input type="date" className="pm-input" value={date} onChange={(e) => setDate(e.target.value)} style={dateBad ? { borderColor: "#b91c1c" } : undefined} />
                </div>
                <div className="si-field">
                  <span className="pm-label">{L("কোন বিলের মাল ফেরত", "Return against bill")} *</span>
                  {inv ? (
                    <div className="si-val is-strong" style={{ justifyContent: "space-between", gap: 6 }}>
                      <span>{inv.invoiceNo}{inv.supplierInvoiceNo ? ` (${inv.supplierInvoiceNo})` : ""} · {inv[K.partyName] || "—"}</span>
                      <button type="button" className="pm-btn-secondary" onClick={() => { setInv(null); setQtys({}); }} title={L("অন্য বিল", "Another bill")}>✕</button>
                    </div>
                  ) : (
                    <input className="pm-input" value={invQ} onChange={(e) => setInvQ(e.target.value)} autoFocus={!mobile} placeholder={L(`বিল নং বা ${K.party.bn}ের নাম/মোবাইল লিখুন…`, `Type bill no or ${K.party.en.toLowerCase()} name/mobile…`)} />
                  )}
                </div>
              </div>
              {dateBad && <div className="si-due">{!date ? L("তারিখ দিন", "Pick a date") : L(`বিলের তারিখ ${fmtDay(billDay)} — রিটার্ন এর আগে হতে পারে না`, `Bill date is ${fmtDay(billDay)} — the return can't be earlier`)}</div>}
              {inv && (
                <div className={mobile ? "si-panel-body" : "si-grid2"} style={mobile ? { padding: 0 } : { gridTemplateColumns: "repeat(4, minmax(0,1fr))" }}>
                  {vRow(L("বিলের তারিখ", "Bill date"), fmtDay(billDay) || "—")}
                  {vRow(K.party[bn ? "bn" : "en"], inv[K.partyName] || "—")}
                  {vRow(L("বিলের মোট", "Bill total"), `${cur} ${f2(inv.grandTotal)}`)}
                  {vRow(L("বিলের বাকি", "Bill due"), `${cur} ${f2(due)}`, { color: due > 0 ? "#b91c1c" : "#15803d" })}
                </div>
              )}
            </div>
          </fieldset>

          {!inv && (
            <div className="si-box" style={{ flex: mobile ? undefined : 1, minHeight: 160 }}>
              {mobile ? invMatches.map((i) => (
                <button key={i.id} type="button" className="si-mrow" onClick={() => { setInv(i); setQtys({}); }}>
                  <div className="si-mrow-top"><span>{i.invoiceNo}{i.supplierInvoiceNo ? ` (${i.supplierInvoiceNo})` : ""}</span><span>{cur} {f2(i.grandTotal)}</span></div>
                  <div className="si-mrow-sub"><span>{i[K.partyName] || "—"}</span><span>{fmtDay(i.invoiceDate)}</span></div>
                </button>
              )) : (
                <table className="pm-table">
                  <thead><tr>
                    <th style={{ width: 84 }}>{L("তারিখ", "Date")}</th>
                    <th style={{ width: 120 }}>{L("বিল নং", "Bill No")}</th>
                    <th>{K.party[bn ? "bn" : "en"]}</th>
                    <th style={{ width: 70 }} className="si-center">{L("আইটেম", "Items")}</th>
                    <th style={{ width: 100 }} className="si-num">{L("মোট", "Total")}</th>
                    <th style={{ width: 90 }} className="si-num">{L("বাকি", "Due")}</th>
                  </tr></thead>
                  <tbody>
                    {invMatches.map((i) => {
                      const iDue = Math.max(0, r2(n2(i.grandTotal) - n2(i.amountPaid)));
                      return (
                        <tr key={i.id} className="pm-clickable" onClick={() => { setInv(i); setQtys({}); }}>
                          <td>{fmtDay(i.invoiceDate)}</td>
                          <td className="si-strong">{i.invoiceNo}{i.supplierInvoiceNo ? ` (${i.supplierInvoiceNo})` : ""}</td>
                          <td>{i[K.partyName] || "—"}</td>
                          <td className="si-center">{(i.items || []).length}</td>
                          <td className="si-num">{f2(i.grandTotal)}</td>
                          <td className={`si-num${iDue > 0 ? " si-due" : ""}`}>{f2(iDue)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
              {!invMatches.length && <div className="si-empty">{L("কোনো বিল পাওয়া যায়নি (শুধু কনফার্ম/পেইড বিল ফেরত হয়)", "No bill found (only confirmed/paid bills can be returned)")}</div>}
            </div>
          )}

          {inv && (
            <>
              <fieldset className="pm-panel" style={{ margin: 0 }}>
                <legend className="pm-panel-legend">{L("কোন পণ্য কতটা ফেরত", "Items to return")}</legend>
                {mobile ? (
                  <div className="si-box">
                    {lines.map((l) => (
                      <div key={l.idx} className="si-mrow" style={{ cursor: "default", background: l.qty > 0 ? "#f0fdf4" : undefined }}>
                        <div className="si-mrow-top"><span>{l.it.name}</span><span style={{ color: K.accent }}>{l.qty > 0 ? f2(l.amount) : "—"}</span></div>
                        <div className="si-mrow-sub">
                          <span>{[l.it.code, `${L("বিলে", "Billed")} ${l.sold} ${l.it.unit || ""}`, l.already ? `${L("আগে ফেরত", "Returned")} ${l.already}` : "", `@ ${f2(l.rate)}`].filter(Boolean).join(" · ")}</span>
                        </div>
                        <div className="si-grid2" style={{ marginTop: 4, alignItems: "center" }}>
                          <span className="si-muted">{L("ফেরতযোগ্য", "Can return")}: <b>{l.returnable}</b></span>
                          <input type="number" min="0" step="any" inputMode="decimal" className="pm-input" disabled={l.returnable <= 0} value={qtys[l.idx] ?? ""}
                            placeholder="0" onChange={(e) => setQtys((q) => ({ ...q, [l.idx]: e.target.value }))} style={{ textAlign: "right" }} />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="si-box">
                    <table className="pm-table">
                      <thead><tr>
                        <th style={{ width: 28 }} className="si-center">#</th>
                        <th>{L("পণ্য", "Item")}</th>
                        <th style={{ width: 80 }} className="si-num">{L("বিলে", "Billed")}</th>
                        <th style={{ width: 80 }} className="si-num">{L("আগে ফেরত", "Returned")}</th>
                        <th style={{ width: 84 }} className="si-num">{L("ফেরতযোগ্য", "Can return")}</th>
                        <th style={{ width: 90 }} className="si-num">{L("ফেরত", "Return qty")}</th>
                        <th style={{ width: 84 }} className="si-num">{L("দাম", "Rate")}</th>
                        <th style={{ width: 96 }} className="si-num">{L("টাকা", "Amount")}</th>
                      </tr></thead>
                      <tbody>
                        {lines.map((l, i) => (
                          <tr key={l.idx} className={l.qty > 0 ? "is-editing" : undefined}>
                            <td className="si-center">{i + 1}</td>
                            <td title={l.it.name}><b>{l.it.name}</b>{l.it.code ? <span className="si-muted"> · {l.it.code}</span> : null}</td>
                            <td className="si-num">{l.sold} {l.it.unit || ""}</td>
                            <td className="si-num">{l.already || "—"}</td>
                            <td className="si-num si-strong">{l.returnable}</td>
                            <td className="si-num" style={{ padding: "1px 2px" }}>
                              <input type="number" min="0" step="any" inputMode="decimal" className="pm-input" disabled={l.returnable <= 0} value={qtys[l.idx] ?? ""}
                                placeholder="0" onChange={(e) => setQtys((q) => ({ ...q, [l.idx]: e.target.value }))} style={{ textAlign: "right" }} />
                            </td>
                            <td className="si-num">{f2(l.rate)}</td>
                            <td className="si-num si-strong" style={{ color: K.accent }}>{l.qty > 0 ? f2(l.amount) : "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                <div className="si-line-tools">
                  <button type="button" className="pm-btn-secondary" onClick={() => setQtys(Object.fromEntries(lines.filter((l) => l.returnable > 0).map((l) => [l.idx, String(l.returnable)])))}>{L("সব ফেরত", "Return all")}</button>
                  <button type="button" className="pm-btn-secondary" onClick={() => setQtys({})}>{L("সব মুছুন", "Clear")}</button>
                </div>
              </fieldset>

              <div className="si-cols">
                <fieldset className="pm-panel" style={{ margin: 0 }}>
                  <legend className="pm-panel-legend">{L("কারণ", "Reason")}</legend>
                  <div className="si-panel-body">
                    <input className="pm-input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder={L("যেমন: নষ্ট মাল / ভুল পণ্য", "e.g. damaged / wrong item")} />
                    {refund > 0.009 && (
                      <div className="si-field">
                        <span className="pm-label">{K.refund[bn ? "bn" : "en"]} — {L("কীভাবে", "how")}</span>
                        <select className="pm-input" value={refundMethod} onChange={(e) => setRefundMethod(e.target.value)}>
                          {REFUND_METHODS.map((m) => <option key={m.key} value={m.key}>{bn ? m.bn : m.en}</option>)}
                        </select>
                      </div>
                    )}
                  </div>
                </fieldset>
                <fieldset className="pm-panel" style={{ margin: 0 }}>
                  <legend className="pm-panel-legend">{L("হিসাব", "Summary")}</legend>
                  <div className="si-panel-body">
                    {totalVat > 0 && totalRow("VAT", `${cur} ${f2(totalVat)}`)}
                    {totalRow(L("বিলের বাকি থেকে কাটা যাবে", "Taken off the bill balance"), `${cur} ${f2(applied)}`)}
                    {refund > 0.009 && totalRow(K.refund[bn ? "bn" : "en"], `${cur} ${f2(refund)}`, { color: "#b91c1c" })}
                    {totalRow(L("ফেরতের মোট", "Return total"), `${cur} ${f2(total)}`, { grand: true, color: K.accent })}
                  </div>
                </fieldset>
              </div>
            </>
          )}
        </div>
        <div className={`si-actions${mobile ? " si-sticky-actions" : ""}`}>
          <button type="button" className="pm-btn-secondary" disabled={saving} onClick={backToList}>← {L("তালিকা", "List")}</button>
          <span className="si-toolbar-gap" />
          <button type="button" className="pm-btn pm-btn--primary" disabled={saving || !inv || total <= 0 || dateBad} onClick={save}>
            {saving ? L("সেভ হচ্ছে…", "Saving…") : `💾 ${L("রিটার্ন সেভ", "Save Return")}`}
          </button>
        </div>
      </>
    ));
  }

  if (view === "detail" && sel) {
    const r = returns.find((x) => x.id === sel.id) || sel;
    return shell(<>{r.returnNo} {statusBadge(r)}</>, K.title[bn ? "bn" : "en"], (
      <>
        <div className="si-body">
          <div className="si-cols">
            <fieldset className="pm-panel" style={{ margin: 0 }}>
              <legend className="pm-panel-legend">{L("তথ্য", "Details")}</legend>
              <div className="si-panel-body">
                {vRow(L("রিটার্ন নং", "Return No"), r.returnNo, { strong: true, color: K.accent })}
                {vRow(L("তারিখ", "Date"), fmtDay(r.returnDate))}
                {vRow(K.party[bn ? "bn" : "en"], r.partyName || "—", { strong: true })}
                {vRow(L("বিল", "Bill"), `${r.invoiceNo}${r.supplierInvoiceNo ? ` (${r.supplierInvoiceNo})` : ""}${r.invoiceDate ? ` · ${fmtDay(r.invoiceDate)}` : ""}`)}
                {r.reason && vRow(L("কারণ", "Reason"), r.reason)}
                {vRow(L("লিখেছেন", "By"), r.createdByName || "—")}
                {r.status === "cancelled" && vRow(L("বাতিল", "Cancelled"), fmtDay(r.cancelledAt), { color: "#b91c1c" })}
              </div>
            </fieldset>
            <fieldset className="pm-panel" style={{ margin: 0 }}>
              <legend className="pm-panel-legend">{L("হিসাব", "Summary")}</legend>
              <div className="si-panel-body">
                {n2(r.totalVat) > 0 && totalRow("VAT", `${cur} ${f2(r.totalVat)}`)}
                {totalRow(L("বিলের বাকি থেকে কাটা হয়েছে", "Taken off the bill balance"), `${cur} ${f2(r.appliedToInvoice)}`)}
                {n2(r.refundAmount) > 0 && totalRow(`${K.refund[bn ? "bn" : "en"]} (${methodName(r.refundMethod)})`, `${cur} ${f2(r.refundAmount)}`, { color: "#b91c1c" })}
                {totalRow(L("ফেরতের মোট", "Return total"), `${cur} ${f2(r.total)}`, { grand: true, color: K.accent })}
              </div>
            </fieldset>
          </div>
          <div className="si-box">
            {mobile ? (r.items || []).map((it, i) => (
              <div key={i} className="si-mrow" style={{ cursor: "default" }}>
                <div className="si-mrow-top"><span>{i + 1}. {it.name}</span><span style={{ color: K.accent }}>{f2(it.amount)}</span></div>
                <div className="si-mrow-sub"><span>{it.code || ""}</span><span>{it.qty} {it.unit || ""} × {f2(it.rate)}</span></div>
              </div>
            )) : (
              <table className="pm-table">
                <thead><tr>
                  <th style={{ width: 28 }} className="si-center">#</th>
                  <th>{L("পণ্য", "Item")}</th>
                  <th style={{ width: 110 }}>{L("কোড", "Code")}</th>
                  <th style={{ width: 90 }} className="si-num">{L("পরিমাণ", "Qty")}</th>
                  <th style={{ width: 90 }} className="si-num">{L("দাম", "Rate")}</th>
                  <th style={{ width: 80 }} className="si-num">VAT</th>
                  <th style={{ width: 100 }} className="si-num">{L("মোট", "Total")}</th>
                </tr></thead>
                <tbody>
                  {(r.items || []).map((it, i) => (
                    <tr key={i}>
                      <td className="si-center">{i + 1}</td>
                      <td className="si-strong" title={it.name}>{it.name}</td>
                      <td>{it.code || ""}</td>
                      <td className="si-num">{it.qty} {it.unit || ""}</td>
                      <td className="si-num">{f2(it.rate)}</td>
                      <td className="si-num">{f2(it.vatAmt)}</td>
                      <td className="si-num si-strong" style={{ color: K.accent }}>{f2(it.amount)}</td>
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
          {canCancel(r) && <button type="button" className="pm-btn-secondary pm-btn--danger" disabled={saving} onClick={() => cancelReturn(r)}>⛔ {L("রিটার্ন বাতিল", "Cancel Return")}</button>}
          {isOwner && r.status === "cancelled" && <button type="button" className="pm-btn-secondary pm-btn--danger" onClick={() => deleteReturn(r)}>🗑️ {L("মুছুন", "Delete")}</button>}
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
  const shownTotal = liveShown.reduce((t, r) => t + n2(r.total), 0);
  const shownApplied = liveShown.reduce((t, r) => t + n2(r.appliedToInvoice), 0);
  const shownRefund = liveShown.reduce((t, r) => t + n2(r.refundAmount), 0);
  const openDetail = (r) => { setSel(r); setView("detail"); };

  return shell(K.title[bn ? "bn" : "en"], `${L("মোট", "Total")} ${cur} ${f2(activeTotal)}`, (
    <>
      <div className="si-toolbar">
        {canManage && <button type="button" className="pm-btn pm-btn--primary" onClick={openNew}>+ {L("নতুন রিটার্ন", "New Return")}</button>}
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
        <div className="si-kpi"><span>{L("রিটার্ন", "Returns")}</span><b>{liveShown.length}</b></div>
        <div className="si-kpi"><span>{L("মোট টাকা", "Total value")}</span><b style={{ color: K.accent }}>{cur} {f2(shownTotal)}</b></div>
        <div className="si-kpi"><span>{L("বিলের বাকি থেকে কাটা", "Off bill balances")}</span><b>{f2(shownApplied)}</b></div>
        <div className="si-kpi"><span>{kind === "sales" ? L("কাস্টমারকে ফেরত", "Refunded") : L("সাপ্লায়ার থেকে ফেরত", "Refund received")}</span><b style={{ color: shownRefund > 0 ? "#b91c1c" : undefined }}>{f2(shownRefund)}</b></div>
      </div>
      <div className="si-filters">
        <div className="si-search">
          <input className="pm-input" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={L("রিটার্ন নং, বিল নং, নাম বা পণ্য…", "Return no, bill no, name or item…")} />
          {search && <button type="button" onClick={() => setSearch("")}>✕</button>}
        </div>
        <label className="pm-check"><input type="checkbox" checked={showCancelled} onChange={(e) => setShowCancelled(e.target.checked)} /> {L("বাতিলগুলোও দেখাও", "Show cancelled")}</label>
      </div>
      <div className="si-main is-all">
        <div className="si-box">
          {mobile ? filtered.map((r) => (
            <button key={r.id} type="button" className="si-mrow" onClick={() => openDetail(r)} style={r.status === "cancelled" ? { opacity: 0.6 } : undefined}>
              <div className="si-mrow-top"><span style={{ color: K.accent }}>{r.returnNo}</span><span>{cur} {f2(r.total)}</span></div>
              <div className="si-mrow-sub"><span>{fmtDay(r.returnDate)} · {L("বিল", "Bill")} {r.invoiceNo}</span>{statusBadge(r)}</div>
              <div className="si-mrow-sub"><span>{r.partyName || "—"} · {(r.items || []).length} {L("টি পণ্য", "items")}</span>{n2(r.refundAmount) > 0 && <span>{L("ফেরত", "Refund")} <b>{f2(r.refundAmount)}</b></span>}</div>
            </button>
          )) : filtered.length > 0 && (
            <table className="pm-table">
              <thead><tr>
                <th style={{ width: 80 }}>{L("তারিখ", "Date")}</th>
                <th style={{ width: 92 }}>{L("রিটার্ন নং", "Return No")}</th>
                <th style={{ width: 120 }}>{L("বিল নং", "Bill No")}</th>
                <th>{K.party[bn ? "bn" : "en"]}</th>
                <th style={{ width: 56 }} className="si-center">{L("আইটেম", "Items")}</th>
                <th>{L("কারণ", "Reason")}</th>
                <th style={{ width: 92 }} className="si-num">{L("বাকি থেকে কাটা", "Off balance")}</th>
                <th style={{ width: 86 }} className="si-num">{L("ফেরত", "Refund")}</th>
                <th style={{ width: 96 }} className="si-num">{L("মোট", "Total")}</th>
                <th style={{ width: 76 }} className="si-center">{L("অবস্থা", "Status")}</th>
              </tr></thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.id} className="pm-clickable" onClick={() => openDetail(r)} style={r.status === "cancelled" ? { color: "#6b7280" } : undefined}>
                    <td>{fmtDay(r.returnDate)}</td>
                    <td className="si-strong" style={{ color: r.status === "cancelled" ? undefined : K.accent }}>{r.returnNo}</td>
                    <td>{r.invoiceNo}{r.supplierInvoiceNo ? ` (${r.supplierInvoiceNo})` : ""}</td>
                    <td title={r.partyName || ""}>{r.partyName || "—"}</td>
                    <td className="si-center">{(r.items || []).length}</td>
                    <td title={r.reason || ""}>{r.reason || ""}</td>
                    <td className="si-num">{f2(r.appliedToInvoice)}</td>
                    <td className="si-num">{n2(r.refundAmount) > 0 ? f2(r.refundAmount) : "—"}</td>
                    <td className="si-num si-strong" style={r.status === "cancelled" ? { textDecoration: "line-through" } : undefined}>{f2(r.total)}</td>
                    <td className="si-center">{statusBadge(r)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {!filtered.length && (
            <div className="si-empty">
              {visibleReturns.length ? L("এই ফিল্টারে কোনো রিটার্ন নেই", "No returns match these filters") : L("এখনো কোনো রিটার্ন নেই", "No returns yet")}
            </div>
          )}
        </div>
      </div>
      <div className="si-statusbar">
        <span>{L("দেখাচ্ছে", "Showing")} <b>{filtered.length}</b> / {visibleReturns.length}</span>
        <span>{L("মোট", "Total")} <b>{cur} {f2(shownTotal)}</b></span>
        {ownOnly && <span>{L("শুধু আপনার বিলের রিটার্ন দেখাচ্ছে", "Showing returns on your bills only")}</span>}
      </div>
    </>
  ));
}
