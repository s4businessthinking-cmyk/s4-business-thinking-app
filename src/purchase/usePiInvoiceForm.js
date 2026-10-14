import { STALE_DRAFT_MS, cancelStaleClear, scheduleStaleClear } from "../utils/staleDraftClear.js";
import { STOCK_AFFECTING_INVOICE_STATUSES, billLeaveGuard, piFmt2, piN2 } from "../shared/appShared.jsx";
import { batchReasons, nextBatchNo, rateOf } from "./purchaseOptions.js";
import { computeStockMap, loadInvoiceRows } from "../inventory/stockFromInvoices";
import { isBranchTransferBill } from "../branch-transfer/branchTransferDomain.js";
import { isOpeningBill } from "../utils/openingBill.js";
import { piEmptyCurrent, piEmptyForm, piEmptyLine } from "./purchaseShared.js";
import { rescaleForUnit } from "../inventory/unitConversion";
import { useEffect, useState } from "react";
import { useEscapeKey } from "../components/WindowChrome.jsx";

export function usePiInvoiceForm({ canManagePurchase, editInvoiceId, invoices, isOwner, lang, onPurchaseSourceHandled, piBaseCur, piCurrent, piEditLineId, piForm, piInvoiceNo, piLines, piMobile, piNameRef, piNavReturn, piOpenParty, piPreviewNextInvoiceNo, piQtyRef, piSnapRef, piSubTab, piView, piWin, pmtView, productFromMaster, products, purchaseOpts, purchaseSource, setEditInvoiceId, setPiCurrent, setPiEditLineId, setPiForm, setPiInvoiceNo, setPiLedgerHidden, setPiLines, setPiNavReturn, setPiOpenParty, setPiSearch, setPiSubTab, setPiView, setPmtPrefillVendorId, setPmtView, setSelInvoice, setSelVoucher, setVendorDropOpen, setVendorSearchQ, shopId, toast, user, vendorSearchQ, vendors }) {
  // ── Open new form ──
  const piOpenNew = () => {
    setPiInvoiceNo(piPreviewNextInvoiceNo());
    setPiForm(piEmptyForm());
    setPiLines([]);
    setPiCurrent(piEmptyCurrent());
    setEditInvoiceId(null);
    setPiSource(null);
    setPiView("form");
    setVendorSearchQ("");
    setVendorDropOpen(false);
  };

  // A purchase order or a received delivery note becomes a new bill: same vendor, the lines still to be billed.
  const [piSource,setPiSource] = useState(null);
  useEffect(()=>{
    if (!purchaseSource?.doc) return;
    onPurchaseSourceHandled?.();
    const { kind:srcKind, doc, lines } = purchaseSource;
    setPiInvoiceNo(piPreviewNextInvoiceNo());
    setPiForm({ ...piEmptyForm(), vendorId:doc.vendorId||"", vendorName:doc.vendorName||"", vendorMobile:doc.vendorMobile||"",
      supplierInvoiceNo:srcKind==="grn" ? (doc.supplierRef||"") : "", refNo:doc.docNo||"", paymentMethod:"credit", note:doc.note||"" });
    setPiLines((lines||[]).map(l=>({ ...piEmptyLine(), productId:l.productId||null, name:l.name||"", code:l.code||"", brand:l.brand||"", qty:String(l.qty||""), unit:l.unit||"Pcs",
      unitCost:l.unitCost!=null&&l.unitCost!=="" ? String(l.unitCost) : "", taxPerc:String(l.taxPerc ?? "5"), salePrice:l.salePrice ? String(l.salePrice) : "" })));
    setPiCurrent(piEmptyCurrent());
    setEditInvoiceId(null);
    setPiSource({ kind:srcKind, id:doc.id, no:doc.docNo||"", purchaseOrderId:srcKind==="po" ? doc.id : (doc.purchaseOrderId||""), purchaseOrderNo:srcKind==="po" ? (doc.docNo||"") : (doc.purchaseOrderNo||"") });
    setPiView("form"); setVendorSearchQ(doc.vendorName||""); setVendorDropOpen(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[purchaseSource]);

  // ── Open edit form ──
  const piOpenEdit = (inv) => {
    if (isOpeningBill(inv)) { toast(lang==="bn" ? "এটা Opening Balance বিল — ভেন্ডর মাস্টার থেকে শুরুর ব্যালেন্স বদলান।" : "This is an Opening Balance bill — change the opening balance in Vendor Master.", "err"); return; }
    if (isBranchTransferBill(inv)) { toast(lang==="bn" ? "এটা Branch Transfer রিসিভের বিল — Branch Transfer থেকে নিয়ন্ত্রণ হয়, এখানে বদলানো যাবে না।" : "This bill comes from a Branch Transfer receipt — manage it from Branch Transfer.", "err"); return; }
    piSnapRef.current = "pending";
    setPiInvoiceNo(inv.invoiceNo);
    setPiSource(null);
    const fxRate = inv.currency && Number(inv.exchangeRate) > 0 ? Number(inv.exchangeRate) : 1;
    const fxBack = (v) => String(parseFloat((Number(v||0)/fxRate).toFixed(4)));
    setPiForm({ invoiceDate:inv.invoiceDate, supplierInvoiceNo:inv.supplierInvoiceNo||"", refNo:inv.refNo||"", currency:fxRate!==1?inv.currency:"", exchangeRate:fxRate!==1?String(inv.exchangeRate):"", vendorId:inv.vendorId||"", vendorName:inv.vendorName||"", vendorMobile:inv.vendorMobile||"", paymentMethod:inv.paymentMethod||"cash", amountPaid:(inv.paymentMethod||"cash")!=="cash"&&inv.amountPaid>0?fxBack(inv.amountPaid):"", note:inv.note||"" });
    setPiLines((inv.items||[]).map(it=>({ id:`${Date.now()}-${Math.random().toString(36).slice(2,8)}`, productId:it.productId||null, name:it.name||"", code:it.code||"", brand:it.brand||"", qty:String(it.qty||""), unit:it.unit||"Pcs", unitCost:fxRate!==1?String(it.fcUnitCost ?? fxBack(it.unitCost)):String(it.unitCost||""), discountPerc:String(it.discountPerc??"0"), taxPerc:String(it.taxPerc??"5"), salePrice:String(it.salePrice||""), ...(it.batchNo?{ batchNo:it.batchNo, batchReasons:it.batchReasons||[] }:{}) })));
    setPiCurrent(piEmptyCurrent());
    setEditInvoiceId(inv.id); setPiView("form"); setVendorSearchQ(inv.vendorName||""); setVendorDropOpen(false);
  };

  // ── Form helpers ──
  const piUpd=(k,v)=>setPiForm(p=>({...p,[k]:v}));
  const piDelLine=(id)=>{
    setPiLines(p=>p.filter(it=>it.id!==id));
    if (piEditLineId===id) { setPiEditLineId(null); setPiCurrent(piEmptyCurrent()); }
  };

  // ── Add the staged entry row into the confirmed items list ──
  // With a Purchase Option on, a product bought from another vendor / at another MRP or cost can be kept as its own batch.
  const piBatchCheck = async (line) => {
    const o = purchaseOpts;
    if (!line.productId || line.batchNo || !(o.batchVendor || o.batchMrp || o.batchCost)) return line;
    const prod = products.find(p => p.id === line.productId);
    if (!prod) return line;
    let stock = 0;
    try {
      const rows = await loadInvoiceRows();
      stock = computeStockMap([prod], rows.purchaseInvoices, rows.salesInvoices, shopId, rows.deliveryNotes, rows.extras).get(prod.id) || 0;
    } catch (err) { console.warn("[S4 PI] batch stock check failed", err); }
    let last = null;
    invoices.forEach(inv => {
      if (inv.id === editInvoiceId || !STOCK_AFFECTING_INVOICE_STATUSES.includes(inv.status) || isBranchTransferBill(inv)) return;
      if (!(inv.items || []).some(it => it.productId === prod.id)) return;
      if (!last || String(inv.invoiceDate || "") > String(last.invoiceDate || "")) last = inv;
    });
    const reasons = batchReasons({ options:o, product:prod, line, rate:rateOf(piForm, piBaseCur), vendorId:piForm.vendorId, vendorName:piForm.vendorName, lastVendor:last ? { id:last.vendorId, name:last.vendorName } : null, stock });
    if (!reasons.length) return line;
    const bnM = lang==="bn";
    const said = reasons.map(r => r.key==="vendor" ? (bnM?`সাপ্লায়ার: ${r.from} → ${r.to}`:`Vendor: ${r.from} → ${r.to}`)
      : r.key==="mrp" ? `M.R.P: ${piFmt2(r.from)} → ${piFmt2(r.to)}` : `Landing Cost: ${piFmt2(r.from)} → ${piFmt2(r.to)}`).join("\n");
    const ok = window.confirm(bnM
      ? `"${prod.name}" — দোকানে আগের মাল আছে (${stock} ${prod.unit||"Pcs"})।\n${said}\n\nএই মাল কি আলাদা stock (নতুন ব্যাচ) হিসেবে রাখবেন?\nOK = আলাদা ব্যাচ, Cancel = আগের stock-এর সাথে মিশে যাবে`
      : `"${prod.name}" — ${stock} ${prod.unit||"Pcs"} of earlier stock is on hand.\n${said}\n\nKeep this as separate stock (a new batch)?\nOK = separate batch, Cancel = merge with existing stock`);
    if (!ok) return line;
    return { ...line, batchNo:nextBatchNo(piInvoiceNo, piLines), batchReasons:reasons.map(r => r.key) };
  };

  const piAddCurrentItem = async () => {
    if (!piCurrent.name.trim()) { toast(lang==="bn"?"আইটেমের নাম লিখুন!":"Enter item name!","err"); return; }
    if (!piCurrent.qty || piN2(piCurrent.qty)<=0) { toast(lang==="bn"?"সঠিক পরিমাণ লিখুন!":"Enter valid quantity!","err"); return; }
    const editId = piEditLineId;
    const entry = await piBatchCheck(piCurrent);
    setPiLines(prev=>editId && prev.some(x=>x.id===editId)
      ? prev.map(x=>x.id===editId ? { ...entry, id:editId } : x)
      : [...prev, { ...entry, id:`${Date.now()}-${Math.random().toString(36).slice(2,8)}` }]);
    setPiEditLineId(null);
    setPiCurrent(piEmptyCurrent());
    setTimeout(()=>piNameRef.current?.focus(), 80);
  };

  // ── Load a confirmed item into the entry row for editing; it stays in the bill until Add updates it ──
  const piEditLine = (item) => {
    setPiCurrent({ productId:item.productId||null, name:item.name||"", code:item.code||"", brand:item.brand||"", qty:String(item.qty||""), unit:item.unit||"Pcs", unitCost:String(item.unitCost||""), discountPerc:String(item.discountPerc??"0"), taxPerc:String(item.taxPerc??"5"), salePrice:String(item.salePrice||""), ...(item.batchNo?{ batchNo:item.batchNo, batchReasons:item.batchReasons||[] }:{}) });
    setPiEditLineId(item.id);
    setTimeout(()=>piNameRef.current?.focus(), 80);
  };

  const piChangeCurrentUnit=(unit)=>setPiCurrent(p=>{
    const prod = p.productId ? products.find(x=>x.id===p.productId) : null;
    return { ...p, unit, unitCost: rescaleForUnit(p.unitCost, prod, p.unit, unit), salePrice: rescaleForUnit(p.salePrice, prod, p.unit, unit) };
  });

  const piSelectProduct=(prod)=>{
    const fx = rateOf(piForm, piBaseCur);
    const knownCost = prod.landingCost||prod.averageCost;
    setPiCurrent(p=>({ ...p, productId:prod.id, name:prod.name, code:prod.code||prod.barcode||"", brand:prod.brand||"", unit:prod.unit||"Pcs", unitCost:knownCost ? (fx!==1&&fx>0 ? String(parseFloat((Number(knownCost)/fx).toFixed(4))) : knownCost) : p.unitCost, salePrice:prod.vatInclusive||prod.mrp||prod.vatExclusive||p.salePrice, taxPerc:prod.purchaseVat||prod.salesVat||p.taxPerc||"5" }));
    setTimeout(()=>piQtyRef.current?.focus(), 100);
  };

  useEffect(()=>{
    if (productFromMaster?.product && piView==="form") piSelectProduct(productFromMaster.product);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[productFromMaster]);

  const piSnapKey = () => JSON.stringify({ f:piForm, l:piLines.map(({ id, ...rest })=>rest) });
  useEffect(()=>{ if (piSnapRef.current==="pending") piSnapRef.current = piSnapKey(); });
  const piIsDirty = () => {
    if (piView!=="form") return false;
    if (String(piCurrent.name||"").trim()) return true;
    if (!editInvoiceId) return piLines.length>0;
    return piSnapRef.current!==piSnapKey();
  };
  const piLeaveUnsavedOk = () =>
    !piIsDirty() || window.confirm(lang==="bn"?"এই বিলের পরিবর্তন সেভ হয়নি। তবুও চলে যাবেন?":"This bill has unsaved changes. Leave anyway?");
  const piLeaveDetail = () => {
    setSelInvoice(null);
    setPiView("list");
    if (piNavReturn === "ledger") {
      setPiSubTab("ledger");
      setPiLedgerHidden(false);
      setPiNavReturn(null);
    }
  };
  const piApplyVendorPayment = (vendor) => {
    const pm = (vendor?.paymentType || "cash") === "credit" ? "credit" : "cash";
    setPiForm((p) => ({ ...p, paymentMethod: pm, amountPaid: pm === "credit" ? "" : p.amountPaid }));
  };
  // Phone back / header back steps out one level at a time instead of leaving Purchase.
  useEffect(()=>{
    const inPayment = piSubTab==="payments" && pmtView!=="list";
    const inFolder = piMobile && piView==="list" && !!piOpenParty;
    if (piView==="list" && !inPayment && !inFolder) return undefined;
    const guard = {
      leave: () => piView!=="form" || piLeaveUnsavedOk(),
      back: () => {
        if (piView==="form") { if (piLeaveUnsavedOk()) setPiView("list"); }
        else if (piView==="detail") { piLeaveDetail(); }
        else if (inPayment) {
          setPmtView("list"); setSelVoucher(null); setPmtPrefillVendorId(null);
          if (piNavReturn === "ledger") {
            setPiSubTab("ledger");
            setPiLedgerHidden(false);
            setPiNavReturn(null);
          }
        } else setPiOpenParty(null);
        return true;
      },
    };
    billLeaveGuard.current = guard;
    return () => { if (billLeaveGuard.current===guard) billLeaveGuard.current = null; };
  });

  useEffect(() => {
    if (piView === "form") {
      cancelStaleClear("pi-draft");
      cancelStaleClear("pi-search");
      return undefined;
    }
    scheduleStaleClear("pi-draft", () => {
      setPiForm(piEmptyForm());
      setPiLines([]);
      setPiCurrent(piEmptyCurrent());
      setEditInvoiceId(null);
      setPiInvoiceNo("");
    }, STALE_DRAFT_MS);
    scheduleStaleClear("pi-search", () => setPiSearch(""), STALE_DRAFT_MS);
    return () => {
      cancelStaleClear("pi-draft");
      cancelStaleClear("pi-search");
    };
  }, [piView]);

  // A minimized bill must be confirmed away before the list opens another one.
  const piLeaveMinOk = () => {
    if (!(piWin.min && piView==="form")) return true;
    if (!piLeaveUnsavedOk()) return false;
    piWin.restore();
    return true;
  };
  useEscapeKey(() => {
    if (piView==="form") { if (piLeaveUnsavedOk()) setPiView("list"); }
    else if (piView==="detail") { piLeaveDetail(); }
    else { setPmtView("list"); setSelVoucher(null); setPmtPrefillVendorId(null); }
  }, {
    enabled: !piWin.min && (piView!=="list" || (piSubTab==="payments" && pmtView!=="list")),
    level: piView==="form" ? 2 : 1,
  });

  const piCanEditInv = (inv) => ["draft","confirmed"].includes(inv?.status) && (isOwner || (canManagePurchase && inv.createdBy===user?.uid));
  const piOpenFromDesktop = (inv) => {
    if (!piLeaveUnsavedOk()) return;
    if (piCanEditInv(inv)) { piOpenEdit(inv); return; }
    setSelInvoice(inv); setPiView("detail");
  };

  const piHandleVendor=(e)=>{
    const vid=e.target.value;
    if (!vid){ piUpd("vendorId",""); piUpd("vendorName",""); piUpd("vendorMobile",""); return; }
    const v=vendors.find(x=>x.id===vid);
    if (v) {
      piUpd("vendorId", vid);
      piUpd("vendorName", v.vendorName);
      piUpd("vendorMobile", v.mobileNumber || v.whatsappNumber || "");
      piApplyVendorPayment(v);
    }
  };

  // ── Searchable vendor picker handler ──
  const piPickVendor=(v)=>{
    piUpd("vendorId",v.id);
    piUpd("vendorName",v.vendorName);
    piUpd("vendorMobile",v.mobileNumber||v.whatsappNumber||"");
    piApplyVendorPayment(v);
    setVendorSearchQ(v.vendorName);
    setVendorDropOpen(false);
  };
  const piClearVendor=()=>{
    piUpd("vendorId",""); piUpd("vendorName",""); piUpd("vendorMobile","");
    setPiForm((p) => ({ ...p, paymentMethod: "cash", amountPaid: "" }));
    setVendorSearchQ(""); setVendorDropOpen(false);
  };
  // Inactive and blocked vendors stay in the ledger and payments but cannot get new bills.
  const pickVendors = vendors.filter(v => !["inactive","blocked"].includes(v.status || "active"));
  const piVendorRecord = (vendorId, vendorName) => {
    const key = String(vendorName || "").trim().toLowerCase();
    return (vendorId && vendors.find(v => v.id === vendorId))
      || (key ? vendors.find(v => String(v.vendorName || "").trim().toLowerCase() === key) : null)
      || null;
  };
  const filteredVendorOpts = pickVendors.filter(v=>{
    if (!vendorSearchQ.trim()) return true;
    const q=vendorSearchQ.trim().toLowerCase();
    return (v.vendorName||"").toLowerCase().includes(q)
      ||(v.vendorCode||"").toLowerCase().includes(q)
      ||(v.mobileNumber||"").includes(q)
      ||(v.city||"").toLowerCase().includes(q);
  });
  return { filteredVendorOpts, piAddCurrentItem, piCanEditInv, piChangeCurrentUnit, piClearVendor, piDelLine, piEditLine, piLeaveDetail, piLeaveMinOk, piLeaveUnsavedOk, piOpenEdit, piOpenFromDesktop, piOpenNew, piPickVendor, piSelectProduct, piSource, piUpd, piVendorRecord, pickVendors, setPiSource };
}
