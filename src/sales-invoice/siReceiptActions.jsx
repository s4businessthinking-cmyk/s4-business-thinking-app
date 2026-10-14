import AgainstInvoiceVoucherWindow from "../vouchers/AgainstInvoiceVoucherWindow.jsx";
import PartyLedgerWindow from "../vouchers/PartyLedgerWindow.jsx";
import { UAE_BANKS } from "../cheque/chequeConfig.js";
import { applyInvoiceStockEffect, deviceSerialTag, reserveShopSerial, toVoucherView, voucherParties } from "../shared/appShared.jsx";
import { isOpeningBill } from "../utils/openingBill.js";
import { logAudit } from "../utils/auditLog.js";
import { offlineCreate, offlineGetById, offlineList, offlinePatch, offlineRemove, offlineUpdate } from "../offline/offlineRepository";
import { printPaymentVoucher, siFmt2, siN2 } from "./salesInvoiceShared.js";
import { returnsAsLedgerVouchers } from "../returns/ReturnsTab.jsx";
import { siToday } from "./siHelpers.js";

export function createSiReceiptActions({ COL, billReturns, canCancelInv, customers, invoices, isDN, isOwner, isQuote, kind, lang, ledgerWin, profile, rcptSaving, receiptWin, receipts, setInvoices, setLedgerWin, setRcptSaving, setReceiptWin, setReceipts, setSelInv, setSiNavReturn, setSiView, shop, shopId, siNavReturn, t, team, toast, user }) {
  // ── Receipts against Bill ──
  const getCustomerOpenInvoices = (partyId, partyName) => invoices
    .filter(inv => ["confirmed","partial"].includes(inv.status) && siN2(inv.balanceDue)>0.01
      && (partyId ? inv.customerId===partyId : !inv.customerId && String(inv.customerName||"").trim()===String(partyName||"").trim()))
    .sort((a,b) => String(a.invoiceDate||"").localeCompare(String(b.invoiceDate||"")));

  const rcptMaxLocalSerial = () => receipts.reduce((mx, r) => {
    const m = String(r.receiptNo || "").match(/RCT-?(\d+)(?:-[A-Z]{2})?$/i);
    return m ? Math.max(mx, Number(m[1])) : mx;
  }, Number(shop?.lastReceiptSerial || 0));
  const rcptFormatNo = (serial) => `RCT-${String(serial).padStart(4, "0")}`;
  const genReceiptNo = async () => {
    const local = rcptMaxLocalSerial();
    const serial = await reserveShopSerial(shopId, "lastReceiptSerial", local);
    if (serial) return rcptFormatNo(serial);
    return isOwner ? rcptFormatNo(local + 1) : `${rcptFormatNo(local + 1)}-${deviceSerialTag()}`;
  };

  const applyInvoicePayments = async (changes, nowIso) => {
    for (const { invoice, newAmountPaid } of changes) {
      const grand = siN2(invoice.grandTotal);
      const newBalance = Math.max(0, parseFloat(siFmt2(grand - newAmountPaid)));
      const newStatus = newBalance < 0.01 ? "paid" : (newAmountPaid > 0 ? "partial" : "confirmed");
      const result = await offlinePatch("salesInvoices", invoice.id, { amountPaid:newAmountPaid, balanceDue:newBalance, status:newStatus, updatedAt:nowIso, updatedBy:user?.uid || "" }, invoice);
      const updated = { ...invoice, ...result.data, id: invoice.id };
      setInvoices(prev => prev.map(x => x.id === invoice.id ? updated : x));
      setSelInv(prev => prev && prev.id === invoice.id ? updated : prev);
    }
  };

  const siSaveReceipt = async (d) => {
    const allocations = (d.allocations||[]).filter(a => siN2(a.amount) > 0);
    if (!d.partyName || !allocations.length) return null;
    setRcptSaving(true);
    try {
      const nowIso = new Date().toISOString();
      const changes = allocations.map(a => {
        const cur = invoices.find(inv => inv.id === a.invoiceId);
        if (!cur) throw new Error(lang==="bn" ? `বিল ${a.invoiceNo} পাওয়া যায়নি` : `Bill ${a.invoiceNo} not found`);
        if (!["confirmed","partial"].includes(cur.status)) throw new Error(lang==="bn" ? `${a.invoiceNo}-এ টাকা নেওয়া যাবে না` : `${a.invoiceNo} cannot take a receipt`);
        const balance = Math.max(0, siN2(cur.grandTotal) - siN2(cur.amountPaid));
        if (siN2(a.amount) > balance + 0.01) throw new Error(lang==="bn" ? `${a.invoiceNo}-এর বাকির চেয়ে বেশি` : `Amount for ${a.invoiceNo} exceeds its balance`);
        return { invoice: cur, newAmountPaid: parseFloat(siFmt2(siN2(cur.amountPaid) + siN2(a.amount))) };
      });
      const receiptNo = await genReceiptNo();
      const payload = {
        shopId, receiptNo,
        customerId: d.partyId || null, customerName: d.partyName, customerMobile: d.partyMobile || "",
        receiptDate: d.date || siToday(), method: d.method,
        totalAmount: parseFloat(siFmt2(allocations.reduce((s,a)=>s+siN2(a.amount),0))),
        chequeNo: d.chequeNo || "", chequeBank: d.chequeBank || "", chequeDate: d.chequeDate || "",
        chequeStatus: d.method === "cheque" ? "pending" : null,
        refNo: d.refNo || "", refBank: d.refBank || "", refDate: d.refDate || "",
        collectedById: d.collectedById || "", collectedByName: d.collectedByName || "",
        note: d.note || "",
        allocations: allocations.map(a => ({ invoiceId:a.invoiceId, invoiceNo:a.invoiceNo, invoiceDate:a.invoiceDate||"", amount:parseFloat(siFmt2(a.amount)) })),
        status: "active",
        createdBy: user.uid, createdByName: profile.personName,
        createdAt: nowIso, updatedAt: nowIso, updatedBy: user?.uid || "",
      };
      const result = await offlineCreate("salesReceipts", payload);
      const created = { ...result.data, id: result.documentId, createdAt: nowIso };
      setReceipts(prev => [created, ...prev]);
      await applyInvoicePayments(changes, nowIso);
      if (navigator.onLine) window.S4Offline?.syncNow?.().catch(err => console.warn("[S4 Sync] sales receipt save sync failed", err));
      toast(lang==="bn" ? `✅ রিসিট ${receiptNo} সেভ হয়েছে` : `✅ Receipt ${receiptNo} saved`);
      return created;
    } catch (e) { toast(e.message, "err"); return null; }
    finally { setRcptSaving(false); }
  };

  const siReverseReceipt = async (receipt, patch) => {
    const nowIso = new Date().toISOString();
    const changes = (receipt.allocations||[]).map(a => {
      const cur = invoices.find(inv => inv.id === a.invoiceId);
      if (!cur || cur.status === "cancelled") return null;
      return { invoice: cur, newAmountPaid: Math.max(0, parseFloat(siFmt2(siN2(cur.amountPaid) - siN2(a.amount)))) };
    }).filter(Boolean);
    await applyInvoicePayments(changes, nowIso);
    const result = await offlinePatch("salesReceipts", receipt.id, { status:"cancelled", cancelledAt:nowIso, cancelledBy:user?.uid || "", updatedAt:nowIso, updatedBy:user?.uid || "", ...patch }, receipt);
    const updated = { ...receipt, ...result.data, id: receipt.id };
    setReceipts(prev => prev.map(r => r.id === receipt.id ? updated : r));
    if (navigator.onLine) window.S4Offline?.syncNow?.().catch(err => console.warn("[S4 Sync] sales receipt cancel sync failed", err));
    return updated;
  };

  const siCancelReceipt = async (receipt) => {
    if (receipt.status === "cancelled") return null;
    if (!window.confirm(lang==="bn" ? "এই রিসিট বাতিল করবেন? বিলগুলোর বাকি আবার ফিরে আসবে।" : "Cancel this receipt? The bills' balances will be restored.")) return null;
    try {
      const updated = await siReverseReceipt(receipt, {});
      toast(lang==="bn" ? "🚫 রিসিট বাতিল হয়েছে" : "🚫 Receipt cancelled", "err");
      logAudit({ shopId, user, profile, action:"cancel", collection:"salesReceipts", docId:receipt.id, docNo:receipt.receiptNo, amount:receipt.totalAmount, note:receipt.customerName });
      return updated;
    } catch (e) { toast(e.message, "err"); return null; }
  };

  // Only cancelled receipts can be removed: cancelling already gave the money back to the bills.
  const siDeleteReceipt = async (receipt) => {
    if (!isOwner || receipt?.status !== "cancelled") return false;
    if (!window.confirm(lang==="bn" ? `রিসিট ${receipt.receiptNo||""} একেবারে মুছে ফেলবেন?` : `Delete receipt ${receipt.receiptNo||""} permanently?`)) return false;
    try {
      await offlineRemove("salesReceipts", receipt.id);
      setReceipts(prev => prev.filter(r => r.id !== receipt.id));
      toast(lang==="bn" ? "🗑️ রিসিট মুছে ফেলা হয়েছে" : "🗑️ Receipt deleted", "err");
      logAudit({ shopId, user, profile, action:"delete", collection:"salesReceipts", docId:receipt.id, docNo:receipt.receiptNo, amount:receipt.totalAmount, note:receipt.customerName });
      if (navigator.onLine) window.S4Offline?.syncNow?.().catch(err => console.warn("[S4 Sync] sales receipt delete sync failed", err));
      return true;
    } catch (e) { toast(e.message, "err"); return false; }
  };

  const siSetReceiptCheque = async (receipt, chequeStatus, extra = {}) => {
    try {
      if (chequeStatus === "bounced") {
        if (!window.confirm(lang==="bn" ? "চেক বাউন্স? রিসিট বাতিল হবে আর বিলের বাকি ফিরে আসবে।" : "Cheque bounced? The receipt is cancelled and the bills' balances restored.")) return null;
        const updated = await siReverseReceipt(receipt, { chequeStatus:"bounced", cancelReason:"cheque_bounced" });
        toast(lang==="bn" ? "❌ চেক বাউন্স" : "❌ Cheque bounced", "err");
        return updated;
      }
      const nowIso = new Date().toISOString();
      const result = await offlinePatch("salesReceipts", receipt.id, { chequeStatus, ...(chequeStatus==="cleared" ? { clearedAt:extra.clearedAt || nowIso, clearedBy:user?.uid || "" } : {}), updatedAt:nowIso, updatedBy:user?.uid || "" }, receipt);
      const updated = { ...receipt, ...result.data, id: receipt.id };
      setReceipts(prev => prev.map(r => r.id === receipt.id ? updated : r));
      if (navigator.onLine) window.S4Offline?.syncNow?.().catch(err => console.warn("[S4 Sync] sales receipt cheque sync failed", err));
      toast(lang==="bn" ? "✅ চেক ক্লিয়ার" : "✅ Cheque cleared");
      return updated;
    } catch (e) { toast(e.message, "err"); return null; }
  };

  const receiptWindow = receiptWin && kind==="sales" ? (() => {
    const openAll = invoices.filter(inv => ["confirmed","partial"].includes(inv.status) && siN2(inv.balanceDue)>0.01);
    const salesmen = (team||[]).filter(m=>m && m.status!=="disabled" && m.active!==false)
      .map(m=>({ id:m.uid||m.id, name:m.personName||m.name||m.email||"" })).filter(m=>m.id&&m.name);
    return (
      <AgainstInvoiceVoucherWindow
        lang={lang} mode="receipt" cur={t.cur||"AED"}
        voucherNo={rcptFormatNo(rcptMaxLocalSerial() + 1)}
        parties={voucherParties(customers, openAll, "customerId", "customerName", c=>c.customerName, c=>c.mobileNumber)}
        salesmen={salesmen}
        banks={UAE_BANKS.map(b=>b.name)}
        getOpenInvoices={(p)=>getCustomerOpenInvoices(p.id, p.name)}
        vouchers={receipts.map(r=>toVoucherView(r,"receipt"))}
        prefill={receiptWin.partyId||receiptWin.partyName ? receiptWin : null}
        initialViewId={receiptWin.viewId||null}
        saving={rcptSaving}
        onSave={async (d)=>{ const c = await siSaveReceipt(d); return c ? toVoucherView(c,"receipt") : null; }}
        onCancelVoucher={canCancelInv ? async (v)=>{ const u = await siCancelReceipt(v.raw); return u ? toVoucherView(u,"receipt") : null; } : undefined}
        onDeleteVoucher={isOwner ? (v)=>siDeleteReceipt(v.raw) : undefined}
        onSetChequeStatus={async (v,st)=>{
          if (st==="bounced" && !canCancelInv) { toast(lang==="bn"?"❌ চেক বাউন্স করার অনুমতি নেই":"❌ You don't have permission to bounce cheques","err"); return null; }
          const u = await siSetReceiptCheque(v.raw, st); return u ? toVoucherView(u,"receipt") : null;
        }}
        onPrint={(v)=>printPaymentVoucher(v.raw, shop, lang)}
        onClose={()=>{
          setReceiptWin(null);
          if (siNavReturn === "ledger") {
            setLedgerWin(true);
            setSiNavReturn(null);
          }
        }}
      />
    );
  })() : null;

  const ledgerWindow = ledgerWin && kind==="sales" ? (
    <PartyLedgerWindow lang={lang} mode="customer" cur={t.cur||"AED"} shopName={shop?.companyName||""}
      partyCodes={Object.fromEntries((customers||[]).filter(c=>c.customerCode).map(c=>[c.id, c.customerCode]))}
      partyTrns={Object.fromEntries((customers||[]).filter(c=>c.trnNumber).map(c=>[c.id, c.trnNumber]))}
      invoices={invoices.map(inv=>({ id:inv.id, no:inv.invoiceNo, date:String(inv.invoiceDate||"").slice(0,10), partyId:inv.customerId||null, partyName:inv.customerName||"", partyMobile:inv.customerMobile||"", total:inv.grandTotal, paid:inv.amountPaid, status:inv.status, ref:inv.deliveryNoteNo||"", method:inv.paymentMethod, raw:inv }))}
      vouchers={(isOwner ? receipts : (()=>{
        const visible = new Set(invoices.map(inv=>inv.id));
        return receipts.map(r=>{
          const allocations = (r.allocations||[]).filter(a=>visible.has(a.invoiceId));
          return allocations.length ? { ...r, allocations, totalAmount:allocations.reduce((s,a)=>s+siN2(a.amount),0) } : null;
        }).filter(Boolean);
      })()).map(r=>({ id:r.id, no:r.receiptNo, date:String(r.receiptDate||"").slice(0,10), partyId:r.customerId||null, partyName:r.customerName||"", partyMobile:r.customerMobile||"", method:r.method, amount:r.totalAmount, status:r.status, allocations:r.allocations||[], raw:r }))
        .concat(returnsAsLedgerVouchers(isOwner ? billReturns : billReturns.filter(r=>invoices.some(inv=>inv.id===r.invoiceId)), "sales"))}
      onOpenInvoice={(inv)=>{ setSiNavReturn("ledger"); setLedgerWin(false); setSelInv(inv); setSiView("detail"); }}
      onOpenVoucher={(r)=>{ if (r?.raw?.__return) return; setSiNavReturn("ledger"); setLedgerWin(false); setReceiptWin({ viewId:r.id }); }}
      onNewVoucher={(p)=>{ setSiNavReturn("ledger"); setLedgerWin(false); setReceiptWin({ partyId:p.id||null, partyName:p.name }); }}
      onClose={()=>setLedgerWin(false)} />
  ) : null;

  const siCancel = async (inv) => {
    if (isOpeningBill(inv)) { toast(lang==="bn" ? "এটা Opening Balance বিল — কাস্টমার মাস্টার থেকে শুরুর ব্যালেন্স বদলান।" : "This is an Opening Balance bill — change the opening balance in Customer Master.", "err"); return; }
    const activeReceipts = receipts.filter(r => r.status !== "cancelled" && (r.allocations||[]).some(a => a.invoiceId === inv.id));
    if (activeReceipts.length) {
      const nos = activeReceipts.map(r => r.receiptNo).join(", ");
      toast(lang==="bn" ? `আগে রিসিট বাতিল করুন: ${nos}` : `Cancel the receipt(s) first: ${nos}`, "err");
      return false;
    }
    const activeReturns = billReturns.filter(r => r.status !== "cancelled" && r.invoiceId === inv.id);
    if (activeReturns.length) {
      const nos = activeReturns.map(r => r.returnNo).join(", ");
      toast(lang==="bn" ? `আগে সেলস রিটার্ন বাতিল করুন: ${nos}` : `Cancel the sales return(s) first: ${nos}`, "err");
      return false;
    }
    if (!window.confirm(t.si_confirmCancel)) return false;
    try {
      const nowIso = new Date().toISOString();
      const result = await offlineUpdate(COL, inv.id, {
        ...inv,
        status:"cancelled",
        updatedAt:nowIso,
        updatedBy:user?.uid || "",
      });

      const updated = { ...result.data, id: inv.id };
      setInvoices(prev => prev.map(x => x.id === inv.id ? updated : x));
      setSelInv(updated);

      if (inv.deliveryNoteId) {
        // The goods are still out with the delivery note; it just becomes open for invoicing again.
        try {
          const res = await offlineList("deliveryNotes");
          const records = Array.isArray(res) ? res : (res.records || []);
          const rec = records.find(r => (r.data?.id || r.document_id || r.id) === inv.deliveryNoteId);
          const dn = rec ? { ...(rec.data || rec), id: inv.deliveryNoteId } : null;
          if (dn && dn.status==="invoiced") {
            await offlineUpdate("deliveryNotes", dn.id, { ...dn, status:"confirmed", convertedInvoiceId:"", convertedInvoiceNo:"", updatedAt:nowIso, updatedBy:user?.uid || "" });
          }
        } catch (err) {
          console.warn("[S4 SI] reopen delivery note failed", err);
        }
      }

      if (inv.quotationId) {
        try {
          const res = await offlineList("quotations");
          const records = Array.isArray(res) ? res : (res.records || []);
          const rec = records.find(r => (r.data?.id || r.document_id || r.id) === inv.quotationId);
          const qt = rec ? { ...(rec.data || rec), id: inv.quotationId } : null;
          if (qt && qt.status==="converted") {
            await offlineUpdate("quotations", qt.id, { ...qt, status:"open", convertedInvoiceId:"", convertedInvoiceNo:"", updatedAt:nowIso, updatedBy:user?.uid || "" });
          }
        } catch (err) {
          console.warn("[S4 SI] reopen quotation failed", err);
        }
      }

      if (inv.salesOrderId) {
        try {
          const latest = await offlineGetById("salesOrders", inv.salesOrderId).catch(() => null);
          const so = latest?.data ? { ...latest.data, id: inv.salesOrderId } : null;
          if (so && ["delivered","invoiced"].includes(so.status) && so.convertedInvoiceId===inv.id) {
            await offlineUpdate("salesOrders", so.id, { ...so, status:"open", convertedInvoiceId:"", convertedInvoiceNo:"", updatedAt:nowIso, updatedBy:user?.uid || "" });
          }
        } catch (err) {
          console.warn("[S4 SI] reopen sales order failed", err);
        }
      }

      if (inv.jobOrderId) {
        try {
          const latest = await offlineGetById("jobOrders", inv.jobOrderId).catch(() => null);
          const job = latest?.data ? { ...latest.data, id: inv.jobOrderId } : null;
          if (job && job.status==="invoiced" && job.convertedInvoiceId===inv.id) {
            await offlineUpdate("jobOrders", job.id, { ...job, status:job.prevStatus||"completed", convertedInvoiceId:"", convertedInvoiceNo:"", updatedAt:nowIso, updatedBy:user?.uid || "" });
          }
        } catch (err) {
          console.warn("[S4 SI] reopen job order failed", err);
        }
      }

      if (!isQuote && !inv.deliveryNoteId) await applyInvoiceStockEffect({
        oldInvoice: inv,
        newInvoice: updated,
        invoiceId: inv.id,
        applyType: "sale",
        reverseType: "return",
        referenceType: isDN ? "delivery_note" : "sales_invoice",
        unitCostKey: "unitPrice",
        shopId,
        actor: { uid: user?.uid, personName: profile?.personName },
      });

      toast(t.si_cancelledMsg,"err");
      logAudit({ shopId, user, profile, action:"cancel", collection:COL, docId:inv.id, docNo:inv.invoiceNo, amount:inv.grandTotal, note:inv.customerName });

      if (navigator.onLine) {
        window.S4Offline?.syncNow?.().catch(err => console.warn("[S4 Sync] sales invoice cancel sync failed", err));
      }
      return true;
    } catch(e){ toast(e.message,"err"); return false; }
  };

  const siDelete = async (inv) => {
    if (isOpeningBill(inv)) { toast(lang==="bn" ? "এটা Opening Balance বিল — কাস্টমার মাস্টার থেকে শুরুর ব্যালেন্স বদলান।" : "This is an Opening Balance bill — change the opening balance in Customer Master.", "err"); return; }
    if (!window.confirm(t.si_confirmDelete)) return;
    try {
      await offlineRemove(COL, inv.id);

      setInvoices(prev => prev.filter(x => x.id !== inv.id));
      setSiView("list");
      setSelInv(null);
      toast(t.si_deleted,"err");
      logAudit({ shopId, user, profile, action:"delete", collection:COL, docId:inv.id, docNo:inv.invoiceNo, amount:inv.grandTotal, note:inv.customerName });

      if (navigator.onLine) {
        window.S4Offline?.syncNow?.().catch(err => console.warn("[S4 Sync] sales invoice delete sync failed", err));
      }
    } catch(e){ toast(e.message,"err"); }
  };
  return { ledgerWindow, receiptWindow, siCancel, siDelete };
}
