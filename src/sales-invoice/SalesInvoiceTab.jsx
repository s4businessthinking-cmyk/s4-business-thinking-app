import { siCalcLine, siN2, siFmt2, SI_UNITS, SI_STATUSES, SI_PAY, siProductRateRows, siCalcTotals, siInvoiceExtras, printPaymentVoucher, siR2, siUnitOptionsFor, generatePaymentVoucherHTML, generateSalesInvoiceHTML } from "./salesInvoiceShared.js";
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

export const SI_PAY_TO_VOUCHER_METHOD = { cash:"cash", bank:"bank_transfer", cheque:"cheque", card:"card" };

// Money taken with the bill itself (not through receipt vouchers or credit notes), printed as a receipt for the customer.
export function printMoneyReceipt(inv, amount, shop, lang) {
  const receipt = {
    receiptNo:inv.invoiceNo, receiptDate:inv.invoiceDate, customerName:inv.customerName||"Walk-in",
    method:SI_PAY_TO_VOUCHER_METHOD[inv.paymentMethod]||"cash", totalAmount:amount,
    chequeNo:inv.chequeNo||"", chequeBank:inv.chequeBank||"", chequeDate:inv.chequeDate||"",
    collectedByName:inv.salesmanName||inv.createdByName||"",
    allocations:[{ invoiceNo:inv.invoiceNo, invoiceDate:inv.invoiceDate, amount }],
  };
  printWithSettings(generatePaymentVoucherHTML(receipt, shop, lang, { title:lang==="bn"?"মানি রিসিট":"MONEY RECEIPT" }), { lang });
}

// ─── SALES INVOICE ────────────────────────────────────────────
export const SI_PREFIX  = "SI-";

export const QT_PREFIX  = "QT-";

export const DN_PREFIX  = "DN-";

export const SO_PREFIX  = "SO-";

export const QT_VALID_DAYS = 15;

export const CUSTOMER_TYPE_ALIASES = {
  "রিটেইল":"retail", "হোলসেল":"wholesale", "কর্পোরেট":"corporate", "vip":"vip",
  "সরকারি":"government", "প্রজেক্ট":"project", "অন্যান্য":"other",
};

export const normCustomerType = (v) => {
  const key = String(v || "").trim().toLowerCase();
  return CUSTOMER_TYPE_ALIASES[key] || key;
};

export const normUnit = (v) => String(v || "").trim().toLowerCase();

// Exact unit + customer type wins, then the unit's "All / Default" row, then the product's base price.
export function siResolveRate(prod, unit, customerType) {
  const basePrice = prod?.vatExclusive || prod?.mrp || "";
  const wantUnit = normUnit(unit || prod?.unit || "Pcs");
  const wantType = normCustomerType(customerType);
  const rows = siProductRateRows(prod).filter((row) => normUnit(row.unit) === wantUnit);
  const match =
    (wantType && rows.find((row) => normCustomerType(row.customerType) === wantType)) ||
    rows.find((row) => !String(row.customerType || "").trim());
  if (!match) return { unitPrice: basePrice, name: prod?.name || "" };
  return {
    unitPrice: match.vatExclusive || match.mrp || match.vatInclusive || basePrice,
    name: String(match.altName || "").trim() || prod?.name || "",
  };
}

export const QT_STATUSES = {
  draft:     SI_STATUSES.draft,
  open:      { bn:"খোলা",          en:"Open",      color:"#06b6d4", bg:"#083344" },
  converted: { bn:"ইনভয়েস হয়েছে", en:"Converted", color:"#22c55e", bg:"#052e16" },
  cancelled: SI_STATUSES.cancelled,
};

export const DN_STATUSES = {
  draft:     SI_STATUSES.draft,
  confirmed: { bn:"ডেলিভারি হয়েছে", en:"Delivered", color:"#06b6d4", bg:"#083344" },
  invoiced:  { bn:"ইনভয়েস হয়েছে",  en:"Invoiced",  color:"#22c55e", bg:"#052e16" },
  cancelled: SI_STATUSES.cancelled,
};

export const SO_STATUSES = {
  draft:     SI_STATUSES.draft,
  open:      { bn:"অপেক্ষায়",        en:"Pending",   color:"#06b6d4", bg:"#083344" },
  delivered: { bn:"ডেলিভারি হয়েছে", en:"Delivered", color:"#a855f7", bg:"#2e1065" },
  invoiced:  { bn:"ইনভয়েস হয়েছে",  en:"Invoiced",  color:"#22c55e", bg:"#052e16" },
  cancelled: SI_STATUSES.cancelled,
};

// Where a converted quotation / sales order / delivery note lives and what it becomes.
export const SOURCE_DOC = {
  delivery:   { col:"deliveryNotes", idKey:"deliveryNoteId", noKey:"deliveryNoteNo" },
  salesOrder: { col:"salesOrders",   idKey:"salesOrderId",   noKey:"salesOrderNo" },
  quotation:  { col:"quotations",    idKey:"quotationId",    noKey:"quotationNo" },
  jobOrder:   { col:"jobOrders",     idKey:"jobOrderId",     noKey:"jobOrderNo" },
};

export const sourceDocOf = (src) => SOURCE_DOC[src?.docKind] || SOURCE_DOC.quotation;

export const siToday= () => localIsoDate();

