import { amountToWordsAED } from "../cheque/chequeConfig.js";
import { chequeAmountOfVoucher, chequeHandoverHtml, chequeVoucherHtml } from "../vouchers/chequeDocs.js";
import { handoverSummary, loadHandoverDocs, saveHandoverDocs } from "../vouchers/chequeHandoverStore.js";
import { isBranchTransferBill } from "../branch-transfer/branchTransferDomain.js";
import { offlinePatch } from "../offline/offlineRepository";
import { piN2 } from "../shared/appShared.jsx";
import { printWithSettings } from "../print/printSettings.js";
import { useEffect, useMemo } from "react";

export function usePiCheque({ chequeHandoverRequest, invoices, lang, onChequeHandoverHandled, onOpenChequePrinter, payments, setChqHandover, setChqHandoverSaving, setPayments, setPiSubTab, setPiView, setSelVoucher, shop, t, toast, user }) {
  // ── This vendor's open (payable) invoices — confirmed/partial with balance > 0, oldest first ──
  // Older vouchers stored only our PI number; fill in the vendor's own invoice number from the invoice.
  const withSupRefs = (v) => v && ({ ...v, allocations:(v.allocations||[]).map(a=>({ ...a, supplierInvoiceNo:a.supplierInvoiceNo || invoices.find(i=>i.id===a.invoiceId)?.supplierInvoiceNo || "" })) });

  const piMoneyInvoices = useMemo(() => invoices.filter(inv => !isBranchTransferBill(inv)), [invoices]);
  const getVendorOpenInvoices = (vendorId, vendorName) => piMoneyInvoices
    .filter(inv => ["confirmed","partial"].includes(inv.status) && piN2(inv.balanceDue)>0.01 && (vendorId ? inv.vendorId===vendorId : inv.vendorName===vendorName))
    .sort((a,b) => new Date(a.invoiceDate||0) - new Date(b.invoiceDate||0));

  // ── Vendor cheque documents ──
  const chequeDocVoucher = (v) => {
    const withRefs = withSupRefs(v);
    return { ...withRefs, allocations: withRefs.allocations.map(a => ({ ...a, invoiceAmount: a.invoiceAmount ?? invoices.find(i=>i.id===a.invoiceId)?.grandTotal })) };
  };
  const chequeDocOpts = (v) => ({ cur: t.cur||"AED", amountWords: `${amountToWordsAED(chequeAmountOfVoucher(v))} Only` });
  const printChequePaymentVoucher = (v) => printWithSettings(chequeVoucherHtml(chequeDocVoucher(v), shop, chequeDocOpts(v)), { lang });
  const printChequeHandover = (v, handover) => printWithSettings(chequeHandoverHtml(chequeDocVoucher(v), shop, handover || v.handover || {}, chequeDocOpts(v)), { lang });
  const openVoucherInChequePrinter = (v) => onOpenChequePrinter?.({
    voucher: v, payee: v.vendorName || "", amount: chequeAmountOfVoucher(v), date: v.chequeDate || v.paymentDate || "", bankName: v.chequeBank || "",
  });
  const openChequeHandover = async (v) => {
    const base = payments.find(p=>p.id===v.id) || v;
    setChqHandover({ ...base, handover: await loadHandoverDocs(base) });
  };
  const piSaveChequeHandover = async (v, handover) => {
    setChqHandoverSaving(true);
    try {
      const nowIso = new Date().toISOString();
      const { handover: _full, ...rest } = v;
      const base = payments.find(p=>p.id===v.id) || rest;
      await saveHandoverDocs(base, handover, user?.uid || "");
      const result = await offlinePatch("purchasePayments", v.id, {
        chequeReceivedBy: base.chequeReceivedBy || handover.receiverName,
        handover: { ...handoverSummary(handover), savedAt: nowIso, savedBy: user?.uid || "" },
        updatedAt: nowIso, updatedBy: user?.uid || "",
      }, base);
      const updated = { ...base, ...result.data, id: v.id };
      setPayments(prev => prev.map(p => p.id===v.id ? updated : p));
      setSelVoucher(prev => prev && prev.id===v.id ? updated : prev);
      if (navigator.onLine) window.S4Offline?.syncNow?.().catch(err => console.warn("[S4 Sync] handover sync failed", err));
      toast(lang==="bn" ? "✅ হস্তান্তর ডকুমেন্ট সেভ হয়েছে" : "✅ Handover document saved");
      setChqHandover(null);
      return updated;
    } catch (e) { toast(e.message, "err"); return null; }
    finally { setChqHandoverSaving(false); }
  };

  useEffect(() => {
    if (!chequeHandoverRequest?.id) return;
    const { at, ...requested } = chequeHandoverRequest;
    setPiView("list"); setPiSubTab("payments"); openChequeHandover(requested);
    onChequeHandoverHandled?.();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chequeHandoverRequest]);
  return { getVendorOpenInvoices, openChequeHandover, openVoucherInChequePrinter, piMoneyInvoices, piSaveChequeHandover, printChequeHandover, printChequePaymentVoucher, withSupRefs };
}
