import { PI_VOUCHER_METHODS, piFmt2, piN2, AutoTA, nsmatch, piR2, DEFAULT_PERMISSIONS, PI_PREFIX, reserveShopSerial, deviceSerialTag, STOCK_AFFECTING_INVOICE_STATUSES, billLeaveGuard, applyInvoiceStockEffect, unlinkedStockOk, voucherParties, toVoucherView } from "../shared/appShared.jsx";
import { useState, useRef, useEffect, useMemo } from "react";
import { UAE_BANKS, amountToWordsAED } from "../cheque/chequeConfig.js";
import { localIsoDate } from "../utils/localIsoDate.js";
import { useFirebaseAuthReady } from "../auth/useFirebaseAuthReady.js";
import { offlineList, offlineCacheCloudRecords, offlinePatch, offlineCreate, offlineRemove, offlineGetById } from "../offline/offlineRepository";
import { query, collection, where, orderBy, onSnapshot, runTransaction, doc } from "../backend/firestore";
import { db } from "../firebase-config";
import { purchaseOptionsOf, batchReasons, rateOf, nextBatchNo, isForeign, lineToBase } from "./purchaseOptions.js";
import { saveShopRecord } from "../offline/shopService";
import { useWindowState, useEscapeKey, MinimizedChip, WindowButtons } from "../components/WindowChrome.jsx";
import { usePmMobile, SI_STATUS_COLOR, SI_CSS, PM_TH } from "../sales-invoice/siSkin.js";
import { subscribeShopCollection } from "../offline/realtimeSync";
import { isBranchTransferBill } from "../branch-transfer/branchTransferDomain.js";
import { chequeAmountOfVoucher, chequeVoucherHtml, chequeHandoverHtml } from "../vouchers/chequeDocs.js";
import { printWithSettings } from "../print/printSettings.js";
import { loadHandoverDocs, saveHandoverDocs, handoverSummary } from "../vouchers/chequeHandoverStore.js";
import { logAudit } from "../utils/auditLog.js";
import { isOpeningBill } from "../utils/openingBill.js";
import { loadInvoiceRows, computeStockMap } from "../inventory/stockFromInvoices";
import { rescaleForUnit, unitFactorFor } from "../inventory/unitConversion";
import { cancelStaleClear, scheduleStaleClear, STALE_DRAFT_MS } from "../utils/staleDraftClear.js";
import { persistOfflineDb } from "../offline/sqliteDb.js";
import { pricingPatchFromLanding } from "../product-master/pricingFromLanding.js";
import { groupInvoicesByParty } from "../invoices/PartyFolderList.jsx";
import { PM_CSS } from "../product-master/pmStyles";
import PartyLedgerWindow from "../vouchers/PartyLedgerWindow.jsx";
import { returnsAsLedgerVouchers } from "../returns/ReturnsTab.jsx";
import AgainstInvoiceVoucherWindow from "../vouchers/AgainstInvoiceVoucherWindow.jsx";
import { printPaymentVoucher, siUnitOptionsFor } from "../sales-invoice/salesInvoiceShared.js";
import VendorChequeWizard from "../vouchers/VendorChequeWizard.jsx";
import ChequeHandoverModal from "../vouchers/ChequeHandoverModal.jsx";
import PurchaseInvoiceDesktopForm from "./PurchaseInvoiceDesktopForm.jsx";
import { CURRENCIES } from "../reports/taxDomain.js";
import { ProductTypeaheadInput } from "../components/ProductTypeaheadInput.jsx";
import StockBadge from "../inventory/StockBadge.jsx";
import ProductInvoiceEntryInfo from "../sales-invoice/ProductInvoiceEntryInfo.jsx";
import { piCalcLine, PI_CHEQUE_STATUSES, piToday, VOUCHER_CARD_TYPES, piEmptyForm, piEmptyCurrent, PMT_PREFIX, piEmptyLine, piCalcTotals, PI_STATUSES, PI_PAY_METHODS, PI_UNITS } from "./purchaseShared.js";
import { PiPaymentsListTab, PiNewPaymentForm, PiVoucherDetailView } from "./PiPayments.jsx";
import { PiItemsTable } from "./PiItemsTable.jsx";
import { renderPiScreens } from "./renderPiScreens.jsx";
import { createPiInvoiceActions } from "./piInvoiceActions.js";
import { usePiInvoiceForm } from "./usePiInvoiceForm.js";
import { usePiPaymentActions } from "./usePiPaymentActions.js";
import { usePiCheque } from "./usePiCheque.js";
import { createPiNumbering } from "./piNumbering.js";
import { usePiData } from "./usePiData.js";

