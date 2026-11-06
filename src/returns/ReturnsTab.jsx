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
import { averageCosts } from "../reports/averageCost.js";
import { livePurchasesOf, liveReturnsOf } from "../reports/reportFilters.js";
import { persistOfflineDb } from "../offline/sqliteDb.js";
import { RETURN_KINDS, RETURNABLE_STATUSES, billHaystack, grnLabel, planPartyReturnSettlement, poGrnFieldsFromInvoice, returnedQtyByLine, validateReturnItems } from "./returnsDomain.js";
import { cancelReturnRefundVoucher, createReturnRefundVoucher } from "./returnsRefundVoucher.js";

export { RETURN_KINDS, returnedQtyByLine, returnsAsLedgerVouchers } from "./returnsDomain.js";

const n2 = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const r2 = (v) => Math.round((n2(v) + Number.EPSILON) * 100) / 100;
const f2 = (v) => r2(v).toFixed(2);
const localDay = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

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

export default function ReturnsTab({
  kind = "sales", lang = "en", th, shopId, user, profile, isOwner, canManage, canDelete = false, canPrint = false,
  cur = "AED", isDesktop, toast, shopName = "", shop = null, products = [], makeNo, leaveGuard = null,
  openInvoiceId = null, onOpenInvoiceHandled = null,
}) {
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
  const [itemQ, setItemQ] = useState("");
  const [inv, setInv] = useState(null);
  const [qtys, setQtys] = useState({});
  const [serials, setSerials] = useState({});
  const [reason, setReason] = useState("");
  const [refundMethod, setRefundMethod] = useState("cash");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [editOf, setEditOf] = useState(null);
  const mobile = usePmMobile();
  const rootRef = useRef(null);
  const fitH = usePmFitHeight(rootRef, mobile, view);
  const openHandledRef = useRef(null);

  useEffect(() => {
    if (!shopId) return undefined;
    const u1 = subscribeShopCollection({ collectionName: K.col, shopId, onRows: (list) => setReturns(list || []) });
    const u2 = subscribeShopCollection({ collectionName: K.invCol, shopId, onRows: (list) => setInvoices(list || []) });
    return () => { u1?.(); u2?.(); };
  }, [shopId, K.col, K.invCol]);

  useEffect(() => {
    if (!openInvoiceId) {
      openHandledRef.current = null;
      return;
    }
    if (openHandledRef.current === openInvoiceId) return;
    if (!invoices.length) return;
    openHandledRef.current = openInvoiceId;
    const found = invoices.find((i) => i.id === openInvoiceId);
    if (!found || found.isDeleted || found.deleted || !RETURNABLE_STATUSES.includes(found.status) || isBranchTransferBill(found)) {
      onOpenInvoiceHandled?.();
      toast?.(L("❌ এই বিল থেকে রিটার্ন করা যাচ্ছে না", "❌ This bill can't be returned"), "err");
      return;
    }
    setDate(localDay());
    setInvQ("");
    setItemQ("");
    setQtys({});
    setSerials({});
    setReason("");
    setRefundMethod("cash");
    setEditOf(null);
    setInv(found);
    setSel(null);
    setView("form");
    onOpenInvoiceHandled?.();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- open once per openInvoiceId
  }, [openInvoiceId, invoices]);

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
  const visibleReturns = useMemo(() => ownOnly ? returns.filter((r) => r.createdBy === user?.uid || myInvoiceIds.has(r.invoiceId)) : returns, [returns, ownOnly, user?.uid, myInvoiceIds]);
  const sortedReturns = useMemo(() => [...visibleReturns].sort((a, b) => String(b.returnDate || b.createdAt || "").localeCompare(String(a.returnDate || a.createdAt || ""))), [visibleReturns]);
  // Memoized: re-renders on every keystroke anywhere in the form, not just search/filters.
  const filtered = useMemo(() => sortedReturns.filter((r) => {
    if (!showCancelled && r.status === "cancelled") return false;
    const day = String(r.returnDate || r.createdAt || "").slice(0, 10);
    if ((from && day < from) || (to && day > to)) return false;
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return [r.returnNo, r.invoiceNo, r.supplierInvoiceNo, r.partyName, ...(r.items || []).map((it) => `${it.name} ${it.code || ""}`)].join(" ").toLowerCase().includes(q);
  }), [sortedReturns, showCancelled, from, to, search]);
  const activeTotal = useMemo(() => visibleReturns.filter((r) => r.status !== "cancelled").reduce((t, r) => t + n2(r.total), 0), [visibleReturns]);

  const invMatches = useMemo(() => {
    const q = invQ.trim().toLowerCase();
    return invoices
      .filter((i) => !i.isDeleted && !i.deleted && i.docKind !== "quotation" && !isBranchTransferBill(i) && RETURNABLE_STATUSES.includes(i.status) && (i.items || []).length)
      .filter((i) => !ownOnly || i.createdBy === user?.uid)
      .filter((i) => !q || billHaystack(i, K.partyName, K.partyMobile).includes(q))
      .sort((a, b) => String(b.invoiceDate || b.createdAt || "").localeCompare(String(a.invoiceDate || a.createdAt || "")))
      .slice(0, 40);
  }, [invoices, invQ, K.partyName, K.partyMobile, ownOnly, user?.uid]);

  const returnedMap = useMemo(() => (inv ? returnedQtyByLine(returns, inv.id, editOf?.id || null) : new Map()), [returns, inv, editOf?.id]);
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
  const visibleLines = useMemo(() => {
    const q = itemQ.trim().toLowerCase();
    if (!q) return lines;
    return lines.filter((l) => `${l.it.name || ""} ${l.it.code || ""} ${l.it.brand || ""}`.toLowerCase().includes(q));
  }, [lines, itemQ]);
  const total = r2(lines.reduce((t, l) => t + l.amount, 0));
  const totalVat = r2(lines.reduce((t, l) => t + l.vat, 0));
  // Settle against source bill + other open bills of the same party (so cheque/last balance shrinks).
  const settlementPreview = useMemo(() => {
    if (!inv) return { appliedToInvoice: 0, refundAmount: 0, appliedAllocations: [] };
    let bills = invoices || [];
    if (editOf && editOf.status !== "cancelled") {
      const allocs = (editOf.appliedAllocations || []).length
        ? editOf.appliedAllocations
        : (n2(editOf.appliedToInvoice) > 0.009 ? [{ invoiceId: editOf.invoiceId, amount: editOf.appliedToInvoice }] : []);
      const back = new Map(allocs.map((a) => [a.invoiceId, n2(a.amount)]));
      bills = bills.map((i) => {
        const add = back.get(i.id) || 0;
        if (!add) return i;
        const amountPaid = Math.max(0, r2(n2(i.amountPaid) - add));
        return { ...i, amountPaid, balanceDue: Math.max(0, r2(n2(i.grandTotal) - amountPaid)) };
      });
    }
    const source = bills.find((i) => i.id === inv.id) || inv;
    return planPartyReturnSettlement({
      sourceInvoice: source,
      returnTotal: total,
      invoices: bills,
      partyIdKey: K.partyId,
      partyNameKey: K.partyName,
    });
  }, [inv, invoices, total, editOf, K.partyId, K.partyName]);
  const due = (() => {
    if (!inv) return 0;
    let addBack = 0;
    if (editOf && editOf.status !== "cancelled") {
      const allocs = (editOf.appliedAllocations || []).length
        ? editOf.appliedAllocations
        : (n2(editOf.appliedToInvoice) > 0.009 ? [{ invoiceId: editOf.invoiceId, amount: editOf.appliedToInvoice }] : []);
      addBack = n2(allocs.find((a) => a.invoiceId === inv.id)?.amount || 0);
    }
    return Math.max(0, r2(n2(inv.grandTotal) - n2(inv.amountPaid) + addBack));
  })();
  const applied = settlementPreview.appliedToInvoice;
  const refund = settlementPreview.refundAmount;

  const resetForm = () => {
    setDate(localDay()); setInvQ(""); setItemQ(""); setInv(null); setQtys({}); setSerials({});
    setReason(""); setRefundMethod("cash"); setEditOf(null);
  };
  const openNew = () => { resetForm(); setView("form"); };

  const loadReturnIntoForm = (r, bill) => {
    setDate(String(r.returnDate || localDay()).slice(0, 10));
    setInvQ("");
    setItemQ("");
    setInv(bill);
    const q = {};
    const s = {};
    (r.items || []).forEach((it) => {
      q[it.lineIndex] = String(it.qty);
      if (it.serialNo) s[it.lineIndex] = String(it.serialNo);
    });
    setQtys(q);
    setSerials(s);
    setReason(r.reason || "");
    setRefundMethod(r.refundMethod || "cash");
    setEditOf(r);
    setSel(null);
    setView("form");
  };

  const refreshPurchaseAvgCosts = async (productIds, returnList) => {
    if (kind !== "purchase" || !shopId) return;
    const ids = [...new Set((productIds || []).filter(Boolean))];
    if (!ids.length) return;
    const live = livePurchasesOf(invoices, shopId).filter((inv) => inv.source !== "openingBalance");
    const livePr = liveReturnsOf(returnList, shopId);
    for (const pid of ids) {
      try {
        const rec = await offlineGetById("products", pid).catch(() => null);
        const prod = rec?.data || (products || []).find((p) => p.id === pid);
        if (!prod) continue;
        const avg = averageCosts([{ ...prod, id: pid }], live, undefined, livePr).get(pid);
        if (!(avg > 0)) continue;
        const next = String(parseFloat(avg.toFixed(4)));
        if (Math.abs(avg - (Number(prod.averageCost) || 0)) < 0.0001) continue;
        await offlinePatch("products", pid, { averageCost: next, updatedAt: new Date().toISOString() }, prod, { deferPersist: true });
      } catch (err) {
        console.warn("[S4 Return] average cost update failed", pid, err);
      }
    }
    persistOfflineDb().catch(() => {});
  };

  const applicationLinesOf = (r) => {
    if (Array.isArray(r?.appliedAllocations) && r.appliedAllocations.length) return r.appliedAllocations;
    if (n2(r?.appliedToInvoice) > 0.009) return [{ invoiceId: r.invoiceId, amount: n2(r.appliedToInvoice) }];
    return [];
  };

  const reverseReturnEffects = async (r, nowIso) => {
    for (const a of applicationLinesOf(r)) {
      const id = a.invoiceId;
      const amt = n2(a.amount);
      if (!id || !(amt > 0.009)) continue;
      const stored = await offlineGetById(K.invCol, id).catch(() => null);
      const fresh = stored?.data ? { ...stored.data, id } : invoices.find((i) => i.id === id);
      if (!fresh || fresh.status === "cancelled") continue;
      const newPaid = Math.max(0, r2(n2(fresh.amountPaid) - amt));
      const balance = Math.max(0, r2(n2(fresh.grandTotal) - newPaid));
      const status = balance < 0.01 ? "paid" : newPaid > 0.009 ? "partial" : "confirmed";
      await offlinePatch(K.invCol, fresh.id, { amountPaid: newPaid, balanceDue: balance, status, updatedAt: nowIso, updatedBy: user?.uid || "" }, fresh);
    }
    await cancelReturnRefundVoucher(r, user);
  };

  const applyReturnEffects = async (ret, bill, appliedAmt, refundAmt, method, returnDate, nowIso, progress = null, allocations = null) => {
    const lines = (allocations && allocations.length)
      ? allocations
      : (appliedAmt > 0.009 ? [{ invoiceId: bill.id, invoiceNo: bill.invoiceNo || "", amount: appliedAmt }] : []);
    let nextBill = bill;
    let nextRet = {
      ...ret,
      appliedToInvoice: appliedAmt,
      appliedAllocations: lines,
      refundAmount: refundAmt,
      refundMethod: refundAmt > 0.009 ? method : "",
      refundVoucherId: null,
      refundVoucherNo: "",
      refundVoucherCol: "",
    };
    for (const a of lines) {
      const id = a.invoiceId;
      const amt = n2(a.amount);
      if (!id || !(amt > 0.009)) continue;
      const stored = await offlineGetById(K.invCol, id).catch(() => null);
      const fresh = stored?.data ? { ...stored.data, id } : (id === bill.id ? nextBill : invoices.find((i) => i.id === id));
      if (!fresh || fresh.status === "cancelled") continue;
      const newPaid = r2(n2(fresh.amountPaid) + amt);
      const balance = Math.max(0, r2(n2(fresh.grandTotal) - newPaid));
      const status = balance < 0.01 ? "paid" : "partial";
      await offlinePatch(K.invCol, fresh.id, { amountPaid: newPaid, balanceDue: balance, status, updatedAt: nowIso, updatedBy: user?.uid || "" }, fresh);
      if (id === bill.id) nextBill = { ...fresh, amountPaid: newPaid, balanceDue: balance, status };
      if (progress) progress.ret = nextRet;
    }
    if (refundAmt > 0.009) {
      const voucher = await createReturnRefundVoucher({
        kind, shopId, user, profile, isOwner, ret: nextRet, invoice: nextBill,
        refundAmount: refundAmt, refundMethod: method, returnDate,
      });
      if (voucher) {
        const link = { refundVoucherId: voucher.id, refundVoucherNo: voucher.no, refundVoucherCol: voucher.col };
        try {
          await offlinePatch(K.col, nextRet.id, link, nextRet);
          nextRet = { ...nextRet, ...link };
          if (progress) progress.ret = nextRet;
        } catch (err) {
          await cancelReturnRefundVoucher({ ...nextRet, ...link }, user);
          throw err;
        }
      }
    }
    return { bill: nextBill, ret: nextRet };
  };

  const restoreReturnAfterFailedEdit = async (snap, partialNew, nowIso) => {
    if (partialNew) {
      try { await reverseReturnEffects(partialNew, nowIso); } catch (err) {
        console.warn("[S4 Return] undo partial edit effects failed", err);
      }
    }
    const cur = await offlineGetById(K.col, snap.id).catch(() => null);
    const base = cur?.data ? { ...cur.data, id: snap.id } : snap;
    const restorePatch = {
      returnDate: snap.returnDate,
      items: snap.items,
      subtotal: snap.subtotal,
      totalVat: snap.totalVat,
      total: snap.total,
      appliedToInvoice: snap.appliedToInvoice,
      appliedAllocations: snap.appliedAllocations || applicationLinesOf(snap),
      refundAmount: snap.refundAmount,
      refundMethod: snap.refundMethod || "",
      reason: snap.reason || "",
      status: "confirmed",
      cancelledAt: null,
      cancelledBy: null,
      replacedByEdit: null,
      refundVoucherId: null,
      refundVoucherNo: "",
      refundVoucherCol: "",
      purchaseOrderId: snap.purchaseOrderId || null,
      purchaseOrderNo: snap.purchaseOrderNo || "",
      goodsReceiptId: snap.goodsReceiptId || null,
      goodsReceiptNo: snap.goodsReceiptNo || "",
      goodsReceiptIds: snap.goodsReceiptIds || null,
      goodsReceiptNos: snap.goodsReceiptNos || null,
      updatedAt: nowIso,
      updatedBy: user?.uid || "",
    };
    await offlinePatch(K.col, snap.id, restorePatch, base);
    const stored = await offlineGetById(K.invCol, snap.invoiceId).catch(() => null);
    const bill = stored?.data ? { ...stored.data, id: snap.invoiceId } : invoices.find((i) => i.id === snap.invoiceId);
    if (!bill) return { ...snap, ...restorePatch, id: snap.id };
    const applied = await applyReturnEffects(
      { ...snap, ...restorePatch, id: snap.id },
      bill,
      n2(snap.appliedToInvoice),
      n2(snap.refundAmount),
      snap.refundMethod || "cash",
      snap.returnDate,
      nowIso,
      null,
      restorePatch.appliedAllocations,
    );
    return applied.ret;
  };

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
    const editing = editOf && editOf.status !== "cancelled" ? editOf : null;
    let reversedForEdit = false;
    let createdId = null;
    const progress = { ret: null };
    try {
      const stored = await offlineGetById(K.invCol, inv.id).catch(() => null);
      const fresh = stored?.data ? { ...stored.data, id: inv.id } : inv;
      const draftItems = picked.map((l) => ({
        lineIndex: l.idx, productId: l.it.productId || null, name: l.it.name || "", code: l.it.code || "", brand: l.it.brand || "",
        qty: l.qty, unit: l.it.unit || "Pcs", unitFactor: n2(l.it.unitFactor) || 1, rate: l.rate, amount: l.amount, vatAmt: l.vat,
        ...(l.it.batchNo ? { batchNo: l.it.batchNo } : {}),
        ...((serials[l.idx] || l.it.serialNo) ? { serialNo: String(serials[l.idx] || l.it.serialNo).trim() } : {}),
      }));
      const priorForCap = editing ? returns.filter((x) => x.id !== editing.id) : returns;
      const bad = validateReturnItems(fresh, draftItems, priorForCap, editing?.id || null);
      if (bad === "INVOICE_NOT_RETURNABLE" || bad === "INVOICE_MISSING") throw new Error(L("এই বিল এখন আর ফেরতযোগ্য নয় (বাতিল/ড্রাফট)", "This bill can no longer be returned (cancelled/draft)"));
      if (bad) throw new Error(L("রিটার্নের পরিমাণ সঠিক নয়", "Return quantities are not valid"));

      // Edit = reverse bill/voucher effects, then patch the SAME return in place (never cancel-then-create).
      if (editing) {
        await reverseReturnEffects(editing, new Date().toISOString());
        reversedForEdit = true;
      }

      const stored2 = await offlineGetById(K.invCol, inv.id).catch(() => null);
      const bill = stored2?.data ? { ...stored2.data, id: inv.id } : fresh;
      // Reload party bills from SQLite so settlement sees post-reverse dues (and other open bills).
      const partyId = bill[K.partyId] || null;
      const partyName = bill[K.partyName] || "";
      const partyBills = (invoices || []).filter((i) => i && i.id && (partyId ? i[K.partyId] === partyId : !!partyName && i[K.partyName] === partyName));
      const freshParty = [];
      for (const p of partyBills) {
        const s = await offlineGetById(K.invCol, p.id).catch(() => null);
        freshParty.push(s?.data ? { ...s.data, id: p.id } : p);
      }
      if (!freshParty.some((p) => p.id === bill.id)) freshParty.push(bill);
      const settlement = planPartyReturnSettlement({
        sourceInvoice: bill,
        returnTotal: total,
        invoices: freshParty,
        partyIdKey: K.partyId,
        partyNameKey: K.partyName,
      });
      const appliedNow = settlement.appliedToInvoice;
      const refundNow = settlement.refundAmount;
      const allocNow = settlement.appliedAllocations;
      const nowIso = new Date().toISOString();
      const returnNo = editing
        ? editing.returnNo
        : await makeNo(K.serial, K.prefix, returns.map((r) => r.returnNo));
      const core = {
        shopId, returnNo, returnDate: date, kind,
        invoiceId: bill.id, invoiceNo: bill.invoiceNo || "", supplierInvoiceNo: bill.supplierInvoiceNo || "", invoiceDate: bill.invoiceDate || "",
        partyId: bill[K.partyId] || null, partyName: bill[K.partyName] || "", partyMobile: bill[K.partyMobile] || "",
        ...poGrnFieldsFromInvoice(bill),
        items: draftItems,
        subtotal: r2(total - totalVat), totalVat, total,
        appliedToInvoice: appliedNow, appliedAllocations: allocNow,
        refundAmount: refundNow, refundMethod: refundNow > 0 ? refundMethod : "",
        reason: reason.trim(), status: "confirmed",
        refundVoucherId: null, refundVoucherNo: "", refundVoucherCol: "",
        updatedAt: nowIso, updatedBy: user?.uid || "",
      };

      let saved;
      if (editing) {
        const patch = {
          ...core,
          editedAt: nowIso,
          editedBy: user?.uid || "",
          cancelledAt: undefined,
          cancelledBy: undefined,
          replacedByEdit: undefined,
        };
        await offlinePatch(K.col, editing.id, patch, editing);
        saved = { ...editing, ...patch, id: editing.id };
      } else {
        const payload = {
          ...core,
          createdAt: nowIso, createdBy: user?.uid || "", createdByName: profile?.personName || "",
        };
        const res = await offlineCreate(K.col, payload);
        saved = { ...res.data, id: res.documentId };
        createdId = saved.id;
      }

      const applied = await applyReturnEffects(saved, bill, appliedNow, refundNow, refundMethod, date, nowIso, progress, allocNow);
      saved = applied.ret;
      reversedForEdit = false;
      createdId = null; // effects committed — do not roll back on later UI errors

      logAudit({ shopId, user, profile, action: editing ? "edit" : "create", collection: K.col, docId: saved.id, docNo: returnNo, amount: total, note: `${core.partyName} · ${core.invoiceNo}` });
      const list = editing
        ? returns.map((r) => (r.id === saved.id ? saved : r))
        : [saved, ...returns.filter((r) => r.id !== saved.id)];
      setReturns(list);
      await refreshPurchaseAvgCosts(core.items.map((it) => it.productId), list);
      toast?.(L(`✅ ${returnNo} সেভ হয়েছে`, `✅ ${returnNo} saved`));
      if (navigator.onLine) window.S4Offline?.syncNow?.().catch(() => {});
      setEditOf(null);
      setSel(saved); setView("detail");
    } catch (e) {
      if (reversedForEdit && editing) {
        try {
          const restored = await restoreReturnAfterFailedEdit(editing, progress.ret, new Date().toISOString());
          setReturns((list) => list.map((r) => (r.id === restored.id ? restored : r)));
        } catch (restoreErr) {
          console.warn("[S4 Return] edit rollback failed", restoreErr);
        }
      } else if (createdId) {
        // New return created but bill/voucher apply failed — undo effects and drop the orphan doc.
        try {
          const nowIso = new Date().toISOString();
          if (progress.ret) await reverseReturnEffects(progress.ret, nowIso);
          await offlineRemove(K.col, createdId);
        } catch (restoreErr) {
          console.warn("[S4 Return] create rollback failed", restoreErr);
        }
      }
      toast?.(`❌ ${e?.message || e}`, "err");
    } finally {
      setSaving(false);
    }
  };

  const canCancel = (r) => r.status !== "cancelled" && (isOwner || (canManage && r.createdBy === user?.uid));

  const cancelReturn = async (r, { silent = false } = {}) => {
    if (!canCancel(r)) return false;
    if (!silent && !window.confirm(L(`${r.returnNo} বাতিল করবেন? স্টক আর বিলের বাকি আগের মতো হয়ে যাবে।`, `Cancel ${r.returnNo}? Stock and the bill balance go back to before.`))) return false;
    setSaving(true);
    try {
      const nowIso = new Date().toISOString();
      await reverseReturnEffects(r, nowIso);
      const patch = { status: "cancelled", cancelledAt: nowIso, cancelledBy: user?.uid || "", updatedAt: nowIso, updatedBy: user?.uid || "" };
      await offlinePatch(K.col, r.id, patch, r);
      const updated = { ...r, ...patch };
      const nextReturns = returns.map((x) => (x.id === r.id ? updated : x));
      setReturns(nextReturns);
      setSel((s) => (s?.id === r.id ? updated : s));
      await refreshPurchaseAvgCosts((r.items || []).map((it) => it.productId), nextReturns);
      logAudit({ shopId, user, profile, action: "cancel", collection: K.col, docId: r.id, docNo: r.returnNo, amount: r.total, note: `${r.partyName} · ${r.invoiceNo}` });
      if (!silent) toast?.(L("🚫 রিটার্ন বাতিল হয়েছে", "🚫 Return cancelled"), "err");
      if (navigator.onLine) window.S4Offline?.syncNow?.().catch(() => {});
      return true;
    } catch (e) {
      toast?.(`❌ ${e?.message || e}`, "err");
      return false;
    } finally {
      setSaving(false);
    }
  };

  const startEdit = async (r) => {
    if (!canCancel(r)) return;
    const bill = invoices.find((i) => i.id === r.invoiceId)
      || (await offlineGetById(K.invCol, r.invoiceId).catch(() => null))?.data;
    const fresh = bill ? { ...bill, id: r.invoiceId } : null;
    if (!fresh) return toast?.(L("❌ মূল বিল পাওয়া যায়নি", "❌ Source bill not found"), "err");
    if (!window.confirm(L(`${r.returnNo} এডিট করবেন? একই রিটার্ন আপডেট হবে — বাতিল হয়ে নতুন নম্বর তৈরি হবে না।`, `Edit ${r.returnNo}? The same return is updated — it is not cancelled into a new number.`))) return;
    loadReturnIntoForm(r, fresh);
  };

  const deleteReturn = async (r) => {
    if (!canDelete || r.status !== "cancelled") return;
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

  const fmtDay = (d) => (d ? String(d).slice(0, 10).split("-").reverse().join("/") : "");
  const methodName = (key) => (REFUND_METHODS.find((m) => m.key === key) || {})[bn ? "bn" : "en"] || key || "";

  const print = (r) => {
    const cols = [
      { label: "#" }, { label: "Item" }, { label: "Qty", align: "right" },
      { label: "Rate", align: "right" }, { label: `Amount (${cur})`, align: "right" },
    ];
    const rows = (r.items || []).map((it, i) => [
      String(i + 1), [it.name, it.code, it.serialNo && `S/N ${it.serialNo}`].filter(Boolean).join(" · "),
      `${it.qty} ${it.unit || ""}`, f2(it.rate), f2(it.amount),
    ]);
    const shopLabel = [
      shopName || shop?.companyName || "",
      shop?.trnNumber ? `TRN: ${shop.trnNumber}` : "",
      shop?.mobile || "",
    ].filter(Boolean).join(" · ");
    const partyLine = [
      `${K.party.en}: ${r.partyName || "—"}`,
      r.partyMobile || "",
      `Against invoice: ${r.invoiceNo || "—"}${r.supplierInvoiceNo ? ` (${r.supplierInvoiceNo})` : ""}`,
      r.invoiceDate ? `Bill date: ${String(r.invoiceDate).slice(0, 10)}` : "",
      r.purchaseOrderNo ? `PO: ${r.purchaseOrderNo}` : "",
      grnLabel(r) ? `GRN: ${grnLabel(r)}` : "",
    ].filter(Boolean).join(" · ");
    const subtitle = [r.returnNo, r.returnDate, r.status === "cancelled" ? "CANCELLED" : ""].filter(Boolean).join(" · ");
    const summaryLines = [
      n2(r.totalVat) > 0.009 ? `VAT: ${cur} ${f2(r.totalVat)}` : "",
      n2(r.appliedToInvoice) > 0.009 ? `Applied to bill: ${cur} ${f2(r.appliedToInvoice)}` : "",
      n2(r.refundAmount) > 0.009 ? `Refund (${methodName(r.refundMethod)})${r.refundVoucherNo ? ` · ${r.refundVoucherNo}` : ""}: ${cur} ${f2(r.refundAmount)}` : "",
      r.reason ? `Reason: ${r.reason}` : "",
      `Return total: ${cur} ${f2(r.total)}`,
    ].filter(Boolean);
    printWithSettings(generateStatementHTML({
      shopName: shopLabel,
      title: K.printTitle,
      subtitle,
      partyLine,
      cols,
      rows,
      foot: ["", "", "", "TOTAL", f2(r.total)],
      summaryLines,
    }), { lang });
  };
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
                    <input className="pm-input" value={invQ} onChange={(e) => setInvQ(e.target.value)} autoFocus={!mobile} placeholder={L(`বিল নং, ${K.party.bn}, পণ্যের নাম/কোড…`, `Bill no, ${K.party.en.toLowerCase()}, product name/code…`)} />
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
                <button key={i.id} type="button" className="si-mrow" onClick={() => { setInv(i); setQtys({}); setSerials(Object.fromEntries((i.items || []).map((it, idx) => [idx, it.serialNo || ""]).filter(([, v]) => v))); setItemQ(""); setEditOf(null); }}>
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
                        <tr key={i.id} className="pm-clickable" onClick={() => { setInv(i); setQtys({}); setSerials(Object.fromEntries((i.items || []).map((it, idx) => [idx, it.serialNo || ""]).filter(([, v]) => v))); setItemQ(""); setEditOf(null); }}>
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
                <div className="si-field" style={{ marginBottom: 8 }}>
                  <input className="pm-input" value={itemQ} onChange={(e) => setItemQ(e.target.value)} placeholder={L("এই বিলে পণ্য খুঁজুন (নাম/কোড)…", "Filter items on this bill (name/code)…")} />
                </div>
                {mobile ? (
                  <div className="si-box">
                    {visibleLines.map((l) => (
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
                        {l.qty > 0 && (
                          <input className="pm-input" style={{ marginTop: 4 }} value={serials[l.idx] ?? l.it.serialNo ?? ""}
                            placeholder={L("সিরিয়াল / IMEI (ঐচ্ছিক)", "Serial / IMEI (optional)")}
                            onChange={(e) => setSerials((s) => ({ ...s, [l.idx]: e.target.value }))} />
                        )}
                      </div>
                    ))}
                    {!visibleLines.length && <div className="si-empty">{L("এই সার্চে কোনো পণ্য নেই", "No items match this filter")}</div>}
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
                        <th style={{ width: 110 }}>{L("সিরিয়াল/IMEI", "Serial/IMEI")}</th>
                        <th style={{ width: 84 }} className="si-num">{L("দাম", "Rate")}</th>
                        <th style={{ width: 96 }} className="si-num">{L("টাকা", "Amount")}</th>
                      </tr></thead>
                      <tbody>
                        {visibleLines.map((l, i) => (
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
                            <td style={{ padding: "1px 2px" }}>
                              <input className="pm-input" disabled={!(l.qty > 0)} value={serials[l.idx] ?? l.it.serialNo ?? ""}
                                placeholder="—" onChange={(e) => setSerials((s) => ({ ...s, [l.idx]: e.target.value }))} />
                            </td>
                            <td className="si-num">{f2(l.rate)}</td>
                            <td className="si-num si-strong" style={{ color: K.accent }}>{l.qty > 0 ? f2(l.amount) : "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {!visibleLines.length && <div className="si-empty">{L("এই সার্চে কোনো পণ্য নেই", "No items match this filter")}</div>}
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
                    {(settlementPreview.appliedAllocations || []).length > 1 && (
                      <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>
                        {L(`একই ${K.party.bn}-এর অন্য বাকি বিলও কাটা হবে — পরের চেক/বাকিতে কম দেখাবে`, `Also nets other open bills of this ${K.party.en.toLowerCase()} — next cheque / balance will be lower`)}
                      </div>
                    )}
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
            {saving ? L("সেভ হচ্ছে…", "Saving…") : `💾 ${editOf ? L("এডিট সেভ", "Save Edit") : L("রিটার্ন সেভ", "Save Return")}`}
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
                {r.purchaseOrderNo && vRow("PO", r.purchaseOrderNo)}
                {grnLabel(r) && vRow("GRN", grnLabel(r))}
                {r.reason && vRow(L("কারণ", "Reason"), r.reason)}
                {r.refundVoucherNo && vRow(L("রিফান্ড ভাউচার", "Refund voucher"), r.refundVoucherNo)}
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
                <div className="si-mrow-sub"><span>{[it.code, it.serialNo && `S/N ${it.serialNo}`].filter(Boolean).join(" · ") || "—"}</span><span>{it.qty} {it.unit || ""} × {f2(it.rate)}</span></div>
              </div>
            )) : (
              <table className="pm-table">
                <thead><tr>
                  <th style={{ width: 28 }} className="si-center">#</th>
                  <th>{L("পণ্য", "Item")}</th>
                  <th style={{ width: 90 }}>{L("কোড", "Code")}</th>
                  <th style={{ width: 110 }}>{L("সিরিয়াল/IMEI", "Serial/IMEI")}</th>
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
                      <td>{it.serialNo || "—"}</td>
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
          {canPrint && <button type="button" className="pm-btn-secondary" onClick={() => print(r)}>🖨️ {L("প্রিন্ট", "Print")}</button>}
          {canCancel(r) && <button type="button" className="pm-btn" disabled={saving} onClick={() => startEdit(r)}>✏️ {L("এডিট", "Edit")}</button>}
          <span className="si-toolbar-gap" />
          {canCancel(r) && <button type="button" className="pm-btn-secondary pm-btn--danger" disabled={saving} onClick={() => cancelReturn(r)}>⛔ {L("রিটার্ন বাতিল", "Cancel Return")}</button>}
          {canDelete && r.status === "cancelled" && <button type="button" className="pm-btn-secondary pm-btn--danger" onClick={() => deleteReturn(r)}>🗑️ {L("মুছুন", "Delete")}</button>}
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
