import { logAudit } from "../utils/auditLog.js";
import { offlineCreate, offlinePatch, offlineRemove } from "../offline/offlineRepository";
import { persistOfflineDb } from "../offline/sqliteDb.js";
import { piFmt2, piN2 } from "../shared/appShared.jsx";
import { piToday } from "./purchaseShared.js";
import { useEffect } from "react";

export function usePiPaymentActions({ canVendorPayments, genPaymentNo, invoices, isOwner, lang, onVoucherHandled, payments, piView, profile, setInvoices, setPayments, setPiSubTab, setPmtPrefillVendorId, setPmtSaving, setPmtView, setSelInvoice, setSelVoucher, shopId, t, toast, user, voucherRequest }) {
  useEffect(()=>{
    if (!voucherRequest) return;
    onVoucherHandled?.();
    if (!canVendorPayments || piView==="form") return;
    setPiSubTab("payments");
    setPmtPrefillVendorId(null); setSelVoucher(null); setPmtView("new");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voucherRequest]);

  // ── Active (non-cancelled) voucher allocations that touch a given invoice — for the read-only trail on Invoice Detail ──
  const getRelatedPayments = (invoiceId) => payments
    .filter(p => (p.allocations||[]).some(a=>a.invoiceId===invoiceId))
    .map(p => ({ payment:p, allocAmount: (p.allocations||[]).find(a=>a.invoiceId===invoiceId)?.amount||0 }))
    .sort((a,b)=>new Date(b.payment.createdAt||0)-new Date(a.payment.createdAt||0));

  // ── Save a Vendor Payment Voucher — offline-first with local invoice updates ──
  const piSavePaymentVoucher = async (payload, { stayOpen = false } = {}) => {
    // payload: { vendorId, vendorName, vendorMobile, method, paymentDate, note, chequeNo, chequeBank, chequeDate, allocations:[{invoiceId,invoiceNo,invoiceDate,amount}] }
    if (!payload.vendorName) { toast(t.pi_vendorRequired,"err"); return null; }
    const allocations = (payload.allocations||[]).filter(a=>piN2(a.amount)>0);
    if (!allocations.length) { toast(t.pi_amountRequired,"err"); return null; }
    if (payload.method==="cheque" && !String(payload.chequeNo||"").trim()) { toast(t.pi_errChequeNo,"err"); return null; }
    if (payload.chequeAmount != null) {
      const allocTotal = allocations.reduce((s,a)=>s+piN2(a.amount),0);
      if (piN2(payload.chequeAmount) <= 0 || piN2(payload.chequeAmount) > allocTotal + 0.001) {
        toast(lang==="bn"?"চেকের অঙ্ক শূন্য বা মোটের চেয়ে বেশি হতে পারবে না":"Cheque amount must be above zero and not more than the total","err");
        return null;
      }
    }

    setPmtSaving(true);
    try {
      const paymentNo = await genPaymentNo();
      const totalAmount = parseFloat(piFmt2(allocations.reduce((s,a)=>s+piN2(a.amount),0)));
      const nowIso = new Date().toISOString();
      const invoiceUpdates = [];

      for (const alloc of allocations) {
        const cur = invoices.find((inv) => inv.id === alloc.invoiceId);
        if (!cur) throw new Error(lang==="bn"?`ইনভয়েস ${alloc.invoiceNo} খুঁজে পাওয়া যায়নি`:`Invoice ${alloc.invoiceNo} not found`);
        if (cur.status==="draft"||cur.status==="cancelled") throw new Error(lang==="bn"?`${alloc.invoiceNo} ড্রাফট বা বাতিল — পেমেন্ট করা যাবে না`:`${alloc.invoiceNo} is draft/cancelled — cannot pay`);
        const curPaid = piN2(cur.amountPaid);
        const grand   = piN2(cur.grandTotal);
        const curBalance = Math.max(0, grand-curPaid);
        const amt = piN2(alloc.amount);
        if (amt > curBalance + 0.01) throw new Error(lang==="bn"?`${alloc.invoiceNo}-এর বাকির চেয়ে বেশি পরিমাণ দেওয়া হয়েছে`:`Amount for ${alloc.invoiceNo} exceeds its balance due`);
        const newAmountPaid = parseFloat(piFmt2(curPaid+amt));
        const newBalance    = Math.max(0, parseFloat(piFmt2(grand-newAmountPaid)));
        const newStatus     = newBalance<0.01 ? "paid" : (newAmountPaid>0 ? "partial" : cur.status);
        invoiceUpdates.push({ invoice: cur, newAmountPaid, newBalance, newStatus });
      }

      const paymentPayload = {
        shopId,
        paymentNo,
        vendorId: payload.vendorId || null,
        vendorName: payload.vendorName,
        vendorMobile: payload.vendorMobile || "",
        method: payload.method,
        paymentDate: payload.paymentDate || piToday(),
        totalAmount,
        chequeNo: payload.method === "cheque" ? (payload.chequeNo || "").trim() : "",
        chequeBank: payload.method === "cheque" ? (payload.chequeBank || "").trim() : "",
        chequeDate: payload.method === "cheque" ? (payload.chequeDate || "") : "",
        chequeStatus: payload.method === "cheque" ? "pending" : null,
        chequeReceivedBy: payload.method === "cheque" ? (payload.chequeReceivedBy || "").trim() : "",
        vendorReceiptNo: (payload.vendorReceiptNo || "").trim(),
        ...(payload.method === "cheque" && payload.chequeAmount != null ? {
          chequeAmount: parseFloat(piFmt2(payload.chequeAmount)),
          discountAmount: parseFloat(piFmt2(Math.max(0, totalAmount - piN2(payload.chequeAmount)))),
        } : {}),
        refNo: (payload.refNo || "").trim(),
        refBank: (payload.refBank || "").trim(),
        refDate: payload.refDate || "",
        note: (payload.note || "").trim(),
        allocations: allocations.map((a) => ({
          invoiceId: a.invoiceId,
          invoiceNo: a.invoiceNo,
          supplierInvoiceNo: a.supplierInvoiceNo || invoices.find((i) => i.id === a.invoiceId)?.supplierInvoiceNo || "",
          invoiceDate: a.invoiceDate || "",
          invoiceAmount: piN2(invoices.find((i) => i.id === a.invoiceId)?.grandTotal),
          amount: parseFloat(piFmt2(a.amount)),
        })),
        status: "active",
        createdBy: user.uid,
        createdByName: profile.personName,
        createdAt: nowIso,
        updatedAt: nowIso,
        updatedBy: user?.uid || "",
      };

      // Voucher first: if anything fails afterwards, a voucher exists rather than a bill marked paid without one.
      const result = await offlineCreate("purchasePayments", paymentPayload);
      const created = { ...result.data, id: result.documentId, createdAt: nowIso };
      setPayments((prev) => [created, ...prev]);

      await applyBillPayments(invoiceUpdates, nowIso);

      if (navigator.onLine) {
        window.S4Offline?.syncNow?.().catch((err) => console.warn("[S4 Sync] purchase payment save sync failed", err));
      }

      toast(t.pi_voucherSaved);
      if (!stayOpen) { setPmtView("list"); setSelVoucher(null); setPmtPrefillVendorId(null); }
      return created;
    } catch(e) { toast(e.message,"err"); return null; }
    finally { setPmtSaving(false); }
  };

  // All bills of one voucher are patched in memory, written to disk once and shown at once (a disk write and a
  // re-render per bill made a 20-bill voucher tick down bill by bill).
  const applyBillPayments = async (invoiceUpdates, nowIso) => {
    const updatedById = new Map();
    try {
      for (const update of invoiceUpdates) {
        const patched = await offlinePatch("purchaseInvoices", update.invoice.id, {
          amountPaid: update.newAmountPaid,
          balanceDue: update.newBalance,
          status: update.newStatus,
          updatedAt: nowIso,
          updatedBy: user?.uid || "",
        }, update.invoice, { deferPersist: true });
        updatedById.set(update.invoice.id, { ...update.invoice, ...patched.data, id: update.invoice.id });
      }
    } finally {
      if (updatedById.size) {
        await persistOfflineDb();
        setInvoices((prev) => prev.map((inv) => updatedById.get(inv.id) || inv));
        setSelInvoice((prev) => (prev && updatedById.get(prev.id)) || prev);
      }
    }
  };

  const piReversePaymentAllocations = async (payment, { cancelReason = "", chequeStatus = null } = {}) => {
    const nowIso = new Date().toISOString();
    const invoiceUpdates = [];

    for (const alloc of (payment.allocations || [])) {
      const cur = invoices.find((inv) => inv.id === alloc.invoiceId);
      if (!cur || cur.status === "cancelled") continue;
      const grand = piN2(cur.grandTotal);
      const newAmountPaid = Math.max(0, parseFloat(piFmt2(piN2(cur.amountPaid) - piN2(alloc.amount))));
      const newBalance = Math.max(0, parseFloat(piFmt2(grand - newAmountPaid)));
      const newStatus = newBalance < 0.01 ? "paid" : (newAmountPaid > 0 ? "partial" : "confirmed");
      invoiceUpdates.push({ invoice: cur, newAmountPaid, newBalance, newStatus });
    }

    await applyBillPayments(invoiceUpdates, nowIso);

    const paymentPatch = {
      status: "cancelled",
      cancelledAt: nowIso,
      cancelledBy: user?.uid || "",
      updatedAt: nowIso,
      updatedBy: user?.uid || "",
      ...(cancelReason ? { cancelReason } : {}),
      ...(chequeStatus ? { chequeStatus } : {}),
    };

    const result = await offlinePatch("purchasePayments", payment.id, paymentPatch, payment);
    const updatedPayment = { ...payment, ...result.data, id: payment.id };
    setPayments((prev) => prev.map((p) => (p.id === payment.id ? updatedPayment : p)));

    if (navigator.onLine) {
      window.S4Offline?.syncNow?.().catch((err) => console.warn("[S4 Sync] purchase payment reverse sync failed", err));
    }

    return updatedPayment;
  };

  // Only cancelled vouchers can be removed: cancelling already put the amounts back on the bills.
  const piDeletePaymentVoucher = async (payment) => {
    if (!isOwner || payment?.status !== "cancelled") return false;
    if (!window.confirm(lang==="bn" ? `ভাউচার ${payment.paymentNo||""} একেবারে মুছে ফেলবেন?` : `Delete voucher ${payment.paymentNo||""} permanently?`)) return false;
    try {
      await offlineRemove("purchasePayments", payment.id);
      setPayments(prev => prev.filter(p => p.id !== payment.id));
      toast(lang==="bn" ? "🗑️ ভাউচার মুছে ফেলা হয়েছে" : "🗑️ Voucher deleted", "err");
      logAudit({ shopId, user, profile, action:"delete", collection:"purchasePayments", docId:payment.id, docNo:payment.paymentNo, amount:payment.totalAmount, note:payment.vendorName });
      if (navigator.onLine) window.S4Offline?.syncNow?.().catch(err => console.warn("[S4 Sync] purchase payment delete sync failed", err));
      return true;
    } catch (e) { toast(e.message, "err"); return false; }
  };

  // ── Cancel a Payment Voucher — reverses every allocation back onto its invoice's balance ──
  const piCancelPaymentVoucher = async (payment) => {
    if (!window.confirm(t.pi_confirmCancelVoucher)) return null;
    try {
      if (payment.status === "cancelled") {
        throw new Error(lang==="bn"?"ভাউচারটি ইতিমধ্যে বাতিল":"Voucher already cancelled");
      }
      const updatedPayment = await piReversePaymentAllocations(payment);
      setSelVoucher((p) => p && p.id === payment.id ? updatedPayment : p);
      toast(t.pi_voucherCancelled,"err");
      logAudit({ shopId, user, profile, action:"cancel", collection:"purchasePayments", docId:payment.id, docNo:payment.paymentNo, amount:payment.totalAmount, note:payment.vendorName });
      return updatedPayment;
    } catch(e) { toast(e.message,"err"); return null; }
  };

  // ── Update a voucher's cheque clearance status. Bounced ⇒ auto-reverses every allocation. ──
  const piSetVoucherChequeStatus = async (payment, newChequeStatus, extra = {}) => {
    if (newChequeStatus==="bounced") {
      if (!window.confirm(t.pi_confirmBounce)) return null;
      try {
        if (payment.status === "cancelled") {
          throw new Error(lang==="bn"?"ভাউচারটি ইতিমধ্যে বাতিল":"Voucher already cancelled");
        }
        const updatedPayment = await piReversePaymentAllocations(payment, {
          cancelReason: "cheque_bounced",
          chequeStatus: "bounced",
        });
        setSelVoucher((p) => p && p.id === payment.id ? updatedPayment : p);
        toast(t.pi_chequeBounced,"err");
        return updatedPayment;
      } catch(e) { toast(e.message,"err"); return null; }
    } else {
      try {
        const nowIso = new Date().toISOString();
        const result = await offlinePatch("purchasePayments", payment.id, {
          chequeStatus:newChequeStatus,
          ...(newChequeStatus==="cleared" ? { clearedAt:extra.clearedAt || nowIso, clearedBy:user?.uid || "" } : {}),
          updatedAt:nowIso,
          updatedBy:user?.uid || "",
        }, payment);

        const updated = { ...payment, ...result.data, id: payment.id };
        setPayments(prev => prev.map(p => p.id === payment.id ? updated : p));
        setSelVoucher(p=>p&&p.id===payment.id?{...p,...updated}:p);
        toast(t.pi_chequeUpdated);

        if (navigator.onLine) {
          window.S4Offline?.syncNow?.().catch(err => console.warn("[S4 Sync] purchase payment cheque clear sync failed", err));
        }
        return updated;
      } catch(e) { toast(e.message,"err"); return null; }
    }
  };
  return { getRelatedPayments, piCancelPaymentVoucher, piDeletePaymentVoucher, piSavePaymentVoucher, piSetVoucherChequeStatus };
}
