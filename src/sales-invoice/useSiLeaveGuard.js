import { PM_TH } from "./siSkin.js";
import { STALE_DRAFT_MS, cancelStaleClear, scheduleStaleClear } from "../utils/staleDraftClear.js";
import { billLeaveGuard } from "../shared/appShared.jsx";
import { printSalesInvoice, siEmptyForm } from "./siHelpers.js";
import { siN2 } from "./salesInvoiceShared.js";
import { useEffect } from "react";

export function useSiLeaveGuard({ canCancelInv, canManageCustomers, customers, editInvId, invoices, isDN, isOwner, isQuote, kind, lang, productFromMaster, receipts, setEditInvId, setLedgerWin, setSelInv, setShowCustPicker, setSiCurrent, setSiForm, setSiInvoiceNo, setSiLines, setSiNavReturn, setSiOpenParty, setSiSearch, setSiView, setSourceQuote, shop, siColorPrint, siCurrent, siEmptyCurrent, siForm, siLines, siMobile, siNavReturn, siOpenEdit, siOpenParty, siPerm, siQuickAddCustomer, siSelectCustomer, siSelectProduct, siShowCode, siSnapRef, siView, siWin, t, user }) {
  useEffect(()=>{
    if (productFromMaster?.product && siView==="form") siSelectProduct(productFromMaster.product);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[productFromMaster]);

  const siSnapKey = () => JSON.stringify({ f:siForm, l:siLines.map(({ id, ...rest })=>rest) });
  useEffect(()=>{ if (siSnapRef.current==="pending") siSnapRef.current = siSnapKey(); });
  const siIsDirty = () => {
    if (siView!=="form") return false;
    if (String(siCurrent.name||"").trim()) return true;
    if (!editInvId) return siLines.length>0;
    return siSnapRef.current!==siSnapKey();
  };
  const siLeaveUnsavedOk = () =>
    !siIsDirty() || window.confirm(lang==="bn"?"এই বিলের পরিবর্তন সেভ হয়নি। তবুও চলে যাবেন?":"This bill has unsaved changes. Leave anyway?");
  const siLeaveDetail = () => {
    setSelInv(null);
    setSiView("list");
    if (siNavReturn === "ledger") {
      setSiNavReturn(null);
      setLedgerWin(true);
    }
  };
  // Phone back / header back steps out one level at a time instead of leaving Sales.
  useEffect(()=>{
    const inFolder = siMobile && siView==="list" && !!siOpenParty;
    if (siView==="list" && !inFolder) return undefined;
    const guard = {
      leave: () => siView!=="form" || siLeaveUnsavedOk(),
      back: () => {
        if (siView==="form") { if (siLeaveUnsavedOk()) setSiView("list"); }
        else if (siView==="detail") { siLeaveDetail(); }
        else setSiOpenParty(null);
        return true;
      },
    };
    billLeaveGuard.current = guard;
    return () => { if (billLeaveGuard.current===guard) billLeaveGuard.current = null; };
  });

  useEffect(() => {
    if (siView === "form") {
      cancelStaleClear(`si-draft-${kind}`);
      cancelStaleClear(`si-search-${kind}`);
      return undefined;
    }
    scheduleStaleClear(`si-draft-${kind}`, () => {
      setSiForm(siEmptyForm());
      setSiLines([]);
      setSiCurrent(siEmptyCurrent());
      setEditInvId(null);
      setSourceQuote(null);
      setSiInvoiceNo("");
      siSnapRef.current = null;
    }, STALE_DRAFT_MS);
    scheduleStaleClear(`si-search-${kind}`, () => setSiSearch(""), STALE_DRAFT_MS);
    return () => {
      cancelStaleClear(`si-draft-${kind}`);
      cancelStaleClear(`si-search-${kind}`);
    };
  }, [siView, kind]);

  // A minimized bill must be confirmed away before the list opens another one.
  const siLeaveMinOk = () => {
    if (!(siWin.min && siView==="form")) return true;
    if (!siLeaveUnsavedOk()) return false;
    siWin.restore();
    return true;
  };
  const siPrint = (doc) => {
    const code = doc.customerId ? (customers||[]).find(c=>c.id===doc.customerId)?.customerCode : "";
    const inv = code && !doc.customerCode ? { ...doc, customerCode:code } : doc;
    if (!siPerm("viewCustomerBalance")) { printSalesInvoice(inv, shop, lang, siShowCode, siColorPrint); return; }
    const nameKey = String(inv.customerName||"").trim().toLowerCase();
    const customerBalance = invoices
      .filter(x => x.status!=="cancelled" && x.status!=="draft" && x.docKind!=="quotation" && x.invoiceType!=="delivery"
        && (inv.customerId ? x.customerId===inv.customerId : String(x.customerName||"").trim().toLowerCase()===nameKey))
      .reduce((sum,x)=>sum+Math.max(0, siN2(x.balanceDue)), 0);
    printSalesInvoice(inv, shop, lang, siShowCode, siColorPrint, { customerBalance });
  };

  // A bill with money received against it changes only through the owner; staff cancel the receipt first.
  const siCanEditDoc = (inv) => (isQuote?["draft","open"]:isDN?["draft","confirmed"]:["draft","confirmed","paid","partial"]).includes(inv?.status)
    && (isOwner || !receipts.some(r => r.status!=="cancelled" && (r.allocations||[]).some(a => a.invoiceId===inv.id)));
  const siCanDeleteDoc = (inv) => !!inv && (isOwner
    ? ["draft","cancelled"].includes(inv.status)
    : canCancelInv && inv.status==="draft" && inv.createdBy===user?.uid);
  const siOpenFromDesktop = (inv) => {
    if (!siLeaveUnsavedOk()) return;
    if (!siCanEditDoc(inv)) { setSelInv(inv); setSiView("detail"); return; }
    siOpenEdit(inv);
  };

  const siPickCustomers = (customers||[]).filter(c=>!["inactive","blocked"].includes(c.status));
  const customerPickerProps = {
    customers: siPickCustomers,
    t,
    th: PM_TH,
    lang,
    onSelect: siSelectCustomer,
    onClose: () => setShowCustPicker(false),
    canQuickAdd: canManageCustomers,
    onQuickAdd: siQuickAddCustomer,
  };
  return { customerPickerProps, siCanDeleteDoc, siCanEditDoc, siLeaveDetail, siLeaveMinOk, siLeaveUnsavedOk, siOpenFromDesktop, siPickCustomers, siPrint };
}