export function PurchaseInvoiceTab({ t, lang, th, s, shopId, user, profile, vendors, products, shop, toast, isDesktop, syncRefreshKey=0, wideDesktop=false, onOpenProductMaster, productFromMaster=null, onOpenChequePrinter, chequeHandoverRequest=null, onChequeHandoverHandled, openNewRequest=0, openNewVendor=null, onOpenNewHandled, voucherRequest=0, onVoucherHandled, onShopUpdated, purchaseSource=null, onPurchaseSourceHandled, openInvoiceId=null, onOpenInvoiceHandled, onProductPatched }) {
  const authSyncReady = useFirebaseAuthReady();
  const isOwner = profile?.role==="owner";
  const perms = { ...DEFAULT_PERMISSIONS, ...(profile?.permissions || {}) };
  const can = (key) => isOwner || perms[key] === true;
  const piBaseCur = String(shop?.currency || "AED").trim().toUpperCase();
  const purchaseOpts = useMemo(() => purchaseOptionsOf(shop), [shop]);
  const savePurchaseOptions = async (next) => {
    const updated = await saveShopRecord(shopId, { purchaseOptions: next }, { ownerUid: user?.uid || shop?.ownerUid, profile, user });
    onShopUpdated?.(updated);
  };

  const canManagePurchase = can("managePurchase");
  const canViewSupplierLedger = can("viewSupplierLedger") || can("viewVendors") || can("vendorPayments") || canManagePurchase;
  const canVendorPayments = can("vendorPayments");

  // ── Firestore state ──
  const [invoices,setInvoices]     = useState([]);
  const [piLoading,setPiLoading]   = useState(true);

  // ── View state: "list" | "form" | "detail" ──
  const [piView,setPiView]         = useState("list");
  const [piGroupMode,setPiGroupMode] = useState("folders");
  const [piOpenParty,setPiOpenParty] = useState(null);
  const piWin = useWindowState({ maximized:true });
  const piMobile = usePmMobile();
  const piRootRef = useRef(null);
  const [piFitH,setPiFitH] = useState(null);
  const { billReturns, chqHandover, chqHandoverSaving, chqWizard, editInvoiceId, payments, piCurrent, piEditLineId, piForm, piInvoiceNo, piLedgerHidden, piLines, piNameRef, piNavReturn, piQtyRef, piSaveLockRef, piSaving, piSearch, piSnapRef, piStatusF, piSubTab, pmtLoading, pmtPrefillInvoiceId, pmtPrefillVendorId, pmtSaving, pmtView, selInvoice, selVoucher, setChqHandover, setChqHandoverSaving, setChqWizard, setEditInvoiceId, setPayments, setPiCurrent, setPiEditLineId, setPiForm, setPiInvoiceNo, setPiLedgerHidden, setPiLines, setPiNavReturn, setPiSaving, setPiSearch, setPiStatusF, setPiSubTab, setPmtLoading, setPmtPrefillInvoiceId, setPmtPrefillVendorId, setPmtSaving, setPmtView, setSelInvoice, setSelVoucher, setVendorDropOpen, setVendorSearchQ, vendorDropOpen, vendorSearchQ, vendorSearchRef } = usePiData({ authSyncReady, canManagePurchase, canVendorPayments, canViewSupplierLedger, piMobile, piRootRef, piView, piWin, setInvoices, setPiFitH, setPiLoading, shopId, syncRefreshKey });

  const { bumpShopPiSerial, genPaymentNo, piFormatPaymentNo, piMaxLocalPaymentSerial, piPreviewNextInvoiceNo, reservePiInvoiceNo } = createPiNumbering({ editInvoiceId, invoices, isOwner, payments, piInvoiceNo, setPiInvoiceNo, shop, shopId });

  // ── Payment Vouchers listener + offline SQLite cache fallback ──
  useEffect(()=>{
    if (!shopId) return;
    setPmtLoading(true);
    let unsub1=()=>{};
    let unsub2=null;

    const normalizePiPayment = (d) => ({
      ...d.data(),
      id:d.id,
      createdAt:d.data().createdAt?.toDate?.() || d.data().createdAt || new Date().toISOString(),
    });

    const sortPiPayments = (rows=[]) => [...rows].sort((a,b)=>
      new Date(b.createdAt||b.paymentDate||0) - new Date(a.createdAt||a.paymentDate||0)
    );

    const loadOfflinePiPayments = async () => {
      const res = await offlineList("purchasePayments");
      const rawRows = Array.isArray(res) ? res : (res.records || []).map(r => r.data || r);
      const rows = rawRows.filter(p => p.shopId === shopId);
      if (rows.length) setPayments(sortPiPayments(rows));
      return rows.length;
    };

    loadOfflinePiPayments()
      .then((count) => { if (count > 0 || !authSyncReady) setPmtLoading(false); })
      .catch(err => { console.warn("[S4 Offline] purchasePayments offline load failed", err); if (!authSyncReady) setPmtLoading(false); });

    const applyCloudPayments = async (rows) => {
      let merged = rows;
      try {
        const res = await offlineList("purchasePayments");
        const records = Array.isArray(res) ? res : (res.records || []);
        const dirty = records
          .filter(r => Number(r?.dirty || 0) === 1)
          .map(r => ({ ...(r.data || r), id:(r.data?.id || r.document_id || r.id) }))
          .filter(p => p.shopId === shopId);
        if (dirty.length) {
          const map = new Map(rows.map(p => [String(p.id), p]));
          dirty.forEach(p => map.set(String(p.id), p));
          merged = sortPiPayments([...map.values()]);
        }
      } catch {}
      setPayments(merged);
      offlineCacheCloudRecords("purchasePayments", rows).catch(err => console.warn("[S4 Offline] purchasePayments cache failed", err));
      setPmtLoading(false);
    };

    if (authSyncReady) {
      const q=query(collection(db,"purchasePayments"),where("shopId","==",shopId),orderBy("createdAt","desc"));
      unsub1=onSnapshot(q,snap=>{
        applyCloudPayments(snap.docs.map(normalizePiPayment));
      },()=>{
        const q2=query(collection(db,"purchasePayments"),where("shopId","==",shopId));
        unsub2=onSnapshot(q2,snap=>{
          applyCloudPayments(sortPiPayments(snap.docs.map(normalizePiPayment)));
        },err2=>{
          console.error(err2);
          loadOfflinePiPayments().finally(()=>setPmtLoading(false));
        });
      });
    }
    return ()=>{ unsub1(); unsub2&&unsub2(); };
  },[shopId, authSyncReady]);

  const { getVendorOpenInvoices, openChequeHandover, openVoucherInChequePrinter, piMoneyInvoices, piSaveChequeHandover, printChequeHandover, printChequePaymentVoucher, withSupRefs } = usePiCheque({ chequeHandoverRequest, invoices, lang, onChequeHandoverHandled, onOpenChequePrinter, payments, setChqHandover, setChqHandoverSaving, setPayments, setPiSubTab, setPiView, setSelVoucher, shop, t, toast, user });

  useEffect(()=>{
    if (!openNewRequest) return;
    onOpenNewHandled?.();
    if (!(isOwner||canManagePurchase) || piView==="form") return;
    setPiSubTab("invoices");
    piOpenNew();
    if (openNewVendor) piPickVendor(openNewVendor);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openNewRequest]);
  const { getRelatedPayments, piCancelPaymentVoucher, piDeletePaymentVoucher, piSavePaymentVoucher, piSetVoucherChequeStatus } = usePiPaymentActions({ canVendorPayments, genPaymentNo, invoices, isOwner, lang, onVoucherHandled, payments, piView, profile, setInvoices, setPayments, setPiSubTab, setPmtPrefillVendorId, setPmtSaving, setPmtView, setSelInvoice, setSelVoucher, shopId, t, toast, user, voucherRequest });

  const { filteredVendorOpts, piAddCurrentItem, piCanEditInv, piChangeCurrentUnit, piClearVendor, piDelLine, piEditLine, piLeaveDetail, piLeaveMinOk, piLeaveUnsavedOk, piOpenEdit, piOpenFromDesktop, piOpenNew, piPickVendor, piSelectProduct, piSource, piUpd, piVendorRecord, pickVendors, setPiSource } = usePiInvoiceForm({ canManagePurchase, editInvoiceId, invoices, isOwner, lang, onPurchaseSourceHandled, piBaseCur, piCurrent, piEditLineId, piForm, piInvoiceNo, piLines, piMobile, piNameRef, piNavReturn, piOpenParty, piPreviewNextInvoiceNo, piQtyRef, piSnapRef, piSubTab, piView, piWin, pmtView, productFromMaster, products, purchaseOpts, purchaseSource, setEditInvoiceId, setPiCurrent, setPiEditLineId, setPiForm, setPiInvoiceNo, setPiLedgerHidden, setPiLines, setPiNavReturn, setPiOpenParty, setPiSearch, setPiSubTab, setPiView, setPmtPrefillVendorId, setPmtView, setSelInvoice, setSelVoucher, setVendorDropOpen, setVendorSearchQ, shopId, toast, user, vendorSearchQ, vendors });

  const { piCancelInv, piConfirm, piDelete, piGoToMakePayment, piSaveDraft, refreshAverageCosts } = createPiInvoiceActions({ billReturns, bumpShopPiSerial, can, canManagePurchase, canVendorPayments, editInvoiceId, invoices, isOwner, lang, onProductPatched, payments, piBaseCur, piCurrent, piForm, piInvoiceNo, piLines, piMoneyInvoices, piOpenNew, piSaveLockRef, piSource, piVendorRecord, products, profile, reservePiInvoiceNo, setInvoices, setPiSaving, setPiSource, setPiSubTab, setPiView, setPmtPrefillInvoiceId, setPmtPrefillVendorId, setPmtView, setSelInvoice, setSelVoucher, shopId, t, toast, user });
  // One-time catch-up per shop and device: Avg. Cost of products saved before it followed the purchases.
  useEffect(() => {
    if (!shopId || piLoading || !invoices.length || !products.length) return;
    const key = `s4-avg-cost-v1:${shopId}`;
    try { if (localStorage.getItem(key)) return; } catch { return; }
    const ids = [...new Set(invoices.flatMap((inv) => (inv.items || []).map((it) => it.productId)))];
    refreshAverageCosts(ids, invoices, { deferPersist: true })
      .then(async (done) => { if (!done) return; await persistOfflineDb(); try { localStorage.setItem(key, new Date().toISOString()); } catch {} })
      .catch((err) => console.warn("[S4 PI] average cost catch-up failed", err));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shopId, piLoading, invoices.length, products.length]);

  // ── Filter ──
  const piFiltered = invoices.filter(inv=>{
    const q=piSearch.trim();
    const matchSt=piStatusF==="ALL"||inv.status===piStatusF;
    if (!q) return matchSt;
    const hay=[inv.invoiceNo,inv.vendorName,inv.supplierInvoiceNo,inv.refNo,inv.createdByName,...(inv.items||[]).map(it=>it.name+" "+it.code+" "+it.brand)].filter(Boolean).join(" ");
    return matchSt&&nsmatch(hay,q);
  });
  const piKPIs = invoices.reduce((a,inv)=>{ a.total++; if (inv.status==="cancelled"||inv.status==="draft"||isBranchTransferBill(inv)) return a; if (!isOpeningBill(inv)) a.amount+=inv.grandTotal||0; a.paid+=inv.amountPaid||0; a.due+=inv.balanceDue||0; return a; },{ total:0,amount:0,paid:0,due:0 });

  const totals=piCalcTotals(piLines);
  const paid=piForm.paymentMethod==="cash" ? totals.grand : piN2(piForm.amountPaid), balance=Math.max(0,totals.grand-paid);

  // ══════ LIST VIEW ══════
  const bnL = lang==="bn";
  const piAccent = "#c2410c";
  const piBadge = (st) => <span className="si-badge" style={{ color:SI_STATUS_COLOR[st]||"#475569" }}>{PI_STATUSES[st]?.[lang]||st}</span>;
  const piRowDue = (inv) => ["cancelled","draft"].includes(inv.status) || isBranchTransferBill(inv) ? 0 : Math.max(0, piN2(inv.grandTotal) - piN2(inv.amountPaid));
  const piBtTag = (inv) => isBranchTransferBill(inv) ? <span className="si-badge" style={{ color:"#0e7490", marginLeft:4 }} title={bnL?"Branch Transfer — মোট/বাকিতে ধরা হয় না":"Branch Transfer — not in totals/dues"}>🚚 Branch</span> : null;
  const piOpenInvoice = (inv) => { if (!piLeaveMinOk()) return; setSelInvoice(inv); setPiView("detail"); };
  useEffect(() => {
    if (!openInvoiceId) return;
    onOpenInvoiceHandled?.();
    const inv = invoices.find((i) => i.id === openInvoiceId);
    if (!inv) return;
    setPiSubTab("invoices");
    piOpenInvoice(inv);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openInvoiceId, invoices]);
  const piRootStyle = piFitH && !piMobile ? { height:piFitH } : undefined;
  const piMatchBlock = (inv) => {
    const q = piSearch.trim();
    if (!q) return [];
    return (inv.items||[]).filter(it=>nsmatch([it.name,it.code,it.brand].filter(Boolean).join(" "), q)).slice(0,3).map((it,i)=>{
      const qty = piN2(it.qty);
      const { tax, total } = piCalcLine(it);
      const landing = qty>0 ? (total - tax)/qty : piN2(it.unitCost);
      return <div key={i} className="si-match" style={{ color:piAccent }}>📦 {it.name}{it.code?` · ${it.code}`:""} — {it.qty} {it.unit} × {piFmt2(landing)} ({bnL?"ল্যান্ডিং":"landing"})</div>;
    });
  };

  return renderPiScreens({ balance, billReturns, bnL, can, canManagePurchase, canVendorPayments, canViewSupplierLedger, chqHandover, chqHandoverSaving, chqWizard, editInvoiceId, filteredVendorOpts, getRelatedPayments, getVendorOpenInvoices, invoices, isDesktop, isOwner, lang, onOpenChequePrinter, onOpenProductMaster, openChequeHandover, openVoucherInChequePrinter, paid, payments, piAccent, piAddCurrentItem, piBadge, piBaseCur, piBtTag, piCanEditInv, piCancelInv, piCancelPaymentVoucher, piChangeCurrentUnit, piClearVendor, piConfirm, piCurrent, piDelLine, piDelete, piDeletePaymentVoucher, piEditLine, piEditLineId, piFiltered, piForm, piFormatPaymentNo, piGoToMakePayment, piGroupMode, piInvoiceNo, piKPIs, piLeaveDetail, piLeaveMinOk, piLeaveUnsavedOk, piLedgerHidden, piLines, piLoading, piMatchBlock, piMaxLocalPaymentSerial, piMobile, piMoneyInvoices, piNameRef, piOpenEdit, piOpenFromDesktop, piOpenInvoice, piOpenNew, piOpenParty, piPickVendor, piQtyRef, piRootRef, piRootStyle, piRowDue, piSaveChequeHandover, piSaveDraft, piSavePaymentVoucher, piSaving, piSearch, piSelectProduct, piSetVoucherChequeStatus, piSource, piStatusF, piSubTab, piUpd, piView, piWin, pickVendors, pmtLoading, pmtPrefillInvoiceId, pmtPrefillVendorId, pmtSaving, pmtView, printChequeHandover, printChequePaymentVoucher, products, purchaseOpts, savePurchaseOptions, selInvoice, selVoucher, setChqHandover, setChqWizard, setPiCurrent, setPiEditLineId, setPiForm, setPiGroupMode, setPiLedgerHidden, setPiLines, setPiNavReturn, setPiOpenParty, setPiSearch, setPiStatusF, setPiSubTab, setPiView, setPmtPrefillInvoiceId, setPmtPrefillVendorId, setPmtView, setSelInvoice, setSelVoucher, setVendorDropOpen, setVendorSearchQ, shop, shopId, t, th, toast, totals, vendorDropOpen, vendorSearchQ, vendorSearchRef, vendors, wideDesktop, withSupRefs });
}
