import { siCalcLine, siN2, siFmt2, SI_UNITS, SI_STATUSES, SI_PAY, siProductRateRows, siCalcTotals, siInvoiceExtras, printPaymentVoucher, siR2, siUnitOptionsFor, generatePaymentVoucherHTML, generateSalesInvoiceHTML, siIsSettledPay } from "./salesInvoiceShared.js";
import { useState, useRef, useMemo, useEffect } from "react";
import { nsmatch, DEFAULT_PERMISSIONS, reserveShopSerial, deviceSerialTag, nextPartyCode, billLeaveGuard, applyInvoiceStockEffect, unlinkedStockOk, voucherParties, toVoucherView, PI_VOUCHER_METHODS, AutoTA } from "../shared/appShared.jsx";
import { useEscapeKey, useWindowState, MinimizedChip, WindowButtons } from "../components/WindowChrome.jsx";
import { useFirebaseAuthReady } from "../auth/useFirebaseAuthReady.js";
import { usePmMobile, PM_TH, SI_STATUS_COLOR, SI_CSS } from "./siSkin.js";
import { subscribeShopCollection } from "../offline/realtimeSync";
import { offlineCacheCloudRecords, offlineList, offlineCreate, offlineUpdate, offlineGetById, offlinePatch, offlineRemove } from "../offline/offlineRepository";
import { query, collection, where, orderBy, onSnapshot, runTransaction, doc } from "../backend/firestore";
import { db } from "../firebase-config";
import { isOpeningBill } from "../utils/openingBill.js";
import { invoiceStatusLabel } from "../invoices/invoiceSettleKind.js";
import { inDateRange, listSummary, matchesStatus, statusCounts } from "../utils/docStatusFilter.js";
import { pendingRows } from "../utils/pendingBills.js";
import { loadInvoiceRows, computeStockMap } from "../inventory/stockFromInvoices";
import { saleBatchChoices, batchStockByProduct } from "../inventory/batchStock";
import { cancelStaleClear, scheduleStaleClear, STALE_DRAFT_MS } from "../utils/staleDraftClear.js";
import { unitFactorFor, itemBaseQty } from "../inventory/unitConversion";
import { logAudit } from "../utils/auditLog.js";
import { persistOfflineDb } from "../offline/sqliteDb.js";
import AgainstInvoiceVoucherWindow from "../vouchers/AgainstInvoiceVoucherWindow.jsx";
import { UAE_BANKS } from "../cheque/chequeConfig.js";
import PartyLedgerWindow from "../vouchers/PartyLedgerWindow.jsx";
import { returnsAsLedgerVouchers } from "../returns/ReturnsTab.jsx";
import { groupInvoicesByParty } from "../invoices/PartyFolderList.jsx";
import { PM_CSS } from "../product-master/pmStyles";
import BatchPickModal from "./BatchPickModal";
import PartyPickerWindow, { CUSTOMER_PICKER_COLS } from "../components/PartyPickerWindow.jsx";
import SalesInvoiceDesktopForm from "./SalesInvoiceDesktopForm.jsx";
import { ProductTypeaheadInput } from "../components/ProductTypeaheadInput.jsx";
import StockBadge from "../inventory/StockBadge.jsx";
import ProductInvoiceEntryInfo from "./ProductInvoiceEntryInfo.jsx";
import { salesSpecs } from "../product-master/productSpecs";
import { printWithSettings, loadPrintSettings, printHtmlDocument } from "../print/printSettings.js";
import { localIsoDate } from "../utils/localIsoDate.js";
import { withoutPeriodLock } from "../accounts/periodLock.js";
import { CUSTOMER_PICKER_LIMIT, SO_PREFIX, QT_PREFIX, DN_PREFIX, SI_PREFIX, SO_STATUSES, QT_STATUSES, DN_STATUSES, siEmptyForm, migrateLegacyDeliveryNotes, siAddDays, siToday, QT_VALID_DAYS, qtIsExpired, siEmptyLine, siResolveRate, normCustomerType, printSalesInvoice, siDeliveryLines, sourceDocOf, printMoneyReceipt } from "./siHelpers.js";
import { SiCustomerPicker } from "./SiCustomerPicker.jsx";
import { SiItemsTable } from "./SiItemsTable.jsx";
import { renderSiScreens } from "./renderSiScreens.jsx";
import { createSiReceiptActions } from "./siReceiptActions.jsx";
import { createSiSaveActions } from "./siSaveActions.js";
import { useSiLeaveGuard } from "./useSiLeaveGuard.js";
import { createSiLineActions } from "./siLineActions.js";
import { createSiNumbering } from "./siNumbering.js";
import { useSiData } from "./useSiData.js";
import { useLoyaltyInfo } from "../counter/useLoyaltyInfo.js";
import { docMessage, partyPhone, pdfFileName } from "../share/whatsappDocShare.js";
import { useDocShare } from "../share/WhatsAppButton.jsx";
import { autoWhatsAppDue } from "../share/autoWhatsApp.js";
import { moneyReceiptHtml } from "./siHelpers.js";
import { billLocationsOf } from "../inventory/billLocation.js";
import { useBillLocationStock } from "../inventory/useBillLocationStock.js";
import { billSnapshot, isDisplayOpen, showOnDisplay } from "../counter/customerDisplay.js";

