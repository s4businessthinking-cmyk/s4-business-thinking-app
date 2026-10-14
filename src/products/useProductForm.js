import { STALE_DRAFT_MS, cancelStaleClear, scheduleStaleClear } from "../utils/staleDraftClear.js";
import { addLocalInviteCode } from "../auth/localAuthBootstrap";
import { db, generateInviteCode } from "../firebase-config";
import { deleteDoc, doc, serverTimestamp, setDoc } from "../backend/firestore";
import { productRatesEnabled } from "../sales-invoice/salesInvoiceShared.js";
import { useEffect, useRef, useState } from "react";

export function useProductForm({ isOwner, lang, setSelOrder, setSettingsPage, shopId, tab, toast }) {
  const hErr  = (e) => { console.error(e); toast(e.message||String(e),"err"); };

  // ── Generate a new single-use invite code ──
  const generateNewCode = async () => {
    try {
      if (!navigator.onLine || !db) {
        toast(lang==="bn"?"❌ Invite Code বানাতে ইন্টারনেট লাগবে":"❌ Internet is required to create an invite code","err");
        return;
      }
      const code = generateInviteCode();
      await setDoc(doc(db,"inviteCodes",code),{
        shopId, used:false, createdAt:serverTimestamp(),
      });
      addLocalInviteCode(shopId, code);
      toast(lang==="bn"?"✅ নতুন Invite Code তৈরি হয়েছে!":"✅ New invite code created!");
    } catch(e) { hErr(e); }
  };

  const deleteInviteCode = async (code) => {
    try { await deleteDoc(doc(db,"inviteCodes",code)); }
    catch(e) { hErr(e); }
  };

  // ── PRODUCT MASTER STATE ──
  const createEmptyPmForm = () => ({
    name:"", code:"",
    barcode:"", ean:"", moreBarcodes:[],
    brand:"", company:"", productGroup:"", category:"", subcategory:"",
    commodityCode:"", productType:"Goods", arabicName:"", weightBarcode:false, rateBarcode:false,
    salesVat:"0", purchaseVat:"0",
    landingCost:"", marginPerc:"", marginAmount:"",
    vatExclusive:"", vatInclusive:"", vatOnMrp:false, mrp:"", averageCost:"",
    openingStock:"", openingRate:"", openingWarehouse:"", unit:"Pcs", customUnits:[], unitDefinitions:[],
    customerTypes:[], unitPrices:[], multiCustomerRatesEnabled:true,
    defaultDiscount:"", reorderMin:"", reorderMax:"", reorderQty:"", rackLocation:"",
    specificationText:"", specShowInSales:false, photoUrl:"", description:""
  });
  const [pmSearch,setPmSearch]=useState("");
  const [pmCatFilter,setPmCatFilter]=useState("ALL");
  const [pmShowAdd,setPmShowAdd]=useState(false);
  // Product Master opened over the Sales Invoice (F9); a product saved there is handed back to the invoice.
  const [pmOverSales,setPmOverSales]=useState(false);
  const [pmPickForSales,setPmPickForSales]=useState(null);
  const [quoteToConvert,setQuoteToConvert]=useState(null);
  const [purchaseSource,setPurchaseSource]=useState(null);
  const [grnIncoming,setGrnIncoming]=useState(null);
  const [chequePrefill,setChequePrefill]=useState(null);
  const [ownerUnlocked,setOwnerUnlocked]=useState(false);
  const ownerIdleTimerRef = useRef(null);
  const OWNER_IDLE_MS = 15 * 60 * 1000;
  useEffect(() => {
    if (!isOwner || !ownerUnlocked) return undefined;
    const bump = () => {
      clearTimeout(ownerIdleTimerRef.current);
      ownerIdleTimerRef.current = setTimeout(() => setOwnerUnlocked(false), OWNER_IDLE_MS);
    };
    bump();
    const evts = ["pointerdown", "keydown", "touchstart", "scroll"];
    evts.forEach((e) => window.addEventListener(e, bump, { passive: true }));
    const onVis = () => { if (document.visibilityState === "hidden") setOwnerUnlocked(false); };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearTimeout(ownerIdleTimerRef.current);
      evts.forEach((e) => window.removeEventListener(e, bump));
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [isOwner, ownerUnlocked]);
  const [pinModal,setPinModal]=useState(null);   // null | "unlock" | "reset"
  const [chequeHandoverReq,setChequeHandoverReq]=useState(null);
  useEffect(()=>{ if (!["sales","quotation","delivery","purchase"].includes(tab)) setPmOverSales(false); },[tab]);
  const [pmEditId,setPmEditId]=useState(null);
  const [pmForm,setPmForm]=useState(createEmptyPmForm);
  const [savingProduct,setSavingProduct]=useState(false);
  // Snapshot of the form as loaded, so leaving with unsaved edits can ask first.
  const pmBaselineRef = useRef(JSON.stringify(createEmptyPmForm()));
  const loadPmForm = (form) => {
    pmBaselineRef.current = JSON.stringify(form);
    setPmForm(form);
  };
  const confirmPmDiscard = () => JSON.stringify(pmForm) === pmBaselineRef.current
    || window.confirm(lang==="bn"?"সেভ না করা পরিবর্তন আছে। বাদ দিয়ে চলে যাবেন?":"You have unsaved changes. Discard them?");
  const pmReset = () => loadPmForm(createEmptyPmForm());

  // Every menu opens at its start screen; sub-pages left open are not restored.
  const lastTabRef = useRef(tab);
  useEffect(() => {
    if (lastTabRef.current === tab) return;
    lastTabRef.current = tab;
    setSettingsPage(null);
    setSelOrder(null);
    setPmShowAdd(false);
    setPmEditId(null);
    loadPmForm(createEmptyPmForm());
  }, [tab]);

  useEffect(() => {
    if (tab === "products") {
      cancelStaleClear("pm-search");
      return undefined;
    }
    scheduleStaleClear("pm-search", () => {
      setPmSearch("");
      setPmCatFilter("ALL");
    }, STALE_DRAFT_MS);
    return () => cancelStaleClear("pm-search");
  }, [tab]);

  useEffect(() => {
    if (pmShowAdd) {
      cancelStaleClear("pm-form-draft");
      return undefined;
    }
    scheduleStaleClear("pm-form-draft", () => {
      if (JSON.stringify(pmForm) === pmBaselineRef.current) return;
      setPmEditId(null);
      loadPmForm(createEmptyPmForm());
    }, STALE_DRAFT_MS);
    return () => cancelStaleClear("pm-form-draft");
  }, [pmShowAdd]);

  const pmFormFromProduct = (p) => ({
    ...createEmptyPmForm(),
    ...p,
    name:p.name||"",
    code:p.code||"",
    barcode:p.barcode||"",
    ean:p.ean||"",
    moreBarcodes:Array.isArray(p.moreBarcodes)?p.moreBarcodes:[],
    brand:p.brand||p.company||"",
    company:p.company||p.brand||"",
    productGroup:p.productGroup||"",
    category:p.category||"",
    subcategory:p.subcategory||"",
    unit:p.unit||"Pcs",
    productType:p.productType||"Goods",
    salesVat:String(p.salesVat ?? p.vatPerc ?? "0"),
    purchaseVat:String(p.purchaseVat ?? "0"),
    landingCost:String(p.landingCost||""),
    marginPerc:String(p.marginPerc||""),
    marginAmount:String(p.marginAmount||""),
    vatExclusive:String(p.vatExclusive||""),
    vatInclusive:String(p.vatInclusive||""),
    mrp:String(p.mrp||""),
    openingStock:String(p.openingStock||""),
    customUnits:Array.isArray(p.customUnits)?p.customUnits:[],
    unitDefinitions:Array.isArray(p.unitDefinitions)?p.unitDefinitions:[],
    customerTypes:Array.isArray(p.customerTypes)?p.customerTypes:[],
    unitPrices:Array.isArray(p.unitPrices)?p.unitPrices:[],
    multiCustomerRatesEnabled:productRatesEnabled(p),
  });

  const startProductEdit = (p) => {
    loadPmForm(pmFormFromProduct(p));
    setPmEditId(p.id);
    setPmShowAdd(true);
  };

  const [globalOpenSalesInvoiceId, setGlobalOpenSalesInvoiceId] = useState(null);
  const [globalOpenPurchaseInvoiceId, setGlobalOpenPurchaseInvoiceId] = useState(null);
  const [globalFocusCustomerId, setGlobalFocusCustomerId] = useState(null);
  const [globalFocusVendorId, setGlobalFocusVendorId] = useState(null);
  const [globalFocusProductId, setGlobalFocusProductId] = useState(null);
  return { chequeHandoverReq, chequePrefill, confirmPmDiscard, createEmptyPmForm, deleteInviteCode, generateNewCode, globalFocusCustomerId, globalFocusProductId, globalFocusVendorId, globalOpenPurchaseInvoiceId, globalOpenSalesInvoiceId, grnIncoming, hErr, loadPmForm, ownerUnlocked, pinModal, pmCatFilter, pmEditId, pmForm, pmOverSales, pmPickForSales, pmReset, pmSearch, purchaseSource, quoteToConvert, savingProduct, setChequeHandoverReq, setChequePrefill, setGlobalFocusCustomerId, setGlobalFocusProductId, setGlobalFocusVendorId, setGlobalOpenPurchaseInvoiceId, setGlobalOpenSalesInvoiceId, setGrnIncoming, setOwnerUnlocked, setPinModal, setPmCatFilter, setPmEditId, setPmForm, setPmOverSales, setPmPickForSales, setPmSearch, setPmShowAdd, setPurchaseSource, setQuoteToConvert, setSavingProduct, startProductEdit };
}