export const siAddDays = (iso, days) => {
  const d = new Date(`${iso || siToday()}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().split("T")[0];
};

export const qtIsExpired = (q) => q?.status==="open" && !!q.validUntil && q.validUntil < siToday();

// A delivery note carries no discount or VAT.
export const siDeliveryLines = (items) => items.map(it=>({ ...it, discountPerc:"0", discountFlat:"", vatPerc:"0" }));

export function siEmptyLine() {
  return { id:`${Date.now()}-${Math.random().toString(36).slice(2,8)}`, productId:null, name:"", code:"", brand:"", qty:"", unit:"Pcs", unitPrice:"", discountPerc:"0", discountFlat:"", vatPerc:"5" };
}

export function siEmptyForm() {
  return {
    invoiceType:loadPrintSettings().defaultBillType==="regular" ? "regular" : "tax",
    invoiceDate:siToday(),
    customerId:"", customerName:"", customerMobile:"", customerAddress:"", customerTrn:"", customerType:"",
    paymentMethod:"cash", amountPaid:"",
    deliveryNoteNo:"", vehicleNo:"",
    note:"",
    refNo:"", salesmanId:"", salesmanName:"", currency:"AED", stockLocation:"main", stockLocationName:"Main",
    billDiscPerc:"", billDiscAmt:"", adjustment:"", roundOff:"", creditDays:"", hideCodeInPrint:false,
    validUntil:"",
  };
}

export function printSalesInvoice(invoice, shop, lang, showCode, colorPrint, opts={}) {
  const settings = loadPrintSettings();
  const html = generateSalesInvoiceHTML(invoice, shop, lang, showCode||false, colorPrint||false, { ...opts, settings });
  printHtmlDocument(html, { preview:settings.showPreview, lang, printer:settings.billPrinter });
}

// ── SI Customer Picker ──
export const CUSTOMER_PICKER_LIMIT = 200;

export function SiCustomerPicker({ customers, onSelect, onClose, onQuickAdd, canQuickAdd=false, t, th, lang }) {
  const [q,setQ]=useState("");
  const [newName,setNewName]=useState("");
  const [adding,setAdding]=useState(false);
  const [active,setActive]=useState(0);
  const listRef=useRef(null);
  const [isPhone]=useState(()=>typeof window!=="undefined" && (window.innerWidth<768 || !!window.matchMedia?.("(pointer: coarse) and (max-width: 1100px)").matches));
  const matched=useMemo(()=>customers.filter(c=>{ if (!q) return true; return nsmatch([c.customerName,c.customerCode,c.mobileNumber].filter(Boolean).join(" "),q); }),[customers,q]);
  const filtered=matched.length>CUSTOMER_PICKER_LIMIT ? matched.slice(0,CUSTOMER_PICKER_LIMIT) : matched;
  useEffect(()=>{ setActive(0); },[q]);
  useEffect(()=>{ listRef.current?.querySelectorAll("[data-cust-row]")[active]?.scrollIntoView({ block:"nearest" }); },[active]);
  useEscapeKey(onClose, { level: 3 });
  const onSearchKey=(e)=>{
    if (e.key==="Escape") { e.preventDefault(); onClose(); }
    else if (e.key==="ArrowDown") { e.preventDefault(); setActive(i=>Math.min(filtered.length-1, i+1)); }
    else if (e.key==="ArrowUp") { e.preventDefault(); setActive(i=>Math.max(0, i-1)); }
    else if (e.key==="Enter" && filtered[active]) { e.preventDefault(); onSelect(filtered[active]); }
  };
  const inp={ padding:"10px 12px", borderRadius:8, border:`1px solid ${th.borderMid}`, background:th.bgInp, color:th.txtPrimary, fontSize:isPhone?16:14, outline:"none", width:"100%", boxSizing:"border-box", fontFamily:"inherit" };

  const handleQuickAdd = async () => {
    const name = newName.trim();
    if (!name || !onQuickAdd || adding) return;
    setAdding(true);
    try {
      await onQuickAdd(name);
      setNewName("");
    } finally {
      setAdding(false);
    }
  };

  return (
    <div data-si-modal-open="customer-picker" onMouseDown={e=>{ if (e.target===e.currentTarget) onClose(); }}
      style={{ position:"fixed", inset:0, background:isPhone?th.bgCard:"rgba(15,23,42,0.45)", zIndex:10000, display:"flex", alignItems:"center", justifyContent:"center", padding:isPhone?0:16 }}>
      <div role="dialog" aria-modal="true" style={isPhone
        ? { width:"100%", height:"100dvh", background:th.bgCard, display:"flex", flexDirection:"column", paddingTop:"env(safe-area-inset-top)", paddingBottom:"env(safe-area-inset-bottom)", boxSizing:"border-box" }
        : { width:"100%", maxWidth:560, background:th.bgCard, borderRadius:14, maxHeight:"80vh", display:"flex", flexDirection:"column", border:`1px solid ${th.border}`, boxShadow:"0 20px 50px rgba(0,0,0,0.3)", overflow:"hidden" }}>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:isPhone?"10px 12px":"14px 16px", borderBottom:`1px solid ${th.border}` }}>
          <span style={{ fontSize:isPhone?16:14, fontWeight:700, color:th.txtPrimary }}>👥 {t.si_customer}</span>
          <button onClick={onClose} aria-label="Close" style={{ background:"none", border:"none", color:th.txtMuted, cursor:"pointer", fontSize:22, minWidth:44, minHeight:44 }}>✕</button>
        </div>
        <div style={{ padding:"10px 14px", borderBottom:`1px solid ${th.border}` }}>
          <input autoFocus={!isPhone} style={inp} placeholder={t.si_customerSearch} value={q} onChange={e=>setQ(e.target.value)} onKeyDown={onSearchKey} enterKeyHint="search" />
          {!isPhone&&<div style={{ fontSize:10.5, color:th.txtFaint, marginTop:5 }}>↑ ↓ {lang==="bn"?"বাছাই":"move"} · Enter {lang==="bn"?"নির্বাচন":"select"} · Esc {lang==="bn"?"বন্ধ":"close"}</div>}
        </div>
        {canQuickAdd&&(
          <div style={{ display:"flex", gap:8, padding:"10px 14px", borderBottom:`1px solid ${th.border}` }}>
            <input
              style={{ ...inp, flex:1 }}
              placeholder={lang==="bn"?"নতুন কাস্টমারের নাম":"New customer name"}
              value={newName}
              onChange={e=>setNewName(e.target.value)}
              onKeyDown={e=>{ if (e.key==="Enter") handleQuickAdd(); }}
            />
            <button
              onClick={handleQuickAdd}
              disabled={adding || !newName.trim()}
              style={{ padding:"10px 14px", borderRadius:8, border:"none", background:adding?"#14532d":"#22c55e", color:"#fff", fontWeight:700, cursor:adding?"not-allowed":"pointer", whiteSpace:"nowrap" }}
            >
              {adding ? "..." : (lang==="bn"?"+ যোগ":"+ Add")}
            </button>
          </div>
        )}
        <div ref={listRef} style={{ overflowY:"auto", flex:1, WebkitOverflowScrolling:"touch" }}>
          {filtered.length===0&&<div style={{ textAlign:"center", padding:"30px", color:th.txtFaint }}>{t.si_noResults}</div>}
          {filtered.map((c,i)=>(
            <button key={c.id} data-cust-row onClick={()=>onSelect(c)} onMouseEnter={()=>!isPhone&&setActive(i)}
              style={{ width:"100%", textAlign:"left", padding:isPhone?"14px 16px":"10px 16px", minHeight:isPhone?56:0, background:i===active&&!isPhone?"rgba(37,99,235,0.12)":"transparent", border:"none", borderBottom:`1px solid ${th.border}`, cursor:"pointer", fontFamily:"inherit" }}>
              <div style={{ fontSize:isPhone?15:13, fontWeight:700, color:th.txtPrimary }}>{c.customerName}</div>
              <div style={{ fontSize:11, color:th.txtMuted, marginTop:2, display:"flex", gap:8 }}>
                {c.mobileNumber&&<span>📱 {c.mobileNumber}</span>}
                {c.customerCode&&<span>#{c.customerCode}</span>}
                {c.city&&<span>📍 {c.city}</span>}
              </div>
            </button>
          ))}
          {matched.length>filtered.length&&(
            <div style={{ textAlign:"center", padding:"12px", fontSize:12, color:th.txtFaint }}>
              {lang==="bn"?`প্রথম ${filtered.length}টি দেখানো হচ্ছে (মোট ${matched.length}) — নাম/মোবাইল লিখে খুঁজুন`:`Showing first ${filtered.length} of ${matched.length} — type a name or mobile to narrow`}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── SI Line Item Mobile ──
export function SiLineItemMobile({ item, idx, onUpdate, onDelete, onPick, t, th, isTax, isDelivery }) {
  const effectiveTax = isTax && !isDelivery;
  const { disc, vat, total } = siCalcLine(item, effectiveTax);
  const inp=(e={})=>({ padding:"7px 9px", borderRadius:6, border:`1px solid ${th.borderMid}`, background:th.bgInp, color:th.txtPrimary, fontSize:12, outline:"none", width:"100%", boxSizing:"border-box", fontFamily:"inherit", ...e });
  const lbl={ fontSize:9, color:th.txtMuted, textTransform:"uppercase", fontWeight:700, marginBottom:2 };
  return (
    <div style={{ background:th.bgCard, border:`1px solid ${th.border}`, borderRadius:12, padding:12, marginBottom:8 }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
        <span style={{ fontSize:12, fontWeight:800, color:isDelivery?"#a855f7":"#22c55e" }}>#{idx+1}</span>
        <div style={{ display:"flex", gap:6 }}>
          <button onClick={()=>onPick(idx)} style={{ padding:"4px 10px", borderRadius:6, border:"1px solid #6366f1", background:"rgba(99,102,241,0.08)", color:"#818cf8", cursor:"pointer", fontSize:11, fontWeight:700 }}>📦</button>
          <button onClick={()=>onDelete(item.id)} style={{ width:28, height:28, borderRadius:6, border:"none", background:"#450a0a", color:"#ef4444", cursor:"pointer", fontSize:13 }}>✕</button>
        </div>
      </div>
      <input style={{ ...inp(), marginBottom:6, fontSize:13, fontWeight:600 }} placeholder={t.si_itemName} value={item.name} onChange={e=>onUpdate(item.id,"name",e.target.value)} />
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:6, marginBottom:6 }}>
        <input style={inp()} placeholder={t.si_code} value={item.code} onChange={e=>onUpdate(item.id,"code",e.target.value)} />
        <input style={inp()} placeholder={t.si_brand} value={item.brand} onChange={e=>onUpdate(item.id,"brand",e.target.value)} />
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:6, marginBottom:6 }}>
        <div><div style={lbl}>{t.si_qty}</div><input style={inp()} inputMode="decimal" placeholder="0" value={item.qty} onChange={e=>onUpdate(item.id,"qty",e.target.value)} /></div>
        <div><div style={lbl}>{t.si_unit}</div><select style={{ ...inp(), background:th.bgCard }} value={item.unit} onChange={e=>onUpdate(item.id,"unit",e.target.value)}>{SI_UNITS.map(u=><option key={u} value={u}>{u}</option>)}</select></div>
        <div><div style={lbl}>{t.si_unitPrice}</div><input style={inp()} inputMode="decimal" placeholder="0.00" value={item.unitPrice} onChange={e=>onUpdate(item.id,"unitPrice",e.target.value)} /></div>
      </div>
      {!isDelivery&&(
        <div style={{ display:"grid", gridTemplateColumns:isTax?"1fr 1fr":"1fr", gap:6 }}>
          <div><div style={lbl}>{t.si_discPerc}</div><input style={inp()} inputMode="decimal" placeholder="0" value={item.discountPerc} onChange={e=>onUpdate(item.id,"discountPerc",e.target.value)} /></div>
          {isTax&&<div><div style={lbl}>VAT %</div><input style={inp()} inputMode="decimal" placeholder="5" value={item.vatPerc} onChange={e=>onUpdate(item.id,"vatPerc",e.target.value)} /></div>}
        </div>
      )}
      <div style={{ marginTop:8, padding:"8px 10px", background:isDelivery?"rgba(168,85,247,0.08)":"rgba(34,197,94,0.08)", borderRadius:8, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
          <span style={{ fontSize:11, color:th.txtMuted }}>{t.si_lineTotal}</span>
          <span style={{ fontSize:15, fontWeight:800, color:isDelivery?"#a855f7":"#22c55e" }}>{t.cur} {siFmt2(total)}</span>
        </div>
    </div>
  );
}

// ── SI Line Item Desktop ──
export function SiLineItemDesktop({ item, idx, onUpdate, onDelete, onPick, t, th, isTax, isDelivery }) {
  const effectiveTax = isTax && !isDelivery;
  const { disc, vat, total } = siCalcLine(item, effectiveTax);
  const inp=(e={})=>({ padding:"7px 9px", borderRadius:6, border:`1px solid ${th.borderMid}`, background:th.bgInp, color:th.txtPrimary, fontSize:12, outline:"none", width:"100%", boxSizing:"border-box", fontFamily:"inherit", ...e });
  return (
    <tr style={{ borderBottom:`1px solid ${th.border}` }}>
      <td style={{ padding:"8px 6px", fontSize:12, fontWeight:700, color:isDelivery?"#a855f7":"#22c55e", textAlign:"center", width:30 }}>{idx+1}</td>
      <td style={{ padding:"8px 6px" }}>
        <div style={{ display:"flex", gap:4, marginBottom:4 }}>
          <input style={{ ...inp(), flex:2 }} placeholder={t.si_itemName} value={item.name} onChange={e=>onUpdate(item.id,"name",e.target.value)} />
          <button onClick={()=>onPick(idx)} style={{ padding:"0 8px", borderRadius:6, border:"1px solid #6366f1", background:"rgba(99,102,241,0.08)", color:"#818cf8", cursor:"pointer", fontSize:13, flexShrink:0 }}>📦</button>
        </div>
        <div style={{ display:"flex", gap:4 }}>
          <input style={{ ...inp(), flex:1 }} placeholder={t.si_code} value={item.code} onChange={e=>onUpdate(item.id,"code",e.target.value)} />
          <input style={{ ...inp(), flex:1 }} placeholder={t.si_brand} value={item.brand} onChange={e=>onUpdate(item.id,"brand",e.target.value)} />
        </div>
      </td>
      <td style={{ padding:"8px 6px", width:70 }}><input style={inp({ textAlign:"center" })} inputMode="decimal" placeholder="0" value={item.qty} onChange={e=>onUpdate(item.id,"qty",e.target.value)} /></td>
      <td style={{ padding:"8px 6px", width:80 }}><select style={{ ...inp(), background:th.bgCard }} value={item.unit} onChange={e=>onUpdate(item.id,"unit",e.target.value)}>{SI_UNITS.map(u=><option key={u} value={u}>{u}</option>)}</select></td>
      <td style={{ padding:"8px 6px", width:110 }}><input style={inp({ textAlign:"right" })} inputMode="decimal" placeholder="0.00" value={item.unitPrice} onChange={e=>onUpdate(item.id,"unitPrice",e.target.value)} /></td>
      {!isDelivery&&<td style={{ padding:"8px 6px", width:70 }}><input style={inp({ textAlign:"center" })} inputMode="decimal" placeholder="0" value={item.discountPerc} onChange={e=>onUpdate(item.id,"discountPerc",e.target.value)} /></td>}
      {isTax&&!isDelivery&&<td style={{ padding:"8px 6px", width:70 }}><input style={inp({ textAlign:"center" })} inputMode="decimal" placeholder="5" value={item.vatPerc} onChange={e=>onUpdate(item.id,"vatPerc",e.target.value)} /></td>}
      <td style={{ padding:"8px 6px", width:110, textAlign:"right" }}>
        <span style={{ fontSize:13, fontWeight:700, color:total>0?"#22c55e":th.txtFaint }}>{t.cur} {siFmt2(total)}</span>
        {effectiveTax&&siN2(item.discountPerc)>0&&<div style={{ fontSize:9, color:th.txtMuted, marginTop:2 }}>{siN2(item.discountPerc)>0&&<span style={{ color:"#ef4444" }}>-{siFmt2(disc)} </span>}{siN2(item.vatPerc)>0&&<span style={{ color:"#06b6d4" }}>+{siFmt2(vat)}</span>}</div>}
      </td>
      <td style={{ padding:"8px 6px", width:36, textAlign:"center" }}><button onClick={()=>onDelete(item.id)} style={{ width:28, height:28, borderRadius:6, border:"none", background:"#450a0a", color:"#ef4444", cursor:"pointer", fontSize:13, fontWeight:700 }}>✕</button></td>
    </tr>
  );
}

// Product Master-style item table: full names wrap, numbers stay in aligned columns.
export function SiItemsTable({ items, lang, isTax, showDisc=true, onEdit, onDelete, editId }) {
  const bn = lang==="bn";
  return (
    <div className="pm-table-wrap">
      <table className="pm-table">
        <colgroup><col style={{ width:26 }} /><col /><col style={{ width:64 }} /><col style={{ width:70 }} /><col style={{ width:80 }} /></colgroup>
        <thead><tr>
          <th className="si-center">#</th>
          <th>{bn?"পণ্য":"Item"}</th>
          <th className="si-num">{bn?"পরিমাণ":"Qty"}</th>
          <th className="si-num">{bn?"দাম":"Price"}</th>
          <th className="si-num">{bn?"মোট":"Total"}</th>
        </tr></thead>
        <tbody>
          {items.map((it,i)=>{
            const { disc, vat, total } = siCalcLine(it, isTax);
            const active = editId && editId===it.id;
            return (
              <tr key={it.id||i} className={active?"is-editing":""}>
                <td className="si-center si-strong" style={{ verticalAlign:"top" }}>{i+1}</td>
                <td className="si-wrap">
                  <div className="si-strong">{it.name}{it.batchNo&&<span style={{ marginLeft:6, fontSize:11, color:"#7c3aed" }}>[{it.batchNo}]</span>}</div>
                  {(it.code||it.brand)&&<div className="si-muted">{[it.code,it.brand].filter(Boolean).join(" · ")}</div>}
                  {((showDisc&&disc>0)||(isTax&&siN2(it.vatPerc)>0))&&(
                    <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                      {showDisc&&disc>0&&<span style={{ color:"#b91c1c" }}>{bn?"ছাড়":"Disc"} {siN2(it.discountPerc)>0?`${it.discountPerc}% `:""}(-{siFmt2(disc)})</span>}
                      {isTax&&siN2(it.vatPerc)>0&&<span style={{ color:"#0e7490" }}>VAT {it.vatPerc}% (+{siFmt2(vat)})</span>}
                    </div>
                  )}
                  {(onEdit||onDelete)&&(
                    <div className="si-line-tools">
                      {onEdit&&<button type="button" className="pm-btn-secondary" onClick={()=>onEdit(it)}>✏️ {bn?"এডিট":"Edit"}</button>}
                      {onDelete&&<button type="button" className="pm-btn-secondary" style={{ color:"#b91c1c" }} onClick={()=>onDelete(it)}>✕ {bn?"মুছুন":"Delete"}</button>}
                    </div>
                  )}
                </td>
                <td className="si-num si-wrap" style={{ verticalAlign:"top" }}>{it.qty} <span className="si-muted">{it.unit}</span></td>
                <td className="si-num" style={{ verticalAlign:"top" }}>{siFmt2(it.unitPrice)}</td>
                <td className="si-num si-strong" style={{ verticalAlign:"top" }}>{siFmt2(total)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// Delivery notes used to be saved inside salesInvoices; move them keeping the same id so their stock-ledger entries still match.
export const dnMigratedIds = new Set();

export async function migrateLegacyDeliveryNotes(rows) {
  const legacy = (rows || []).filter(r => r?.id && r.invoiceType==="delivery" && r.docKind!=="delivery" && !dnMigratedIds.has(r.id));
  const moved = [];
  for (const inv of legacy) {
    dnMigratedIds.add(inv.id);
    try {
      const createdAt = inv.createdAt instanceof Date ? inv.createdAt.toISOString() : inv.createdAt;
      await withoutPeriodLock(async () => {
        await offlineCreate("deliveryNotes", { ...inv, docKind:"delivery", createdAt });
        await offlineRemove("salesInvoices", inv.id);
      });
      moved.push(inv.id);
    } catch (err) {
      dnMigratedIds.delete(inv.id);
      console.warn("[S4 DN] legacy delivery note move failed", inv.id, err);
    }
  }
  if (moved.length && navigator.onLine) {
    window.S4Offline?.syncNow?.().catch(err => console.warn("[S4 Sync] delivery note move sync failed", err));
  }
  return moved;
}

// ── SALES INVOICE TAB (main) ──
export function SalesInvoiceTab({ t, lang, th, s, shopId, user, profile, customers, products, shop, toast, isDesktop, siShowCode, siColorPrint, canManageCustomers=false, onCustomerCreated, syncRefreshKey=0, team=[], onOpenProductMaster, productFromMaster=null, wideDesktop=false, kind="sales", quoteToConvert=null, onConvertQuote, onConvertToDN, onQuoteConvertHandled, openNewRequest=0, openNewCustomer=null, onOpenNewHandled, voucherRequest=0, onVoucherHandled, openInvoiceId=null, onOpenInvoiceHandled }) {
  const authSyncReady = useFirebaseAuthReady();
  const isOwner = profile?.role==="owner";
  const siPerm = (key) => isOwner || { ...DEFAULT_PERMISSIONS, ...(profile?.permissions||{}) }[key] === true;
  const canDiscount = siPerm("giveDiscount");
  const canCancelInv = siPerm("cancelInvoices");
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
  useEscapeKey(() => {
    if (siView==="form") { if (siLeaveUnsavedOk()) setSiView("list"); }
    else { setSiView("list"); setSelInv(null); }
  }, { enabled: siView!=="list" && !siWin.min, level: siView==="form" ? 2 : 1 });
  const [selInv,setSelInv]         = useState(null);
  const [editInvId,setEditInvId]   = useState(null);
  const [siPrintModal,setSiPrintModal] = useState(null); // invoice to print after confirm
  const [siInvoiceNo,setSiInvoiceNo]= useState("");
  const [siForm,setSiForm]         = useState(siEmptyForm());
  const [siLines,setSiLines]       = useState([]);
  const [showCustPicker,setShowCustPicker]= useState(false);
  const siSnapRef = useRef(null);
  const siEmptyCurrent = () => ({ productId:null, name:"", code:"", brand:"", qty:"1", unit:"Pcs", unitPrice:"", discountPerc:"0", discountFlat:"", vatPerc:"5" });
  const [siCurrent,setSiCurrent]   = useState(siEmptyCurrent);
  const [siEditLineId,setSiEditLineId] = useState(null);
  const [siBatchAsk,setSiBatchAsk] = useState(null);
  const siNameRef = useRef(null);
  const siQtyRef = useRef(null);

  const [siSaving,setSiSaving]     = useState(false);
  const siSaveLockRef = useRef(false);
  const [siSearch,setSiSearch]     = useState("");
  const [siStatusF,setSiStatusF]   = useState("ALL");
  const [siViewAll,setSiViewAll]   = useState(isOwner);

  // Customer receipt vouchers (Receipts against Bill) — only the sales kind collects money.
  const [receipts,setReceipts]         = useState([]);
  const [billReturns,setBillReturns]   = useState([]);
  useEffect(() => {
    if (!shopId || kind!=="sales") return undefined;
    const unsub = subscribeShopCollection({ collectionName:"salesReturns", shopId, onRows:(list)=>setBillReturns(list||[]) });
    return () => { try { unsub?.(); } catch { /* ignore */ } };
  }, [shopId, kind]);
  const siLoadedPaidRef = useRef(0);
  const [rcptSaving,setRcptSaving]     = useState(false);
  const [receiptWin,setReceiptWin]     = useState(null); // null | {} | { partyId, partyName, invoiceId } | { viewId }
  const [ledgerWin,setLedgerWin]       = useState(false);
  const [siNavReturn,setSiNavReturn]   = useState(null); // null | "ledger"

  useEffect(()=>{
    if (!shopId || kind!=="sales") return;
    let unsub1=()=>{};
    let unsub2=null;
    let cancelled=false;
    const normalize = (d) => ({ ...d.data(), id:d.id, createdAt:d.data().createdAt?.toDate?.()?.toISOString?.() || d.data().createdAt || new Date().toISOString() });
    const sortRows = (rows=[]) => [...rows].sort((a,b)=>new Date(b.createdAt||b.receiptDate||0)-new Date(a.createdAt||a.receiptDate||0));
    const applyRows = (rows) => {
      if (cancelled) return;
      setReceipts(sortRows(rows));
      offlineCacheCloudRecords("salesReceipts", rows).catch(err => console.warn("[S4 Offline] salesReceipts cache failed", err));
    };
    offlineList("salesReceipts").then(res => {
      if (cancelled) return;
      const rows = (Array.isArray(res) ? res : (res.records || [])).map(r => ({ ...(r.data || r), id:(r.data?.id || r.document_id || r.id) })).filter(r => r.shopId===shopId);
      if (rows.length) setReceipts(sortRows(rows));
    }).catch(err => console.warn("[S4 Offline] salesReceipts offline load failed", err));
    if (authSyncReady) {
      const q=query(collection(db,"salesReceipts"),where("shopId","==",shopId),orderBy("createdAt","desc"));
      unsub1=onSnapshot(q, snap=>applyRows(snap.docs.map(normalize)), ()=>{
        const q2=query(collection(db,"salesReceipts"),where("shopId","==",shopId));
        unsub2=onSnapshot(q2, snap=>applyRows(snap.docs.map(normalize)), err=>console.error(err));
      });
    }
    return ()=>{ cancelled=true; unsub1(); unsub2&&unsub2(); };
  },[shopId, kind, authSyncReady, syncRefreshKey]);

  // Local-first list, then Firebase; SQLite cache stays in background
  useEffect(()=>{
    if (!shopId) return;
    setSiLoading(true);
    let u1=()=>{};
    let u2=null;
    let cancelled=false;
    let cloudRowsLatest=null;

    const normalizeSiInvoice = (d) => ({
      ...d.data(),
      id:d.id,
      createdAt:d.data().createdAt?.toDate?.() || d.data().createdAt || new Date().toISOString(),
    });

    const sortSiInvoices = (rows=[]) => [...rows].sort((a,b)=>
      new Date(b.createdAt||b.invoiceDate||0) - new Date(a.createdAt||a.invoiceDate||0)
    );

    const filterSiRows = (rows=[]) => rows.filter(inv =>
      inv.shopId === shopId && (isOwner || inv.createdBy === user.uid)
    );

    const loadOfflineSiInvoices = async ({ cloudRows = null } = {}) => {
      const mergeSource = cloudRows ?? cloudRowsLatest;
      const res = await offlineList(COL);
      if (cancelled) return 0;
      const records = Array.isArray(res) ? res : (res.records || []);
      const localRows = filterSiRows(records
        .map(r => ({ ...(r.data || r), id:(r.data?.id || r.document_id || r.id) })));

      if (Array.isArray(mergeSource)) {
        const merged = new Map(mergeSource.map(inv => [String(inv.id), inv]));
        records
          .filter(r => Number(r?.dirty || 0) === 1)
          .map(r => ({ ...(r.data || r), id:(r.data?.id || r.document_id || r.id) }))
          .filter(inv => inv.shopId === shopId && (isOwner || inv.createdBy === user.uid))
          .forEach(inv => merged.set(String(inv.id), inv));
        const rows = sortSiInvoices(filterSiRows([...merged.values()]));
        setInvoices(rows);
        return rows.length;
      }

      if (localRows.length) setInvoices(sortSiInvoices(localRows));
      return localRows.length;
    };

    loadOfflineSiInvoices()
      .then((count) => { if (!cancelled && count > 0) setSiLoading(false); })
      .catch(err => console.warn("[S4 Offline] salesInvoices offline load failed", err));

    const applyCloudRows = (rows) => {
      if (cancelled) return;
      cloudRowsLatest = rows;
      setSiLoading(false);
      loadOfflineSiInvoices({ cloudRows: rows }).catch(() => {
        if (!cancelled) setInvoices(sortSiInvoices(filterSiRows(rows)));
      });
      offlineCacheCloudRecords(COL, rows)
        .catch(err => console.warn("[S4 Offline] salesInvoices cache failed", err));
    };

    if (authSyncReady) {
      const baseQ = isOwner
        ? query(collection(db,COL),where("shopId","==",shopId),orderBy("createdAt","desc"))
        : query(collection(db,COL),where("shopId","==",shopId),where("createdBy","==",user.uid),orderBy("createdAt","desc"));

      u1=onSnapshot(baseQ,snap=>{
        applyCloudRows(snap.docs.map(normalizeSiInvoice));
      },()=>{
        const fbQ=isOwner
          ? query(collection(db,COL),where("shopId","==",shopId))
          : query(collection(db,COL),where("shopId","==",shopId),where("createdBy","==",user.uid));
        u2=onSnapshot(fbQ,snap=>{
          applyCloudRows(sortSiInvoices(snap.docs.map(normalizeSiInvoice)));
        },err=>{
          console.error(err);
          loadOfflineSiInvoices().finally(()=>{ if (!cancelled) setSiLoading(false); });
        });
      });
    }
    return ()=>{ cancelled=true; u1(); u2&&u2(); };
  },[shopId,isOwner,user.uid,syncRefreshKey,authSyncReady,COL,dnMigrateTick]);

  useEffect(()=>{
    if (kind!=="sales" || !invoices.some(inv=>inv.invoiceType==="delivery")) return;
    migrateLegacyDeliveryNotes(invoices).then(moved=>{
      if (moved.length) setInvoices(prev=>prev.filter(inv=>!moved.includes(inv.id)));
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[invoices]);

  useEffect(()=>{
    if (!isDN || !shopId) return;
    let cancelled=false;
    offlineList("salesInvoices").then(res=>{
      const records = Array.isArray(res) ? res : (res.records || []);
      const rows = records.map(r => ({ ...(r.data || r), id:(r.data?.id || r.document_id || r.id) })).filter(r => r.shopId===shopId);
      return migrateLegacyDeliveryNotes(rows);
    }).then(moved=>{ if (!cancelled && moved?.length) setDnMigrateTick(n=>n+1); })
      .catch(err=>console.warn("[S4 DN] legacy delivery note scan failed", err));
    return ()=>{ cancelled=true; };
  },[isDN, shopId]);

  const siMaxLocalSerial = () => invoices.reduce((mx, inv) => {
    const m = String(inv.invoiceNo || "").match(serialRe);
    return m ? Math.max(mx, Number(m[1])) : mx;
  }, Number(shop?.[serialField] || 0));

  const siFormatInvoiceNo = (serial) =>
    `${DOC_PREFIX}${String(serial).padStart(4, "0")}`;

  const siPreviewNextInvoiceNo = () =>
    siFormatInvoiceNo(siMaxLocalSerial() + 1);

  const reserveSiInvoiceNo = async () => {
    if (editInvId) return siInvoiceNo;
    const local = siMaxLocalSerial();
    const serial = await reserveShopSerial(shopId, serialField, local);
    const no = serial ? siFormatInvoiceNo(serial)
      : isOwner ? siFormatInvoiceNo(local + 1)
      : `${siFormatInvoiceNo(local + 1)}-${deviceSerialTag()}`;
    setSiInvoiceNo(no);
    return no;
  };

  const bumpShopSiSerial = (invoiceNo) => {
    const m = String(invoiceNo || "").match(serialRe);
    if (!m || !navigator.onLine) return;
    const serial = Number(m[1]);
    if (!Number.isFinite(serial) || serial <= 0) return;
    runTransaction(db, async tx => {
      const shopRef = doc(db, "shops", shopId);
      const shopSnap = await tx.get(shopRef);
      const current = Number(shopSnap.data()?.[serialField] || 0);
      if (serial > current) tx.update(shopRef, { [serialField]: serial });
    }).catch(err => console.warn(`[S4 SI] ${serialField} background bump failed`, err));
  };

  const siOpenNew = (customer=null) => {
    setSiInvoiceNo(siPreviewNextInvoiceNo());
    const termDays = customer ? parseInt(String(customer.paymentTerms||"").replace(/[^\d]/g,""),10) : 0;
    const customerFields = customer ? {
      customerId:customer.id, customerName:customer.customerName||"", customerMobile:customer.mobileNumber||"",
      customerAddress:[customer.address,customer.area,customer.city].filter(Boolean).join(", "),
      customerTrn:customer.trnNumber||"", customerType:customer.customerType||"",
      creditDays:Number.isFinite(termDays)&&termDays>0 ? String(termDays) : "",
      ...(kind==="sales" && customer.paymentType==="credit" ? { paymentMethod:"credit", amountPaid:"" } : {}),
    } : {};
    const myDefaults = team.find(m=>(m.uid||m.id)===user?.uid)?.defaults || profile?.defaults || {};
    const salesmanDefault = myDefaults.salesmanId
      ? { salesmanId:myDefaults.salesmanId, salesmanName:myDefaults.salesmanName||"" }
      : { salesmanId:user?.uid||"", salesmanName:profile?.personName||"" };
    const payDefault = kind==="sales" ? {} : (SI_PAY[myDefaults.paymentMethod] ? { paymentMethod:myDefaults.paymentMethod } : {});
    const billTypeDefault = ["tax","regular"].includes(myDefaults.billType) ? { invoiceType:myDefaults.billType } : {};
    setSiForm({ ...siEmptyForm(), ...billTypeDefault, ...(isDN?{ invoiceType:"delivery" }:{}), ...salesmanDefault, ...payDefault, validUntil:isQuote&&!isSO?siAddDays(siToday(), QT_VALID_DAYS):"", ...customerFields });
    setSiLines([]);
    setSiCurrent(siEmptyCurrent());
    setEditInvId(null);
    setSourceQuote(null);
    setSiView("form");
  };

  const siLoadDoc=(inv)=>{
    siLoadedPaidRef.current = inv.paymentMethod==="cash" ? 0 : siN2(inv.amountPaid);
    setSiForm({
      invoiceType:inv.invoiceType||"regular", invoiceDate:inv.invoiceDate,
      customerId:inv.customerId||"", customerName:inv.customerName||"",
      customerMobile:inv.customerMobile||"", customerAddress:inv.customerAddress||"",
      customerTrn:inv.customerTrn||"", paymentMethod:inv.paymentMethod||"cash",
      customerType:(customers||[]).find(c=>c.id===inv.customerId)?.customerType||"",
      // Cash is always auto-paid — don't pre-fill amountPaid so switching to credit gives 0
      amountPaid: inv.paymentMethod==="cash" ? "" : (inv.amountPaid>0?String(inv.amountPaid):""),
      deliveryNoteNo:inv.deliveryNoteNo||"", vehicleNo:inv.vehicleNo||"", note:inv.note||"",
      refNo:inv.refNo||"", salesmanId:inv.salesmanId||"", salesmanName:inv.salesmanName||"",
      currency:inv.currency||"AED", stockLocation:inv.stockLocation||"main", stockLocationName:inv.stockLocationName||"Main",
      billDiscPerc:siN2(inv.billDiscPerc)>0?String(inv.billDiscPerc):"",
      billDiscAmt:siN2(inv.billDiscPerc)>0?"":(siN2(inv.billDiscAmt)>0?String(inv.billDiscAmt):""),
      adjustment:siN2(inv.adjustment)?String(inv.adjustment):"", roundOff:siN2(inv.roundOff)?String(inv.roundOff):"",
      creditDays:siN2(inv.creditDays)>0?String(inv.creditDays):"",
      hideCodeInPrint:!!inv.hideCodeInPrint,
      validUntil:inv.validUntil||"",
    });
    setSiLines((inv.items||[]).map(it=>({ id:`${Date.now()}-${Math.random().toString(36).slice(2,8)}`, productId:it.productId||null, name:it.name||"", code:it.code||"", brand:it.brand||"", qty:String(it.qty||""), unit:it.unit||"Pcs", unitPrice:String(it.unitPrice||""), discountPerc:String(it.discountPerc||"0"), discountFlat:siN2(it.discountFlat)>0?String(it.discountFlat):"", vatPerc:it.vatPerc!=null&&it.vatPerc!==""?String(it.vatPerc):"5", batchNo:it.batchNo||"", ...(it.isService?{ isService:true }:{}) })));
    setSiCurrent(siEmptyCurrent());
  };
  const siOpenEdit=(inv)=>{
    if (isOpeningBill(inv)) { toast(lang==="bn" ? "এটা Opening Balance বিল — কাস্টমার মাস্টার থেকে শুরুর ব্যালেন্স বদলান।" : "This is an Opening Balance bill — change the opening balance in Customer Master.", "err"); return; }
    siSnapRef.current = "pending";
    siLoadDoc(inv);
    setSiInvoiceNo(inv.invoiceNo);
    setSourceQuote(null);
    setEditInvId(inv.id); setSiView("form");
  };
  useEffect(()=>{
    if (!openNewRequest) return;
    onOpenNewHandled?.();
    if (kind!=="sales" || siView==="form") return;
    siOpenNew(openNewCustomer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openNewRequest]);
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
    setSiForm(p=>({ ...p, invoiceDate:siToday(), validUntil:"", refNo:p.refNo||quoteToConvert.invoiceNo||"",
      invoiceType:isDN?"delivery":quoteToConvert.invoiceType==="regular"?"regular":"tax",
      ...(!isDN && p.invoiceType==="delivery" ? { deliveryNoteNo:quoteToConvert.invoiceNo||"" } : {}) }));
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

  const siUpd=(k,v)=>setSiForm(p=>({...p,[k]:v}));
  const siAddLine=()=>setSiLines(p=>[...p,siEmptyLine()]);
  const siFindProduct = (productId) => productId ? products.find(p=>p.id===productId) : null;
  // Re-price a line for a new unit; keep a hand-typed name unless it is the product's own/alternate name.
  const siRepriceForUnit = (item, unit, customerType = siForm.customerType) => {
    const prod = siFindProduct(item.productId);
    if (!prod) return { ...item, unit };
    const rate = siResolveRate(prod, unit, customerType);
    const autoNames = new Set([prod.name, ...siProductRateRows(prod).map(r=>String(r.altName||"").trim())].filter(Boolean));
    return {
      ...item,
      unit,
      unitPrice: String(rate.unitPrice || item.unitPrice || ""),
      name: autoNames.has(item.name) ? rate.name : item.name,
    };
  };
  const siUpdLine=(id,f,v)=>setSiLines(p=>p.map(it=>{
    if (it.id!==id) return it;
    return f==="unit" ? siRepriceForUnit(it, v) : {...it,[f]:v};
  }));
  const siChangeCurrentUnit=(unit)=>setSiCurrent(p=>siRepriceForUnit(p, unit));
  const siDelLine=(id)=>setSiLines(p=>p.filter(it=>it.id!==id));

  // A line starts with the larger of the product's default discount and the customer's discount.
  const siAutoDisc = (prod, customer) => {
    if (isDN || siForm.invoiceType==="delivery" || !prod) return 0;
    const c = customer !== undefined ? customer : (customers||[]).find(x=>x.id===siForm.customerId);
    return Math.max(0, Math.min(100, Math.max(siN2(prod.defaultDiscount), siN2(c?.discountPerc))));
  };

  // Quick add: adds product as new line directly from picker
  const siAddProductLine = async (prod) => {
    const unit = prod.unit||"Pcs";
    const rate = siResolveRate(prod, unit, siForm.customerType);
    const draftLine = {
      ...siEmptyLine(),
      productId:  prod.id,
      name:       rate.name,
      code:       prod.code||prod.barcode||"",
      brand:      prod.brand||"",
      unit,
      unitPrice:  rate.unitPrice,
      discountPerc: String(siAutoDisc(prod)),
      vatPerc:    prod.salesVat||"5",
      qty:        "1",
    };
    const newLine = await siPickBatch(draftLine);
    if (newLine) setSiLines(p=>[...p, newLine]);
  };

  const siSelectProduct=(prod)=>{
    const unit = prod.unit||"Pcs";
    const rate = siResolveRate(prod, unit, siForm.customerType);
    setSiCurrent(p=>({
      ...p,
      productId: prod.id,
      name:      rate.name,
      code:      prod.code||prod.barcode||"",
      brand:     prod.brand||"",
      unit,
      unitPrice: rate.unitPrice||p.unitPrice,
      discountPerc: String(siAutoDisc(prod)),
      vatPerc:   prod.salesVat||"5",
      batchNo:   undefined,
    }));
    setTimeout(()=>siQtyRef.current?.focus(), 100);
  };

  // A product kept in separate batches asks which batch the goods leave from; null means the user closed the window.
  const siPickBatch = async (line) => {
    if (isQuote || !line.productId || line.batchNo !== undefined) return line;
    const prod = siFindProduct(line.productId);
    if (!prod) return line;
    let choices = [];
    try {
      const rows = await loadInvoiceRows();
      const stockMap = computeStockMap([prod], rows.purchaseInvoices, rows.salesInvoices, shopId, rows.deliveryNotes, rows.extras);
      choices = saleBatchChoices(batchStockByProduct([prod], rows, shopId, stockMap).get(prod.id));
    } catch (err) { console.warn("[S4 SI] batch lookup failed", err); }
    if (choices.length < 2) return choices[0] && !choices[0].isMain ? { ...line, batchNo:choices[0].batchNo } : line;
    const picked = await new Promise(resolve => setSiBatchAsk({ product:prod, choices, resolve }));
    setSiBatchAsk(null);
    if (!picked) return null;
    return picked.isMain ? line : { ...line, batchNo:picked.batchNo };
  };

  const siAddCurrentItem = async () => {
    if (!siCurrent.name.trim()) { toast(t.si_errName,"err"); return; }
    if (!siCurrent.qty||siN2(siCurrent.qty)<=0) { toast(t.si_errQty,"err"); return; }
    const editId = siEditLineId;
    const entry = editId && siCurrent.batchNo !== undefined ? siCurrent : await siPickBatch(siCurrent);
    if (!entry) { setTimeout(()=>siQtyRef.current?.focus(), 80); return; }
    setSiLines(prev=>editId && prev.some(x=>x.id===editId)
      ? prev.map(x=>x.id===editId ? { ...entry, id:editId } : x)
      : [...prev, { ...entry, id:`${Date.now()}-${Math.random().toString(36).slice(2,8)}` }]);
    setSiEditLineId(null);
    setSiCurrent(siEmptyCurrent());
    setTimeout(()=>siNameRef.current?.focus(), 80);
  };

  const siSelectCustomer=(c)=>{
    siUpd("customerId",c.id); siUpd("customerName",c.customerName);
    siUpd("customerMobile",c.mobileNumber||"");
    siUpd("customerAddress",[c.address,c.area,c.city].filter(Boolean).join(", ")||"");
    siUpd("customerTrn",c.trnNumber||"");
    siUpd("customerType",c.customerType||"");
    const termDays = parseInt(String(c.paymentTerms||"").replace(/[^\d]/g,""),10);
    siUpd("creditDays", Number.isFinite(termDays)&&termDays>0 ? String(termDays) : "");
    if (kind==="sales") {
      const pm = c.paymentType === "credit" ? "credit" : "cash";
      setSiForm((p) => ({ ...p, paymentMethod: pm, amountPaid: pm === "credit" ? "" : p.amountPaid }));
    }
    setShowCustPicker(false);
    // Lines still on the old automatic discount move to the new customer's; hand-typed discounts stay.
    const oldCustomer = (customers||[]).find(x=>x.id===siForm.customerId) || null;
    const applyDisc = (it) => {
      const prod = siFindProduct(it.productId);
      if (!prod) return it;
      const before = siAutoDisc(prod, oldCustomer);
      const after = siAutoDisc(prod, c);
      return before !== after && Math.abs(siN2(it.discountPerc) - before) < 0.001 ? { ...it, discountPerc:String(after) } : it;
    };
    const newType = c.customerType||"";
    if (normCustomerType(newType) === normCustomerType(siForm.customerType)) {
      setSiLines(p=>p.map(applyDisc));
      setSiCurrent(p=>applyDisc(p));
      return;
    }
    let changed = 0;
    const reprice = (raw) => {
      const it = applyDisc(raw);
      if (!it.productId) return it;
      const next = siRepriceForUnit(it, it.unit, newType);
      if (String(next.unitPrice) !== String(it.unitPrice) || next.name !== it.name) changed += 1;
      return next;
    };
    const repricedLines = siLines.map(reprice);
    const repricedCurrent = reprice(siCurrent);
    setSiLines(repricedLines);
    setSiCurrent(repricedCurrent);
    if (changed) toast(lang==="bn"
      ? `${changed}টি item-এর দাম নতুন customer type অনুযায়ী বদলানো হয়েছে`
      : `Prices of ${changed} item(s) updated for the new customer type`);
  };

  const siQuickAddCustomer = async (customerName) => {
    if (!canManageCustomers) {
      toast(lang==="bn"?"কাস্টমার যোগ করার permission নেই":"No permission to add customers","err");
      return;
    }
    const name = String(customerName || "").trim();
    if (!name) return;

    try {
      const now = new Date().toISOString();
      const result = await offlineCreate("customers", {
        shopId,
        customerName: name,
        customerCode: await nextPartyCode(shopId, "customers", customers),
        mobileNumber: "",
        createdBy: user.uid,
        createdAt: now,
      });
      const created = { ...result.data, id: result.documentId, customerName: name };
      onCustomerCreated?.(created);
      siSelectCustomer(created);
      toast(lang==="bn"?"✅ কাস্টমার যোগ হয়েছে":"✅ Customer added");

      if (navigator.onLine) {
        window.S4Offline?.syncNow?.().catch(err => console.warn("[S4 Sync] customer quick-add sync failed", err));
      }
    } catch (error) {
      toast(error?.message || String(error), "err");
    }
  };

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

  const siBuild=(status, invoiceNoOverride)=>{
    if (String(siCurrent.name||"").trim()) {
      toast(lang==="bn"?"❌ উপরের ঘরে একটা আইটেম আছে যা বিলে যোগ হয়নি — Add চাপুন বা ঘরটা খালি করুন":"❌ An item in the entry row is not added to the bill yet — press Add or clear it","err");
      return null;
    }
    const valid=siLines.filter(it=>it.name.trim());
    if (!valid.length){ toast(t.si_errItems,"err"); return null; }
    const badLine = valid.find(it => siN2(it.discountPerc)<0 || siN2(it.discountPerc)>100 || siN2(it.discountFlat)<0 || siN2(it.vatPerc)<0 || siN2(it.unitPrice)<0);
    if (badLine) { toast(lang==="bn"?`❌ "${badLine.name}": ছাড় ০–১০০% আর দাম/VAT মাইনাস হতে পারে না`:`❌ "${badLine.name}": discount must be 0–100% and price/VAT cannot be negative`,"err"); return null; }
    const isDelivery = isDN || (kind==="sales" && siForm.invoiceType==="delivery");
    const isTax      = siForm.invoiceType==="tax";
    for (const it of valid){
      if (!it.qty.toString().trim()||siN2(it.qty)<=0){ toast(t.si_errQty,"err"); return null; }
      if (siN2(it.unitPrice)<0){ toast(t.si_errPrice,"err"); return null; }
    }
    const effectiveIsTax = isTax && !isDelivery;
    const builtItems=valid.map(it=>{
      const item = isDelivery ? siDeliveryLines([it])[0] : it;
      const { disc, vat, total }=siCalcLine(item, effectiveIsTax);
      return { productId:it.productId||null, name:it.name.trim(), code:it.code.trim(), brand:it.brand.trim(), qty:siN2(it.qty), unit:it.unit, unitFactor:unitFactorFor(siFindProduct(it.productId), it.unit), unitPrice:siN2(it.unitPrice), discountPerc:isDelivery?0:siN2(it.discountPerc), discountFlat:isDelivery||siN2(it.discountPerc)>0?0:siN2(it.discountFlat), discountAmt:parseFloat(siFmt2(disc)), vatPerc:effectiveIsTax?siN2(it.vatPerc):0, vatAmt:parseFloat(siFmt2(vat)), lineTotal:parseFloat(siFmt2(total)), ...(it.batchNo?{ batchNo:it.batchNo }:{}), ...(it.isService&&!it.productId?{ isService:true }:{}) };
    });
    const formTotals = isDelivery ? siCalcTotals(siDeliveryLines(valid), false) : siCalcTotals(valid, effectiveIsTax, siInvoiceExtras(siForm));
    const { sub, disc, vat, grand } = formTotals;
    if (grand < -0.001) { toast(lang==="bn"?"❌ সর্বমোট মাইনাস হতে পারে না — সমন্বয়/ছাড় ঠিক করুন":"❌ Grand total cannot be negative — check adjustment/discount","err"); return null; }
    const priorDoc = editInvId ? invoices.find(inv=>inv.id===editInvId) : null;
    if (!canDiscount && !isDelivery) {
      const reduction = (d, adj) => siN2(d) + Math.max(0, -siN2(adj));
      const baseDoc = priorDoc || sourceQuote;
      // The owner-set product/customer discount is automatic, so it never needs the discount permission.
      const autoAllowed = valid.reduce((sum, it) => {
        const auto = siAutoDisc(siFindProduct(it.productId));
        if (!auto) return sum;
        return sum + siCalcLine({ ...it, discountPerc: Math.min(siN2(it.discountPerc), auto), discountFlat: 0 }, effectiveIsTax).disc;
      }, 0);
      const allowed = Math.max(baseDoc ? reduction(baseDoc.totalDiscount, baseDoc.adjustment) : 0, autoAllowed);
      const noDiscountMsg = lang==="bn"?"❌ ডিসকাউন্ট দেওয়ার অনুমতি নেই — মালিকের কাছে পারমিশন নিন":"❌ You are not allowed to give discounts — ask the owner for permission";
      if (reduction(disc, formTotals.adjustment) > allowed + 0.01) {
        toast(noDiscountMsg,"err"); return null;
      }
      // Round Off is for coins only; a larger cut is a discount.
      const roundOff = siN2(siForm.roundOff);
      if (roundOff < -1 && roundOff < siN2(baseDoc?.roundOff) - 0.005) {
        toast(noDiscountMsg,"err"); return null;
      }
      // Lowering the rate below the product's price is a discount too, unless the line already had that rate.
      const underPriced = valid.find((it) => {
        const prod = siFindProduct(it.productId);
        if (!prod) return false;
        const listRate = siN2(siResolveRate(prod, it.unit, siForm.customerType).unitPrice);
        const prior = (baseDoc?.items || []).find((x) => x.productId === it.productId && (x.unit || "") === (it.unit || ""));
        const floor = prior ? Math.min(listRate, siN2(prior.unitPrice)) : listRate;
        return floor > 0 && siN2(it.unitPrice) < floor - 0.005;
      });
      if (underPriced) {
        toast(lang==="bn"?`❌ "${underPriced.name}"-এর দাম কমানোর অনুমতি নেই — মালিকের কাছে পারমিশন নিন`:`❌ You are not allowed to lower the price of "${underPriced.name}" — ask the owner for permission`,"err"); return null;
      }
    }
    if (status==="draft" && priorDoc && !isQuote && priorDoc.status && priorDoc.status!=="draft") {
      toast(lang==="bn"?"❌ সেভ করা বিলকে আবার Draft করা যাবে না":"❌ A saved invoice cannot be turned back into a draft","err"); return null;
    }
    const isCash     = siForm.paymentMethod==="cash";
    // Receipts may have been posted since the form was opened: apply only the user's change on top of the latest paid amount.
    const typedPaid  = siN2(siForm.amountPaid);
    const creditPaid = priorDoc && priorDoc.paymentMethod!=="cash"
      ? siN2(priorDoc.amountPaid) + (typedPaid - siLoadedPaidRef.current)
      : typedPaid;
    const receiptsOnBill = priorDoc ? (receipts||[]).filter(r=>r.status!=="cancelled")
      .reduce((s,r)=>s+(r.allocations||[]).filter(a=>a.invoiceId===priorDoc.id).reduce((x,a)=>x+siN2(a.amount),0),0) : 0;
    if (!isDelivery && !isQuote && !isCash && priorDoc && receiptsOnBill > grand + 0.01) {
      toast(lang==="bn"?`❌ এই বিলে আগেই ${siFmt2(receiptsOnBill)} টাকা নেওয়া হয়েছে — সর্বমোট এর চেয়ে কম করা যাবে না`:`❌ ${siFmt2(receiptsOnBill)} has already been received on this bill — the total cannot go below it`,"err"); return null;
    }
    if (!isDelivery && !isQuote && isCash && receiptsOnBill > 0.01) {
      toast(lang==="bn"?"❌ এই বিলে Receipt Voucher আছে — Cash করা যাবে না, আগে Receipt বাতিল করুন":"❌ This bill has receipt vouchers — it cannot be made cash; cancel the receipts first","err"); return null;
    }
    if (!isDelivery && !isQuote && !isCash && (typedPaid < 0 || creditPaid > grand + 0.01)) {
      toast(lang==="bn"?"❌ পরিশোধিত টাকা মোট বিলের চেয়ে বেশি বা ঋণাত্মক হতে পারে না!":"❌ Amount paid cannot exceed the grand total or be negative!","err"); return null;
    }
    // cash invoice: auto fully paid | delivery: confirmed | credit: normal; receipts already posted on the bill always stay counted
    const paid = isDelivery || isQuote ? 0
               : isCash     ? parseFloat(siFmt2(grand))
               : Math.min(Math.max(creditPaid,receiptsOnBill,0), Math.max(grand,0));
    const bal  = isDelivery || isQuote ? 0 : Math.max(0, grand - paid);
    const derivedStatus = isQuote ? (status==="confirmed" ? "open" : status)
                        : isDN ? status
                        : isDelivery ? "confirmed"
                        : (status==="confirmed" ? (bal<0.01?"paid":paid>0?"partial":"confirmed") : status);
    const keepConverted = priorDoc?.convertedInvoiceNo ? { convertedInvoiceId:priorDoc.convertedInvoiceId||"", convertedInvoiceNo:priorDoc.convertedInvoiceNo } : {};
    const sourceLink = (src) => { const m = sourceDocOf(src); return { [m.idKey]:src.id, [m.noKey]:src.invoiceNo||"" }; };
    // A delivery note made from a sales order keeps that link, and its invoice inherits it.
    const keepOrder = (doc) => doc?.salesOrderId ? { salesOrderId:doc.salesOrderId, salesOrderNo:doc.salesOrderNo||"" } : {};
    const quoteFields = isQuote ? { docKind:isSO?"salesOrder":"quotation", validUntil:siForm.validUntil||"", ...keepConverted }
      : isDN ? { docKind:"delivery", ...keepConverted, ...(sourceQuote ? sourceLink(sourceQuote) : keepOrder(priorDoc)) }
      : sourceQuote ? { ...keepOrder(sourceQuote), ...sourceLink(sourceQuote) }
      : priorDoc?.deliveryNoteId ? { deliveryNoteId:priorDoc.deliveryNoteId, deliveryNoteNo:priorDoc.deliveryNoteNo||"", ...keepOrder(priorDoc) }
      : priorDoc?.salesOrderId ? keepOrder(priorDoc)
      : priorDoc?.jobOrderId ? { jobOrderId:priorDoc.jobOrderId, jobOrderNo:priorDoc.jobOrderNo||"" }
      : priorDoc?.quotationId ? { quotationId:priorDoc.quotationId, quotationNo:priorDoc.quotationNo||"" } : {};
    const docType = isDN ? "delivery" : isQuote ? (isTax ? "tax" : "regular") : (siForm.invoiceType||"tax");
    return { ...quoteFields, shopId, invoiceNo:invoiceNoOverride ?? siInvoiceNo, invoiceType:docType, invoiceDate:siForm.invoiceDate, customerId:siForm.customerId||null, customerCode:siForm.customerId?((customers||[]).find(c=>c.id===siForm.customerId)?.customerCode||""):"", customerName:siForm.customerName.trim(), customerMobile:siForm.customerMobile.trim(), customerAddress:siForm.customerAddress.trim(), customerTrn:siForm.customerTrn.trim(), items:builtItems, subtotal:parseFloat(siFmt2(sub)), totalDiscount:parseFloat(siFmt2(disc)), totalVat:parseFloat(siFmt2(vat)), grandTotal:parseFloat(siFmt2(grand)), paymentMethod:siForm.paymentMethod, amountPaid:parseFloat(siFmt2(paid)), balanceDue:parseFloat(siFmt2(bal)), status:derivedStatus, deliveryNoteNo:siForm.deliveryNoteNo.trim(), vehicleNo:siForm.vehicleNo.trim(), note:siForm.note.trim(), createdBy:priorDoc?.createdBy||user.uid, createdByName:priorDoc?.createdByName||profile.personName,
      refNo:String(siForm.refNo||"").trim(),
      salesmanId:siForm.salesmanId||"", salesmanName:String(siForm.salesmanName||"").trim(),
      currency:siForm.currency||"AED",
      stockLocation:siForm.stockLocation||"main", stockLocationName:siForm.stockLocationName||"Main",
      billDiscPerc:isDelivery?0:Math.min(Math.max(siN2(siForm.billDiscPerc),0),100),
      billDiscAmt:isDelivery?0:parseFloat(siFmt2(formTotals.billDisc)),
      billDiscount:isDelivery?0:parseFloat(siFmt2(formTotals.billDisc)),
      adjustment:isDelivery?0:siN2(siForm.adjustment),
      roundOff:isDelivery?0:siN2(siForm.roundOff),
      creditDays:Math.max(0, Math.round(siN2(siForm.creditDays))),
      dueDate:!isDelivery && !isQuote && siN2(siForm.creditDays)>0 && siForm.invoiceDate ? siAddDays(siForm.invoiceDate, Math.round(siN2(siForm.creditDays))) : "",
      hideCodeInPrint:!!siForm.hideCodeInPrint,
    };
  };

  // The customer's master settings: blocked customers can't be billed; cash-only and credit limit ask first.
  const siCustomerTermsOk = (p) => {
    if (kind!=="sales" || p.status==="draft" || p.invoiceType==="delivery" || !p.customerId) return true;
    const cust = (customers||[]).find(c=>c.id===p.customerId);
    if (!cust) return true;
    const priorDoc = editInvId ? invoices.find(inv=>inv.id===editInvId) : null;
    if (cust.status==="blocked" && priorDoc?.customerId!==cust.id) {
      toast(lang==="bn"?`❌ "${cust.customerName}" ব্লক করা কাস্টমার — বিক্রি করা যাবে না`:`❌ "${cust.customerName}" is a blocked customer — cannot be billed`,"err");
      return false;
    }
    if (p.balanceDue<=0.01) return true;
    if (cust.paymentType==="cash" && !window.confirm(lang==="bn"
      ? `"${cust.customerName}" শুধু নগদের কাস্টমার। তবুও বাকিতে ${siFmt2(p.balanceDue)} দেবেন?`
      : `"${cust.customerName}" is a cash-only customer. Give ${siFmt2(p.balanceDue)} on credit anyway?`)) return false;
    const limit = siN2(cust.creditLimit);
    if (limit>0) {
      const outstanding = invoices
        .filter(inv=>inv.id!==editInvId && inv.customerId===cust.id && !["cancelled","draft"].includes(inv.status))
        .reduce((s,inv)=>s+Math.max(0, siN2(inv.balanceDue)), 0);
      if (outstanding + p.balanceDue > limit + 0.01 && !window.confirm(lang==="bn"
        ? `ক্রেডিট লিমিট ছাড়িয়ে যাচ্ছে!\nলিমিট: ${siFmt2(limit)}\nআগের বাকি: ${siFmt2(outstanding)}\nএই বিলের বাকি: ${siFmt2(p.balanceDue)}\nতবুও সেভ করবেন?`
        : `Credit limit exceeded!\nLimit: ${siFmt2(limit)}\nOutstanding: ${siFmt2(outstanding)}\nThis bill due: ${siFmt2(p.balanceDue)}\nSave anyway?`)) return false;
    }
    return true;
  };

  const saveSalesInvoiceOffline = async (payload, successMessage, options = {}) => {
    const nowIso = new Date().toISOString();
    const priorInvoice = editInvId ? invoices.find(inv => inv.id === editInvId) : null;
    let savedInvoice;
    const deferPersist = { deferPersist: true };

    if (editInvId) {
      const result = await offlineUpdate(COL, editInvId, {
        ...payload,
        updatedAt: nowIso,
        updatedBy: user?.uid || "",
      }, deferPersist);

      savedInvoice = { ...result.data, id: editInvId };
      setInvoices(prev => prev.map(inv => inv.id === editInvId ? savedInvoice : inv));
      setSelInv(prev => prev && prev.id === editInvId ? savedInvoice : prev);
      toast(successMessage || t.si_updated);
      if (priorInvoice && priorInvoice.status !== "draft") {
        logAudit({ shopId, user, profile, action:"edit", collection:COL, docId:editInvId, docNo:payload.invoiceNo, amount:payload.grandTotal,
          note:`${payload.customerName||""} · ${siFmt2(priorInvoice.grandTotal)} → ${siFmt2(payload.grandTotal)}` });
      }
    } else {
      const result = await offlineCreate(COL, {
        ...payload,
        createdAt: nowIso,
        updatedAt: nowIso,
      }, deferPersist);

      savedInvoice = { ...result.data, id: result.documentId };
      setInvoices(prev => [savedInvoice, ...prev]);
      toast(successMessage);
    }

    // Goods on an invoice made from a delivery note already left stock with the delivery note.
    if (!isQuote && !payload.deliveryNoteId) await applyInvoiceStockEffect({
      oldInvoice: priorInvoice,
      newInvoice: payload,
      invoiceId: savedInvoice.id,
      applyType: "sale",
      reverseType: "return",
      referenceType: isDN ? "delivery_note" : "sales_invoice",
      unitCostKey: "unitPrice",
      shopId,
      actor: { uid: user?.uid, personName: profile?.personName },
    });

    await persistOfflineDb();

    if (!editInvId) bumpShopSiSerial(payload.invoiceNo);

    if ((kind==="sales" || isDN) && !editInvId && sourceQuote?.id) {
      const src = sourceDocOf(sourceQuote);
      try {
        const latestSrc = await offlineGetById(src.col, sourceQuote.id).catch(() => null);
        const baseSrc = latestSrc?.data ? { ...latestSrc.data, id: sourceQuote.id } : sourceQuote;
        await offlineUpdate(src.col, sourceQuote.id, {
          ...baseSrc,
          ...(sourceQuote.docKind==="jobOrder" ? { prevStatus: baseSrc.status || "", invoicedAt: baseSrc.invoicedAt || nowIso, statusHistory: [...(baseSrc.statusHistory || []), { status: "invoiced", at: nowIso, by: profile?.personName || "" }] } : {}),
          status: sourceQuote.docKind==="quotation" || !sourceQuote.docKind ? "converted" : isDN ? "delivered" : "invoiced",
          convertedInvoiceId: savedInvoice.id,
          convertedInvoiceNo: payload.invoiceNo,
          updatedAt: nowIso,
          updatedBy: user?.uid || "",
        });
      } catch (err) {
        console.warn("[S4 SI] mark source document converted failed", err);
      }
      setSourceQuote(null);
    }

    if (navigator.onLine) {
      window.S4Offline?.syncNow?.().catch(err => console.warn("[S4 Sync] sales invoice save sync failed", err));
    }

    if (!editInvId) {
      siOpenNew();
    } else {
      setSelInv(savedInvoice);
      setSiView("detail");
    }

    if (options.print) {
      setSiPrintModal(savedInvoice);
    }

    return savedInvoice;
  };

  const siSaveRun = async (status, successMsg, options) => {
    if (siSaveLockRef.current) return;
    siSaveLockRef.current = true;
    setSiSaving(true);
    try {
      const lockedBy = editInvId ? billReturns.filter(r => r.status !== "cancelled" && r.invoiceId === editInvId) : [];
      if (lockedBy.length) {
        toast(lang==="bn" ? `এই বিলে রিটার্ন আছে (${lockedBy.map(r=>r.returnNo).join(", ")}) — আগে রিটার্ন বাতিল করুন` : `This bill has return(s) ${lockedBy.map(r=>r.returnNo).join(", ")}; cancel them before editing`, "err");
        return;
      }
      if ((kind==="sales" || isDN) && !editInvId && sourceQuote?.id) {
        const latest = await offlineGetById(sourceDocOf(sourceQuote).col, sourceQuote.id).catch(() => null);
        const src = latest?.data || null;
        if (src && ["converted","invoiced","delivered"].includes(src.status)) {
          toast(lang==="bn"
            ? `${sourceQuote.invoiceNo} আগেই ${src.convertedInvoiceNo ? `→ ${src.convertedInvoiceNo} ` : ""}রূপান্তরিত — আরেকটা ইনভয়েস বানানো যাবে না`
            : `${sourceQuote.invoiceNo} was already converted${src.convertedInvoiceNo ? ` to ${src.convertedInvoiceNo}` : ""} — cannot create another invoice`, "err");
          return;
        }
        if (src?.status==="cancelled") {
          toast(lang==="bn" ? `${sourceQuote.invoiceNo} বাতিল করা হয়েছে` : `${sourceQuote.invoiceNo} has been cancelled`, "err");
          return;
        }
      }
      const p = siBuild(status, siInvoiceNo);
      if (!p) return;
      if (!siCustomerTermsOk(p)) return;
      if (status!=="draft" && !isQuote && !unlinkedStockOk(p.items, lang)) return;
      if (!editInvId) p.invoiceNo = await reserveSiInvoiceNo();
      await saveSalesInvoiceOffline(p, editInvId ? t.si_updated : successMsg, options);
    } catch(e) {
      toast(e.message,"err");
    } finally {
      siSaveLockRef.current = false;
      setSiSaving(false);
    }
  };
  const siSaveDraft = () => siSaveRun("draft", t.si_saved);
  const siConfirm = () => siSaveRun("confirmed", t.si_confirmed, { print:true });

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

  const siFiltered=invoices.filter(inv=>{
    const matchSt=siStatusF==="ALL"||inv.status===siStatusF;
    const q=siSearch.trim();
    if (!q) return matchSt;
    const hay=[inv.invoiceNo,inv.customerName,inv.createdByName,...(inv.items||[]).map(it=>it.name+" "+it.code)].filter(Boolean).join(" ");
    return matchSt&&nsmatch(hay,q);
  });
  const siKPIs=invoices.reduce((a,inv)=>{ a.total++; if (inv.status!=="cancelled"&&inv.status!=="draft") { if (!isOpeningBill(inv)) a.amount+=inv.grandTotal||0; a.paid+=inv.amountPaid||0; a.due+=inv.balanceDue||0; } if (inv.status==="open") a.open++; if (inv.status==="converted") a.converted++; if (inv.status==="confirmed") a.delivered++; if (inv.status==="invoiced") a.invoiced++; if (inv.status==="delivered") a.soDelivered++; return a; },{total:0,amount:0,paid:0,due:0,open:0,converted:0,delivered:0,invoiced:0,soDelivered:0});
  const kpiCards = isSO
    ? [{l:lang==="bn"?"মোট সেলস অর্ডার":"Sales Orders",v:siKPIs.total,c:"#a1a1aa",pre:""},{l:lang==="bn"?"মোট মূল্য":"Total Value",v:siFmt2(siKPIs.amount),c:"#0e7490",pre:t.cur+" "},{l:SO_STATUSES.open[lang],v:siKPIs.open,c:"#06b6d4",pre:""},{l:lang==="bn"?"ডেলিভারি / ইনভয়েস হয়েছে":"Delivered / Invoiced",v:siKPIs.soDelivered+siKPIs.invoiced,c:"#22c55e",pre:""}]
    : isDN
    ? [{l:lang==="bn"?"মোট ডেলিভারি নোট":"Delivery Notes",v:siKPIs.total,c:"#a1a1aa",pre:""},{l:lang==="bn"?"মোট মূল্য":"Total Value",v:siFmt2(siKPIs.amount),c:"#a855f7",pre:t.cur+" "},{l:lang==="bn"?"ইনভয়েস বাকি":"Not Invoiced",v:siKPIs.delivered,c:"#06b6d4",pre:""},{l:DN_STATUSES.invoiced[lang],v:siKPIs.invoiced,c:"#22c55e",pre:""}]
    : isQuote
    ? [{l:lang==="bn"?"মোট কোটেশন":"Quotations",v:siKPIs.total,c:"#a1a1aa",pre:""},{l:lang==="bn"?"মোট মূল্য":"Total Value",v:siFmt2(siKPIs.amount),c:"#f59e0b",pre:t.cur+" "},{l:QT_STATUSES.open[lang],v:siKPIs.open,c:"#06b6d4",pre:""},{l:QT_STATUSES.converted[lang],v:siKPIs.converted,c:"#22c55e",pre:""}]
    : [{l:t.si_totalInvoices,v:siKPIs.total,c:"#a1a1aa",pre:""},{l:t.si_totalSales,v:siFmt2(siKPIs.amount),c:"#22c55e",pre:t.cur+" "},{l:t.si_totalPaid,v:siFmt2(siKPIs.paid),c:"#06b6d4",pre:t.cur+" "},{l:t.si_totalDue,v:siFmt2(siKPIs.due),c:siKPIs.due>0?"#ef4444":"#22c55e",pre:t.cur+" "}];

  const formIsDelivery = isDN || (kind==="sales" && siForm.invoiceType==="delivery");
  const mobileTypeOptions = (isDN||isQuote) ? [] : [
    ...(siForm.invoiceType==="regular" ? [["regular","🧾",t.si_regular,t.si_regularDesc,"#22c55e"]] : []),
    ["tax","🏛️",t.si_tax,t.si_taxDesc,"#1d4ed8"],
    ...((kind==="sales"&&siForm.invoiceType==="delivery") ? [["delivery","🚚",t.si_delivery,t.si_deliveryDesc,"#a855f7"]] : []),
  ];
  const formIsTax      = siForm.invoiceType==="tax";
  const formIsCash     = siForm.paymentMethod==="cash";
  const totals=formIsDelivery ? siCalcTotals(siDeliveryLines(siLines), false) : siCalcTotals(siLines, formIsTax, siInvoiceExtras(siForm));
  // cash: auto fully paid, delivery: 0
  const formPaid = formIsDelivery || isQuote ? 0 : formIsCash ? totals.grand : siN2(siForm.amountPaid);
  const balance  = Math.max(0, totals.grand - formPaid);

  // ══ LIST ══
  const bnL = lang==="bn";
  const siAccent = isSO ? "#0e7490" : isQuote ? "#b45309" : isDN ? "#7e22ce" : "#15803d";
  const siLightC = { "#a1a1aa":"#07101c", "#22c55e":"#15803d", "#06b6d4":"#0e7490", "#ef4444":"#b91c1c", "#a855f7":"#7e22ce", "#f59e0b":"#b45309" };
  const siBadge = (st) => <span className="si-badge" style={{ color:SI_STATUS_COLOR[st]||"#475569" }}>{STATUSES[st]?.[lang]||st}</span>;
  const siExpiredBadge = (inv) => isQuote && !isSO && qtIsExpired(inv) ? <span className="si-badge" style={{ color:"#b91c1c", marginRight:3 }}>{bnL?"মেয়াদ শেষ":"Expired"}</span> : null;
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
    if (!openInvoiceId || kind !== "sales") return;
    onOpenInvoiceHandled?.();
    const inv = invoices.find((i) => i.id === openInvoiceId);
    if (inv) siOpenInvoice(inv);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openInvoiceId, invoices, kind]);
  const siDocTitle = isSO ? (bnL?"সেলস অর্ডার":"SALES ORDER") : isQuote ? (bnL?"কোটেশন":"QUOTATION") : isDN ? (bnL?"ডেলিভারি নোট":"DELIVERY NOTE") : (bnL?"সেলস ইনভয়েস":"SALES INVOICE");
  const siRootStyle = siFitH && !siMobile ? { height:siFitH } : undefined;

  if (siView==="list" || (siView==="form" && siWin.min && wideDesktop)) {
    const groups = groupInvoicesByParty(siFiltered, { idField:"customerId", nameField:"customerName" });
    const openGroup = siGroupMode==="folders" && siOpenParty ? (groups.find(g=>g.key===siOpenParty) || null) : null;
    const rows = openGroup ? openGroup.invoices : siFiltered;
    const cashName = bnL ? "ক্যাশ (নাম ছাড়া)" : "Cash (no name)";
    const groupName = (g) => g.isCash ? cashName : g.name;
    const rowsSum = rows.reduce((a,inv)=>{
      if (!["cancelled","draft"].includes(inv.status)) { a.total += siN2(inv.grandTotal); a.due += siRowDue(inv); }
      if (inv.status==="draft") a.drafts += 1;
      return a;
    }, { total:0, due:0, drafts:0 });
    const showParties = siGroupMode==="folders" && (!siMobile || !openGroup);
    const showInvoices = siGroupMode==="all" || !siMobile || !!openGroup;
    const newLabel = isSO ? (bnL?"+ নতুন সেলস অর্ডার":"+ New Sales Order") : isQuote ? (bnL?"+ নতুন কোটেশন":"+ New Quotation") : isDN ? (bnL?"+ নতুন ডেলিভারি নোট":"+ New Delivery Note") : (bnL?"+ নতুন ইনভয়েস":"+ New Invoice");
    const emptyText = isSO ? (bnL?"এখনো কোনো সেলস অর্ডার নেই":"No sales orders yet") : isQuote ? (bnL?"এখনো কোনো কোটেশন নেই":"No quotations yet") : isDN ? (bnL?"এখনো কোনো ডেলিভারি নোট নেই":"No delivery notes yet") : t.si_noInvoices;
    const matchBlock = (inv) => siMatchedLines(inv).map(({ it, net }, i)=>(
      <div key={i} className="si-match">📦 {it.name}{it.code?` · ${it.code}`:""} — {it.qty} {it.unit} × {siFmt2(net)}</div>
    ));
    return (
      <div ref={siRootRef} className="si-root" style={siRootStyle}>
        <style>{PM_CSS}</style>
        <style>{SI_CSS}</style>
        {siView==="form"&&siWin.min&&(
          <MinimizedChip lang={lang} onRestore={siWin.restore}
            title={`${isSO?"SALES ORDER":isQuote?"QUOTATION":isDN?"DELIVERY NOTE":"SALES INVOICE"} ${siInvoiceNo||""}`}
            onClose={()=>{ if (siLeaveUnsavedOk()) setSiView("list"); }} />
        )}
        {showCustPicker&&<SiCustomerPicker {...customerPickerProps} />}
        {siPrintModal&&(
          <div className="pm-backdrop" style={{ zIndex:10000, alignItems:"center" }}>
            <div className="pm-window" style={{ maxWidth:380 }} role="dialog" aria-modal="true">
              <div className="pm-window-title">
                <span>✅ {isSO ? (bnL?"সেলস অর্ডার সেভ হয়েছে":"Sales order saved") : isQuote ? (bnL?"কোটেশন সেভ হয়েছে":"Quotation saved") : isDN ? (bnL?"ডেলিভারি নোট সেভ হয়েছে":"Delivery note saved") : (bnL?"ইনভয়েস সেভ হয়েছে":"Invoice saved")}</span>
                <button type="button" className="pm-window-close" onClick={()=>setSiPrintModal(null)}>✕</button>
              </div>
              <div className="pm-window-body">
                <div className="si-total-row"><span>{t.si_invoiceNo}</span><b>{siPrintModal.invoiceNo}</b></div>
                <div className="si-total-row"><span>{t.si_customer}</span><b>{siPrintModal.customerName||"—"}</b></div>
                <div className="si-total-row is-grand"><span>{t.si_grandTotal}</span><b>{t.cur} {siFmt2(siPrintModal.grandTotal)}</b></div>
                <div className="pm-window-foot">
                  <button type="button" className="pm-btn-secondary" onClick={()=>setSiPrintModal(null)}>{bnL?"পরে প্রিন্ট করব":"Print later"}</button>
                  <button type="button" className="pm-btn pm-btn--primary" autoFocus onClick={()=>{ siPrint(siPrintModal); setSiPrintModal(null); }}>🖨️ {bnL?"এখনই প্রিন্ট":"Print now"}</button>
                </div>
              </div>
            </div>
          </div>
        )}
        {receiptWindow}
        {ledgerWindow}

        <div className="pm-reference-title">
          <strong style={{ color:siAccent }}>{siDocTitle}</strong>
          <span>
            {invoices.length} {bnL?"টি":"total"}
            {!isOwner ? ` · ${bnL?"শুধু আমার":"Mine only"}` : ""}
          </span>
        </div>

        <div className="si-toolbar">
          <button type="button" className="pm-btn pm-btn--primary" onClick={()=>{ if (siLeaveMinOk()) siOpenNew(); }} disabled={siSaving}>
            {newLabel}{kind==="sales"&&!siMobile?" (F4)":""}
          </button>
          {kind==="sales"&&canCustBalance&&<button type="button" className="pm-btn-secondary" onClick={()=>setLedgerWin(true)}>📒 {bnL?"কাস্টমার লেজার":"Customer Ledger"}</button>}
          {kind==="sales"&&<button type="button" className="pm-btn-secondary" onClick={()=>setReceiptWin({})}>💰 {bnL?"রিসিট (টাকা গ্রহণ)":"Receipts"}</button>}
        </div>

        {invoices.length>0&&(
          <div className="si-kpis">
            {kpiCards.map((k,i)=>(
              <div key={i} className="si-kpi"><span>{k.l}</span><b style={{ color:siLightC[k.c]||k.c }}>{k.pre}{k.v}</b></div>
            ))}
          </div>
        )}

        <div className="si-filters">
          <div className="si-search">
            <input className="pm-input" placeholder={t.si_searchPh} value={siSearch} onChange={e=>setSiSearch(e.target.value)} />
            {siSearch&&<button type="button" aria-label="Clear" onClick={()=>setSiSearch("")}>✕</button>}
          </div>
          <div className="si-pills">
            {["ALL",...Object.keys(STATUSES)].map(st=>(
              <button key={st} type="button" className={`pm-btn-secondary${siStatusF===st?" is-active":""}`} onClick={()=>setSiStatusF(st)}>
                {st==="ALL"?t.si_allStatus:STATUSES[st]?.[lang]}
              </button>
            ))}
          </div>
          <div className="si-pills">
            {[["folders", bnL?"📁 নাম অনুযায়ী":"📁 By name"], ["all", bnL?"📋 সব":"📋 All"]].map(([m,label])=>(
              <button key={m} type="button" className={`pm-btn-secondary${siGroupMode===m?" is-active":""}`} onClick={()=>{ setSiGroupMode(m); setSiOpenParty(null); }}>{label}</button>
            ))}
          </div>
        </div>

        <div className={`si-main${siGroupMode==="all" || siMobile ? " is-all" : ""}`}>
          {showParties&&(
            <div className="si-box">
              <table className="pm-table">
                <colgroup><col /><col style={{ width:siMobile?96:76 }} /><col style={{ width:siMobile?84:68 }} /></colgroup>
                <thead><tr><th>{t.si_customer}</th><th className="si-num">{bnL?"মোট":"Total"}</th><th className="si-num">{bnL?"বাকি":"Due"}</th></tr></thead>
                <tbody>
                  {!siMobile&&groups.length>0&&(
                    <tr className={`pm-clickable${!openGroup?" pm-selected":""}`} onClick={()=>setSiOpenParty(null)}>
                      <td className="si-strong">{bnL?"সব কাস্টমার":"All customers"} ({siFiltered.length})</td><td /><td />
                    </tr>
                  )}
                  {groups.map(g=>(
                    <tr key={g.key} className={`pm-clickable si-party-row${openGroup?.key===g.key?" pm-selected":""}`} onClick={()=>setSiOpenParty(g.key)}>
                      <td className="si-wrap">
                        {g.isCash?"💵 ":""}{groupName(g)}
                        <div className="si-muted" style={{ fontWeight:400, fontSize:"0.9em" }}>
                          {g.invoices.length} {bnL?"টি":(g.invoices.length===1?"doc":"docs")}{g.lastDate?` · ${g.lastDate}`:""}
                        </div>
                      </td>
                      <td className="si-num">{siFmt2(g.total)}</td>
                      <td className={`si-num${g.due>0.01?" si-due":""}`}>{g.due>0.01?siFmt2(g.due):"-"}</td>
                    </tr>
                  ))}
                  {groups.length===0&&<tr><td colSpan={3} className="si-empty">{siLoading?"⏳":invoices.length===0?emptyText:t.si_noResults}</td></tr>}
                </tbody>
              </table>
            </div>
          )}

          {showInvoices&&(
            <div className="si-box">
              {siMobile&&openGroup&&(
                <button type="button" className="pm-btn-secondary" style={{ width:"100%", minHeight:36, marginBottom:3 }} onClick={()=>setSiOpenParty(null)}>
                  ← {bnL?"সব কাস্টমার":"All customers"} · {groupName(openGroup)}
                </button>
              )}
              {siLoading ? <div className="si-empty">⏳</div>
                : invoices.length===0 ? <div className="si-empty">{emptyText}</div>
                : rows.length===0 ? <div className="si-empty">🔍 {t.si_noResults}</div>
                : siMobile ? rows.map(inv=>{
                  const due = siRowDue(inv);
                  return (
                    <button key={inv.id} type="button" className="si-mrow" onClick={()=>siOpenInvoice(inv)}>
                      <div className="si-mrow-top">
                        <span style={{ color:siAccent }}>{inv.invoiceNo}</span>
                        <span>{siExpiredBadge(inv)}{siBadge(inv.status)}</span>
                      </div>
                      <div className="si-mrow-sub"><span>{inv.customerName||"—"}</span><b>{t.cur} {siFmt2(inv.grandTotal)}</b></div>
                      <div className="si-mrow-sub">
                        <span>{inv.invoiceDate}{inv.createdByName?` · ${inv.createdByName}`:""}</span>
                        {due>0.01 ? <span className="si-due">{bnL?"বাকি":"Due"} {siFmt2(due)}</span>
                          : (isQuote||isDN)&&inv.convertedInvoiceNo ? <span style={{ color:"#15803d" }}>→ {inv.convertedInvoiceNo}</span> : null}
                      </div>
                      {matchBlock(inv)}
                    </button>
                  );
                })
                : (
                  <table className="pm-table">
                    <colgroup>
                      <col style={{ width:96 }} /><col style={{ width:78 }} /><col /><col style={{ width:84 }} />
                      {(isQuote||isDN) ? <col style={{ width:110 }} /> : <><col style={{ width:42 }} /><col style={{ width:84 }} /><col style={{ width:84 }} /></>}
                      <col style={{ width:88 }} /><col style={{ width:100 }} />
                    </colgroup>
                    <thead>
                      <tr>
                        <th>{t.si_invoiceNo}</th><th>{t.si_date}</th><th>{t.si_customer}</th><th>{bnL?"স্ট্যাটাস":"Status"}</th>
                        {(isQuote||isDN) ? <th>{isSO?(bnL?"ডেলিভারি / বিল":"Delivery / Bill"):isQuote?(bnL?"মেয়াদ / ইনভয়েস":"Valid / Invoice"):(bnL?"ইনভয়েস":"Invoice")}</th>
                          : <><th className="si-num">{bnL?"আইটেম":"Items"}</th><th className="si-num">{bnL?"মোট":"Total"}</th><th className="si-num">{bnL?"পরিশোধ":"Paid"}</th></>}
                        <th className="si-num">{(isQuote||isDN)?(bnL?"মোট":"Total"):(bnL?"বাকি":"Due")}</th>
                        <th>{t.si_createdBy}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map(inv=>{
                        const due = siRowDue(inv);
                        const matches = matchBlock(inv);
                        return (
                          <tr key={inv.id} className="pm-clickable" onClick={()=>siOpenInvoice(inv)} title={inv.note||""}>
                            <td className="si-strong" style={{ color:siAccent }}>{inv.invoiceNo}</td>
                            <td>{inv.invoiceDate}</td>
                            <td className={matches.length?"si-wrap":""} title={inv.customerName||""}>{inv.customerName||"—"}{matches}</td>
                            <td>{siExpiredBadge(inv)}{siBadge(inv.status)}</td>
                            {(isQuote||isDN) ? (
                              <td>{inv.convertedInvoiceNo ? <span style={{ color:"#15803d" }}>→ {inv.convertedInvoiceNo}</span> : (isQuote ? (inv.validUntil||"-") : "-")}</td>
                            ) : (
                              <>
                                <td className="si-num">{inv.items?.length||0}</td>
                                <td className="si-num si-strong">{siFmt2(inv.grandTotal)}</td>
                                <td className="si-num">{siN2(inv.amountPaid)>0?siFmt2(inv.amountPaid):"-"}</td>
                              </>
                            )}
                            <td className={`si-num${(isQuote||isDN)?" si-strong":due>0.01?" si-due":""}`}>
                              {(isQuote||isDN) ? siFmt2(inv.grandTotal) : due>0.01 ? siFmt2(due) : "-"}
                            </td>
                            <td title={inv.createdByName||""}>{inv.createdByName||"-"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
            </div>
          )}
        </div>

        <div className="si-statusbar">
          <span>{bnL?"দেখানো":"Showing"}: <b>{rows.length}</b>{openGroup?` · ${groupName(openGroup)}`:""}</span>
          <span>{bnL?"মোট":"Total"}: <b>{t.cur} {siFmt2(rowsSum.total)}</b></span>
          {!isQuote&&!isDN&&<span>{bnL?"বাকি":"Due"}: <b style={{ color:rowsSum.due>0.01?"#b91c1c":undefined }}>{t.cur} {siFmt2(rowsSum.due)}</b></span>}
          {rowsSum.drafts>0&&<span style={{ color:"#b45309" }}>{bnL?`${rowsSum.drafts}টি ড্রাফট মোটে ধরা হয়নি`:`${rowsSum.drafts} draft(s) not counted in totals`}</span>}
        </div>
      </div>
    );
  }

  // ══ DETAIL ══
  if (siView==="detail"&&selInv) {
    const inv=invoices.find(x=>x.id===selInv.id)||selInv;
    const isTax       = inv.invoiceType==="tax";
    const isInvCash   = inv.paymentMethod==="cash";
    const isInvDelivery = inv.invoiceType==="delivery";
    const { sub, disc, vat, grand, adjustment, roundOff } = siCalcTotals(inv.items||[], isTax&&!isInvDelivery, siInvoiceExtras(inv));
    const bal=grand-siN2(inv.amountPaid);
    const canEdit=siCanEditDoc(inv);
    // cash invoice is always fully paid → no mark paid button
    const canPay=!isQuote&&!isInvCash&&["confirmed","partial"].includes(inv.status);
    const canConvert=!!onConvertQuote&&((isQuote&&["draft","open"].includes(inv.status)&&!qtIsExpired(inv))||(isDN&&inv.status==="confirmed"));
    const related = kind==="sales" ? receipts.filter(r=>(r.allocations||[]).some(a=>a.invoiceId===inv.id)) : [];
    const paidOnBill = kind!=="sales" || ["draft","cancelled"].includes(inv.status) ? 0 : siR2(siN2(inv.amountPaid)
      - related.filter(r=>r.status!=="cancelled").reduce((s,r)=>s+siN2((r.allocations||[]).find(a=>a.invoiceId===inv.id)?.amount),0)
      - billReturns.filter(r=>r.status!=="cancelled"&&r.invoiceId===inv.id).reduce((s,r)=>s+siN2(r.appliedToInvoice),0));
    const typeLabel = { regular:t.si_regular, tax:t.si_tax, delivery:t.si_delivery }[inv.invoiceType] || inv.invoiceType || "-";
    const vRow = (label, value, opts={}) => (
      <div className="pm-form-row">
        <label className="pm-label">{label}</label>
        <div className={`si-val${opts.strong?" is-strong":""}`} style={opts.color?{ color:opts.color }:undefined}>{value}</div>
      </div>
    );
    const totalRows = [
      [t.si_subtotal, siFmt2(sub)],
      ...(disc>0?[[t.si_totalDiscount, `- ${siFmt2(disc)}`, "#b91c1c"]]:[]),
      ...(vat>0?[["VAT", `+ ${siFmt2(vat)}`, "#0e7490"]]:[]),
      ...(adjustment?[[bnL?"সমন্বয়":"Adjustment", `${adjustment>0?"+":"-"} ${siFmt2(Math.abs(adjustment))}`]]:[]),
      ...(roundOff?[["Round Off", `${roundOff>0?"+":"-"} ${siFmt2(Math.abs(roundOff))}`]]:[]),
    ];
    const back = () => siLeaveDetail();
    return (
      <div ref={siRootRef} className="si-root" style={siRootStyle}>
        <style>{PM_CSS}</style>
        <style>{SI_CSS}</style>
        {receiptWindow}

        <div className="pm-reference-title">
          <strong style={{ color:siAccent }}>{siDocTitle} — {inv.invoiceNo}</strong>
          <span>{siExpiredBadge(inv)}{siBadge(inv.status)}</span>
        </div>

        <div className="si-body">
          <div className="si-cols">
            <fieldset className="pm-panel">
              <legend className="pm-panel-legend">{bnL?"ডকুমেন্ট":"Document"}</legend>
              <div className="si-panel-body">
                {vRow(t.si_invoiceNo, inv.invoiceNo, { strong:true, color:siAccent })}
                {vRow(t.si_date, inv.invoiceDate||"-")}
                {!isQuote&&!isDN&&vRow(t.si_invoiceType, typeLabel)}
                {isQuote&&!isSO&&vRow(bnL?"মেয়াদ":"Valid until", `${inv.validUntil||"—"}${qtIsExpired(inv)?(bnL?" (মেয়াদ শেষ)":" (Expired)"):""}`, { color:qtIsExpired(inv)?"#b91c1c":undefined })}
                {isSO&&vRow(bnL?"ডেলিভারির তারিখ":"Delivery by", inv.validUntil||"—")}
                {!isSO&&inv.salesOrderNo&&vRow(bnL?"সেলস অর্ডার":"Sales Order", inv.salesOrderNo, { color:"#0e7490" })}
                {inv.jobOrderNo&&vRow(bnL?"জব কার্ড":"Job Card", inv.jobOrderNo, { color:"#c2410c" })}
                {!isQuote&&inv.deliveryNoteId&&vRow(bnL?"ডেলিভারি নোট":"Delivery Note", inv.deliveryNoteNo, { color:"#7e22ce" })}
                {!isQuote&&!inv.deliveryNoteId&&(inv.deliveryNoteNo||inv.vehicleNo)&&vRow(t.si_deliverySection, [inv.deliveryNoteNo, inv.vehicleNo].filter(Boolean).join(" · "))}
                {(isQuote||isDN)&&inv.convertedInvoiceNo&&vRow(isSO&&inv.status==="delivered"?(bnL?"ডেলিভারি নোট":"Delivery Note"):(bnL?"ইনভয়েস":"Invoice"), inv.convertedInvoiceNo, { strong:true, color:"#15803d" })}
                {!isQuote&&inv.quotationNo&&vRow(bnL?"কোটেশন":"Quotation", inv.quotationNo, { color:"#b45309" })}
                {inv.salesmanName&&vRow(bnL?"সেলসম্যান":"Salesman", inv.salesmanName)}
                {vRow(t.si_createdBy, inv.createdByName||"-")}
              </div>
            </fieldset>
            <fieldset className="pm-panel">
              <legend className="pm-panel-legend">{t.si_customer}</legend>
              <div className="si-panel-body">
                {vRow(bnL?"নাম":"Name", inv.customerName||"—", { strong:true })}
                {(()=>{ const code = inv.customerCode || (customers||[]).find(c=>c.id===inv.customerId)?.customerCode; return code ? vRow(bnL?"কোড":"Code", code) : null; })()}
                {vRow(bnL?"মোবাইল":"Mobile", inv.customerMobile||"-")}
                {vRow(bnL?"ঠিকানা":"Address", inv.customerAddress||"-")}
                {(isTax||inv.customerTrn)&&vRow("TRN", inv.customerTrn||"-")}
                {!isQuote&&!isDN&&siN2(inv.creditDays)>0&&vRow(bnL?"বাকির দিন":"Credit Days", inv.creditDays)}
                {inv.note&&<div className="si-note">📝 {inv.note}</div>}
              </div>
            </fieldset>
          </div>

          <fieldset className="pm-panel">
            <legend className="pm-panel-legend">📦 {t.si_items} ({inv.items?.length||0})</legend>
            <div className="si-panel-body">
              <SiItemsTable items={inv.items||[]} lang={lang} isTax={isTax&&!isInvDelivery} showDisc={!isInvDelivery} />
            </div>
          </fieldset>

          <div className="si-cols">
            <fieldset className="pm-panel">
              <legend className="pm-panel-legend">{t.si_summary}</legend>
              <div className="si-panel-body">
                {totalRows.map(([l,v,c],i)=>(
                  <div key={i} className="si-total-row"><span>{l}</span><b style={c?{ color:c }:undefined}>{t.cur} {v}</b></div>
                ))}
                <div className="si-total-row is-grand"><span>{t.si_grandTotal}</span><span style={{ color:siAccent }}>{t.cur} {siFmt2(grand)}</span></div>
              </div>
            </fieldset>
            {!isQuote&&!isDN&&(
              <fieldset className="pm-panel">
                <legend className="pm-panel-legend">💳 {t.si_payment}</legend>
                <div className="si-panel-body">
                  <div className="si-total-row"><span>{t.si_paymentMethod}</span><b>{SI_PAY[inv.paymentMethod]?.icon} {SI_PAY[inv.paymentMethod]?.[lang]||"-"}</b></div>
                  {isInvCash ? (
                    <div className="si-paid-box"><span>✅ {bnL?"নগদে সম্পূর্ণ পরিশোধিত":"Fully paid (cash)"}</span><span>{t.cur} {siFmt2(inv.amountPaid||grand)}</span></div>
                  ) : !isInvDelivery && (
                    <>
                      <div className="si-total-row"><span>{t.si_amountPaid}</span><b style={{ color:"#15803d" }}>{t.cur} {siFmt2(inv.amountPaid)}</b></div>
                      <div className={`si-paid-box${bal>0.01?" is-due":""}`}><span>{t.si_balanceDue}</span><span>{t.cur} {siFmt2(Math.max(0,bal))}</span></div>
                    </>
                  )}
                  {related.length>0&&(
                    <div className="pm-table-wrap" style={{ marginTop:3 }}>
                      <table className="pm-table">
                        <colgroup><col /><col style={{ width:80 }} /><col style={{ width:84 }} /></colgroup>
                        <thead><tr><th>💰 {bnL?"রিসিট":"Receipt"}</th><th>{t.si_date}</th><th className="si-num">{bnL?"টাকা":"Amount"}</th></tr></thead>
                        <tbody>
                          {related.map(r=>{
                            const amt=(r.allocations||[]).find(a=>a.invoiceId===inv.id)?.amount||0;
                            const off=r.status==="cancelled";
                            return (
                              <tr key={r.id} className="pm-clickable" style={off?{ opacity:0.55 }:undefined} onClick={()=>setReceiptWin({ viewId:r.id })}>
                                <td>{r.receiptNo} {PI_VOUCHER_METHODS[r.method]?.icon||"💵"}{off?(bnL?" (বাতিল)":" (cancelled)"):""}</td>
                                <td>{r.receiptDate}</td>
                                <td className="si-num si-strong" style={off?{ textDecoration:"line-through" }:{ color:"#15803d" }}>{siFmt2(amt)}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </fieldset>
            )}
          </div>
        </div>

        <div className="si-actions">
          <button type="button" className="pm-btn-secondary" onClick={back}>← {bnL?"তালিকা":"List"}</button>
          <button type="button" className="pm-btn pm-btn--primary" onClick={()=>siPrint(inv)}>🖨️ {bnL?"প্রিন্ট":"Print"}</button>
          {paidOnBill>0.01&&<button type="button" className="pm-btn" onClick={()=>printMoneyReceipt(inv, paidOnBill, shop, lang)} title={bnL?"বিলের সাথে নেওয়া টাকার রশিদ":"Receipt for the money taken with this bill"}>🧾 {bnL?"মানি রিসিট":"Money Receipt"}</button>}
          {canConvert&&isSO&&onConvertToDN&&<button type="button" className="pm-btn" onClick={()=>onConvertToDN(inv)}>🚚 {bnL?"ডেলিভারি নোট বানান":"Make Delivery Note"}</button>}
          {canConvert&&<button type="button" className="pm-btn" onClick={()=>onConvertQuote(inv)}>🧾 {bnL?"ইনভয়েসে রূপান্তর":"Convert to Invoice"}</button>}
          {canEdit&&<button type="button" className="pm-btn" onClick={()=>siOpenEdit(inv)}>✏️ {bnL?"এডিট":"Edit"}</button>}
          {canPay&&kind==="sales"&&<button type="button" className="pm-btn" onClick={()=>setReceiptWin({ partyId:inv.customerId||null, partyName:inv.customerName||"", invoiceId:inv.id })}>💰 {bnL?"টাকা গ্রহণ":"Receive Payment"}</button>}
          {canCancelInv&&["confirmed","partial","paid","draft","open"].includes(inv.status)&&<button type="button" className="pm-btn pm-btn--danger" onClick={()=>siCancel(inv)}>{bnL?"বাতিল":"Cancel"}</button>}
          {siCanDeleteDoc(inv)&&<button type="button" className="pm-btn pm-btn--danger" onClick={()=>siDelete(inv)}>🗑 {bnL?"মুছুন":"Delete"}</button>}
          {isOwner&&!["draft","cancelled"].includes(inv.status)&&<span className="si-hint">{bnL?"মুছতে চাইলে আগে বাতিল করুন (স্টক ঠিক থাকবে)":"To delete, cancel first (keeps stock correct)"}</span>}
          {!canEdit&&!isOwner&&["confirmed","paid","partial"].includes(inv.status)&&related.some(r=>r.status!=="cancelled")&&(
            <span className="si-hint">{bnL?"টাকা নেওয়া হয়েছে — এডিট করতে আগে রিসিট বাতিল করুন":"Payment received — cancel the receipt first to edit"}</span>
          )}
        </div>
      </div>
    );
  }

  // ══ FORM ══
  if (wideDesktop) return (
    <div style={{ position:"fixed", inset:siWin.max?0:"28px 40px", zIndex:1500, background:"#c7d8ee", padding:siWin.max?6:"0 6px 6px", boxSizing:"border-box", overflowX:"auto", overflowY:"hidden", display:"flex", flexDirection:"column", border:siWin.max?"none":"1px solid #2854ad", boxShadow:siWin.max?"none":"0 18px 50px rgba(2,6,23,0.45)" }}>
      <div onDoubleClick={siWin.toggleMax} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:8, margin:siWin.max?"-6px -6px 6px":"0 -6px 6px", padding:"4px 6px 4px 12px", background:"linear-gradient(180deg,#3f69bd,#2854ad)", color:"#fff", fontSize:13, fontWeight:800, userSelect:"none", flexShrink:0, fontFamily:"Segoe UI, Tahoma, sans-serif" }}>
        <span>{isSO?"SALES ORDER":isQuote?"QUOTATION":isDN?"DELIVERY NOTE":"SALES INVOICE"}{siInvoiceNo?` — ${siInvoiceNo}`:""}</span>
        <WindowButtons win={siWin} lang={lang} onClose={()=>{ if (siLeaveUnsavedOk()) setSiView("list"); }} />
      </div>
      {siBatchAsk&&<BatchPickModal lang={lang} product={siBatchAsk.product} choices={siBatchAsk.choices} onPick={c=>siBatchAsk.resolve(c)} onClose={()=>siBatchAsk.resolve(null)} />}
      {showCustPicker&&(
        <PartyPickerWindow title="Select Customer" columns={CUSTOMER_PICKER_COLS} items={siPickCustomers} lang={lang}
          partyWord="customer" modalId="customer-picker"
          onPick={(c)=>{ siSelectCustomer(c); setTimeout(()=>siNameRef.current?.focus(), 60); }}
          onClose={()=>{ setShowCustPicker(false); setTimeout(()=>siNameRef.current?.focus(), 30); }}
          onQuickAdd={canManageCustomers ? siQuickAddCustomer : null} />
      )}
      <SalesInvoiceDesktopForm
        lang={lang} t={t} shopId={shopId} products={products} customers={siPickCustomers} onSelectCustomer={siSelectCustomer} team={team} invoices={invoices}
        form={siForm} setField={siUpd} lines={siLines} setLines={setSiLines} current={siCurrent} setCurrent={setSiCurrent}
        totals={totals} formPaid={formPaid} balance={balance}
        invoiceNo={siInvoiceNo} editInvId={editInvId} saving={siSaving} nameRef={siNameRef} qtyRef={siQtyRef}
        helpers={{ siCalcLine, siFmt2, siN2, siUnitOptionsFor, SI_PAY, SI_STATUSES:STATUSES, emptyCurrent:siEmptyCurrent }}
        kind={kind}
        sourceQuoteNo={sourceQuote?.invoiceNo||""}
        sourceIsDN={sourceQuote?.docKind==="delivery"}
        sourceKind={sourceQuote?.docKind||""}
        onConvertQuote={(isQuote||isDN)&&onConvertQuote ? (inv)=>{ if (siLeaveUnsavedOk()) onConvertQuote(inv); } : undefined}
        onConvertToDN={isSO&&onConvertToDN ? (inv)=>{ if (siLeaveUnsavedOk()) onConvertToDN(inv); } : undefined}
        onSelectProduct={siSelectProduct} onChangeCurrentUnit={siChangeCurrentUnit} onAddCurrent={siAddCurrentItem} onDelLine={siDelLine}
        onOpenCustomerPicker={()=>setShowCustPicker(true)}
        onConfirm={siConfirm} onSaveDraft={siSaveDraft}
        onClose={()=>{ if (siLeaveUnsavedOk()) setSiView("list"); }}
        onNew={()=>{ if (siLeaveUnsavedOk()) siOpenNew(); }}
        onOpenInvoice={siOpenFromDesktop}
        onCancelInvoice={canCancelInv ? async (inv)=>{ if (await siCancel(inv)) setSiView("detail"); } : undefined}
        onDeleteInvoice={(inv)=>{ if (siCanDeleteDoc(inv)) siDelete(inv); }}
        canDeleteInvoice={siCanDeleteDoc}
        canDiscount={canDiscount}
        canSeeCost={canSeeCost}
        onPrintInvoice={(inv)=>siPrint(inv)}
        onOpenProductMaster={onOpenProductMaster}
        toast={toast}
      />
    </div>
  );


  const pmInputStyle = siMobile
    ? { width:"100%", height:42, padding:"6px 10px", border:"1px solid #cbd5e1", borderRadius:8, background:"#fff", color:"#07101c", font:"15px Tahoma, Arial, sans-serif", outline:"none", boxSizing:"border-box" }
    : { width:"100%", height:20, padding:"1px 4px", border:"1px solid #8797a9", borderRadius:0, background:"#fff", color:"#07101c", font:"11px Tahoma, Arial, sans-serif", outline:"none", boxSizing:"border-box" };
  const fPanel = (title, children, extra) => (
    <fieldset className="pm-panel">
      <legend className="pm-panel-legend">{title}{extra}</legend>
      <div className="si-panel-body">{children}</div>
    </fieldset>
  );
  const fRow = (label, control) => (
    <div className="pm-form-row"><label className="pm-label">{label}</label>{control}</div>
  );
  const fField = (label, control) => (
    <div className="si-field"><label className="pm-label">{label}</label>{control}</div>
  );
  const formTitle = isSO
    ? (editInvId?(bnL?"সেলস অর্ডার এডিট":"EDIT SALES ORDER"):(bnL?"নতুন সেলস অর্ডার":"NEW SALES ORDER"))
    : isQuote
    ? (editInvId?(bnL?"কোটেশন এডিট":"EDIT QUOTATION"):(bnL?"নতুন কোটেশন":"NEW QUOTATION"))
    : isDN
    ? (editInvId?(bnL?"ডেলিভারি নোট এডিট":"EDIT DELIVERY NOTE"):(bnL?"নতুন ডেলিভারি নোট":"NEW DELIVERY NOTE"))
    : (editInvId?(bnL?"ইনভয়েস এডিট":"EDIT SALES INVOICE"):(bnL?"নতুন সেলস ইনভয়েস":"NEW SALES INVOICE"));
  const selectedType = mobileTypeOptions.find(([type])=>type===siForm.invoiceType);
  const priceCols = formIsTax&&!formIsDelivery ? (canDiscount?"minmax(0,1fr) 70px 62px":"minmax(0,1fr) 62px") : (!formIsDelivery&&canDiscount ? "minmax(0,1fr) 70px" : "1fr");
  const summaryRows = [
    [t.si_subtotal, siFmt2(totals.sub)],
    ...(totals.disc>0?[[t.si_totalDiscount, `- ${siFmt2(totals.disc)}`, "#b91c1c"]]:[]),
    ...(totals.vat>0?[["VAT", `+ ${siFmt2(totals.vat)}`, "#0e7490"]]:[]),
    ...(totals.adjustment?[[bnL?"সমন্বয়":"Adjustment", `${totals.adjustment>0?"+":"-"} ${siFmt2(Math.abs(totals.adjustment))}`]]:[]),
    ...(totals.roundOff?[["Round Off", `${totals.roundOff>0?"+":"-"} ${siFmt2(Math.abs(totals.roundOff))}`]]:[]),
  ];
  const closeForm = ()=>{ if (siLeaveUnsavedOk()) setSiView("list"); };

  return (
    <div ref={siRootRef} className="si-root" style={siRootStyle}>
      <style>{PM_CSS}</style>
      {siBatchAsk&&<BatchPickModal lang={lang} product={siBatchAsk.product} choices={siBatchAsk.choices} onPick={c=>siBatchAsk.resolve(c)} onClose={()=>siBatchAsk.resolve(null)} />}
      <style>{SI_CSS}</style>
      {showCustPicker&&<SiCustomerPicker {...customerPickerProps} />}

      <div className="pm-reference-title">
        <strong style={{ color:siAccent }}>{formTitle}{sourceQuote?` (${sourceQuote.invoiceNo})`:""}</strong>
        <span>{siInvoiceNo}</span>
      </div>

      <div className="si-body">
        {mobileTypeOptions.length>1&&fPanel(t.si_invoiceType, <>
          <select className="pm-input" value={siForm.invoiceType} onChange={e=>siUpd("invoiceType",e.target.value)}>
            {mobileTypeOptions.map(([type,icon,label])=><option key={type} value={type}>{icon} {label}</option>)}
          </select>
          {selectedType&&<div className="pm-hint">{selectedType[3]}</div>}
        </>)}

        {fPanel(`${t.si_invoiceNo} & ${t.si_date}`, <>
          {fRow(t.si_invoiceNo, <div className="si-val is-strong" style={{ color:siAccent, fontFamily:"Consolas, monospace" }}>{siInvoiceNo}</div>)}
          {fRow(t.si_date, <input type="date" className="pm-input" value={siForm.invoiceDate} onChange={e=>siUpd("invoiceDate",e.target.value)} />)}
          {isQuote&&fRow(isSO?(bnL?"ডেলিভারির তারিখ":"Delivery by"):(bnL?"মেয়াদ":"Valid Until"), <input type="date" className="pm-input" value={siForm.validUntil||""} onChange={e=>siUpd("validUntil",e.target.value)} />)}
        </>)}

        {fPanel(t.si_customer, <>
          <button type="button" className="pm-btn" style={{ width:"100%", minHeight:siMobile?36:24, textAlign:"left" }} onClick={()=>setShowCustPicker(true)}>
            {siForm.customerId ? `✅ ${siForm.customerName} — ${bnL?"বদলান":"change"}` : `👥 ${t.si_selectCustomer}`}
          </button>
          {fRow(bnL?"নাম":"Name", <input className="pm-input" placeholder={t.si_customerManual} value={siForm.customerName} onChange={e=>{
            siUpd("customerName",e.target.value);
            if (siForm.customerId) ["customerId","customerMobile","customerAddress","customerTrn","customerType","creditDays"].forEach(f=>siUpd(f,""));
          }} />)}
          {fRow(bnL?"মোবাইল":"Mobile", <input className="pm-input" inputMode="tel" value={siForm.customerMobile} onChange={e=>siUpd("customerMobile",e.target.value)} />)}
          {fRow(bnL?"ঠিকানা":"Address", <input className="pm-input" value={siForm.customerAddress} onChange={e=>siUpd("customerAddress",e.target.value)} />)}
          {siForm.invoiceType==="tax"&&fRow("TRN", <input className="pm-input" style={{ fontFamily:"Consolas, monospace" }} placeholder="100XXXXXXXXXXXX" value={siForm.customerTrn} onChange={e=>siUpd("customerTrn",e.target.value)} />)}
        </>)}

        {fPanel(`📦 ${t.si_items}`, <>
          <div className="si-entry">
            {fField(t.si_itemName, (
              <ProductTypeaheadInput
                products={products}
                value={siCurrent.name}
                onChange={(value)=>setSiCurrent((p)=>({ ...p, name:value, productId:null }))}
                onSelectProduct={siSelectProduct}
                field="name"
                inputRef={siNameRef}
                placeholder={t.si_itemName}
                th={PM_TH}
                lang={lang}
                onKeyDown={(e)=>e.key==="Enter"&&siAddCurrentItem()}
                style={{ ...pmInputStyle, fontWeight:700 }}
              />
            ))}
            <div className="si-grid2">
              {fField("Code / Model", (
                <ProductTypeaheadInput
                  products={products}
                  value={siCurrent.code}
                  onChange={(value)=>setSiCurrent((p)=>({ ...p, code:value }))}
                  onSelectProduct={siSelectProduct}
                  field="code"
                  placeholder="Code / Model"
                  th={PM_TH}
                  lang={lang}
                  onKeyDown={(e)=>e.key==="Enter"&&siAddCurrentItem()}
                  style={pmInputStyle}
                />
              ))}
              {fField(t.si_brand, <input className="pm-input" value={siCurrent.brand} onChange={e=>setSiCurrent(p=>({...p,brand:e.target.value}))} />)}
            </div>
            {siCurrent.productId && !isQuote && (()=>{
              const prod = siFindProduct(siCurrent.productId);
              const inBill = [...siLines.filter(it=>it.productId===siCurrent.productId && it.id!==siEditLineId), siCurrent].reduce((sum,it)=>sum+itemBaseQty(it, prod),0);
              return <StockBadge product={prod} products={products} shopId={shopId} refreshKey={invoices} lang={lang} extraQty={editInvId ? 0 : inBill} />;
            })()}
            {siCurrent.productId && (
              <ProductInvoiceEntryInfo
                product={siFindProduct(siCurrent.productId)}
                lang={lang}
                fmt={siFmt2}
                canSeeCost={canSeeCost}
              />
            )}
            {siCurrent.productId && (()=>{
              const spec = salesSpecs(siFindProduct(siCurrent.productId));
              return spec ? (
                <div style={{ margin:"6px 0", padding:"6px 10px", background:"#fff8db", border:"1px solid #e6c65c", borderRadius:6, fontSize:13, fontWeight:700, color:"#5b4300", lineHeight:1.5 }}>
                  📐 {spec}
                </div>
              ) : null;
            })()}
            {siCurrent.productId && (siForm.customerId || String(siForm.customerName||"").trim()) && (()=>{
              const custName = String(siForm.customerName||"").trim().toLowerCase();
              const history = invoices
                .filter(inv => inv.id!==editInvId && !["cancelled","draft"].includes(inv.status)
                  && (siForm.customerId ? inv.customerId===siForm.customerId : !inv.customerId && String(inv.customerName||"").trim().toLowerCase()===custName))
                .flatMap(inv => (inv.items||[]).filter(it=>it.productId===siCurrent.productId).map(it=>({ inv, it })))
                .sort((a,b)=>String(b.inv.invoiceDate||"").localeCompare(String(a.inv.invoiceDate||"")))
                .slice(0,3);
              if (!history.length) return <div className="pm-hint">🕘 {bnL?"এই কাস্টমারকে আগে এই পণ্য বিক্রি হয়নি":"Not sold to this customer before"}</div>;
              return (
                <div className="si-history">
                  <div className="pm-label" style={{ color:"#15803d" }}>🕘 {bnL?"এই কাস্টমারকে আগের দাম (চাপ দিলে বসবে)":"Previous price to this customer (tap to use)"}</div>
                  {history.map(({ inv, it }, i)=>{
                    const { disc, gross } = siCalcLine(it, false);
                    const qty = siN2(it.qty);
                    const net = qty>0 ? (gross - disc)/qty : siN2(it.unitPrice);
                    return (
                      <button key={i} type="button"
                        onClick={()=>setSiCurrent(p=>({ ...p, unit:it.unit||p.unit, unitPrice:String(it.unitPrice??p.unitPrice), discountPerc:String(it.discountPerc??p.discountPerc??"0") }))}>
                        <span className="si-muted">{inv.invoiceDate} · {inv.invoiceNo}</span>
                        <b style={{ color:"#15803d", whiteSpace:"nowrap" }}>{siFmt2(qty)} {it.unit||""} × {t.cur} {siFmt2(net)}</b>
                      </button>
                    );
                  })}
                </div>
              );
            })()}
            <div className="si-grid2">
              {fField(t.si_qty, <input className="pm-input" style={{ textAlign:"center" }} inputMode="decimal" placeholder="1" value={siCurrent.qty}
                ref={siQtyRef}
                onChange={e=>setSiCurrent(p=>({...p,qty:e.target.value}))}
                onKeyDown={e=>e.key==="Enter"&&siAddCurrentItem()} />)}
              {fField(t.si_unit, (
                <select className="pm-input" value={siCurrent.unit} onChange={e=>siChangeCurrentUnit(e.target.value)}>
                  {siUnitOptionsFor(siFindProduct(siCurrent.productId), siCurrent.unit).map(u=><option key={u} value={u}>{u}</option>)}
                </select>
              ))}
            </div>
            <div className="si-grid3" style={{ gridTemplateColumns:priceCols }}>
              {fField(`${t.si_unitPrice} (${t.cur})`, <input className="pm-input" style={{ fontWeight:700 }} inputMode="decimal" placeholder="0.00" value={siCurrent.unitPrice}
                onChange={e=>setSiCurrent(p=>({...p,unitPrice:e.target.value}))}
                onKeyDown={e=>e.key==="Enter"&&siAddCurrentItem()} />)}
              {!formIsDelivery&&canDiscount&&fField(t.si_discPerc, <input className="pm-input" inputMode="decimal" placeholder="0" value={siCurrent.discountPerc} onChange={e=>setSiCurrent(p=>({...p,discountPerc:e.target.value}))} />)}
              {formIsTax&&!formIsDelivery&&fField("VAT%", <input className="pm-input" inputMode="decimal" placeholder="5" value={siCurrent.vatPerc} onChange={e=>setSiCurrent(p=>({...p,vatPerc:e.target.value}))} />)}
            </div>
            <div style={{ display:"flex", gap:4, alignItems:"center" }}>
              <button type="button" className="pm-btn pm-btn--primary" style={{ flex:1, minHeight:siMobile?38:24 }} onClick={siAddCurrentItem}>
                {siEditLineId ? (bnL?"✅ আপডেট করুন":"✅ Update Item") : (bnL?"✅ পণ্য যোগ করুন":"✅ Add Item")}
              </button>
              {siEditLineId&&<button type="button" className="pm-btn-secondary" style={{ minHeight:siMobile?38:24 }} onClick={()=>{ setSiEditLineId(null); setSiCurrent(siEmptyCurrent()); }}>{bnL?"বাদ":"Cancel"}</button>}
              {(siN2(siCurrent.qty)>0&&siN2(siCurrent.unitPrice)>0)&&(
                <b style={{ color:siAccent, whiteSpace:"nowrap" }}>= {t.cur} {siFmt2(siCalcLine(siCurrent, formIsTax&&!formIsDelivery).total)}</b>
              )}
            </div>
          </div>
          {siLines.length===0
            ? <div className="pm-hint" style={{ textAlign:"center" }}>{bnL?"↑ উপরে পণ্য যোগ করুন":"↑ Add items above"}</div>
            : <SiItemsTable items={siLines} lang={lang} isTax={formIsTax&&!formIsDelivery} showDisc={!formIsDelivery}
                editId={siEditLineId}
                onEdit={(item)=>{
                  setSiCurrent({ productId:item.productId||null, name:item.name, code:item.code||"", brand:item.brand||"", qty:String(item.qty), unit:item.unit||"Pcs", unitPrice:String(item.unitPrice||""), discountPerc:String(item.discountPerc||"0"), discountFlat:siN2(item.discountFlat)>0?String(item.discountFlat):"", vatPerc:item.vatPerc!=null&&item.vatPerc!==""?String(item.vatPerc):"5", batchNo:item.batchNo||"", ...(item.isService?{ isService:true }:{}) });
                  setSiEditLineId(item.id);
                  setTimeout(()=>siNameRef.current?.focus(), 80);
                }}
                onDelete={(item)=>{ setSiLines(p=>p.filter(x=>x.id!==item.id)); if (siEditLineId===item.id) { setSiEditLineId(null); setSiCurrent(siEmptyCurrent()); } }} />}
        </>, siLines.length>0 ? ` (${siLines.length})` : "")}

        {!formIsDelivery&&siLines.length>0&&fPanel(bnL?"বিলের ছাড় ও সমন্বয়":"Bill Discount & Adjustment", (
          <div className="si-grid2">
            {[
              ["billDiscPerc", bnL?"বিলের ছাড় %":"Bill Disc %", !canDiscount, "decimal"],
              ["billDiscAmt", bnL?"বিলের ছাড় টাকা":"Bill Disc Amt", !canDiscount || siN2(siForm.billDiscPerc)>0, "decimal"],
              ["adjustment", bnL?"সমন্বয় (+/-)":"Adjustment (+/-)", false, "text"],
              ["roundOff", "Round Off", false, "text"],
              ...(!isQuote?[["creditDays", bnL?"বাকির দিন":"Credit Days", false, "numeric"]]:[]),
            ].map(([key,label,disabled,mode])=>(
              <div key={key}>{fField(label, <input className="pm-input" inputMode={mode} disabled={disabled} placeholder="0" value={siForm[key]||""}
                title={disabled&&!canDiscount&&key.startsWith("billDisc")?(bnL?"ডিসকাউন্টের অনুমতি নেই":"No discount permission"):undefined}
                onChange={e=>setSiForm(p=>({ ...p, [key]:e.target.value, ...(key==="billDiscPerc"&&e.target.value?{ billDiscAmt:"" }:{}) }))} />)}</div>
            ))}
          </div>
        ))}

        {fPanel(`📊 ${t.si_summary}`, <>
          {summaryRows.map(([l,v,c],i)=>(
            <div key={i} className="si-total-row"><span>{l}</span><b style={c?{ color:c }:undefined}>{t.cur} {v}</b></div>
          ))}
          <div className="si-total-row is-grand"><span>{t.si_grandTotal}</span><span style={{ color:siAccent }}>{t.cur} {siFmt2(totals.grand)}</span></div>
        </>)}

        {!formIsDelivery&&!isQuote&&fPanel(`💳 ${t.si_payment}`, <>
          {fRow(bnL?"পেমেন্টের ধরন":"Payment method", (
            <select className="pm-input" value={siForm.paymentMethod} onChange={e=>{
              const key = e.target.value;
              // Switching away from cash: clear auto-filled paid amount
              if (siForm.paymentMethod==="cash" && key!=="cash") setSiForm(p=>({...p, paymentMethod:key, amountPaid:""}));
              else siUpd("paymentMethod",key);
            }}>
              {Object.entries(SI_PAY).map(([key,pm])=><option key={key} value={key}>{pm.icon} {pm[lang]}</option>)}
            </select>
          ))}
          {formIsCash ? (
            <div className="si-paid-box"><span>✅ {bnL?"নগদে সম্পূর্ণ পরিশোধিত":"Fully paid (cash)"}</span><span>{t.cur} {siFmt2(totals.grand)}</span></div>
          ) : (
            <>
              {fRow(t.si_amountPaid, (
                <div style={{ display:"flex", gap:4 }}>
                  <input className="pm-input" inputMode="decimal" placeholder="0.00" value={siForm.amountPaid} onChange={e=>siUpd("amountPaid",e.target.value)} />
                  {totals.grand>0&&<button type="button" className="pm-btn-secondary" onClick={()=>siUpd("amountPaid",siFmt2(totals.grand))}>{bnL?"পুরো":"Full"}</button>}
                </div>
              ))}
              {totals.grand>0&&<div className={`si-paid-box${balance>0.01?" is-due":""}`}><span>{t.si_balanceDue}</span><span>{t.cur} {siFmt2(balance)}</span></div>}
            </>
          )}
        </>)}

        {!isQuote&&fPanel(`🚚 ${t.si_deliverySection}`, <>
          {fRow(t.si_deliveryNote, <input className="pm-input" placeholder="DN-0001" value={siForm.deliveryNoteNo} onChange={e=>siUpd("deliveryNoteNo",e.target.value)} />)}
          {fRow(t.si_vehicleNo, <input className="pm-input" placeholder="ABC-1234" value={siForm.vehicleNo} onChange={e=>siUpd("vehicleNo",e.target.value)} />)}
        </>)}

        {fPanel(`📝 ${t.si_note}`, (
          <AutoTA className="pm-input" style={{ height:"auto", minHeight:siMobile?64:42 }} placeholder={t.si_notePh} value={siForm.note} onChange={e=>siUpd("note",e.target.value)} />
        ))}
      </div>

      <div className="si-actions si-sticky-actions">
        <button type="button" className="pm-btn pm-btn--primary" onClick={siConfirm} disabled={siSaving}>
          {siSaving?"...":(isSO?(bnL?"✓ অর্ডার সেভ":"✓ Save Order"):isQuote?(bnL?"✅ কোটেশন সেভ":"✅ Save Quotation"):isDN?(bnL?"✅ ডেলিভারি নোট সেভ":"✅ Save Delivery Note"):(bnL?"✅ ইনভয়েস নিশ্চিত":"✅ Confirm Invoice"))}
        </button>
        <button type="button" className="pm-btn-secondary" onClick={siSaveDraft} disabled={siSaving}>{bnL?"ড্রাফট সেভ":"Save Draft"}</button>
        <button type="button" className="pm-btn pm-btn--danger" onClick={closeForm}>{bnL?"বাতিল":"Cancel"}</button>
      </div>
    </div>
  );
}