// ── SALES INVOICE TAB (main) ──
export function SalesInvoiceTab({ t, lang, th, s, shopId, user, profile, customers, products, shop, toast, isDesktop, siShowCode, siColorPrint, canManageCustomers=false, onCustomerCreated, syncRefreshKey=0, team=[], onOpenProductMaster, productFromMaster=null, wideDesktop=false, kind="sales", branchLocked=false, quoteToConvert=null, onConvertQuote, onConvertToDN, onQuoteConvertHandled, openNewRequest=0, openNewCustomer=null, onOpenNewHandled, openBranchSalesRequest=null, onOpenBranchSalesHandled, voucherRequest=0, onVoucherHandled, openInvoiceId=null, onOpenInvoiceHandled, onStartReturn }) {
  const authSyncReady = useFirebaseAuthReady();
  const isOwner = profile?.role==="owner";
  const siPerm = (key) => isOwner || { ...DEFAULT_PERMISSIONS, ...(profile?.permissions||{}) }[key] === true;
  const canDiscount = siPerm("giveDiscount");
  const canCancelInv = siPerm("cancelInvoices");
  const canPrintInv = siPerm("printSales") || siPerm("manageSales");
  const canViewAllInvoices = siPerm("viewAllSalesInvoices");
  const canCustBalance = siPerm("viewCustomerBalance");
  const canSeeCost = siPerm("manageProducts") || siPerm("managePurchase");
  // A sales order behaves like a quotation (no stock, no money) until it becomes a delivery note or an invoice.
  const isSO = kind==="salesOrder";
  const isQuote = kind==="quotation" || isSO;
  const isDN = kind==="delivery";
  const COL = isSO ? "salesOrders" : isQuote ? "quotations" : isDN ? "deliveryNotes" : "salesInvoices";
  const DOC_PREFIX = isSO ? SO_PREFIX : isQuote ? QT_PREFIX : isDN ? DN_PREFIX : SI_PREFIX;
  const STATUSES = isSO ? SO_STATUSES : isQuote ? QT_STATUSES : isDN ? DN_STATUSES : SI_STATUSES;
  const serialRe = isSO ? /SO-?(\d+)(?:-[A-Z]{2})?$/i : isQuote ? /QT-?(\d+)(?:-[A-Z]{2})?$/i : isDN ? /DN-?(\d+)(?:-[A-Z]{2})?$/i : /SI-?(\d+)(?:-[A-Z]{2})?$/i;
  const serialField = isSO ? "lastSOSerial" : isQuote ? "lastQTSerial" : isDN ? "lastDNSerial" : "lastSISerial";
  // The quotation or delivery note this new sales invoice is being made from.
  const [sourceQuote,setSourceQuote] = useState(null);
  const [dnMigrateTick,setDnMigrateTick] = useState(0);

  const [invoices,setInvoices]     = useState([]);
  const [siLoading,setSiLoading]   = useState(true);
  const [siView,setSiView]         = useState("list");
  const [siGroupMode,setSiGroupMode] = useState("folders");
  const [siOpenParty,setSiOpenParty] = useState(null);
  const siWin = useWindowState({ maximized:true });
  useEffect(() => { if (siView!=="form") siWin.restore(); }, [siView]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (siView !== "form") return undefined;
    loadInvoiceRows().catch(() => {});
  }, [siView]);
  const siMobile = usePmMobile();
  const siRootRef = useRef(null);
  const [siFitH,setSiFitH] = useState(null);
  // On PC the screen fills exactly the space below the window title, so the page itself never scrolls.
  useEffect(() => {
    if (siMobile) { setSiFitH(null); return undefined; }
    const fit = () => {
      const el = siRootRef.current; if (!el) return;
      const top = el.getBoundingClientRect().top + (el.parentElement?.scrollTop || 0);
      setSiFitH(Math.max(420, Math.floor(window.innerHeight - top)));
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [siMobile, siView]);
  const { billReturns, cashRcptSaving, cashReceiptWin, editInvId, ledgerWin, rcptSaving, receiptWin, receipts, selInv, setCashRcptSaving, setCashReceiptWin, setEditInvId, setLedgerWin, setRcptSaving, setReceiptWin, setReceipts, setSelInv, setShowCustPicker, setSiBatchAsk, setSiCurrent, setSiEditLineId, setSiForm, setSiInvoiceNo, setSiLines, setSiNavReturn, setSiLedgerPartyKey, setSiPrintModal, setSiPrintPayAsk, setSiSaving, setSiSearch, setSiVehicleQ, setSiRefQ, setSiStatusF, showCustPicker, siBatchAsk, siCurrent, siEditLineId, siEmptyCurrent, siForm, siInvoiceNo, siLines, siLoadedPaidRef, siNameRef, siCodeRef, siNavReturn, siLedgerPartyKey, siPrintModal, siPrintPayAsk, siQtyRef, siSaveLockRef, siSaving, siSearch, siVehicleQ, siRefQ, siSnapRef, siStatusF } = useSiData({ COL, authSyncReady, dnMigrateTick, invoices, isDN, isOwner, kind, setDnMigrateTick, setInvoices, setSiLoading, shopId, syncRefreshKey, user, viewAllInvoices: canViewAllInvoices });

  const { bumpShopSiSerial, reserveSiInvoiceNo, siLoadDoc, siOpenEdit, siOpenNew, siPreviewNextInvoiceNo } = createSiNumbering({ DOC_PREFIX, customers, editInvId, invoices, isDN, isOwner, isQuote, isSO, kind, lang, profile, serialField, serialRe, setEditInvId, setSiCurrent, setSiForm, setSiInvoiceNo, setSiLines, setSiView, setSourceQuote, shop, shopId, siEmptyCurrent, siInvoiceNo, siLoadedPaidRef, siSnapRef, team, toast, user });
  useEffect(()=>{
    if (!openNewRequest) return;
    onOpenNewHandled?.();
    if (kind!=="sales" || siView==="form") return;
    siOpenNew(openNewCustomer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openNewRequest]);
  useEffect(() => {
    if (!openBranchSalesRequest?.at) return;
    onOpenBranchSalesHandled?.();
    if (kind !== "sales") return;
    const { branchId, branchName } = openBranchSalesRequest;
    siOpenNew(null, "", branchId ? { stockLocation: branchId, stockLocationName: branchName || branchId } : null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openBranchSalesRequest?.at]);
  useEffect(()=>{
    if (!voucherRequest) return;
    onVoucherHandled?.();
    if (kind==="sales") setReceiptWin({});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voucherRequest]);
  // Quotation → new sales invoice: same customer, items and discounts, fresh invoice number and today's date.
  useEffect(()=>{
    if (isQuote || !quoteToConvert) return;
    if (quoteToConvert.docKind==="quotation" && qtIsExpired(quoteToConvert)) {
      toast(lang==="bn" ? "কোটেশনের মেয়াদ শেষ — আগে মেয়াদ বাড়ান বা নতুন কোটেশন বানান" : "This quotation has expired — extend the validity or create a new quote", "err");
      onQuoteConvertHandled?.();
      return;
    }
    siLoadDoc(quoteToConvert);
    // Delivery notes store every line at 0% VAT; the invoice needs each product's real VAT rate.
    if (!isDN && (quoteToConvert.docKind==="delivery" || quoteToConvert.invoiceType==="delivery")) {
      setSiLines(prev=>prev.map(l=>{
        const vat = siFindProduct(l.productId)?.salesVat;
        return { ...l, vatPerc: vat!=null && String(vat).trim()!=="" ? String(vat) : "5" };
      }));
    }
    const srcIsDn = quoteToConvert.docKind === "delivery" || quoteToConvert.invoiceType === "delivery";
    setSiForm((p) => ({
      ...p, invoiceDate: siToday(), validUntil: "", refNo: p.refNo || quoteToConvert.invoiceNo || "",
      invoiceType: isDN ? "delivery" : quoteToConvert.invoiceType === "regular" ? "regular" : "tax",
      locationId: quoteToConvert.locationId || p.locationId || "",
      ...(!isDN && srcIsDn ? { deliveryNoteNo: quoteToConvert.invoiceNo || "" } : {}),
    }));
    setSiInvoiceNo(siPreviewNextInvoiceNo());
    setEditInvId(null);
    setSourceQuote(quoteToConvert);
    setSiView("form");
    onQuoteConvertHandled?.();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[quoteToConvert]);
  // The invoice list may still be loading when a quotation arrives; keep the preview number current.
  useEffect(()=>{
    if (sourceQuote && !editInvId && siView==="form") setSiInvoiceNo(siPreviewNextInvoiceNo());
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[invoices]);

  const { siAddCurrentItem, siAutoDisc, siChangeCurrentUnit, siDelLine, siFindProduct, siQuickAddCustomer, siSelectCustomer, siSelectProduct, siUpd } = createSiLineActions({ canManageCustomers, customers, isDN, isQuote, kind, lang, onCustomerCreated, products, setShowCustPicker, setSiBatchAsk, setSiCurrent, setSiEditLineId, setSiForm, setSiLines, shopId, siCurrent, siEditLineId, siEmptyCurrent, siForm, siLines, siNameRef, siCodeRef, siQtyRef, t, toast, user });

  const { customerPickerProps, siCanDeleteDoc, siCanEditDoc, siLeaveDetail, siLeaveFormToList, siLeaveMinOk, siLeaveUnsavedOk, siOpenFromDesktop, siPickCustomers, siPrint, siDocHtml } = useSiLeaveGuard({ canCancelInv, canManageCustomers, customers, editInvId, invoices, isDN, isOwner, isQuote, kind, lang, productFromMaster, receipts, setEditInvId, setLedgerWin, setSelInv, setShowCustPicker, setSiCurrent, setSiForm, setSiInvoiceNo, setSiLines, setSiNavReturn, setSiOpenParty, setSiSearch, setSiView, setSourceQuote, shop, siColorPrint, siCurrent, siEmptyCurrent, siForm, siLines, siMobile, siNavReturn, siOpenEdit, siOpenParty, siPerm, siQuickAddCustomer, siSelectCustomer, siSelectProduct, siShowCode, siSnapRef, siView, siWin, t, user });

  useEscapeKey(() => {
    if (siView==="form") siLeaveFormToList();
    else if (siView==="detail") siLeaveDetail();
  }, { enabled: siView!=="list" && !siWin.min, level: siView==="form" ? 2 : 1 });

  // Customers with "WhatsApp on invoice" ticked: the bill's PDF + message open right after it becomes a live bill.
  const siAutoShare = useDocShare({ lang, toast });
  const siOnInvoiceSaved = (saved, prior) => {
    const customer = saved?.customerId ? customers.find(c=>c.id===saved.customerId) : null;
    if (autoWhatsAppDue({ kind, saved, prior, customer })) siAutoShare.startAuto(siWhatsAppDoc(saved), saved.invoiceNo || "");
  };
  const { siConfirm, siSaveDraft } = createSiSaveActions({ onInvoiceSaved: siOnInvoiceSaved, COL, billReturns, bumpShopSiSerial, canDiscount, customers, editInvId, invoices, isDN, isQuote, isSO, kind, lang, products, profile, receipts, reserveSiInvoiceNo, setInvoices, setSelInv, setSiPrintModal, setSiSaving, setSiView, setSourceQuote, shopId, siAutoDisc, siCurrent, siFindProduct, siForm, siInvoiceNo, siLines, siLoadedPaidRef, siOpenNew, siPrint, siSaveLockRef, sourceQuote, t, toast, user });

  const siHasPrintableLines = siLines.some((it) => String(it.name || "").trim());
  const siRequestPrint = (inv) => {
    if (!canPrintInv) return;
    if (inv && inv.status !== "draft") {
      siPrint(inv);
      return;
    }
    if (!inv && !siHasPrintableLines) { toast(t.si_errItems, "err"); return; }
    if (inv && inv.status === "draft" && inv.id !== editInvId) siOpenEdit(inv);
    if (isQuote || isDN || siForm.invoiceType === "delivery") {
      if (inv) { siPrint(inv); return; }
      siConfirm({ print: "direct" });
      return;
    }
    setSiPrintPayAsk(true);
  };
  const siPrintAs = (choice) => {
    setSiPrintPayAsk(false);
    const current = siForm.paymentMethod;
    const method = choice === "credit" ? "credit" : (current === "bank" || current === "card" ? current : "cash");
    // setSiForm is async — when switching cash→credit, force unpaid in the same save so a
    // stale amountPaid cannot flip status to paid before React applies the clear.
    const switchingToCredit = method === "credit" && current !== "credit";
    if (method !== current) {
      setSiForm((p) => ({ ...p, paymentMethod: method, ...(method === "credit" ? { amountPaid: "", cashPartial: false } : { cashPartial: false }) }));
    }
    siConfirm({ print: "direct", paymentMethod: method, cashPartial: false, ...(switchingToCredit ? { forceAmountPaid: 0 } : {}) });
  };

  const { cashReceiptWindow, ledgerWindow, receiptWindow, siCancel, siDelete } = createSiReceiptActions({ COL, billReturns, canCancelInv, canPrintInv, cashRcptSaving, cashReceiptWin, customers, invoices, isDN, isOwner, isQuote, kind, lang, ledgerWin, profile, rcptSaving, receiptWin, receipts, setCashReceiptWin, setCashRcptSaving, setInvoices, setLedgerWin, setRcptSaving, setReceiptWin, setReceipts, setSelInv, setSiNavReturn, setSiLedgerPartyKey, siLedgerPartyKey, setSiView, shop, shopId, siNavReturn, t, team, toast, user });

  // Memoized: invoices can be thousands of rows, and this component re-renders on
  // every keystroke anywhere in the form, not just the search box.
  const [siFrom,setSiFrom] = useState("");
  const [siTo,setSiTo] = useState("");
  const siFiltered=useMemo(() => invoices.filter(inv=>{
    const matchSt=matchesStatus(inv, siStatusF)&&inDateRange(inv, "invoiceDate", siFrom, siTo);
    if (!matchSt) return false;
    const vq=siVehicleQ.trim();
    if (vq && !nsmatch(inv.vehicleNo||"", vq)) return false;
    const rq=siRefQ.trim();
    if (rq && !nsmatch(inv.refNo||"", rq)) return false;
    const q=siSearch.trim();
    if (!q) return true;
    const hay=[inv.invoiceNo,inv.customerName,inv.createdByName,inv.vehicleNo,inv.refNo,...(inv.items||[]).map(it=>it.name+" "+it.code)].filter(Boolean).join(" ");
    return nsmatch(hay,q);
  }), [invoices, siStatusF, siSearch, siVehicleQ, siRefQ, siFrom, siTo]);
  // Pills show how many bills each status has; the summary says what the filtered list adds up to.
  const siStatusCounts=useMemo(() => statusCounts(invoices), [invoices]);
  const siViewSum=useMemo(() => listSummary(siFiltered, { skip: isOpeningBill }), [siFiltered]);
  // Pending bills view (sales invoices only): bills with money still due, by due date.
  const [siPending,setSiPending] = useState(false);
  const siPendingCount=useMemo(() => (kind==="sales" ? pendingRows(invoices, { kind:"sales", asOf:(()=>{ const d=new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; })() }).length : 0), [invoices, kind]);
  const siListFilter={ from:siFrom, setFrom:setSiFrom, to:siTo, setTo:setSiTo, counts:siStatusCounts, summary:siViewSum,
    pending: kind==="sales"&&siPending, setPending:setSiPending, pendingCount:siPendingCount };
  const siKPIs=useMemo(() => invoices.reduce((a,inv)=>{ a.total++; if (inv.status!=="cancelled"&&inv.status!=="draft") { if (!isOpeningBill(inv)) a.amount+=inv.grandTotal||0; a.paid+=inv.amountPaid||0; a.due+=inv.balanceDue||0; } if (inv.status==="open") a.open++; if (inv.status==="converted") a.converted++; if (inv.status==="confirmed") a.delivered++; if (inv.status==="invoiced") a.invoiced++; if (inv.status==="delivered") a.soDelivered++; return a; },{total:0,amount:0,paid:0,due:0,open:0,converted:0,delivered:0,invoiced:0,soDelivered:0}), [invoices]);
  const kpiCards = isSO
    ? [{l:lang==="bn"?"মোট সেলস অর্ডার":"Sales Orders",v:siKPIs.total,c:"#a1a1aa",pre:""},{l:lang==="bn"?"মোট মূল্য":"Total Value",v:siFmt2(siKPIs.amount),c:"#0e7490",pre:t.cur+" "},{l:SO_STATUSES.open[lang],v:siKPIs.open,c:"#06b6d4",pre:""},{l:lang==="bn"?"ডেলিভারি / ইনভয়েস হয়েছে":"Delivered / Invoiced",v:siKPIs.soDelivered+siKPIs.invoiced,c:"#22c55e",pre:""}]
    : isDN
    ? [{l:lang==="bn"?"মোট ডেলিভারি নোট":"Delivery Notes",v:siKPIs.total,c:"#a1a1aa",pre:""},{l:lang==="bn"?"মোট মূল্য":"Total Value",v:siFmt2(siKPIs.amount),c:"#a855f7",pre:t.cur+" "},{l:lang==="bn"?"ইনভয়েস বাকি":"Not Invoiced",v:siKPIs.delivered,c:"#06b6d4",pre:""},{l:DN_STATUSES.invoiced[lang],v:siKPIs.invoiced,c:"#22c55e",pre:""}]
    : isQuote
    ? [{l:lang==="bn"?"মোট কোটেশন":"Quotations",v:siKPIs.total,c:"#a1a1aa",pre:""},{l:lang==="bn"?"মোট মূল্য":"Total Value",v:siFmt2(siKPIs.amount),c:"#f59e0b",pre:t.cur+" "},{l:QT_STATUSES.open[lang],v:siKPIs.open,c:"#06b6d4",pre:""},{l:QT_STATUSES.converted[lang],v:siKPIs.converted,c:"#22c55e",pre:""}]
    : [{l:t.si_totalInvoices,v:siKPIs.total,c:"#a1a1aa",pre:""},{l:t.si_totalSales,v:siFmt2(siKPIs.amount),c:"#22c55e",pre:t.cur+" "},{l:t.si_totalPaid,v:siFmt2(siKPIs.paid),c:"#06b6d4",pre:t.cur+" "},{l:t.si_totalDue,v:siFmt2(siKPIs.due),c:siKPIs.due>0?"#ef4444":"#22c55e",pre:t.cur+" "}];

  const formIsDelivery = isDN || (kind==="sales" && siForm.invoiceType==="delivery");
  const mobileTypeOptions = (isDN||isQuote) ? [] : [
    ...(siForm.invoiceType==="regular" ? [["regular","",t.si_regular,t.si_regularDesc,"#22c55e"]] : []),
    ["tax","",t.si_tax,t.si_taxDesc,"#1d4ed8"],
    ...((kind==="sales"&&siForm.invoiceType==="delivery") ? [["delivery","",t.si_delivery,t.si_deliveryDesc,"#a855f7"]] : []),
  ];
  const formIsTax      = siForm.invoiceType==="tax";
  const formIsCash     = siForm.paymentMethod==="cash";
  const formIsSettled  = siIsSettledPay(siForm.paymentMethod, siForm.cashPartial);
  const totals=formIsDelivery ? siCalcTotals(siDeliveryLines(siLines), false) : siCalcTotals(siLines, formIsTax, siInvoiceExtras(siForm));
  // cash / bank / card: auto fully paid; delivery: 0; credit / cheque / partial-cash: typed amount
  const formPaid = formIsDelivery || isQuote ? 0 : formIsSettled ? totals.grand : siN2(siForm.amountPaid);
  const balance  = Math.max(0, totals.grand - formPaid);
  // Loyalty points of the bill's customer (read-only) and the customer display window (does nothing unless it is open).
  // W01: the godowns a bill can sell from, and what each holds (nothing loaded for a main-only shop)
  const siLocations = useMemo(() => billLocationsOf(shop), [shop]);
  const siLocStock = useBillLocationStock({ shopId, products, locations: siLocations, skipDocId: editInvId || "", refreshKey: syncRefreshKey });
  const siLoyalty = useLoyaltyInfo({ shopId, shop, customer: kind==="sales" && siForm.customerId ? customers.find(c=>c.id===siForm.customerId) : null,
    billNet: siR2(totals.grand - totals.vat), billDay: siForm.invoiceDate, excludeId: editInvId || "", refreshKey: invoices.length + syncRefreshKey });
  const siLineAmount = (it, tax) => { const c = siCalcLine(it, tax); return c.gross - c.disc + c.vat; };
  useEffect(() => {
    if (kind!=="sales" || !isDisplayOpen()) return;
    const shopName = shop?.companyName || "", cur = t.cur || "AED";
    if (siView==="form" && siLines.length) {
      showOnDisplay({ shopName, cur, mode:"live", title:"Bill", no:siInvoiceNo || "", customer:siForm.customerName || "",
        member: siLoyalty?.no ? `${siLoyalty.no}${siLoyalty.points!=null ? ` · ${siLoyalty.points} pts` : ""}` : "",
        lines: siLines.map(it=>({ name:it.name || it.code || "", qty:it.qty, amount:siLineAmount(it, formIsTax) })), vat:totals.vat, total:totals.grand, paid:formPaid });
      return;
    }
    const last = invoices.filter(inv=>["confirmed","paid","partial"].includes(inv.status) && !isOpeningBill(inv))
      .reduce((a, inv)=>(!a || String(inv.createdAt || "") > String(a.createdAt || "") ? inv : a), null);
    showOnDisplay(last ? billSnapshot(last, { shopName, cur, lineAmount:(it)=>siLineAmount(it, last.invoiceType==="tax") }) : { shopName, cur, mode:"idle", welcome:"Welcome" });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, siView, siLines, totals.grand, totals.vat, formPaid, formIsTax, siForm.customerName, siInvoiceNo, invoices, siLoyalty?.no, siLoyalty?.points, shop?.companyName]);

  // ══ LIST ══
  const bnL = lang==="bn";
  const siAccent = isSO ? "#0e7490" : isQuote ? "#b45309" : isDN ? "#7e22ce" : "#15803d";
  const siLightC = { "#a1a1aa":"#07101c", "#22c55e":"#15803d", "#06b6d4":"#0e7490", "#ef4444":"#b91c1c", "#a855f7":"#7e22ce", "#f59e0b":"#b45309" };
  const siBadge = (invOrSt) => {
    const inv = invOrSt && typeof invOrSt === "object" ? invOrSt : { status: invOrSt };
    const st = inv.status;
    const label = invoiceStatusLabel(inv, lang, STATUSES) || (STATUSES[st]?.[lang] || st);
    return <span className="si-badge"style={{ color:SI_STATUS_COLOR[st]||"#475569" }}>{label}</span>;
  };
  const siExpiredBadge = (inv) => isQuote && !isSO && qtIsExpired(inv) ? <span className="si-badge"style={{ color:"#b91c1c", marginRight:3 }}>{bnL?"মেয়াদ শেষ":"Expired"}</span> : null;
  const siRowDue = (inv) => (isQuote || isDN || ["cancelled","draft"].includes(inv.status)) ? 0 : Math.max(0, siN2(inv.grandTotal) - siN2(inv.amountPaid));
  const siMatchedLines = (inv) => {
    const q = siSearch.trim();
    if (!q) return [];
    return (inv.items||[]).filter(it=>nsmatch([it.name,it.code,it.brand].filter(Boolean).join(" "), q)).slice(0,3).map((it)=>{
      const { disc, gross } = siCalcLine(it, false);
      const qty = siN2(it.qty);
      return { it, net: qty>0 ? (gross - disc)/qty : siN2(it.unitPrice) };
    });
  };
  const siOpenInvoice = (inv) => { if (!siLeaveMinOk()) return; setSelInv(inv); setSiView("detail"); };
  useEffect(() => {
    // openInvoiceId is shared across sales/quotation/delivery/salesOrder (same shared tab, different `kind`) —
    // the id is only ever meaningful within the kind it was set for, so no extra `kind`check is needed here.
    // On a fresh tab switch `invoices`starts empty and loads a moment later (see useSiData), so the id must
    // stay pending (not consumed yet) until either it's actually found, or the list has loaded and still
    // doesn't have it — clearing it on the very first, still-empty render would drop the open request.
    if (!openInvoiceId) return;
    const inv = invoices.find((i) => i.id === openInvoiceId);
    if (inv) { onOpenInvoiceHandled?.(); if (wideDesktop) siOpenFromDesktop(inv); else siOpenInvoice(inv); }
    else if (invoices.length > 0) { onOpenInvoiceHandled?.(); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openInvoiceId, invoices, kind]);
  // WhatsApp: the print HTML as a PDF with a short message to the customer's number (share/whatsappDocShare.js).
  const siDocType = (inv) => isSO ? (bnL?"সেলস অর্ডার":"Sales Order") : isQuote ? (bnL?"কোটেশন":"Quotation")
    : (isDN || inv.invoiceType==="delivery") ? (bnL?"ডেলিভারি নোট":"Delivery Note") : inv.invoiceType==="tax" ? (bnL?"ট্যাক্স ইনভয়েস":"Tax Invoice") : (bnL?"ইনভয়েস":"Invoice");
  const siWaPhone = (inv) => partyPhone(inv.customerId ? customers.find(c=>c.id===inv.customerId) : null) || String(inv.customerMobile || "");
  const siWhatsAppDoc = (inv) => ({
    html: siDocHtml(inv), fileName: pdfFileName(inv.invoiceNo, inv.customerName), phone: siWaPhone(inv),
    text: docMessage({ bn: bnL, shop: shop?.companyName || "", docType: siDocType(inv), no: inv.invoiceNo, date: inv.invoiceDate, total: inv.grandTotal, cur: t.cur || "AED", party: inv.customerName || "" }),
  });
  const siMoneyReceiptDoc = (inv, amount) => ({
    html: moneyReceiptHtml(inv, amount, shop, lang), fileName: pdfFileName("Receipt", inv.invoiceNo, inv.customerName), phone: siWaPhone(inv),
    text: docMessage({ bn: bnL, shop: shop?.companyName || "", docType: bnL?"মানি রিসিট":"Money receipt", no: inv.invoiceNo, date: inv.invoiceDate, total: amount, cur: t.cur || "AED", party: inv.customerName || "" }),
  });
  const siDocTitle = isSO ? (bnL?"সেলস অর্ডার":"SALES ORDER") : isQuote ? (bnL?"কোটেশন":"QUOTATION") : isDN ? (bnL?"ডেলিভারি নোট":"DELIVERY NOTE") : (bnL?"সেলস ইনভয়েস":"SALES INVOICE");

  // Reminder on this document — a plain "reminders"collection record carrying linkType/linkId/linkLabel
  // so the bell/Reminders tab can jump straight back to this invoice/quotation/delivery note.
  const [siReminderForm, setSiReminderForm] = useState(null);
  const siOpenReminderForm = (inv) => setSiReminderForm({ invoiceId: inv.id, invoiceNo: inv.invoiceNo || "", customerName: inv.customerName || "", date: siToday(), time: "", note: "" });
  const siSaveReminder = async () => {
    if (!siReminderForm?.date) return;
    if (!shopId || !user?.uid) {
      toast?.(bnL ? "লগইন ছাড়া রিমাইন্ডার সেভ হবে না" : "Sign in to save a reminder", "err");
      return;
    }
    try {
      const at = new Date().toISOString();
      await offlineCreate("reminders", {
        title: `${siDocTitle} ${siReminderForm.invoiceNo}${siReminderForm.customerName ? ` — ${siReminderForm.customerName}` : ""}`,
        note: siReminderForm.note || "", dueDate: siReminderForm.date, dueTime: siReminderForm.time || "",
        repeat: "none", remindBefore: 0, assignedTo: "", assignedToName: "", private: false, status: "open", shopId,
        createdAt: at, updatedAt: at, createdBy: user.uid, updatedBy: user.uid,
        createdByName: profile?.personName || profile?.username || "",
        linkType: kind, linkId: siReminderForm.invoiceId, linkLabel: siReminderForm.invoiceNo,
      });
      setSiReminderForm(null);
      toast?.(bnL ? "রিমাইন্ডার সেট হয়েছে" : "Reminder set");
      if (navigator.onLine) window.S4Offline?.syncNow?.().catch(() => {});
    } catch (e) {
      toast?.(e.message || String(e), "err");
    }
  };
  const siRootStyle = siFitH && !siMobile ? { height:siFitH } : undefined;

  return <>{renderSiScreens({ listFilter: siListFilter, onStartReturn, siLocations, siLocStock, STATUSES, balance, billReturns, bnL, branchLocked, canCancelInv, canCustBalance, canDiscount, canManageCustomers, canPrintInv, canSeeCost, canViewAllInvoices: isOwner || canViewAllInvoices, cashReceiptWindow, customerPickerProps, customers, editInvId, formIsCash, formIsDelivery, formIsSettled, formIsTax, formPaid, invoices, isDN, isOwner, isQuote, isSO, kind, kpiCards, lang, ledgerWindow, mobileTypeOptions, onConvertQuote, onConvertToDN, onOpenProductMaster, products, receiptWindow, receipts, selInv, setCashReceiptWin, setLedgerWin, setReceiptWin, setShowCustPicker, setSiCurrent, setSiEditLineId, setSiForm, setSiGroupMode, setSiLines, setSiOpenParty, setSiPrintModal, setSiPrintPayAsk, setSiSearch, setSiVehicleQ, setSiRefQ, setSiStatusF, setSiView, shop, shopId, showCustPicker, siAccent, siAddCurrentItem, siBadge, siBatchAsk, siCanDeleteDoc, siCanEditDoc, siCancel, siChangeCurrentUnit, siConfirm, siCurrent, siDelLine, siDelete, siDocTitle, siEditLineId, siEmptyCurrent, siExpiredBadge, siFiltered, siFindProduct, siForm, siGroupMode, siInvoiceNo, siLeaveDetail, siLeaveFormToList, siLeaveMinOk, siLeaveUnsavedOk, siLightC, siLines, siLoading, siMatchedLines, siMobile, siNameRef, siCodeRef, siOpenEdit, siOpenFromDesktop, siOpenInvoice, siOpenNew, siOpenParty, siPickCustomers, siPrint, siPrintAs, siPrintModal, siPrintPayAsk, siQtyRef, siQuickAddCustomer, siReminderForm, siOpenReminderForm, siRequestPrint, siSaveReminder, setSiReminderForm, siLoyalty, siWhatsAppDoc, siMoneyReceiptDoc, siRootRef, siRootStyle, siRowDue, siSaveDraft, siSaving, siSearch, siVehicleQ, siRefQ, siSelectCustomer, siSelectProduct, siStatusF, siUpd, siView, siWin, sourceQuote, t, team, toast, totals, user, profile, wideDesktop })}{siAutoShare.dialogs}</>;
}
