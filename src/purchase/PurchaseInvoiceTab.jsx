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

export const PMT_PREFIX      = "PMT-";

export const PI_UNITS        = ["Pcs","Set","Nos","Kg","Ltr","Box","Cm","Mtr","Dz"];

export const PI_PAY_METHODS  = {
  cash:   { bn:"নগদ",            en:"Cash",          icon:"💵" },
  bank:   { bn:"ব্যাংক ট্রান্সফার", en:"Bank Transfer",  icon:"🏦" },
  cheque: { bn:"চেক",             en:"Cheque",         icon:"📃" },
  credit: { bn:"বাকি (ক্রেডিট)",  en:"Credit",         icon:"📅" },
};

export const VOUCHER_CARD_TYPES = ["Visa", "Mastercard", "American Express", "Debit Card", "Other"];

export const PI_CHEQUE_STATUSES = {
  pending:  { bn:"⏳ অপেক্ষমান",      en:"⏳ Pending",  color:"#f59e0b", bg:"#451a03" },
  cleared:  { bn:"✅ ক্লিয়ার হয়েছে",  en:"✅ Cleared",  color:"#22c55e", bg:"#052e16" },
  bounced:  { bn:"❌ বাউন্স হয়েছে",   en:"❌ Bounced",  color:"#ef4444", bg:"#450a0a" },
};

export const PI_STATUSES = {
  draft:     { bn:"ড্রাফট",        en:"Draft",     color:"#f59e0b", bg:"#451a03" },
  confirmed: { bn:"নিশ্চিত",       en:"Confirmed", color:"#06b6d4", bg:"#083344" },
  partial:   { bn:"আংশিক পরিশোধ", en:"Partial",   color:"#a855f7", bg:"#2e1065" },
  paid:      { bn:"পরিশোধিত",     en:"Paid",      color:"#22c55e", bg:"#052e16" },
  cancelled: { bn:"বাতিল",        en:"Cancelled", color:"#71717a", bg:"#27272a" },
};

export const piToday    = () => localIsoDate();

export function piCalcLine(it) {
  const qty=piN2(it.qty), cost=piN2(it.unitCost), dp=Math.min(Math.max(piN2(it.discountPerc),0),100), tp=Math.max(piN2(it.taxPerc),0);
  const gross=piR2(qty*cost), disc=piR2(gross*dp/100), base=piR2(gross-disc), tax=piR2(base*tp/100);
  return { gross, disc, tax, total:piR2(base+tax) };
}

export function piCalcTotals(items) {
  let sub=0,disc=0,tax=0,grand=0;
  items.forEach(it=>{ const c=piCalcLine(it); sub+=c.gross; disc+=c.disc; tax+=c.tax; grand+=c.total; });
  return { sub:piR2(sub), disc:piR2(disc), tax:piR2(tax), grand:piR2(grand) };
}

export function piEmptyLine() {
  return { id:`${Date.now()}-${Math.random().toString(36).slice(2,8)}`, productId:null, name:"", code:"", brand:"", qty:"", unit:"Pcs", unitCost:"", discountPerc:"0", taxPerc:"5", salePrice:"" };
}

export function piEmptyCurrent() {
  return { productId:null, name:"", code:"", brand:"", qty:"", unit:"Pcs", unitCost:"", discountPerc:"0", taxPerc:"5", salePrice:"" };
}

export function piEmptyForm() {
  return { invoiceDate:piToday(), supplierInvoiceNo:"", refNo:"", currency:"", exchangeRate:"", vendorId:"", vendorName:"", vendorMobile:"", paymentMethod:"cash", amountPaid:"", note:"" };
}

// ─── PI: PRODUCT PICKER MODAL ─────────────────────────────────
export function PiProductPicker({ products, onSelect, onClose, t, th }) {
  const [q,setQ]=useState("");
  const filtered=products.filter(p=>{
    if (!q) return true;
    const hay = [p.name,p.code,p.brand,p.category,p.barcode,...(p.moreBarcodes||[])].filter(Boolean).join(" ");
    return nsmatch(hay, q);
  });
  const inp={ padding:"10px 12px", borderRadius:8, border:`1px solid ${th.borderMid}`, background:th.bgInp, color:th.txtPrimary, fontSize:14, outline:"none", width:"100%", boxSizing:"border-box", fontFamily:"inherit" };
  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.85)", zIndex:10000, display:"flex", alignItems:"flex-end", justifyContent:"center" }}>
      <div style={{ width:"100%", maxWidth:600, background:th.bgCard, borderRadius:"16px 16px 0 0", maxHeight:"70vh", display:"flex", flexDirection:"column", border:`1px solid ${th.border}` }}>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"14px 16px", borderBottom:`1px solid ${th.border}` }}>
          <span style={{ fontSize:14, fontWeight:700, color:th.txtPrimary }}>{t.pi_fromMaster}</span>
          <button onClick={onClose} style={{ background:"none", border:"none", color:th.txtMuted, cursor:"pointer", fontSize:20, lineHeight:1 }}>✕</button>
        </div>
        <div style={{ padding:"10px 14px", borderBottom:`1px solid ${th.border}` }}>
          <input autoFocus style={inp} placeholder={t.pi_pmSearchPh} value={q} onChange={e=>setQ(e.target.value)} />
        </div>
        <div style={{ overflowY:"auto", flex:1 }}>
          {filtered.length===0&&<div style={{ textAlign:"center", padding:"30px 20px", color:th.txtFaint, fontSize:13 }}>{t.pi_noResults}</div>}
          {filtered.map(p=>(
            <button key={p.id} onClick={()=>onSelect(p)} style={{ width:"100%", textAlign:"left", padding:"12px 16px", background:"transparent", border:"none", borderBottom:`1px solid ${th.border}`, color:th.txtSecondary, cursor:"pointer", fontFamily:"inherit" }}>
              <div style={{ fontSize:13, fontWeight:700, color:th.txtPrimary }}>{p.name}</div>
              <div style={{ fontSize:11, color:th.txtMuted, marginTop:3, display:"flex", gap:8, flexWrap:"wrap" }}>
                {p.code&&<span>📋 {p.code}</span>}
                {p.brand&&<span>🏷️ {p.brand}</span>}
                {p.category&&<span>🗂️ {p.category}</span>}
                {p.vatExclusive&&<span style={{ color:"#22c55e" }}>{t.cur}{p.vatExclusive}</span>}
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── PI: ITEMS TABLE ──────────────────────────────────────────
export function PiItemsTable({ items, lang, onEdit, onDelete, editId }) {
  const bn = lang==="bn";
  return (
    <div className="pm-table-wrap">
      <table className="pm-table">
        <colgroup><col style={{ width:24 }} /><col /><col style={{ width:58 }} /><col style={{ width:66 }} /><col style={{ width:76 }} /></colgroup>
        <thead><tr>
          <th className="si-center">#</th>
          <th>{bn?"পণ্য":"Item"}</th>
          <th className="si-num">{bn?"পরিমাণ":"Qty"}</th>
          <th className="si-num">{bn?"দাম":"Cost"}</th>
          <th className="si-num">{bn?"মোট":"Total"}</th>
        </tr></thead>
        <tbody>
          {items.map((it,i)=>{
            const { disc, tax, total } = piCalcLine(it);
            return (
              <tr key={it.id||i} className={editId&&editId===it.id?"is-editing":undefined}>
                <td className="si-center si-strong">{i+1}</td>
                <td className="si-wrap">
                  <div className="si-strong">{it.name}</div>
                  {(it.code||it.brand)&&<div className="si-muted">{[it.code,it.brand].filter(Boolean).join(" · ")}</div>}
                  {it.batchNo&&<div style={{ color:"#7c3aed", fontWeight:700 }}>📦 {bn?"আলাদা ব্যাচ":"Batch"} {it.batchNo}</div>}
                  {(piN2(it.discountPerc)>0||piN2(it.taxPerc)>0||piN2(it.salePrice)>0)&&(
                    <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                      {piN2(it.discountPerc)>0&&<span style={{ color:"#b91c1c" }}>{bn?"ছাড়":"Disc"} {it.discountPerc}% (-{piFmt2(disc)})</span>}
                      {piN2(it.taxPerc)>0&&<span style={{ color:"#0e7490" }}>VAT {it.taxPerc}% (+{piFmt2(tax)})</span>}
                      {piN2(it.salePrice)>0&&<span style={{ color:"#15803d", fontWeight:700 }}>{bn?"বিক্রয়":"Sale"} {piFmt2(it.salePrice)}</span>}
                    </div>
                  )}
                  {(onEdit||onDelete)&&(
                    <div className="si-line-tools">
                      {onEdit&&<button type="button" className="pm-btn-secondary" onClick={()=>onEdit(it)}>✏️ {bn?"এডিট":"Edit"}</button>}
                      {onDelete&&<button type="button" className="pm-btn-secondary" style={{ color:"#b91c1c" }} onClick={()=>onDelete(it.id)}>✕ {bn?"মুছুন":"Delete"}</button>}
                    </div>
                  )}
                </td>
                <td className="si-num">{it.qty} <span className="si-muted">{it.unit}</span></td>
                <td className="si-num">{piFmt2(it.unitCost)}</td>
                <td className="si-num si-strong" style={{ color:"#c2410c" }}>{piFmt2(total)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function PiSalesmanView({ t, lang, th, shopId, syncRefreshKey=0, showCost=false }) {
  const [invoices,setInvoices]   = useState([]);
  const [loading,setLoading]     = useState(true);
  const [searchQ,setSearchQ]     = useState("");
  const [dateRange,setDateRange] = useState("30"); // 7 | 30 | 90 | "all"
  const authSyncReady = useFirebaseAuthReady();

  // Local-first, then Firebase live listener; always cache to SQLite for offline.
  useEffect(()=>{
    if (!shopId) return;
    setLoading(true);
    let unsub1=()=>{};
    let unsub2=null;
    let cancelled=false;

    const normalize = (d) => ({
      ...d.data(),
      id:d.id,
      createdAt:d.data().createdAt?.toDate?.() || d.data().createdAt || new Date(),
    });

    const sortRows = (rows=[]) => [...rows].sort((a,b)=>
      new Date(b.createdAt||0) - new Date(a.createdAt||0)
    );

    const loadLocal = async () => {
      try {
        const res = await offlineList("purchaseInvoices");
        if (cancelled) return;
        const records = Array.isArray(res) ? res : (res.records || []);
        const rows = sortRows(records
          .map(r => ({ ...(r.data || r), id:(r.data?.id || r.document_id || r.id) }))
          .filter(inv => inv.shopId === shopId));
        if (rows.length) {
          setInvoices(rows);
          setLoading(false);
        }
      } catch (err) {
        console.warn("[S4 Offline] PiSalesmanView local load failed", err);
      }
    };

    const applyCloud = (rows) => {
      if (cancelled) return;
      setInvoices(sortRows(rows));
      setLoading(false);
      offlineCacheCloudRecords("purchaseInvoices", rows)
        .catch(err => console.warn("[S4 Offline] PiSalesmanView cache failed", err));
    };

    loadLocal();

    if (authSyncReady) {
      const q=query(collection(db,"purchaseInvoices"),where("shopId","==",shopId),orderBy("createdAt","desc"));
      unsub1=onSnapshot(q,snap=>{
        applyCloud(snap.docs.map(normalize));
      },()=>{
        const q2=query(collection(db,"purchaseInvoices"),where("shopId","==",shopId));
        unsub2=onSnapshot(q2,snap=>{
          applyCloud(sortRows(snap.docs.map(normalize)));
        },err2=>{
          console.error(err2);
          loadLocal().finally(()=>{ if (!cancelled) setLoading(false); });
        });
      });
    }
    return ()=>{ cancelled=true; unsub1(); unsub2&&unsub2(); };
  },[shopId,syncRefreshKey,authSyncReady]);

  // flatten all items from all confirmed/paid invoices
  const allItems = [];
  const cutoff = dateRange==="all" ? null : new Date(Date.now() - Number(dateRange)*24*60*60*1000);
  invoices.forEach(inv=>{
    if (!["confirmed","paid","partial"].includes(inv.status)) return;
    if (cutoff) {
      const when = new Date(inv.invoiceDate || inv.createdAt || 0);
      if (!Number.isNaN(when.getTime()) && when < cutoff) return;
    }
    (inv.items||[]).forEach(it=>{
      allItems.push({
        ...it,
        invoiceId:    inv.id,
        invoiceNo:    inv.invoiceNo,
        invoiceDate:  inv.invoiceDate,
        vendorName:   inv.vendorName||"—",
        purchaseDate: inv.createdAt,
      });
    });
  });

  // search filter
  const q = searchQ.trim();
  const filtered = q
    ? allItems.filter(it=>{
        const hay = [it.name,it.code,it.brand].filter(Boolean).join(" ");
        return nsmatch(hay, q);
      })
    : allItems;

  const inp = { padding:"11px 14px", borderRadius:10, border:`1px solid ${th.borderMid}`, background:th.bgInp, color:th.txtPrimary, fontSize:14, outline:"none", width:"100%", boxSizing:"border-box", fontFamily:"inherit" };
  const dateOpts = [
    { val:"7",   label:t.pi_last7  },
    { val:"30",  label:t.pi_last30 },
    { val:"90",  label:t.pi_last90 },
    { val:"all", label:t.pi_allTime},
  ];

  return (
    <div>
      {/* Title */}
      <div style={{ marginBottom:16 }}>
        <div style={{ fontSize:18, fontWeight:900, color:"#f97316" }}>{t.pi_salesmanTitle}</div>
        <div style={{ fontSize:12, color:th.txtMuted, marginTop:3 }}>{t.pi_salesmanSub}</div>
      </div>

      {/* Search */}
      <div style={{ position:"relative", marginBottom:10 }}>
        <span style={{ position:"absolute", left:14, top:"50%", transform:"translateY(-50%)", fontSize:16, pointerEvents:"none" }}>🔍</span>
        <input style={{ ...inp, paddingLeft:42 }} placeholder={t.pi_searchProduct} value={searchQ} onChange={e=>setSearchQ(e.target.value)} autoFocus />
        {searchQ&&<button onClick={()=>setSearchQ("")} style={{ position:"absolute", right:12, top:"50%", transform:"translateY(-50%)", background:"none", border:"none", color:th.txtMuted, cursor:"pointer", fontSize:18, lineHeight:1 }}>✕</button>}
      </div>

      {/* Date filter pills */}
      <div style={{ display:"flex", gap:6, marginBottom:16, flexWrap:"wrap" }}>
        {dateOpts.map(o=>(
          <button key={o.val} onClick={()=>setDateRange(o.val)} style={{ padding:"6px 14px", borderRadius:20, border:"1px solid", cursor:"pointer", fontSize:12, fontWeight:700, fontFamily:"inherit", background:dateRange===o.val?"#f97316":"transparent", borderColor:dateRange===o.val?"#f97316":th.borderMid, color:dateRange===o.val?"#fff":th.txtMuted }}>
            {o.label}
          </button>
        ))}
      </div>

      {/* Count */}
      {!loading&&filtered.length>0&&(
        <div style={{ fontSize:11, color:th.txtMuted, marginBottom:10, fontWeight:700 }}>
          {filtered.length}{lang==="bn"?"টি পণ্য পাওয়া গেছে":" products found"}
        </div>
      )}

      {/* Loading */}
      {loading&&<div style={{ textAlign:"center", padding:"60px 20px", color:th.txtFaint }}><div style={{ fontSize:40 }}>⏳</div><div style={{ marginTop:8 }}>{t.pi_loading||"Loading..."}</div></div>}

      {/* Empty */}
      {!loading&&filtered.length===0&&(
        <div style={{ textAlign:"center", padding:"60px 20px", color:th.txtFaint }}>
          <div style={{ fontSize:46, marginBottom:10 }}>📦</div>
          <div>{t.pi_noItemFound}</div>
        </div>
      )}

      {/* Item cards */}
      {!loading&&filtered.map((it,idx)=>{
        // Purchase lines store the sale price VAT-inclusive (seeded from the product's vatInclusive/MRP).
        const saleInc = piN2(it.salePrice);
        const vatPerc = it.taxPerc!=null && String(it.taxPerc).trim()!=="" ? piN2(it.taxPerc) : 5;
        const saleEx  = saleInc / (1 + vatPerc/100);
        const vatAmt  = saleInc - saleEx;
        const margin  = saleEx - piN2(it.unitCost);
        const marginPerc = piN2(it.unitCost)>0 ? (margin/piN2(it.unitCost)*100).toFixed(1) : 0;
        const d = it.purchaseDate instanceof Date ? it.purchaseDate : new Date(it.purchaseDate);
        const dateStr = d.toLocaleDateString(lang==="bn"?"bn-BD":"en-GB",{day:"numeric",month:"short",year:"numeric"});
        return (
          <div key={idx} style={{ background:th.bgCard, border:`1px solid ${th.border}`, borderRadius:14, padding:16, marginBottom:10, overflow:"hidden" }}>

            {/* Product name + meta */}
            <div style={{ marginBottom:10 }}>
              <div style={{ fontSize:17, fontWeight:900, color:th.txtPrimary, lineHeight:1.2, marginBottom:4 }}>{it.name}</div>
              <div style={{ display:"flex", flexWrap:"wrap", gap:8, alignItems:"center" }}>
                {it.code&&<span style={{ fontSize:12, color:th.txtMuted, background:th.bgInp, padding:"2px 8px", borderRadius:6, fontFamily:"monospace" }}>📋 {it.code}</span>}
                {it.brand&&<span style={{ fontSize:12, color:th.txtMuted, background:th.bgInp, padding:"2px 8px", borderRadius:6 }}>🏷️ {it.brand}</span>}
                <span style={{ fontSize:12, color:"#f59e0b", fontWeight:700 }}>📅 {dateStr}</span>
                <span style={{ fontSize:12, color:th.txtMuted }}>🏭 {it.vendorName}</span>
              </div>
            </div>

            {/* Qty + Purchase price row */}
            <div style={{ display:"grid", gridTemplateColumns:showCost?"1fr 1fr":"1fr", gap:8, marginBottom:10 }}>
              <div style={{ background:th.bgInp, borderRadius:10, padding:"10px 12px" }}>
                <div style={{ fontSize:9, color:th.txtMuted, textTransform:"uppercase", fontWeight:700, letterSpacing:0, marginBottom:4 }}>
                  {lang==="bn"?"📦 ক্রয় পরিমাণ":"📦 Purchased Qty"}
                </div>
                <div style={{ fontSize:20, fontWeight:900, color:"#06b6d4" }}>
                  {it.qty} <span style={{ fontSize:13, color:th.txtMuted }}>{it.unit}</span>
                </div>
              </div>
              {showCost&&(
                <div style={{ background:th.bgInp, borderRadius:10, padding:"10px 12px" }}>
                  <div style={{ fontSize:9, color:th.txtMuted, textTransform:"uppercase", fontWeight:700, letterSpacing:0, marginBottom:4 }}>
                    {t.pi_purchasePrice}
                  </div>
                  <div style={{ fontSize:20, fontWeight:900, color:"#a1a1aa" }}>
                    {t.cur} {piFmt2(it.unitCost)}
                  </div>
                </div>
              )}
            </div>

            {/* Sale price — big prominent box */}
            {saleEx>0 ? (
              <div style={{ background:"linear-gradient(135deg,rgba(34,197,94,0.12),rgba(34,197,94,0.05))", border:"1.5px solid #22c55e", borderRadius:12, padding:"14px 16px" }}>
                <div style={{ fontSize:10, color:"#22c55e", textTransform:"uppercase", fontWeight:700, letterSpacing:0, marginBottom:10 }}>
                  💰 {lang==="bn"?"বিক্রয় মূল্য বিবরণ":"Sale Price Details"}
                </div>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:6 }}>
                  <span style={{ fontSize:12, color:th.txtMuted }}>{t.pi_saleExVat}</span>
                  <span style={{ fontSize:15, fontWeight:700, color:th.txtPrimary }}>{t.cur} {piFmt2(saleEx)}</span>
                </div>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
                  <span style={{ fontSize:12, color:"#06b6d4" }}>🧾 {t.pi_vatAmount} ({vatPerc}%)</span>
                  <span style={{ fontSize:14, fontWeight:700, color:"#06b6d4" }}>+ {t.cur} {piFmt2(vatAmt)}</span>
                </div>
                <div style={{ height:1, background:"rgba(34,197,94,0.3)", marginBottom:8 }} />
                {/* Total inc VAT — the big number */}
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                  <span style={{ fontSize:13, fontWeight:800, color:"#22c55e" }}>{t.pi_saleIncVat}</span>
                  <span style={{ fontSize:26, fontWeight:900, color:"#22c55e", letterSpacing:0 }}>{t.cur} {piFmt2(saleInc)}</span>
                </div>
                {/* Margin info */}
                {showCost&&margin>0&&(
                  <div style={{ marginTop:8, padding:"5px 10px", background:"rgba(34,197,94,0.1)", borderRadius:8, display:"flex", justifyContent:"space-between" }}>
                    <span style={{ fontSize:11, color:"#22c55e", fontWeight:700 }}>{t.pi_margin}</span>
                    <span style={{ fontSize:12, fontWeight:800, color:"#22c55e" }}>{t.cur} {piFmt2(margin)} ({marginPerc}%)</span>
                  </div>
                )}
              </div>
            ):(
              <div style={{ background:th.bgInp, border:`1px dashed ${th.borderMid}`, borderRadius:10, padding:"12px 14px", textAlign:"center" }}>
                <span style={{ fontSize:12, color:th.txtFaint }}>{lang==="bn"?"বিক্রয় মূল্য সেট করা হয়নি":"Sale price not set"}</span>
              </div>
            )}

            {/* Invoice reference */}
            <div style={{ marginTop:8, fontSize:10, color:th.txtFaint, textAlign:"right" }}>
              {it.invoiceNo}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── PI: PAYMENTS TAB — list of Vendor Payment Vouchers ───────
export function PiPaymentsListTab({ payments, loading, t, lang, onOpen, mobile=false }) {
  const bn = lang==="bn";
  const [q,setQ] = useState("");
  const filtered = payments.filter(p=>{
    if (!q.trim()) return true;
    const s = q.toLowerCase();
    return (p.vendorName||"").toLowerCase().includes(s) || (p.paymentNo||"").toLowerCase().includes(s);
  });
  const total = filtered.reduce((sum,p)=>sum+(p.status==="cancelled"?0:piN2(p.totalAmount)), 0);
  const chequeOf = (v) => v.method==="cheque" && v.status!=="cancelled" ? (PI_CHEQUE_STATUSES[v.chequeStatus]||PI_CHEQUE_STATUSES.pending) : null;
  const statusCell = (v) => {
    if (v.status==="cancelled") return <span className="si-badge" style={{ color:"#b91c1c" }}>{bn?"বাতিল":"Cancelled"}</span>;
    const chq = chequeOf(v);
    return chq ? <span className="si-badge" style={{ color:chq.color }}>{chq[lang]}</span> : null;
  };
  return (
    <>
      <div className="si-filters" style={{ padding:0 }}>
        <div className="si-search">
          <input className="pm-input" placeholder={t.pi_searchVoucherPh} value={q} onChange={e=>setQ(e.target.value)} />
          {q&&<button type="button" aria-label="Clear" onClick={()=>setQ("")}>✕</button>}
        </div>
      </div>
      <div className="si-box" style={{ flex:1 }}>
        {loading ? <div className="si-empty">⏳</div>
          : payments.length===0 ? <div className="si-empty">💳 {t.pi_noVouchers}</div>
          : filtered.length===0 ? <div className="si-empty">🔍 {t.pi_noResults}</div>
          : mobile ? filtered.map(v=>(
            <button key={v.id} type="button" className="si-mrow" style={v.status==="cancelled"?{ opacity:0.6 }:undefined} onClick={()=>onOpen(v)}>
              <div className="si-mrow-top">
                <span style={{ color:"#c2410c" }}>{PI_VOUCHER_METHODS[v.method]?.icon||"💵"} {v.paymentNo}</span>
                <span>{statusCell(v)}</span>
              </div>
              <div className="si-mrow-sub"><span>{v.vendorName||"—"}</span><b style={{ color:"#15803d" }}>{t.cur} {piFmt2(v.totalAmount)}</b></div>
              <div className="si-mrow-sub">
                <span>{v.paymentDate} · {(v.allocations||[]).length} {bn?"টি ইনভয়েস":"invoices"}</span>
                {piN2(v.discountAmount)>0&&<span>{bn?"ছাড়":"Disc"} {piFmt2(v.discountAmount)}</span>}
              </div>
            </button>
          ))
          : (
            <table className="pm-table">
              <colgroup><col style={{ width:100 }} /><col style={{ width:80 }} /><col /><col style={{ width:80 }} /><col style={{ width:60 }} /><col style={{ width:90 }} /><col style={{ width:110 }} /></colgroup>
              <thead><tr>
                <th>{bn?"ভাউচার":"Voucher"}</th><th>{bn?"তারিখ":"Date"}</th><th>{bn?"ভেন্ডর":"Vendor"}</th><th>{bn?"পদ্ধতি":"Method"}</th>
                <th className="si-num">{bn?"ইনভয়েস":"Bills"}</th><th className="si-num">{bn?"টাকা":"Amount"}</th><th>{bn?"স্ট্যাটাস":"Status"}</th>
              </tr></thead>
              <tbody>
                {filtered.map(v=>{
                  const off = v.status==="cancelled";
                  return (
                    <tr key={v.id} className="pm-clickable" style={off?{ opacity:0.6 }:undefined} onClick={()=>onOpen(v)}>
                      <td className="si-strong" style={{ color:"#c2410c" }}>{v.paymentNo}</td>
                      <td>{v.paymentDate}</td>
                      <td title={v.vendorName||""}>{v.vendorName||"—"}</td>
                      <td>{PI_VOUCHER_METHODS[v.method]?.icon||"💵"} {PI_VOUCHER_METHODS[v.method]?.[lang]||v.method||"-"}</td>
                      <td className="si-num">{(v.allocations||[]).length}</td>
                      <td className="si-num si-strong" style={off?{ textDecoration:"line-through" }:{ color:"#15803d" }}>{piFmt2(v.totalAmount)}</td>
                      <td>{statusCell(v)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
      </div>
      <div className="si-statusbar" style={{ borderTop:0, padding:"2px 0" }}>
        <span>{bn?"দেখানো":"Showing"}: <b>{filtered.length}</b></span>
        <span>{bn?"মোট":"Total"}: <b>{t.cur} {piFmt2(total)}</b></span>
      </div>
    </>
  );
}

// ─── PI: NEW VENDOR PAYMENT VOUCHER FORM ───────────────────────
// Select a vendor → see all their open invoices → allocate Cash/Cheque payment, full or partial, per invoice.
export function PiNewPaymentForm({ vendors, prefillVendorId, getVendorOpenInvoices, saving, onSave, onCancel, t, th, lang, isDesktop }) {
  const [vendorQ,setVendorQ]       = useState("");
  const [vendorDropOpen,setVendorDropOpen] = useState(false);
  const [vendor,setVendor]         = useState(null); // { id, name, mobile }
  const [amounts,setAmounts]       = useState({});   // { [invoiceId]: "123.45" }
  const [method,setMethod]         = useState("cash");
  const [paymentDate,setPaymentDate] = useState(piToday());
  const [note,setNote]             = useState("");
  const [chequeNo,setChequeNo]     = useState("");
  const [chequeBank,setChequeBank] = useState("");
  const [chequeReceivedBy,setChequeReceivedBy] = useState("");
  const [vendorReceiptNo,setVendorReceiptNo] = useState("");
  const [refNo,setRefNo] = useState("");
  const [refBank,setRefBank] = useState("");
  const [chequeDate,setChequeDate] = useState(piToday());
  const [distAmt,setDistAmt]       = useState("");
  const vendorBoxRef = useRef(null);

  // Pre-fill vendor if navigated here from an Invoice or the Supplier Ledger
  useEffect(()=>{
    if (!prefillVendorId || !vendors?.length) return;
    const v = vendors.find(x=>x.id===prefillVendorId || x.vendorName===prefillVendorId);
    if (v) setVendor({ id:v.id, name:v.vendorName, mobile:v.mobileNumber||v.whatsappNumber||"" });
  },[prefillVendorId, vendors]);

  useEffect(()=>{
    const handler=(e)=>{ if (vendorBoxRef.current && !vendorBoxRef.current.contains(e.target)) setVendorDropOpen(false); };
    document.addEventListener("mousedown",handler);
    return ()=>document.removeEventListener("mousedown",handler);
  },[]);

  const openInvoices = vendor ? getVendorOpenInvoices(vendor.id, vendor.name) : [];
  const filteredVendors = (vendors||[]).filter(v=>(v.vendorName||"").toLowerCase().includes(vendorQ.toLowerCase())).slice(0,30);

  const setAmt = (invId,val) => setAmounts(p=>({ ...p, [invId]:val }));
  const payFull = (inv) => setAmt(inv.id, piFmt2(piN2(inv.balanceDue)));

  const totalPayment = Object.values(amounts).reduce((s,v)=>s+piN2(v),0);

  // Auto-distribute a lump sum FIFO across open invoices (oldest first), still editable afterward
  const autoDistribute = () => {
    let remaining = piN2(distAmt);
    if (remaining<=0) return;
    const next = {};
    for (const inv of openInvoices) {
      if (remaining<=0) { next[inv.id]=""; continue; }
      const bal = piN2(inv.balanceDue);
      const give = Math.min(bal, remaining);
      next[inv.id] = give>0 ? piFmt2(give) : "";
      remaining = parseFloat((remaining-give).toFixed(2));
    }
    setAmounts(next);
  };

  const inp=(e={})=>({ padding:"10px 12px", borderRadius:8, border:`1px solid ${th.borderMid}`, background:th.bgInp, color:th.txtPrimary, fontSize:14, outline:"none", width:"100%", boxSizing:"border-box", fontFamily:"inherit", ...e });
  const lbl={ fontSize:10, color:th.txtMuted, textTransform:"uppercase", fontWeight:700, marginBottom:4 };

  const handleSave = () => {
    const allocations = openInvoices
      .filter(inv => piN2(amounts[inv.id])>0)
      .map(inv => ({ invoiceId:inv.id, invoiceNo:inv.invoiceNo, supplierInvoiceNo:inv.supplierInvoiceNo||"", invoiceDate:inv.invoiceDate||"", amount:piN2(amounts[inv.id]) }));
    onSave({
      vendorId:vendor?.id||null, vendorName:vendor?.name||"", vendorMobile:vendor?.mobile||"",
      method, paymentDate, note,
      chequeNo: method==="cheque"?chequeNo:"",
      chequeBank: method==="cheque"?chequeBank:"",
      chequeDate: method==="cheque"?chequeDate:"",
      chequeReceivedBy: method==="cheque"?chequeReceivedBy:"",
      vendorReceiptNo,
      refNo: (method==="bank_transfer"||method==="card")?refNo:"",
      refBank: (method==="bank_transfer"||method==="card")?refBank:"",
      refDate: (method==="bank_transfer"||method==="card")?paymentDate:"",
      allocations,
    });
  };

  return (
    <div>
      <button onClick={onCancel} style={{ display:"flex", alignItems:"center", gap:6, background:"transparent", border:"none", color:"#f97316", cursor:"pointer", fontSize:13, fontWeight:700, padding:"0 0 14px 0", fontFamily:"inherit" }}>{t.pi_backToPayments}</button>

      <div style={{ background:th.bgCard, border:`1px solid ${th.border}`, borderRadius:14, padding:16, marginBottom:12 }}>
        <div style={{ fontSize:14, fontWeight:800, color:"#f97316", marginBottom:12 }}>💳 {t.pi_paymentVoucherTitle}</div>

        {/* Vendor selector */}
        <div style={{ marginBottom:14 }}>
          <div style={lbl}>{t.pi_selectVendor}</div>
          {!vendor ? (
            <div ref={vendorBoxRef} style={{ position:"relative" }}>
              <input style={inp()} placeholder={t.pi_searchVendor} value={vendorQ}
                onFocus={()=>setVendorDropOpen(true)} onChange={e=>{ setVendorQ(e.target.value); setVendorDropOpen(true); }} />
              {vendorDropOpen&&filteredVendors.length>0&&(
                <div style={{ position:"absolute", top:"calc(100% + 4px)", left:0, right:0, maxHeight:240, overflowY:"auto", background:th.bgCard, border:`1px solid ${th.border}`, borderRadius:10, zIndex:50, boxShadow:"0 8px 24px rgba(0,0,0,0.3)" }}>
                  {filteredVendors.map(v=>(
                    <div key={v.id||`name:${v.vendorName}`} onClick={()=>{ setVendor({ id:v.id, name:v.vendorName, mobile:v.mobileNumber||v.whatsappNumber||"" }); setVendorDropOpen(false); setVendorQ(""); }}
                      style={{ padding:"10px 12px", cursor:"pointer", borderBottom:`1px solid ${th.border}`, fontSize:13 }}
                      onMouseEnter={e=>e.currentTarget.style.background=th.bgInp}
                      onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                      <div style={{ fontWeight:700, color:th.txtPrimary }}>🏭 {v.vendorName}</div>
                      {(v.mobileNumber||v.whatsappNumber)&&<div style={{ fontSize:11, color:th.txtMuted }}>📱 {v.mobileNumber||v.whatsappNumber}</div>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"10px 12px", background:th.bgInp, borderRadius:10, border:`1px solid ${th.border}` }}>
              <div>
                <div style={{ fontSize:13, fontWeight:800, color:th.txtPrimary }}>🏭 {vendor.name}</div>
                {vendor.mobile&&<div style={{ fontSize:11, color:th.txtMuted, marginTop:1 }}>📱 {vendor.mobile}</div>}
              </div>
              <button onClick={()=>{ setVendor(null); setAmounts({}); }} style={{ padding:"6px 12px", borderRadius:8, border:`1px solid ${th.borderMid}`, background:"transparent", color:th.txtMuted, fontSize:11, fontWeight:700, cursor:"pointer" }}>{t.pi_changeVendor}</button>
            </div>
          )}
        </div>

        {vendor&&(<>
          {/* Method */}
          <div style={lbl}>{t.pi_paymentMethod}</div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:14 }}>
            {Object.entries(PI_VOUCHER_METHODS).map(([key,pm])=>(
              <button key={key} onClick={()=>setMethod(key)} style={{ padding:"10px 6px", borderRadius:10, cursor:"pointer", fontFamily:"inherit", border:`1.5px solid ${method===key?"#f97316":th.borderMid}`, background:method===key?"rgba(249,115,22,0.12)":"transparent", color:method===key?"#f97316":th.txtMuted, fontSize:13, fontWeight:700, display:"flex", alignItems:"center", justifyContent:"center", gap:6 }}>
                <span style={{ fontSize:17 }}>{pm.icon}</span><span>{pm[lang]}</span>
              </button>
            ))}
          </div>

          <div style={{ marginBottom:14 }}>
            <div style={lbl}>{t.pi_paymentDate}</div>
            <input type="date" style={inp()} value={paymentDate} onChange={e=>setPaymentDate(e.target.value)} />
          </div>

          {method==="cheque"&&(
            <div style={{ background:"rgba(99,102,241,0.06)", border:"1px solid #6366f1", borderRadius:10, padding:12, marginBottom:14 }}>
              <div style={{ fontSize:11, color:"#818cf8", fontWeight:700, marginBottom:10 }}>📃 {lang==="bn"?"চেকের তথ্য":"Cheque Details"}</div>
              <div style={{ marginBottom:8 }}>
                <div style={lbl}>{t.pi_chequeNo}</div>
                <input style={{ ...inp(), fontFamily:"monospace" }} placeholder="000123" value={chequeNo} onChange={e=>setChequeNo(e.target.value)} />
              </div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
                <div>
                  <div style={lbl}>{t.pi_chequeBank}</div>
                  <select style={{ ...inp(), background:th.bgCard }} value={chequeBank} onChange={e=>setChequeBank(e.target.value)}>
                    <option value="">{lang==="bn"?"নির্বাচন করুন":"Select bank"}</option>
                    {UAE_BANKS.map(b=><option key={b.id} value={b.name}>{b.name}</option>)}
                  </select>
                </div>
                <div>
                  <div style={lbl}>{t.pi_chequeDate}</div>
                  <input type="date" style={inp()} value={chequeDate} onChange={e=>setChequeDate(e.target.value)} />
                </div>
              </div>
              <div style={{ marginTop:8 }}>
                <div style={lbl}>{lang==="bn"?"চেক গ্রহণকারীর নাম (ঐচ্ছিক)":"Cheque Received By (optional)"}</div>
                <input style={inp()} placeholder={lang==="bn"?"যিনি চেক নিয়েছেন":"Person who took the cheque"} value={chequeReceivedBy} onChange={e=>setChequeReceivedBy(e.target.value)} />
              </div>
            </div>
          )}

          <div style={{ marginBottom:14 }}>
            <div style={lbl}>{lang==="bn"?"ভেন্ডরের রিসিট নম্বর (ঐচ্ছিক)":"Vendor Receipt No. (optional)"}</div>
            <input style={{ ...inp(), fontFamily:"monospace" }} placeholder={lang==="bn"?"ভেন্ডর যে রিসিট দিয়েছে":"Receipt number given by the vendor"} value={vendorReceiptNo} onChange={e=>setVendorReceiptNo(e.target.value)} />
          </div>

          {(method==="bank_transfer"||method==="card")&&(
            <div style={{ background:"rgba(14,165,233,0.06)", border:"1px solid #0ea5e9", borderRadius:10, padding:12, marginBottom:14 }}>
              <div style={{ fontSize:11, color:"#38bdf8", fontWeight:700, marginBottom:10 }}>{PI_VOUCHER_METHODS[method].icon} {method==="card"?(lang==="bn"?"কার্ডের তথ্য":"Card Details"):(lang==="bn"?"ট্রান্সফারের তথ্য":"Transfer Details")}</div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
                <div>
                  <div style={lbl}>{method==="card"?(lang==="bn"?"অনুমোদন / রেফ নং":"Approval / Ref No"):(lang==="bn"?"রেফারেন্স নং":"Reference No")}</div>
                  <input style={{ ...inp(), fontFamily:"monospace" }} value={refNo} onChange={e=>setRefNo(e.target.value)} />
                </div>
                <div>
                  <div style={lbl}>{method==="card"?(lang==="bn"?"কার্ডের ধরন":"Card Type"):(lang==="bn"?"ব্যাংক":"Bank")}</div>
                  <select style={{ ...inp(), background:th.bgCard }} value={refBank} onChange={e=>setRefBank(e.target.value)}>
                    <option value="">—</option>
                    {(method==="card"?VOUCHER_CARD_TYPES:UAE_BANKS.map(b=>b.name)).map(b=><option key={b} value={b}>{b}</option>)}
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* Auto-distribute helper */}
          {openInvoices.length>1&&(
            <div style={{ display:"flex", gap:8, marginBottom:14, alignItems:"flex-end" }}>
              <div style={{ flex:1 }}>
                <div style={lbl}>{t.pi_autoDistributeAmt}</div>
                <input style={inp()} inputMode="decimal" placeholder={t.pi_autoDistributePh} value={distAmt} onChange={e=>setDistAmt(e.target.value)} />
              </div>
              <button onClick={autoDistribute} style={{ padding:"10px 14px", borderRadius:8, border:"1px solid #f97316", background:"rgba(249,115,22,0.08)", color:"#f97316", fontSize:12, fontWeight:700, cursor:"pointer", height:42 }}>{t.pi_autoDistribute}</button>
            </div>
          )}

          {/* Open invoices */}
          <div style={lbl}>{t.pi_openInvoices} ({openInvoices.length})</div>
          {openInvoices.length===0&&<div style={{ textAlign:"center", padding:"20px", color:th.txtFaint, fontSize:12 }}>{t.pi_noOpenInvoices}</div>}
          {openInvoices.map(inv=>(
            <div key={inv.id} style={{ display:"flex", alignItems:"center", gap:8, padding:"10px 12px", background:th.bgInp, borderRadius:10, marginBottom:6, border:`1px solid ${th.border}` }}>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:13, fontWeight:700, color:"#f97316" }}>🧾 {inv.supplierInvoiceNo||inv.invoiceNo}{inv.supplierInvoiceNo&&<span style={{ fontSize:11, fontWeight:600, color:th.txtMuted }}> · {inv.invoiceNo}</span>}</div>
                <div style={{ fontSize:11, color:th.txtMuted, marginTop:2 }}>📅 {inv.invoiceDate} · {t.pi_balanceDue}: <span style={{ color:"#ef4444", fontWeight:700 }}>{t.cur} {piFmt2(inv.balanceDue)}</span></div>
              </div>
              <input style={{ ...inp(), width:100, flex:"0 0 100px", textAlign:"right", fontWeight:700, color:"#22c55e", borderColor:piN2(amounts[inv.id])>0?"#22c55e":th.borderMid }}
                inputMode="decimal" placeholder="0.00" value={amounts[inv.id]||""} onChange={e=>setAmt(inv.id,e.target.value)} />
              <button onClick={()=>payFull(inv)} style={{ padding:"8px 10px", borderRadius:8, border:`1px solid ${th.borderMid}`, background:"transparent", color:th.txtMuted, fontSize:10, fontWeight:700, cursor:"pointer", flexShrink:0 }}>{t.pi_payFull}</button>
            </div>
          ))}

          {/* Note */}
          <div style={{ marginTop:10, marginBottom:4 }}>
            <div style={lbl}>{t.pi_paymentNote}</div>
            <AutoTA style={{ width:"100%", padding:"10px 12px", borderRadius:8, border:`1px solid ${th.borderMid}`, background:th.bgInp, color:th.txtPrimary, fontSize:13, outline:"none", resize:"none", overflow:"hidden", minHeight:50, boxSizing:"border-box", fontFamily:"inherit" }}
              placeholder={t.pi_paymentNotePh} value={note} onChange={e=>setNote(e.target.value)} />
          </div>
        </>)}
      </div>

      {vendor&&openInvoices.length>0&&(
        <div style={{ position:isDesktop?"static":"sticky", bottom:0, background:th.bgCard, border:`1px solid ${th.border}`, borderRadius:14, padding:14, marginBottom:12 }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
            <span style={{ fontSize:13, fontWeight:700, color:th.txtMuted }}>{t.pi_totalPayment}</span>
            <span style={{ fontSize:20, fontWeight:900, color:"#22c55e" }}>{t.cur} {piFmt2(totalPayment)}</span>
          </div>
          <button onClick={handleSave} disabled={saving||totalPayment<=0} style={{ width:"100%", padding:"13px", borderRadius:10, border:"none", background:(saving||totalPayment<=0)?"#1e3a5f":"linear-gradient(135deg,#15803d,#16a34a)", color:"#fff", fontSize:15, fontWeight:800, cursor:(saving||totalPayment<=0)?"not-allowed":"pointer" }}>
            {saving?"...":t.pi_newPayment}
          </button>
        </div>
      )}
    </div>
  );
}

// ─── PI: VOUCHER DETAIL VIEW ────────────────────────────────────
export function PiVoucherDetailView({ voucher, t, th, lang, isOwner, onBack, onCancel, onDelete, onSetChequeStatus, onPrint, onViewInvoice, onPrintCheque, onPrintChequeVoucher, onHandover }) {
  const isCheque = voucher.method==="cheque";
  const isCancelled = voucher.status==="cancelled";
  const chequeSt = PI_CHEQUE_STATUSES[voucher.chequeStatus]||PI_CHEQUE_STATUSES.pending;
  const dr = { display:"flex", alignItems:"center", justifyContent:"space-between", padding:"8px 0", borderBottom:`1px solid ${th.border}` };
  return (
    <div>
      <button onClick={onBack} style={{ display:"flex", alignItems:"center", gap:6, background:"transparent", border:"none", color:"#f97316", cursor:"pointer", fontSize:13, fontWeight:700, padding:"0 0 14px 0", fontFamily:"inherit" }}>{t.pi_backToPayments}</button>

      <div style={{ background:th.bgCard, border:`1px solid ${th.border}`, borderRadius:14, padding:16, marginBottom:10 }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:10 }}>
          <div>
            <div style={{ fontSize:20, fontWeight:900, color:"#f97316", letterSpacing:1 }}>{PI_VOUCHER_METHODS[voucher.method]?.icon} {voucher.paymentNo}</div>
            <div style={{ fontSize:12, color:th.txtMuted, marginTop:2 }}>📅 {voucher.paymentDate}</div>
          </div>
          {isCancelled
            ? <span style={{ fontSize:10, fontWeight:700, color:"#ef4444", background:"#450a0a", padding:"4px 10px", borderRadius:10 }}>{lang==="bn"?"বাতিল":"CANCELLED"}</span>
            : isCheque&&<span style={{ fontSize:10, fontWeight:700, color:chequeSt.color, background:chequeSt.bg, padding:"4px 10px", borderRadius:10 }}>{chequeSt[lang]}</span>}
        </div>
        <div style={dr}><span style={{ fontSize:12, color:th.txtMuted }}>🏭 {t.pi_payToVendor}</span><span style={{ fontSize:13, fontWeight:700, color:th.txtPrimary }}>{voucher.vendorName}</span></div>
        <div style={dr}><span style={{ fontSize:12, color:th.txtMuted }}>💳 {t.pi_paymentMethod}</span><span style={{ fontSize:13, fontWeight:700, color:th.txtPrimary }}>{PI_VOUCHER_METHODS[voucher.method]?.icon} {PI_VOUCHER_METHODS[voucher.method]?.[lang]}</span></div>
        {isCheque&&(
          <>
            <div style={dr}><span style={{ fontSize:12, color:th.txtMuted }}>📃 {t.pi_chequeNo}</span><span style={{ fontSize:13, fontWeight:700, color:th.txtPrimary }}>{voucher.chequeNo||"—"}</span></div>
            <div style={dr}><span style={{ fontSize:12, color:th.txtMuted }}>🏦 {t.pi_chequeBank}</span><span style={{ fontSize:13, fontWeight:700, color:th.txtPrimary }}>{voucher.chequeBank||"—"}</span></div>
            <div style={dr}><span style={{ fontSize:12, color:th.txtMuted }}>📅 {t.pi_chequeDate}</span><span style={{ fontSize:13, fontWeight:700, color:th.txtPrimary }}>{voucher.chequeDate||"—"}</span></div>
            {voucher.chequeReceivedBy&&<div style={dr}><span style={{ fontSize:12, color:th.txtMuted }}>🙋 {lang==="bn"?"চেক গ্রহণকারী":"Cheque Received By"}</span><span style={{ fontSize:13, fontWeight:700, color:th.txtPrimary }}>{voucher.chequeReceivedBy}</span></div>}
          </>
        )}
        {voucher.vendorReceiptNo&&<div style={dr}><span style={{ fontSize:12, color:th.txtMuted }}>🧾 {lang==="bn"?"ভেন্ডরের রিসিট নম্বর":"Vendor Receipt No."}</span><span style={{ fontSize:13, fontWeight:700, color:th.txtPrimary }}>{voucher.vendorReceiptNo}</span></div>}
        {(voucher.method==="bank_transfer"||voucher.method==="card")&&(
          <>
            <div style={dr}><span style={{ fontSize:12, color:th.txtMuted }}>🔖 {voucher.method==="card"?(lang==="bn"?"অনুমোদন / রেফ নং":"Approval / Ref No"):(lang==="bn"?"রেফারেন্স নং":"Reference No")}</span><span style={{ fontSize:13, fontWeight:700, color:th.txtPrimary }}>{voucher.refNo||"—"}</span></div>
            <div style={dr}><span style={{ fontSize:12, color:th.txtMuted }}>{voucher.method==="card"?(lang==="bn"?"💳 কার্ডের ধরন":"💳 Card Type"):(lang==="bn"?"🏦 ব্যাংক":"🏦 Bank")}</span><span style={{ fontSize:13, fontWeight:700, color:th.txtPrimary }}>{voucher.refBank||"—"}</span></div>
          </>
        )}
        <div style={{ ...dr, borderBottom:"none" }}><span style={{ fontSize:13, fontWeight:700, color:th.txtMuted }}>{t.pi_totalPayment}</span><span style={{ fontSize:18, fontWeight:900, color:isCancelled?th.txtFaint:"#22c55e", textDecoration:isCancelled?"line-through":"none" }}>{t.cur} {piFmt2(voucher.totalAmount)}</span></div>
        {isCheque&&piN2(voucher.discountAmount)>0&&(
          <>
            <div style={dr}><span style={{ fontSize:12, color:th.txtMuted }}>🏷️ {lang==="bn"?"ছাড়":"Discount"}</span><span style={{ fontSize:13, fontWeight:700, color:"#f59e0b" }}>{t.cur} {piFmt2(voucher.discountAmount)}</span></div>
            <div style={{ ...dr, borderBottom:"none" }}><span style={{ fontSize:12, color:th.txtMuted }}>🖋️ {lang==="bn"?"চেকের পরিমাণ":"Cheque Amount"}</span><span style={{ fontSize:15, fontWeight:900, color:"#3b82f6" }}>{t.cur} {piFmt2(voucher.chequeAmount)}</span></div>
          </>
        )}
        {voucher.note&&<div style={{ marginTop:8, padding:"8px 10px", background:th.bgInp, borderRadius:8, fontSize:12, color:th.txtSecondary, borderLeft:"3px solid #f97316" }}>📝 {voucher.note}</div>}
      </div>

      {isCheque&&!isCancelled&&(onPrintCheque||onPrintChequeVoucher||onHandover)&&(
        <div style={{ background:th.bgCard, border:`1px solid ${th.border}`, borderRadius:14, padding:14, marginBottom:10, display:"flex", flexDirection:"column", gap:8 }}>
          <div style={{ fontSize:11, color:"#3b82f6", fontWeight:700, textTransform:"uppercase" }}>🖨️ {lang==="bn"?"চেক ও ডকুমেন্ট":"Cheque & documents"}</div>
          {voucher.chequePrintedAt&&<div style={{ fontSize:11, color:th.txtMuted }}>✅ {lang==="bn"?"চেক প্রিন্ট হয়েছে":"Cheque printed"}: {String(voucher.chequePrintedAt).slice(0,10)}{voucher.chequePrintCount>1?` (×${voucher.chequePrintCount})`:""}</div>}
          {voucher.handover?.receiverName&&<div style={{ fontSize:11, color:th.txtMuted }}>🪪 {lang==="bn"?"হস্তান্তর":"Handed over to"}: <b style={{ color:th.txtPrimary }}>{voucher.handover.receiverName}</b>{voucher.handover.receivedAt?` · ${voucher.handover.receivedAt}`:""}</div>}
          <div style={{ display:"flex", flexWrap:"wrap", gap:8 }}>
            {onPrintCheque&&<button onClick={onPrintCheque} style={{ flex:"1 1 140px", padding:"11px", borderRadius:10, border:"none", background:"linear-gradient(135deg,#f97316,#ea580c)", color:"#fff", fontSize:13, fontWeight:700, cursor:"pointer" }}>🖨️ {lang==="bn"?"চেক প্রিন্ট":"Print Cheque"}</button>}
            {onPrintChequeVoucher&&<button onClick={onPrintChequeVoucher} style={{ flex:"1 1 140px", padding:"11px", borderRadius:10, border:"1px solid #3b82f6", background:"rgba(59,130,246,0.08)", color:"#3b82f6", fontSize:13, fontWeight:700, cursor:"pointer" }}>📄 {lang==="bn"?"চেক পেমেন্ট ভাউচার":"Cheque Payment Voucher"}</button>}
            {onHandover&&<button onClick={onHandover} style={{ flex:"1 1 140px", padding:"11px", borderRadius:10, border:"1px solid #22c55e", background:"rgba(34,197,94,0.08)", color:"#22c55e", fontSize:13, fontWeight:700, cursor:"pointer" }}>🪪 {voucher.handover?(lang==="bn"?"হস্তান্তর ডকুমেন্ট দেখুন":"View Handover"):(lang==="bn"?"হস্তান্তর ডকুমেন্ট":"Handover Document")}</button>}
          </div>
        </div>
      )}

      {/* Allocations table */}
      <div style={{ background:th.bgCard, border:`1px solid ${th.border}`, borderRadius:14, padding:14, marginBottom:10 }}>
        <div style={{ fontSize:11, color:"#f97316", fontWeight:700, textTransform:"uppercase", letterSpacing:0, marginBottom:10 }}>{t.pi_allocations}</div>
        {(voucher.allocations||[]).map((a,i)=>(
          <button key={i} onClick={()=>onViewInvoice(a.invoiceId)} style={{ width:"100%", textAlign:"left", display:"flex", justifyContent:"space-between", alignItems:"center", padding:"10px 12px", background:th.bgInp, borderRadius:10, marginBottom:6, border:`1px solid ${th.border}`, cursor:"pointer", fontFamily:"inherit" }}>
            <div>
              <div style={{ fontSize:13, fontWeight:700, color:"#f97316" }}>🧾 {a.supplierInvoiceNo||a.invoiceNo}</div>
              <div style={{ fontSize:11, color:th.txtMuted, marginTop:2 }}>{a.supplierInvoiceNo?`${a.invoiceNo} · `:""}{a.invoiceDate?`📅 ${a.invoiceDate}`:""}</div>
            </div>
            <span style={{ fontSize:14, fontWeight:800, color:"#22c55e" }}>{t.cur} {piFmt2(a.amount)}</span>
          </button>
        ))}
      </div>

      {/* Actions */}
      {(isOwner||onCancel)&&(
        <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
          <button onClick={onPrint} style={{ padding:"12px", borderRadius:10, border:`1px solid ${th.borderMid}`, background:"transparent", color:th.txtPrimary, fontSize:13, fontWeight:700, cursor:"pointer" }}>{t.pi_printReceipt}</button>
          {isOwner&&!isCancelled&&isCheque&&voucher.chequeStatus==="pending"&&(
            <>
              <button onClick={()=>onSetChequeStatus("cleared")} style={{ padding:"12px", borderRadius:10, border:"1px solid #22c55e", background:"rgba(34,197,94,0.08)", color:"#22c55e", fontSize:13, fontWeight:700, cursor:"pointer" }}>{t.pi_markCleared}</button>
              <button onClick={()=>onSetChequeStatus("bounced")} style={{ padding:"12px", borderRadius:10, border:"1px solid #ef4444", background:"rgba(239,68,68,0.08)", color:"#ef4444", fontSize:13, fontWeight:700, cursor:"pointer" }}>{t.pi_markBounced}</button>
            </>
          )}
          {!isCancelled&&onCancel&&(
            <button onClick={onCancel} style={{ padding:"11px", borderRadius:10, border:"1px solid #450a0a", background:"transparent", color:"#ef4444", fontSize:13, fontWeight:700, cursor:"pointer" }}>{t.pi_cancelVoucher}</button>
          )}
          {isCancelled&&onDelete&&(
            <button onClick={onDelete} style={{ padding:"11px", borderRadius:10, border:"1px solid #7f1d1d", background:"#7f1d1d", color:"#fff", fontSize:13, fontWeight:700, cursor:"pointer" }}>🗑️ {lang==="bn"?"ভাউচার মুছুন":"Delete Voucher"}</button>
          )}
        </div>
      )}
    </div>
  );
}

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
  // On PC the screen fills exactly the space below the window title, so the page itself never scrolls.
  useEffect(() => {
    if (piMobile) { setPiFitH(null); return undefined; }
    const fit = () => {
      const el = piRootRef.current; if (!el) return;
      const top = el.getBoundingClientRect().top + (el.parentElement?.scrollTop || 0);
      setPiFitH(Math.max(420, Math.floor(window.innerHeight - top)));
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [piMobile, piView]);
  useEffect(() => { if (piView!=="form") piWin.restore(); }, [piView]); // eslint-disable-line react-hooks/exhaustive-deps
  const [piSubTab,setPiSubTab]     = useState(
    canManagePurchase ? "invoices" : (canViewSupplierLedger ? "ledger" : (canVendorPayments ? "payments" : "invoices"))
  ); // "invoices" | "ledger" | "payments"
  const [selInvoice,setSelInvoice] = useState(null);
  const [editInvoiceId,setEditInvoiceId] = useState(null);
  const piSnapRef = useRef(null);
  const [piLedgerHidden,setPiLedgerHidden] = useState(false);
  const [piNavReturn,setPiNavReturn] = useState(null); // null | "ledger"

  // ── Vendor Payment Voucher state (Cash/Cheque, partial payment against open invoices) ──
  const [payments,setPayments]         = useState([]);       // all vouchers for this shop (live)
  const [billReturns,setBillReturns]   = useState([]);
  useEffect(() => {
    if (!shopId) return undefined;
    const unsub = subscribeShopCollection({ collectionName:"purchaseReturns", shopId, onRows:(list)=>setBillReturns(list||[]) });
    return () => { try { unsub?.(); } catch { /* ignore */ } };
  }, [shopId]);
  const [pmtLoading,setPmtLoading]     = useState(true);
  const [pmtView,setPmtView]           = useState("list");   // "list" | "new" | "detail"
  const [selVoucher,setSelVoucher]     = useState(null);
  const [pmtPrefillVendorId,setPmtPrefillVendorId] = useState(null);
  const [pmtPrefillInvoiceId,setPmtPrefillInvoiceId] = useState(null);
  const [pmtSaving,setPmtSaving]       = useState(false);
  const [chqWizard,setChqWizard]       = useState(null);     // null | { vendorId }
  const [chqHandover,setChqHandover]   = useState(null);     // voucher being documented
  const [chqHandoverSaving,setChqHandoverSaving] = useState(false);

  // ── Form state ──
  const [piInvoiceNo,setPiInvoiceNo] = useState("");
  const [piForm,setPiForm]           = useState(piEmptyForm());
  const [piLines,setPiLines]         = useState([]);
  const [piCurrent,setPiCurrent]     = useState(piEmptyCurrent());
  const [piEditLineId,setPiEditLineId] = useState(null);
  const [piSaving,setPiSaving]       = useState(false);
  const piSaveLockRef = useRef(false);
  const piNameRef = useRef(null);
  const piQtyRef = useRef(null);

  // ── Vendor search state (for purchase invoice form) ──
  const [vendorSearchQ,setVendorSearchQ]     = useState("");
  const [vendorDropOpen,setVendorDropOpen]   = useState(false);
  const vendorSearchRef = useRef(null);

  // Close vendor dropdown when clicking outside
  useEffect(()=>{
    const handler=(e)=>{
      if (vendorSearchRef.current && !vendorSearchRef.current.contains(e.target)){
        setVendorDropOpen(false);
      }
    };
    document.addEventListener("mousedown",handler);
    return ()=>document.removeEventListener("mousedown",handler);
  },[]);

  // ── Filter state ──
  const [piSearch,setPiSearch]       = useState("");
  const [piStatusF,setPiStatusF]     = useState("ALL");

  const allowedPiSubTabs = [
    ...(canManagePurchase ? ["invoices"] : []),
    ...(canViewSupplierLedger ? ["ledger"] : []),
    ...(canVendorPayments ? ["payments"] : []),
  ];

  useEffect(()=>{
    if (!allowedPiSubTabs.length) return;
    if (!allowedPiSubTabs.includes(piSubTab)) {
      setPiSubTab(allowedPiSubTabs[0]);
      setPmtView("list");
      setSelVoucher(null);
    }
  }, [piSubTab, canManagePurchase, canViewSupplierLedger, canVendorPayments]);

  // ── Local-first list, then Firebase; SQLite cache stays in background ──
  useEffect(()=>{
    if (!shopId) return;
    setPiLoading(true);
    let unsub1=()=>{};
    let unsub2=null;
    let cancelled=false;
    let cloudRowsLatest=null;

    const normalizePiInvoice = (d) => ({
      ...d.data(),
      id:d.id,
      createdAt:d.data().createdAt?.toDate?.() || d.data().createdAt || new Date().toISOString(),
    });

    const sortPiInvoices = (rows=[]) => [...rows].sort((a,b)=>
      new Date(b.createdAt||b.invoiceDate||0) - new Date(a.createdAt||a.invoiceDate||0)
    );

    const loadOfflinePiInvoices = async ({ cloudRows = null } = {}) => {
      const mergeSource = cloudRows ?? cloudRowsLatest;
      const res = await offlineList("purchaseInvoices");
      if (cancelled) return 0;
      const records = Array.isArray(res) ? res : (res.records || []);
      const localRows = records
        .map(r => ({ ...(r.data || r), id:(r.data?.id || r.document_id || r.id) }))
        .filter(inv => inv.shopId === shopId);

      if (Array.isArray(mergeSource)) {
        const merged = new Map(mergeSource.map(inv => [String(inv.id), inv]));
        records
          .filter(r => Number(r?.dirty || 0) === 1)
          .map(r => ({ ...(r.data || r), id:(r.data?.id || r.document_id || r.id) }))
          .filter(inv => inv.shopId === shopId)
          .forEach(inv => merged.set(String(inv.id), inv));
        const rows = sortPiInvoices([...merged.values()]);
        setInvoices(rows);
        return rows.length;
      }

      if (localRows.length) setInvoices(sortPiInvoices(localRows));
      return localRows.length;
    };

    loadOfflinePiInvoices()
      .then((count) => { if (!cancelled && count > 0) setPiLoading(false); })
      .catch(err => console.warn("[S4 Offline] purchaseInvoices offline load failed", err));

    const applyCloudRows = (rows) => {
      if (cancelled) return;
      cloudRowsLatest = rows;
      setPiLoading(false);
      loadOfflinePiInvoices({ cloudRows: rows }).catch(() => {
        if (!cancelled) setInvoices(sortPiInvoices(rows));
      });
      offlineCacheCloudRecords("purchaseInvoices", rows)
        .catch(err => console.warn("[S4 Offline] purchaseInvoices cache failed", err));
    };

    if (authSyncReady) {
      const q=query(collection(db,"purchaseInvoices"),where("shopId","==",shopId),orderBy("createdAt","desc"));
      unsub1=onSnapshot(q,snap=>{
        applyCloudRows(snap.docs.map(normalizePiInvoice));
      },()=>{
        // Index নেই — orderBy ছাড়া fallback query, client-side sort
        const q2=query(collection(db,"purchaseInvoices"),where("shopId","==",shopId));
        unsub2=onSnapshot(q2,snap=>{
          applyCloudRows(sortPiInvoices(snap.docs.map(normalizePiInvoice)));
        },err2=>{
          console.error(err2);
          loadOfflinePiInvoices().finally(()=>{ if (!cancelled) setPiLoading(false); });
        });
      });
    }
    return ()=>{ cancelled=true; unsub1(); unsub2&&unsub2(); };
  },[shopId,syncRefreshKey,authSyncReady]);

  // ── Generate invoice no — preview instantly, commit on save ──
  const piMaxLocalSerial = () => invoices.reduce((mx, inv) => {
    const m = String(inv.invoiceNo || "").match(/PI-?(\d+)(?:-[A-Z]{2})?$/i);
    return m ? Math.max(mx, Number(m[1])) : mx;
  }, Number(shop?.lastPISerial || 0));

  const piFormatInvoiceNo = (serial) =>
    `${PI_PREFIX}${String(serial).padStart(4, "0")}`;

  const piPreviewNextInvoiceNo = () =>
    piFormatInvoiceNo(piMaxLocalSerial() + 1);

  const reservePiInvoiceNo = async () => {
    if (editInvoiceId) return piInvoiceNo;
    const local = piMaxLocalSerial();
    const serial = await reserveShopSerial(shopId, "lastPISerial", local);
    const no = serial ? piFormatInvoiceNo(serial)
      : isOwner ? piFormatInvoiceNo(local + 1)
      : `${piFormatInvoiceNo(local + 1)}-${deviceSerialTag()}`;
    setPiInvoiceNo(no);
    return no;
  };

  const bumpShopPiSerial = (invoiceNo) => {
    const m = String(invoiceNo || "").match(/PI-?(\d+)$/i);
    if (!m || !navigator.onLine) return;
    const serial = Number(m[1]);
    if (!Number.isFinite(serial) || serial <= 0) return;
    runTransaction(db, async tx => {
      const shopRef = doc(db, "shops", shopId);
      const shopSnap = await tx.get(shopRef);
      const current = Number(shopSnap.data()?.lastPISerial || 0);
      if (serial > current) tx.update(shopRef, { lastPISerial: serial });
    }).catch(err => console.warn("[S4 PI] lastPISerial background bump failed", err));
  };

  // ── Generate payment voucher no (local-first, cloud when online) ──
  const piMaxLocalPaymentSerial = () => payments.reduce((mx, payment) => {
    const m = String(payment.paymentNo || "").match(/PMT-?(\d+)(?:-[A-Z]{2})?$/i);
    return m ? Math.max(mx, Number(m[1])) : mx;
  }, Number(shop?.lastPaymentSerial || 0));

  const piFormatPaymentNo = (serial) =>
    `${PMT_PREFIX}${String(serial).padStart(4, "0")}`;

  const genPaymentNo = async () => {
    const local = piMaxLocalPaymentSerial();
    const serial = await reserveShopSerial(shopId, "lastPaymentSerial", local);
    if (serial) return piFormatPaymentNo(serial);
    return isOwner ? piFormatPaymentNo(local + 1) : `${piFormatPaymentNo(local + 1)}-${deviceSerialTag()}`;
  };

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

  useEffect(()=>{
    if (!openNewRequest) return;
    onOpenNewHandled?.();
    if (!(isOwner||canManagePurchase) || piView==="form") return;
    setPiSubTab("invoices");
    piOpenNew();
    if (openNewVendor) piPickVendor(openNewVendor);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openNewRequest]);
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

      for (const update of invoiceUpdates) {
        const patched = await offlinePatch("purchaseInvoices", update.invoice.id, {
          amountPaid: update.newAmountPaid,
          balanceDue: update.newBalance,
          status: update.newStatus,
          updatedAt: nowIso,
          updatedBy: user?.uid || "",
        }, update.invoice);
        const updated = { ...update.invoice, ...patched.data, id: update.invoice.id };
        setInvoices((prev) => prev.map((inv) => (inv.id === update.invoice.id ? updated : inv)));
        setSelInvoice((prev) => prev && prev.id === update.invoice.id ? updated : prev);
      }

      if (navigator.onLine) {
        window.S4Offline?.syncNow?.().catch((err) => console.warn("[S4 Sync] purchase payment save sync failed", err));
      }

      toast(t.pi_voucherSaved);
      if (!stayOpen) { setPmtView("list"); setSelVoucher(null); setPmtPrefillVendorId(null); }
      return created;
    } catch(e) { toast(e.message,"err"); return null; }
    finally { setPmtSaving(false); }
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

    for (const update of invoiceUpdates) {
      const patched = await offlinePatch("purchaseInvoices", update.invoice.id, {
        amountPaid: update.newAmountPaid,
        balanceDue: update.newBalance,
        status: update.newStatus,
        updatedAt: nowIso,
        updatedBy: user?.uid || "",
      }, update.invoice);
      const updated = { ...update.invoice, ...patched.data, id: update.invoice.id };
      setInvoices((prev) => prev.map((inv) => (inv.id === update.invoice.id ? updated : inv)));
      setSelInvoice((prev) => prev && prev.id === update.invoice.id ? updated : prev);
    }

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

  // ── Build payload ──
  const piBuild=(status, invoiceNoOverride)=>{
    if (!piForm.vendorName.trim()){ toast(lang==="bn"?"❌ Vendor / সাপ্লায়ারের নাম দিন — লিস্টে না থাকলে নাম লিখে দিন":"❌ Enter the vendor / supplier name — type it if it's not in the list","err"); return null; }
    if (!piForm.supplierInvoiceNo.trim()){ toast(lang==="bn"?"❌ সাপ্লায়ারের Invoice No দিন — নম্বর না থাকলে যেকোনো একটা রেফারেন্স লিখুন":"❌ Enter the supplier's invoice no — type any reference if there is none","err"); return null; }
    if (piCurrent.name.trim()){ toast(lang==="bn"?"❌ এন্ট্রি সারির আইটেম এখনো যোগ/আপডেট করা হয়নি — Add/Update চাপুন বা সারিটি খালি করুন":"❌ The item in the entry row is not added yet — press Add/Update or clear the row","err"); return null; }
    const priorInv = editInvoiceId ? invoices.find(inv=>inv.id===editInvoiceId) : null;
    if (status==="draft" && priorInv?.status && priorInv.status!=="draft") {
      toast(lang==="bn"?"❌ সেভ করা বিলকে আবার Draft করা যাবে না":"❌ A saved invoice cannot be turned back into a draft","err"); return null;
    }
    const valid=piLines.filter(it=>it.name.trim());
    if (!valid.length){ toast(t.pi_errItems,"err"); return null; }
    for (const it of valid){
      if (!it.name.trim()){ toast(t.pi_errName,"err"); return null; }
      if (!it.qty.toString().trim()||piN2(it.qty)<=0){ toast(t.pi_errQty,"err"); return null; }
      if (piN2(it.unitCost)<0){ toast(t.pi_errCost,"err"); return null; }
      if (piN2(it.taxPerc)<0){ toast(lang==="bn"?"❌ VAT % ঋণাত্মক হতে পারে না":"❌ VAT % cannot be negative","err"); return null; }
      if (piN2(it.discountPerc)<0||piN2(it.discountPerc)>100){ toast(lang==="bn"?`❌ "${it.name}": ছাড় ০–১০০% হতে হবে`:`❌ "${it.name}": discount must be 0–100%`,"err"); return null; }
    }
    const foreign = isForeign(piForm, piBaseCur);
    const rate = rateOf(piForm, piBaseCur);
    if (foreign && !(rate > 0)) { toast(lang==="bn"?`❌ ${piForm.currency} থেকে ${piBaseCur}-এর রেট (Exchange Rate) দিন`:`❌ Enter the exchange rate from ${piForm.currency} to ${piBaseCur}`,"err"); return null; }
    const baseLines = valid.map(it=>lineToBase(it, rate));
    const builtItems=baseLines.map((it,idx)=>{ const { disc, tax, total }=piCalcLine(it); return { productId:it.productId||null, name:it.name.trim(), code:it.code.trim(), brand:it.brand.trim(), qty:piN2(it.qty), unit:it.unit, unitFactor:unitFactorFor(it.productId ? products.find(p=>p.id===it.productId) : null, it.unit), unitCost:piN2(it.unitCost), discountPerc:piN2(it.discountPerc), discountAmt:parseFloat(piFmt2(disc)), taxPerc:piN2(it.taxPerc), taxAmt:parseFloat(piFmt2(tax)), lineTotal:parseFloat(piFmt2(total)), salePrice:piN2(it.salePrice)||null,
      ...(foreign?{ fcUnitCost:piN2(valid[idx].unitCost) }:{}), ...(it.batchNo?{ batchNo:it.batchNo, batchReasons:it.batchReasons||[] }:{}) }; });
    const { sub, disc, tax, grand } = piCalcTotals(baseLines);
    const fcGrand = piCalcTotals(valid).grand;
    // Paying the whole bill in a foreign currency settles it exactly, without a rounding paisa left over.
    const fcPaid = piN2(piForm.amountPaid);
    const typedPaid=piForm.paymentMethod==="cash" ? parseFloat(piFmt2(grand)) : (foreign && Math.abs(fcPaid-fcGrand)<0.01 ? grand : fcPaid*rate);
    if (typedPaid > grand + 0.01) { toast(lang==="bn"?"পরিশোধিত টাকা মোট বিলের চেয়ে বেশি হতে পারে না!":"Amount paid cannot exceed the grand total!","err"); return null; }
    const paid=Math.min(Math.max(typedPaid,0), grand), balanceDue=Math.max(0,grand-paid);
    const derivedStatus = status==="confirmed" ? (balanceDue<0.01?"paid":paid>0?"partial":"confirmed") : status;
    const linkFrom = piSource || priorInv || {};
    const sourceFields = {
      ...((piSource ? piSource.purchaseOrderId : linkFrom.purchaseOrderId) ? { purchaseOrderId:piSource ? piSource.purchaseOrderId : linkFrom.purchaseOrderId, purchaseOrderNo:piSource ? piSource.purchaseOrderNo : (linkFrom.purchaseOrderNo||"") } : {}),
      ...(piSource?.kind==="grn" ? { goodsReceiptId:piSource.id, goodsReceiptNo:piSource.no } : priorInv?.goodsReceiptId ? { goodsReceiptId:priorInv.goodsReceiptId, goodsReceiptNo:priorInv.goodsReceiptNo||"" } : {}),
    };
    return { ...sourceFields, shopId, invoiceNo:invoiceNoOverride ?? piInvoiceNo, supplierInvoiceNo:piForm.supplierInvoiceNo.trim(), refNo:String(piForm.refNo||"").trim(), invoiceDate:piForm.invoiceDate,
      currency:foreign?String(piForm.currency).trim().toUpperCase():"", exchangeRate:foreign?rate:null, fcGrandTotal:foreign?fcGrand:null, vendorId:piForm.vendorId||null, vendorName:piForm.vendorName.trim(), vendorMobile:piForm.vendorMobile.trim(), items:builtItems, subtotal:parseFloat(piFmt2(sub)), totalDiscount:parseFloat(piFmt2(disc)), totalTax:parseFloat(piFmt2(tax)), grandTotal:parseFloat(piFmt2(grand)), paymentMethod:piForm.paymentMethod, amountPaid:parseFloat(piFmt2(paid)), balanceDue:parseFloat(piFmt2(balanceDue)), status:derivedStatus, note:piForm.note.trim(), createdBy:priorInv?.createdBy||user.uid, createdByName:priorInv?.createdByName||profile.personName };
  };

  const savePurchaseInvoiceOffline = async (payload, successMessage) => {
    const nowIso = new Date().toISOString();
    const priorInvoice = editInvoiceId ? invoices.find(inv => inv.id === editInvoiceId) : null;
    let savedId;
    let savedDoc = null;
    const deferPersist = { deferPersist: true };

    if (editInvoiceId) {
      const result = await offlinePatch("purchaseInvoices", editInvoiceId, {
        ...payload,
        updatedAt: nowIso,
        updatedBy: user?.uid || "",
      }, priorInvoice, deferPersist);

      const updated = { ...result.data, id: editInvoiceId };
      savedId = editInvoiceId;
      savedDoc = updated;
      setInvoices(prev => prev.map(inv => inv.id === editInvoiceId ? updated : inv));
      setSelInvoice(prev => prev && prev.id === editInvoiceId ? updated : prev);
      toast(successMessage || t.pi_updated);
      if (priorInvoice && priorInvoice.status !== "draft") {
        logAudit({ shopId, user, profile, action:"edit", collection:"purchaseInvoices", docId:editInvoiceId, docNo:payload.invoiceNo, amount:payload.grandTotal,
          note:`${payload.vendorName||""} · ${piFmt2(priorInvoice.grandTotal)} → ${piFmt2(payload.grandTotal)}` });
      }
    } else {
      const result = await offlineCreate("purchaseInvoices", {
        ...payload,
        createdAt: nowIso,
        updatedAt: nowIso,
      }, deferPersist);

      const created = { ...result.data, id: result.documentId };
      savedId = result.documentId;
      savedDoc = created;
      setInvoices(prev => [created, ...prev]);
      toast(successMessage);
    }

    if (!payload.goodsReceiptId) await applyInvoiceStockEffect({
      oldInvoice: priorInvoice,
      newInvoice: payload,
      invoiceId: savedId,
      applyType: "purchase",
      reverseType: "adjustment",
      referenceType: "purchase_invoice",
      unitCostKey: "unitCost",
      shopId,
      actor: { uid: user?.uid, personName: profile?.personName },
    });

    if (!editInvoiceId) bumpShopPiSerial(payload.invoiceNo);
    if (STOCK_AFFECTING_INVOICE_STATUSES.includes(payload.status)) await piUpdateProductCosts(payload, deferPersist);

    await persistOfflineDb();

    if (navigator.onLine) {
      window.S4Offline?.syncNow?.().catch(err => console.warn("[S4 Sync] purchase invoice save sync failed", err));
    }

    if (!editInvoiceId) {
      piOpenNew();
    } else if (savedDoc) {
      setSelInvoice(savedDoc);
      setPiView("detail");
    }
  };

  // A confirmed purchase becomes the product's latest cost, and a sale price typed on the line updates the product's price.
  const piUpdateProductCosts = async (payload, persistOpts = {}) => {
    if (!(canManagePurchase || can("manageProducts"))) return;
    const nowIso = new Date().toISOString();
    const billDay = String(payload.invoiceDate || nowIso).slice(0, 10);
    for (const it of payload.items || []) {
      if (!it.productId) continue;
      try {
        const rec = await offlineGetById("products", it.productId).catch(() => null);
        const prod = rec?.data || products.find(p => p.id === it.productId);
        if (!prod) continue;
        // A back-dated bill must not replace the cost/price of a newer purchase.
        if (prod.lastPurchaseDate && billDay < String(prod.lastPurchaseDate).slice(0, 10)) continue;
        const factor = Number(it.unitFactor) > 0 ? Number(it.unitFactor) : 1;
        const qty = Number(it.qty) || 0;
        const netCost = qty > 0 ? (Number(it.lineTotal) - Number(it.taxAmt || 0)) / qty / factor : Number(it.unitCost) / factor;
        const patch = {
          lastPurchaseVendorId: payload.vendorId || "",
          lastPurchaseVendorName: payload.vendorName || "",
          lastPurchaseInvoiceNo: payload.invoiceNo || "",
        };
        const lastDay = String(prod.lastPurchaseDate || "").slice(0, 10);
        if (!lastDay || billDay >= lastDay) patch.lastPurchaseDate = billDay;
        if (netCost > 0) {
          const lcStr = String(parseFloat(netCost.toFixed(4)));
          const costChanged = Math.abs(netCost - (Number(prod.landingCost) || 0)) > 0.0001;
          if (costChanged) {
            patch.landingCost = lcStr;
            patch.lastPurchaseCost = lcStr;
            Object.assign(patch, pricingPatchFromLanding(prod, netCost));
          } else if (!lastDay || billDay >= lastDay) {
            patch.lastPurchaseCost = lcStr;
          }
        }
        const sale = Number(it.salePrice) || 0;
        if (sale > 0 && factor === 1) {
          const priceKey = prod.vatInclusive ? "vatInclusive" : prod.mrp ? "mrp" : prod.vatExclusive ? "vatExclusive" : "vatInclusive";
          if (Math.abs(sale - (Number(prod[priceKey]) || 0)) > 0.0001) patch[priceKey] = String(sale);
        }
        const keys = Object.keys(patch).filter((k) => patch[k] !== undefined && patch[k] !== prod[k]);
        if (!keys.length) continue;
        const merged = { ...patch, updatedAt: nowIso };
        await offlinePatch("products", it.productId, merged, prod, persistOpts);
        onProductPatched?.(it.productId, merged);
      } catch (err) {
        console.warn("[S4 PI] product cost update failed", it.productId, err);
      }
    }
  };

  // ── Save ──
  const piSupplierInvoiceDuplicateOk = (payload) => {
    const key = (v) => String(v || "").trim().toLowerCase().replace(/\s+/g, " ");
    const supNo = key(payload.supplierInvoiceNo);
    const day = String(payload.invoiceDate || "").slice(0, 10);
    const sameVendor = (inv) => (payload.vendorId && inv.vendorId === payload.vendorId)
      || (!!key(payload.vendorName) && key(inv.vendorName) === key(payload.vendorName));
    const others = piMoneyInvoices.filter(inv => inv.id !== editInvoiceId && inv.status !== "cancelled" && sameVendor(inv));
    const bn = lang==="bn";

    if (supNo) {
      const same = others.filter(inv => key(inv.supplierInvoiceNo) === supNo);
      const sameDay = same.find(inv => String(inv.invoiceDate || "").slice(0, 10) === day);
      if (sameDay) {
        alert(bn
          ? `❌ ডুপ্লিকেট! এই সাপ্লায়ারের Supplier Invoice No "${payload.supplierInvoiceNo}" একই তারিখে (${day}) আগেই ${sameDay.invoiceNo}-এ এন্ট্রি করা আছে।\nআবার সেভ করা যাবে না।`
          : `❌ Duplicate! Supplier invoice "${payload.supplierInvoiceNo}" from this supplier on ${day} is already entered as ${sameDay.invoiceNo}.\nIt cannot be saved again.`);
        return false;
      }
      if (same.length) {
        const d = same[0];
        return window.confirm(bn
          ? `⚠️ এই সাপ্লায়ারের Supplier Invoice No "${payload.supplierInvoiceNo}" আগেই ${d.invoiceNo} (${d.invoiceDate||""})-এ এন্ট্রি করা আছে।\nতারিখ আলাদা — তবুও সেভ করবেন?`
          : `⚠️ Supplier invoice "${payload.supplierInvoiceNo}" from this supplier is already entered as ${d.invoiceNo} (${d.invoiceDate||""}).\nThe date differs — save anyway?`);
      }
      return true;
    }

    const lookalike = others.find(inv => String(inv.invoiceDate || "").slice(0, 10) === day && Math.abs(piN2(inv.grandTotal) - piN2(payload.grandTotal)) < 0.01);
    if (!lookalike) return true;
    return window.confirm(bn
      ? `⚠️ একই সাপ্লায়ার, একই তারিখ (${day}) আর একই টাকার (${piFmt2(payload.grandTotal)}) বিল আগেই ${lookalike.invoiceNo}-এ আছে।\nডুপ্লিকেট হতে পারে — তবুও সেভ করবেন?`
      : `⚠️ A bill from this supplier on ${day} for ${piFmt2(payload.grandTotal)} already exists as ${lookalike.invoiceNo}.\nIt may be a duplicate — save anyway?`);
  };

  // Vendor Master rules: a blocked vendor gets no new bills, the credit limit warns, credit days set the due date.
  const piVendorTermsOk = (payload, status) => {
    const bn = lang==="bn";
    const vendor = piVendorRecord(payload.vendorId, payload.vendorName);
    const prior = editInvoiceId ? invoices.find(inv => inv.id === editInvoiceId) : null;
    const sameVendorAsPrior = prior && ((vendor && prior.vendorId === vendor.id) || String(prior.vendorName||"").trim().toLowerCase() === String(payload.vendorName||"").trim().toLowerCase());
    if (vendor?.status === "blocked" && !sameVendorAsPrior) {
      toast(bn ? `❌ "${vendor.vendorName}" ব্লক করা — Vendor Master-এ Active না করলে নতুন বিল করা যাবে না` : `❌ "${vendor.vendorName}" is blocked — make it Active in Vendor Master to bill it`, "err");
      return false;
    }
    const days = Math.round(piN2(vendor?.paymentTerms));
    if (days > 0 && payload.invoiceDate) {
      const d = new Date(`${String(payload.invoiceDate).slice(0,10)}T00:00:00`);
      d.setDate(d.getDate() + days);
      payload.dueDate = localIsoDate(d);
      payload.creditDays = days;
    } else {
      payload.dueDate = "";
      payload.creditDays = 0;
    }
    const limit = piN2(vendor?.creditLimit);
    if (status === "draft" || limit <= 0 || piN2(payload.balanceDue) <= 0.01) return true;
    const outstanding = piMoneyInvoices
      .filter(inv => inv.id !== editInvoiceId && ["confirmed","partial"].includes(inv.status)
        && (inv.vendorId === vendor.id || String(inv.vendorName||"").trim().toLowerCase() === String(vendor.vendorName||"").trim().toLowerCase()))
      .reduce((sum, inv) => sum + Math.max(0, piN2(inv.balanceDue)), 0);
    const after = outstanding + piN2(payload.balanceDue);
    if (after <= limit + 0.01) return true;
    return window.confirm(bn
      ? `⚠️ "${vendor.vendorName}"-এর ক্রেডিট লিমিট ${piFmt2(limit)}।\nআগের বাকি ${piFmt2(outstanding)} + এই বিলের বাকি ${piFmt2(payload.balanceDue)} = ${piFmt2(after)} — লিমিট ছাড়িয়ে যাচ্ছে।\nতবুও সেভ করবেন?`
      : `⚠️ "${vendor.vendorName}" has a credit limit of ${piFmt2(limit)}.\nDue so far ${piFmt2(outstanding)} + this bill ${piFmt2(payload.balanceDue)} = ${piFmt2(after)} — over the limit.\nSave anyway?`);
  };

  const piSaveRun = async (status, successMsg) => {
    if (piSaveLockRef.current) return;
    piSaveLockRef.current = true;
    setPiSaving(true);
    try {
      const lockedBy = editInvoiceId ? billReturns.filter(r => r.status !== "cancelled" && r.invoiceId === editInvoiceId) : [];
      if (lockedBy.length) {
        toast(lang==="bn" ? `এই বিলে রিটার্ন আছে (${lockedBy.map(r=>r.returnNo).join(", ")}) — আগে রিটার্ন বাতিল করুন` : `This bill has return(s) ${lockedBy.map(r=>r.returnNo).join(", ")}; cancel them before editing`, "err");
        return;
      }
      const payload = piBuild(status, piInvoiceNo);
      if (!payload) return;
      if (!editInvoiceId && payload.goodsReceiptId) {
        const already = invoices.find(inv => inv.goodsReceiptId===payload.goodsReceiptId && inv.status!=="cancelled");
        if (already) { toast(lang==="bn" ? `❌ ${payload.goodsReceiptNo}-এর বিল আগেই হয়েছে: ${already.invoiceNo}` : `❌ ${payload.goodsReceiptNo} is already billed as ${already.invoiceNo}`, "err"); return; }
      }
      if (status!=="draft" && !unlinkedStockOk(payload.items, lang)) return;
      if (!piVendorTermsOk(payload, status)) return;
      if (!piSupplierInvoiceDuplicateOk(payload)) return;
      if (!editInvoiceId) payload.invoiceNo = await reservePiInvoiceNo();
      await savePurchaseInvoiceOffline(payload, editInvoiceId ? t.pi_updated : successMsg);
      if (!editInvoiceId) setPiSource(null);
    } catch(e) {
      toast(e.message,"err");
    } finally {
      piSaveLockRef.current = false;
      setPiSaving(false);
    }
  };
  const piSaveDraft = () => piSaveRun("draft", t.pi_saved);
  const piConfirm = () => piSaveRun("confirmed", t.pi_confirmed);

  // "Make Payment" from an invoice: jump to the Payments tab, New Voucher form, pre-selected for this vendor.
  // The new voucher form pre-fills this exact invoice's row with its full balance — other open invoices for
  // the same vendor are shown too, so the user can combine them into one voucher if they want.
  const piGoToMakePayment = (inv) => {
    if (!canVendorPayments) return;
    setPmtPrefillVendorId(inv.vendorId || inv.vendorName);
    setPmtPrefillInvoiceId(inv.id);
    setSelVoucher(null);
    setPmtView("new");
    setPiSubTab("payments");
    setPiView("list");
  };
  const piCancelInv = async (inv) => {
    if (!isOwner && !can("managePurchase")) {
      toast(lang==="bn" ? "পারচেজ বিল বাতিল করার অনুমতি নেই" : "You are not allowed to cancel purchase bills", "err");
      return;
    }
    if (isOpeningBill(inv)) { toast(lang==="bn" ? "এটা Opening Balance বিল — ভেন্ডর মাস্টার থেকে শুরুর ব্যালেন্স বদলান।" : "This is an Opening Balance bill — change the opening balance in Vendor Master.", "err"); return; }
    if (isBranchTransferBill(inv)) { toast(lang==="bn" ? "এটা Branch Transfer রিসিভের বিল — Branch Transfer থেকে নিয়ন্ত্রণ হয়, এখানে বদলানো যাবে না।" : "This bill comes from a Branch Transfer receipt — manage it from Branch Transfer.", "err"); return; }
    const activeVouchers = payments.filter(p => p.status !== "cancelled" && (p.allocations||[]).some(a => a.invoiceId === inv.id));
    if (activeVouchers.length) {
      const nos = activeVouchers.map(p => p.paymentNo).join(", ");
      toast(lang==="bn" ? `আগে পেমেন্ট ভাউচার বাতিল করুন: ${nos}` : `Cancel the payment voucher(s) first: ${nos}`, "err");
      return false;
    }
    const activeReturns = billReturns.filter(r => r.status !== "cancelled" && r.invoiceId === inv.id);
    if (activeReturns.length) {
      const nos = activeReturns.map(r => r.returnNo).join(", ");
      toast(lang==="bn" ? `আগে পারচেজ রিটার্ন বাতিল করুন: ${nos}` : `Cancel the purchase return(s) first: ${nos}`, "err");
      return false;
    }
    if (!window.confirm(t.pi_confirmCancel)) return false;
    try {
      const nowIso = new Date().toISOString();
      const result = await offlinePatch("purchaseInvoices", inv.id, {
        status:"cancelled",
        updatedAt:nowIso,
        updatedBy:user?.uid || "",
      }, inv);

      const updated = { ...result.data, id: inv.id };
      setInvoices(prev => prev.map(x => x.id === inv.id ? updated : x));
      setSelInvoice(updated);

      if (!inv.goodsReceiptId) await applyInvoiceStockEffect({
        oldInvoice: inv,
        newInvoice: updated,
        invoiceId: inv.id,
        applyType: "purchase",
        reverseType: "adjustment",
        referenceType: "purchase_invoice",
        unitCostKey: "unitCost",
        shopId,
        actor: { uid: user?.uid, personName: profile?.personName },
      });

      if (canManagePurchase || can("manageProducts")) {
        const ids = [...new Set((inv.items || []).map((it) => it.productId).filter(Boolean))];
        const live = piMoneyInvoices.filter((i) => i.id !== inv.id && i.status !== "cancelled" && i.status !== "draft");
        for (const pid of ids) {
          let latest = null;
          for (const row of live) {
            if (!(row.items || []).some((it) => it.productId === pid)) continue;
            if (!latest || String(row.invoiceDate) > String(latest.invoiceDate)) latest = row;
          }
          if (latest) await piUpdateProductCosts(latest);
        }
      }

      toast(t.pi_cancelledMsg,"err");
      logAudit({ shopId, user, profile, action:"cancel", collection:"purchaseInvoices", docId:inv.id, docNo:inv.invoiceNo, amount:inv.grandTotal, note:inv.vendorName });

      if (navigator.onLine) {
        window.S4Offline?.syncNow?.().catch(err => console.warn("[S4 Sync] purchase invoice cancel sync failed", err));
      }
      return true;
    } catch(e){ toast(e.message,"err"); return false; }
  };
  const piDelete = async (inv) => {
    if (isOpeningBill(inv)) { toast(lang==="bn" ? "এটা Opening Balance বিল — ভেন্ডর মাস্টার থেকে শুরুর ব্যালেন্স বদলান।" : "This is an Opening Balance bill — change the opening balance in Vendor Master.", "err"); return; }
    if (isBranchTransferBill(inv)) { toast(lang==="bn" ? "এটা Branch Transfer রিসিভের বিল — Branch Transfer থেকে নিয়ন্ত্রণ হয়, এখানে বদলানো যাবে না।" : "This bill comes from a Branch Transfer receipt — manage it from Branch Transfer.", "err"); return; }
    if (!window.confirm(t.pi_confirmDelete)) return;
    try {
      await offlineRemove("purchaseInvoices", inv.id);

      setInvoices(prev => prev.filter(x => x.id !== inv.id));
      setPiView("list");
      setSelInvoice(null);
      toast(t.pi_deleted,"err");
      logAudit({ shopId, user, profile, action:"delete", collection:"purchaseInvoices", docId:inv.id, docNo:inv.invoiceNo, amount:inv.grandTotal, note:inv.vendorName });

      if (navigator.onLine) {
        window.S4Offline?.syncNow?.().catch(err => console.warn("[S4 Sync] purchase invoice delete sync failed", err));
      }
    } catch(e){ toast(e.message,"err"); }
  };

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

  if (piView==="list" || (piView==="form" && piWin.min && wideDesktop)) {
    const groups = groupInvoicesByParty(piFiltered, { idField:"vendorId", nameField:"vendorName" });
    const openGroup = piGroupMode==="folders" && piOpenParty ? (groups.find(g=>g.key===piOpenParty) || null) : null;
    const rows = openGroup ? openGroup.invoices : piFiltered;
    const groupName = (g) => g.isCash ? (bnL?"নাম ছাড়া":"No name") : g.name;
    const rowsSum = rows.reduce((a,inv)=>{
      if (!["cancelled","draft"].includes(inv.status) && !isBranchTransferBill(inv)) { a.total += piN2(inv.grandTotal); a.due += piRowDue(inv); }
      if (inv.status==="draft") a.drafts += 1;
      return a;
    }, { total:0, due:0, drafts:0 });
    const showParties = piGroupMode==="folders" && (!piMobile || !openGroup);
    const showInvoices = piGroupMode==="all" || !piMobile || !!openGroup;
    const subTabs = [
      ...(canManagePurchase ? [{ key:"invoices", icon:"📋", bn:"ইনভয়েস", en:"Invoices" }] : []),
      ...(canViewSupplierLedger ? [{ key:"ledger", icon:"🏭", bn:"সাপ্লায়ার লেজার", en:"Supplier Ledger" }] : []),
      ...(canVendorPayments ? [{ key:"payments", icon:"💳", bn:"পেমেন্ট", en:"Payments" }] : []),
    ];
    return (
      <div ref={piRootRef} className="si-root" style={piRootStyle}>
        <style>{PM_CSS}</style>
        <style>{SI_CSS}</style>
        {piView==="form"&&piWin.min&&(
          <MinimizedChip lang={lang} onRestore={piWin.restore}
            title={`PURCHASE INVOICE ${piInvoiceNo||""}`}
            onClose={()=>{ if (piLeaveUnsavedOk()) setPiView("list"); }} />
        )}

        <div className="pm-reference-title">
          <strong style={{ color:piAccent }}>{bnL?"ক্রয় ইনভয়েস":"PURCHASE INVOICE"}</strong>
          <span>{invoices.length} {bnL?"টি":"total"}</span>
        </div>

        <div className="si-toolbar">
          {canManagePurchase&&piSubTab==="invoices"&&(
            <button type="button" className="pm-btn pm-btn--primary" onClick={()=>{ if (piLeaveMinOk()) piOpenNew(); }} disabled={piSaving}>
              {piSaving?"...":(bnL?"+ নতুন ইনভয়েস":"+ New Invoice")}{!piMobile&&!piSaving?" (F3)":""}
            </button>
          )}
          {canVendorPayments&&piSubTab==="payments"&&pmtView==="list"&&(
            <button type="button" className="pm-btn pm-btn--primary" onClick={()=>{ setPmtPrefillVendorId(null); setSelVoucher(null); setPmtView("new"); }}>{t.pi_newPayment}</button>
          )}
          {canVendorPayments&&piSubTab==="payments"&&pmtView==="list"&&(
            <button type="button" className="pm-btn-secondary" onClick={()=>setChqWizard({ vendorId:null })}>🖨️ {bnL?"ভেন্ডর চেক":"Vendor Cheque"}</button>
          )}
          <span className="si-toolbar-gap" />
          {subTabs.length>1&&(
            <div className="si-pills">
              {subTabs.map(tab=>(
                <button key={tab.key} type="button" className={`pm-btn-secondary${piSubTab===tab.key?" is-active":""}`}
                  onClick={()=>{ setPiSubTab(tab.key); if(tab.key==="ledger") setPiLedgerHidden(false); if(tab.key==="payments"){ setPmtView("list"); setSelVoucher(null); } }}>
                  {tab.icon} {bnL?tab.bn:tab.en}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className={piSubTab==="invoices"?undefined:"si-body"} style={piSubTab==="invoices"?{ display:"contents" }:undefined}>
          {/* ── SUB-TAB: SUPPLIER LEDGER ── */}
          {piSubTab==="ledger"&&canViewSupplierLedger&&piLedgerHidden&&(
            <div style={{ textAlign:"center", padding:"40px 16px" }}>
              <button onClick={()=>setPiLedgerHidden(false)} style={{ padding:"12px 22px", borderRadius:10, border:"none", background:"linear-gradient(135deg,#f97316,#ea580c)", color:"#fff", fontSize:14, fontWeight:700, cursor:"pointer" }}>
                📒 {lang==="bn"?"সাপ্লায়ার লেজার খুলুন":"Open Supplier Ledger"}
              </button>
            </div>
          )}
          {piSubTab==="ledger"&&canViewSupplierLedger&&!piLedgerHidden&&(
            <PartyLedgerWindow lang={lang} mode="supplier" cur={t.cur||"AED"} shopName={shop?.companyName||""}
              partyCodes={Object.fromEntries((vendors||[]).filter(v=>v.vendorCode).map(v=>[v.id, v.vendorCode]))}
              partyTrns={Object.fromEntries((vendors||[]).filter(v=>v.trnNumber).map(v=>[v.id, v.trnNumber]))}
              invoices={piMoneyInvoices.map(inv=>({ id:inv.id, no:inv.invoiceNo, date:String(inv.invoiceDate||"").slice(0,10), partyId:inv.vendorId||null, partyName:inv.vendorName||"", partyMobile:inv.vendorMobile||"", total:inv.grandTotal, paid:inv.amountPaid, status:inv.status, ref:inv.supplierInvoiceNo||"", method:inv.paymentMethod, raw:inv }))}
              vouchers={(canVendorPayments ? payments.map(p=>({ id:p.id, no:p.paymentNo, date:String(p.paymentDate||"").slice(0,10), partyId:p.vendorId||null, partyName:p.vendorName||"", partyMobile:p.vendorMobile||"", method:p.method, amount:p.totalAmount, status:p.status, allocations:withSupRefs(p).allocations, raw:p })) : [])
                .concat(returnsAsLedgerVouchers(billReturns, "purchase"))}
              onOpenInvoice={(inv)=>{ setPiNavReturn("ledger"); setSelInvoice(inv); setPiView("detail"); }}
              onOpenVoucher={canVendorPayments ? (v)=>{ if (v?.raw?.__return) return; setPiNavReturn("ledger"); setSelVoucher(v); setPmtView("detail"); setPiSubTab("payments"); } : undefined}
              onNewVoucher={canVendorPayments ? (p)=>{ setPmtPrefillVendorId(p.id||p.name); setPmtPrefillInvoiceId(null); setSelVoucher(null); setPmtView("new"); setPiSubTab("payments"); } : undefined}
              onClose={()=>{ if (canManagePurchase||canVendorPayments) setPiSubTab(canManagePurchase?"invoices":"payments"); else setPiLedgerHidden(true); }} />
          )}
          {/* ── SUB-TAB: PAYMENTS (Vendor Payment Voucher — Cash/Cheque, partial across open invoices) ── */}
          {piSubTab==="payments"&&canVendorPayments&&pmtView==="list"&&(
            <PiPaymentsListTab payments={payments} loading={pmtLoading} t={t} lang={lang} mobile={piMobile}
              onOpen={(v)=>{ setSelVoucher(v); setPmtView("detail"); }} />
          )}
          {piSubTab==="payments"&&canVendorPayments&&pmtView==="new"&&isDesktop&&(()=>{
            const openAll = piMoneyInvoices.filter(inv => ["confirmed","partial"].includes(inv.status) && piN2(inv.balanceDue)>0.01);
            const prefParty = pmtPrefillVendorId ? (vendors.find(v=>v.id===pmtPrefillVendorId) ? { partyId:pmtPrefillVendorId } : { partyName:pmtPrefillVendorId }) : null;
            return (
              <AgainstInvoiceVoucherWindow
                lang={lang} mode="payment" cur={t.cur||"AED"}
                voucherNo={piFormatPaymentNo(piMaxLocalPaymentSerial() + 1)}
                parties={voucherParties(vendors, openAll, "vendorId", "vendorName", v=>v.vendorName, v=>v.mobileNumber||v.whatsappNumber)}
                banks={UAE_BANKS.map(b=>b.name)}
                getOpenInvoices={(p)=>getVendorOpenInvoices(p.id, p.name)}
                vouchers={payments.map(p=>toVoucherView(withSupRefs(p),"payment"))}
                prefill={prefParty ? { ...prefParty, invoiceId:pmtPrefillInvoiceId } : null}
                saving={pmtSaving}
                onSave={async (d)=>{
                  const created = await piSavePaymentVoucher({ vendorId:d.partyId, vendorName:d.partyName, vendorMobile:d.partyMobile, method:d.method, paymentDate:d.date, note:d.note, chequeNo:d.chequeNo, chequeBank:d.chequeBank, chequeDate:d.chequeDate, chequeReceivedBy:d.chequeReceivedBy, vendorReceiptNo:d.vendorReceiptNo, refNo:d.refNo, refBank:d.refBank, refDate:d.refDate, allocations:d.allocations }, { stayOpen:true });
                  return created ? toVoucherView(withSupRefs(created),"payment") : null;
                }}
                onCancelVoucher={(isOwner||canVendorPayments) ? async (v)=>{ const u = await piCancelPaymentVoucher(v.raw); return u ? toVoucherView(u,"payment") : null; } : undefined}
                onDeleteVoucher={isOwner ? (v)=>piDeletePaymentVoucher(v.raw) : undefined}
                onSetChequeStatus={isOwner ? async (v,st)=>{ const u = await piSetVoucherChequeStatus(v.raw, st); return u ? toVoucherView(u,"payment") : null; } : undefined}
                onPrint={(v)=>printPaymentVoucher(v.raw, shop, lang)}
                onClose={()=>{ setPmtView("list"); setPmtPrefillVendorId(null); setPmtPrefillInvoiceId(null); }}
              />
            );
          })()}
          {piSubTab==="payments"&&canVendorPayments&&pmtView==="new"&&!isDesktop&&(
            <PiNewPaymentForm prefillVendorId={pmtPrefillVendorId}
              vendors={[
                ...(vendors||[]),
                ...[...new Set(piMoneyInvoices
                  .filter(inv => !inv.vendorId && inv.vendorName && ["confirmed","partial"].includes(inv.status) && piN2(inv.balanceDue)>0.01)
                  .map(inv => inv.vendorName))]
                  .filter(name => !(vendors||[]).some(v => v.vendorName===name))
                  .map(name => ({ id:null, vendorName:name, mobileNumber:invoices.find(inv=>inv.vendorName===name)?.vendorMobile||"" })),
              ]}
              getVendorOpenInvoices={getVendorOpenInvoices} saving={pmtSaving}
              onSave={piSavePaymentVoucher} onCancel={()=>{ setPmtView("list"); setPmtPrefillVendorId(null); }}
              t={t} th={th} lang={lang} isDesktop={isDesktop} />
          )}
          {piSubTab==="payments"&&canVendorPayments&&pmtView==="detail"&&selVoucher&&(
            <PiVoucherDetailView voucher={withSupRefs(selVoucher)} t={t} th={th} lang={lang} isOwner={isOwner}
              onBack={()=>{ setPmtView("list"); setSelVoucher(null); }}
              onCancel={(isOwner||canVendorPayments) ? ()=>piCancelPaymentVoucher(selVoucher) : undefined}
              onDelete={isOwner ? async ()=>{ if (await piDeletePaymentVoucher(selVoucher)) { setPmtView("list"); setSelVoucher(null); } } : undefined}
              onSetChequeStatus={(st)=>piSetVoucherChequeStatus(selVoucher,st)}
              onPrint={()=>printPaymentVoucher(withSupRefs(selVoucher), shop, lang)}
              onPrintCheque={onOpenChequePrinter ? ()=>openVoucherInChequePrinter(selVoucher) : undefined}
              onPrintChequeVoucher={()=>printChequePaymentVoucher(selVoucher)}
              onHandover={()=>openChequeHandover(selVoucher)}
              onViewInvoice={(invoiceId)=>{ const inv=invoices.find(i=>i.id===invoiceId); if(inv){ setSelInvoice(inv); setPiSubTab("invoices"); setPiView("detail"); } }}
            />
          )}
          {chqWizard&&canVendorPayments&&(
            <VendorChequeWizard
              lang={lang} cur={t.cur||"AED"}
              vendors={voucherParties(vendors, piMoneyInvoices.filter(inv => ["confirmed","partial"].includes(inv.status) && piN2(inv.balanceDue)>0.01), "vendorId", "vendorName", v=>v.vendorName, v=>v.mobileNumber||v.whatsappNumber)}
              banks={UAE_BANKS.map(b=>b.name)}
              getOpenInvoices={(p)=>getVendorOpenInvoices(p.id, p.name)}
              amountWords={(n)=>`${amountToWordsAED(n)} Only`}
              initialVendorId={chqWizard.vendorId}
              saving={pmtSaving}
              onSave={(payload)=>piSavePaymentVoucher(payload, { stayOpen:true })}
              onPrintCheque={onOpenChequePrinter ? (v)=>{ setChqWizard(null); openVoucherInChequePrinter(v); } : undefined}
              onPrintVoucher={(v)=>printChequePaymentVoucher(v)}
              onHandover={(v)=>openChequeHandover(v)}
              onClose={()=>setChqWizard(null)}
            />
          )}
          {chqHandover&&(
            <ChequeHandoverModal
              lang={lang} cur={t.cur||"AED"}
              voucher={chqHandover}
              saving={chqHandoverSaving}
              onSave={(h)=>piSaveChequeHandover(chqHandover, h)}
              onPrint={(h)=>printChequeHandover(chqHandover, h)}
              onClose={()=>setChqHandover(null)}
            />
          )}
        </div>

        {piSubTab==="invoices"&&canManagePurchase&&(<>
          {invoices.length>0&&(
            <div className="si-kpis">
              {[
                { l:t.pi_totalInvoices, v:piKPIs.total, c:"#07101c", pre:"" },
                { l:t.pi_totalAmount,   v:piFmt2(piKPIs.amount), c:piAccent, pre:`${t.cur} ` },
                { l:t.pi_totalPaid,     v:piFmt2(piKPIs.paid),   c:"#15803d", pre:`${t.cur} ` },
                { l:t.pi_totalDue,      v:piFmt2(piKPIs.due),    c:piKPIs.due>0?"#b91c1c":"#15803d", pre:`${t.cur} ` },
              ].map((k,i)=>(
                <div key={i} className="si-kpi"><span>{k.l}</span><b style={{ color:k.c }}>{k.pre}{k.v}</b></div>
              ))}
            </div>
          )}

          <div className="si-filters">
            <div className="si-search">
              <input className="pm-input" placeholder={t.pi_searchPh} value={piSearch} onChange={e=>setPiSearch(e.target.value)} />
              {piSearch&&<button type="button" aria-label="Clear" onClick={()=>setPiSearch("")}>✕</button>}
            </div>
            <div className="si-pills">
              {["ALL",...Object.keys(PI_STATUSES)].map(st=>(
                <button key={st} type="button" className={`pm-btn-secondary${piStatusF===st?" is-active":""}`} onClick={()=>setPiStatusF(st)}>
                  {st==="ALL"?t.pi_allStatus:PI_STATUSES[st]?.[lang]}
                </button>
              ))}
            </div>
            <div className="si-pills">
              {[["folders", bnL?"📁 নাম অনুযায়ী":"📁 By name"], ["all", bnL?"📋 সব":"📋 All"]].map(([m,label])=>(
                <button key={m} type="button" className={`pm-btn-secondary${piGroupMode===m?" is-active":""}`} onClick={()=>{ setPiGroupMode(m); setPiOpenParty(null); }}>{label}</button>
              ))}
            </div>
          </div>

          <div className={`si-main${piGroupMode==="all" || piMobile ? " is-all" : ""}`}>
            {showParties&&(
              <div className="si-box">
                <table className="pm-table">
                  <colgroup><col /><col style={{ width:piMobile?96:76 }} /><col style={{ width:piMobile?84:68 }} /></colgroup>
                  <thead><tr><th>{t.pi_vendor}</th><th className="si-num">{bnL?"মোট":"Total"}</th><th className="si-num">{bnL?"বাকি":"Due"}</th></tr></thead>
                  <tbody>
                    {!piMobile&&groups.length>0&&(
                      <tr className={`pm-clickable${!openGroup?" pm-selected":""}`} onClick={()=>setPiOpenParty(null)}>
                        <td className="si-strong">{bnL?"সব ভেন্ডর":"All vendors"} ({piFiltered.length})</td><td /><td />
                      </tr>
                    )}
                    {groups.map(g=>(
                      <tr key={g.key} className={`pm-clickable si-party-row${openGroup?.key===g.key?" pm-selected":""}`} onClick={()=>setPiOpenParty(g.key)}>
                        <td className="si-wrap">
                          {groupName(g)}
                          <div className="si-muted" style={{ fontWeight:400, fontSize:"0.9em" }}>
                            {g.invoices.length} {bnL?"টি":(g.invoices.length===1?"bill":"bills")}{g.lastDate?` · ${g.lastDate}`:""}
                          </div>
                        </td>
                        <td className="si-num">{piFmt2(g.total)}</td>
                        <td className={`si-num${g.due>0.01?" si-due":""}`}>{g.due>0.01?piFmt2(g.due):"-"}</td>
                      </tr>
                    ))}
                    {groups.length===0&&<tr><td colSpan={3} className="si-empty">{piLoading?"⏳":invoices.length===0?t.pi_noInvoices:t.pi_noResults}</td></tr>}
                  </tbody>
                </table>
              </div>
            )}

            {showInvoices&&(
              <div className="si-box">
                {piMobile&&openGroup&&(
                  <button type="button" className="pm-btn-secondary" style={{ width:"100%", minHeight:36, marginBottom:3 }} onClick={()=>setPiOpenParty(null)}>
                    ← {bnL?"সব ভেন্ডর":"All vendors"} · {groupName(openGroup)}
                  </button>
                )}
                {piLoading ? <div className="si-empty">⏳ {t.pi_loading}</div>
                  : invoices.length===0 ? <div className="si-empty">{t.pi_noInvoices}</div>
                  : rows.length===0 ? <div className="si-empty">🔍 {t.pi_noResults}</div>
                  : piMobile ? rows.map(inv=>{
                    const due = piRowDue(inv);
                    return (
                      <button key={inv.id} type="button" className="si-mrow" onClick={()=>piOpenInvoice(inv)}>
                        <div className="si-mrow-top">
                          <span style={{ color:piAccent }}>{inv.invoiceNo}{piBtTag(inv)}</span>
                          <span>{piBadge(inv.status)}</span>
                        </div>
                        <div className="si-mrow-sub"><span>{inv.vendorName||"—"}</span><b>{t.cur} {piFmt2(inv.grandTotal)}</b></div>
                        <div className="si-mrow-sub">
                          <span>{inv.invoiceDate}{inv.supplierInvoiceNo?` · ${inv.supplierInvoiceNo}`:""}</span>
                          {due>0.01&&<span className="si-due">{bnL?"বাকি":"Due"} {piFmt2(due)}</span>}
                        </div>
                        {piMatchBlock(inv)}
                      </button>
                    );
                  })
                  : (
                    <table className="pm-table">
                      <colgroup>
                        <col style={{ width:96 }} /><col style={{ width:78 }} /><col /><col style={{ width:96 }} /><col style={{ width:84 }} />
                        <col style={{ width:42 }} /><col style={{ width:84 }} /><col style={{ width:84 }} /><col style={{ width:84 }} /><col style={{ width:100 }} />
                      </colgroup>
                      <thead>
                        <tr>
                          <th>{t.pi_invoiceNo}</th><th>{t.pi_date}</th><th>{t.pi_vendor}</th><th>{bnL?"সাপ্লায়ার বিল":"Supplier Inv"}</th><th>{bnL?"স্ট্যাটাস":"Status"}</th>
                          <th className="si-num">{bnL?"আইটেম":"Items"}</th><th className="si-num">{bnL?"মোট":"Total"}</th><th className="si-num">{bnL?"পরিশোধ":"Paid"}</th>
                          <th className="si-num">{bnL?"বাকি":"Due"}</th><th>{t.pi_createdBy}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map(inv=>{
                          const due = piRowDue(inv);
                          const matches = piMatchBlock(inv);
                          return (
                            <tr key={inv.id} className="pm-clickable" onClick={()=>piOpenInvoice(inv)} title={inv.note||""}>
                              <td className="si-strong" style={{ color:piAccent }} title={inv.invoiceNo}>{inv.invoiceNo}{piBtTag(inv)}</td>
                              <td>{inv.invoiceDate}</td>
                              <td className={matches.length?"si-wrap":""} title={inv.vendorName||""}>{inv.vendorName||"—"}{matches}</td>
                              <td title={inv.supplierInvoiceNo||""}>{inv.supplierInvoiceNo||"-"}</td>
                              <td>{piBadge(inv.status)}</td>
                              <td className="si-num">{inv.items?.length||0}</td>
                              <td className="si-num si-strong">{piFmt2(inv.grandTotal)}</td>
                              <td className="si-num">{piN2(inv.amountPaid)>0?piFmt2(inv.amountPaid):"-"}</td>
                              <td className={`si-num${due>0.01?" si-due":""}`}>{due>0.01?piFmt2(due):"-"}</td>
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
            <span>{bnL?"মোট":"Total"}: <b>{t.cur} {piFmt2(rowsSum.total)}</b></span>
            <span>{bnL?"বাকি":"Due"}: <b style={{ color:rowsSum.due>0.01?"#b91c1c":undefined }}>{t.cur} {piFmt2(rowsSum.due)}</b></span>
            {rowsSum.drafts>0&&<span style={{ color:"#b45309" }}>{bnL?`${rowsSum.drafts}টি ড্রাফট মোটে ধরা হয়নি`:`${rowsSum.drafts} draft(s) not counted in totals`}</span>}
          </div>
        </>)}
      </div>
    );
  }

  // ══════ DETAIL VIEW ══════
  if (piView==="detail"&&selInvoice) {
    const inv = invoices.find(x=>x.id===selInvoice.id) || selInvoice;
    const items = inv.items||[];
    const calc = piCalcTotals(items);
    const grand = items.length ? calc.grand : piN2(inv.grandTotal);
    const bal = grand - piN2(inv.amountPaid);
    const isOB = isOpeningBill(inv);
    const isBT = isBranchTransferBill(inv);
    const canEdit = !isOB && !isBT && piCanEditInv(inv) && ["draft","confirmed"].includes(inv.status);
    const canPay = !isBT && canVendorPayments && ["confirmed","partial"].includes(inv.status) && bal>0.01;
    const canCancel = !isOB && !isBT && isOwner && ["draft","confirmed","partial","paid"].includes(inv.status);
    const canDel = !isOB && !isBT && isOwner && ["draft","cancelled"].includes(inv.status);
    const related = getRelatedPayments(inv.id);
    const vendorCode = inv.vendorId ? (vendors||[]).find(v=>v.id===inv.vendorId)?.vendorCode : "";
    const vRow = (label, value, opts={}) => (
      <div className="pm-form-row">
        <label className="pm-label">{label}</label>
        <div className={`si-val${opts.strong?" is-strong":""}`} style={opts.color?{ color:opts.color }:undefined}>{value}</div>
      </div>
    );
    const totalRows = [
      [t.pi_subtotal, piFmt2(items.length ? calc.sub : grand)],
      ...(calc.disc>0?[[t.pi_totalDiscount, `- ${piFmt2(calc.disc)}`, "#b91c1c"]]:[]),
      ...(calc.tax>0?[[t.pi_totalTax, `+ ${piFmt2(calc.tax)}`, "#0e7490"]]:[]),
    ];
    const back = () => piLeaveDetail();
    return (
      <div ref={piRootRef} className="si-root" style={piRootStyle}>
        <style>{PM_CSS}</style>
        <style>{SI_CSS}</style>

        <div className="pm-reference-title">
          <strong style={{ color:piAccent }}>{bnL?"ক্রয় ইনভয়েস":"PURCHASE INVOICE"} — {inv.invoiceNo}</strong>
          <span>{piBadge(inv.status)}</span>
        </div>

        <div className="si-body">
          <div className="si-cols">
            <fieldset className="pm-panel">
              <legend className="pm-panel-legend">{bnL?"ডকুমেন্ট":"Document"}</legend>
              <div className="si-panel-body">
                {vRow(t.pi_invoiceNo, inv.invoiceNo, { strong:true, color:piAccent })}
                {inv.supplierInvoiceNo&&vRow(t.pi_supplierInvoiceNo, inv.supplierInvoiceNo, { color:"#7e22ce" })}
                {inv.refNo&&vRow("Ref. No", inv.refNo)}
                {inv.purchaseOrderNo&&vRow(bnL?"পারচেজ অর্ডার":"Purchase Order", inv.purchaseOrderNo, { color:"#1d4ed8" })}
                {inv.goodsReceiptNo&&vRow(bnL?"মাল গ্রহণ (DN)":"Goods Received (DN)", inv.goodsReceiptNo, { color:"#0f766e" })}
                {inv.currency&&vRow(bnL?"মুদ্রা":"Currency", `${inv.currency} ${piFmt2(inv.fcGrandTotal)} @ ${inv.exchangeRate}`, { color:"#0e7490" })}
                {vRow(t.pi_date, inv.invoiceDate||"-")}
                {vRow(t.pi_createdBy, inv.createdByName||"-")}
                {isOB&&<div className="si-note">{bnL?"এটা ভেন্ডরের শুরুর ব্যালেন্স (Opening Balance) — বদলাতে ভেন্ডর মাস্টারে যান।":"This is the vendor's opening balance — change it in Vendor Master."}</div>}
                {isBT&&<div className="si-note">🚚 {bnL?`Branch Transfer ${inv.branchTransferNo||""} → ${inv.branchName||""} রিসিভের বিল। এটা দোকানের ভেতরে মাল সরানোর হিসাব — স্টক, ক্রয়ের মোট আর সাপ্লায়ারের বাকিতে ধরা হয় না। আসল সাপ্লায়ার বিল আলাদা Purchase Invoice-এ থাকবে।`:`Receipt bill of Branch Transfer ${inv.branchTransferNo||""} → ${inv.branchName||""}. It only records goods moving inside the shop — not counted in stock, purchase totals or supplier dues. The real supplier bill stays a separate Purchase Invoice.`}</div>}
              </div>
            </fieldset>
            <fieldset className="pm-panel">
              <legend className="pm-panel-legend">🏭 {t.pi_vendor}</legend>
              <div className="si-panel-body">
                {vRow(bnL?"নাম":"Name", inv.vendorName||"—", { strong:true })}
                {vendorCode&&vRow(bnL?"কোড":"Code", vendorCode)}
                {vRow(bnL?"মোবাইল":"Mobile", inv.vendorMobile||"-")}
                {inv.note&&<div className="si-note">📝 {inv.note}</div>}
              </div>
            </fieldset>
          </div>

          {items.length>0&&(
            <fieldset className="pm-panel">
              <legend className="pm-panel-legend">📦 {t.pi_items} ({items.length})</legend>
              <div className="si-panel-body"><PiItemsTable items={items} lang={lang} /></div>
            </fieldset>
          )}

          <div className="si-cols">
            <fieldset className="pm-panel">
              <legend className="pm-panel-legend">{t.pi_summary}</legend>
              <div className="si-panel-body">
                {totalRows.map(([l,v,c],i)=>(
                  <div key={i} className="si-total-row"><span>{l}</span><b style={c?{ color:c }:undefined}>{t.cur} {v}</b></div>
                ))}
                <div className="si-total-row is-grand"><span>{t.pi_grandTotal}</span><span style={{ color:piAccent }}>{t.cur} {piFmt2(grand)}</span></div>
              </div>
            </fieldset>
            <fieldset className="pm-panel">
              <legend className="pm-panel-legend">💳 {t.pi_payment}</legend>
              <div className="si-panel-body">
                <div className="si-total-row"><span>{t.pi_paymentMethod}</span><b>{PI_PAY_METHODS[inv.paymentMethod]?.icon} {PI_PAY_METHODS[inv.paymentMethod]?.[lang]||"-"}</b></div>
                <div className="si-total-row"><span>{t.pi_amountPaid}</span><b style={{ color:"#15803d" }}>{t.cur} {piFmt2(inv.amountPaid)}</b></div>
                <div className={`si-paid-box${bal>0.01?" is-due":""}`}><span>{bal>0.01?t.pi_balanceDue:t.pi_alreadyFullyPaid}</span><span>{t.cur} {piFmt2(Math.max(0,bal))}</span></div>
                {related.length>0&&(
                  <div className="pm-table-wrap" style={{ marginTop:3 }}>
                    <table className="pm-table">
                      <colgroup><col /><col style={{ width:80 }} /><col style={{ width:84 }} /></colgroup>
                      <thead><tr><th>💳 {t.pi_relatedPayments}</th><th>{t.pi_date}</th><th className="si-num">{bnL?"টাকা":"Amount"}</th></tr></thead>
                      <tbody>
                        {related.map(({ payment, allocAmount })=>{
                          const off = payment.status==="cancelled";
                          const chq = payment.method==="cheque" && !off ? (PI_CHEQUE_STATUSES[payment.chequeStatus]||PI_CHEQUE_STATUSES.pending) : null;
                          return (
                            <tr key={payment.id} className="pm-clickable" style={off?{ opacity:0.55 }:undefined}
                              onClick={()=>{ setSelVoucher(payment); setPmtView("detail"); setPiSubTab("payments"); setPiView("list"); }}>
                              <td>{PI_VOUCHER_METHODS[payment.method]?.icon||"💵"} {payment.paymentNo}{off?(bnL?" (বাতিল)":" (cancelled)"):""}{chq?<span style={{ color:chq.color }}> · {chq[lang]}</span>:null}</td>
                              <td>{payment.paymentDate}</td>
                              <td className="si-num si-strong" style={off?{ textDecoration:"line-through" }:{ color:"#15803d" }}>{piFmt2(allocAmount)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </fieldset>
          </div>
        </div>

        <div className="si-actions">
          <button type="button" className="pm-btn-secondary" onClick={back}>← {bnL?"তালিকা":"List"}</button>
          {canEdit&&<button type="button" className="pm-btn pm-btn--primary" onClick={()=>piOpenEdit(inv)}>✏️ {t.pi_editBtn}</button>}
          {canPay&&<button type="button" className="pm-btn" onClick={()=>piGoToMakePayment(inv)}>{t.pi_makePayment}</button>}
          {canCancel&&<button type="button" className="pm-btn pm-btn--danger" onClick={()=>piCancelInv(inv)}>{bnL?"বাতিল":"Cancel"}</button>}
          {canDel&&<button type="button" className="pm-btn pm-btn--danger" onClick={()=>piDelete(inv)}>🗑 {bnL?"মুছুন":"Delete"}</button>}
          {canCancel&&inv.status!=="draft"&&<span className="si-hint">{bnL?"মুছতে চাইলে আগে বাতিল করুন (স্টক ঠিক থাকবে)":"To delete, cancel first (keeps stock correct)"}</span>}
        </div>
      </div>
    );
  }

  // ══════ FORM VIEW ══════
  if (wideDesktop) return (
    <div style={{ position:"fixed", inset:piWin.max?0:"28px 40px", zIndex:1500, background:"#c7d8ee", padding:piWin.max?6:"0 6px 6px", boxSizing:"border-box", overflowX:"auto", overflowY:"hidden", display:"flex", flexDirection:"column", border:piWin.max?"none":"1px solid #2854ad", boxShadow:piWin.max?"none":"0 18px 50px rgba(2,6,23,0.45)" }}>
      <div onDoubleClick={piWin.toggleMax} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:8, margin:piWin.max?"-6px -6px 6px":"0 -6px 6px", padding:"4px 6px 4px 12px", background:"linear-gradient(180deg,#3f69bd,#2854ad)", color:"#fff", fontSize:13, fontWeight:800, userSelect:"none", flexShrink:0, fontFamily:"Segoe UI, Tahoma, sans-serif" }}>
        <span>PURCHASE INVOICE{piInvoiceNo?` — ${piInvoiceNo}`:""}</span>
        <WindowButtons win={piWin} lang={lang} onClose={()=>{ if (piLeaveUnsavedOk()) setPiView("list"); }} />
      </div>
      <PurchaseInvoiceDesktopForm
        lang={lang} t={t} shopId={shopId} products={products} vendors={pickVendors} invoices={invoices}
        form={piForm} setField={piUpd} lines={piLines} setLines={setPiLines} current={piCurrent} setCurrent={setPiCurrent}
        totals={totals} paid={paid} balance={balance}
        invoiceNo={piInvoiceNo} editInvoiceId={editInvoiceId} saving={piSaving} nameRef={piNameRef} qtyRef={piQtyRef}
        helpers={{ piCalcLine, piFmt2, piN2, PI_PAY_METHODS, PI_STATUSES, PI_UNITS, emptyCurrent:piEmptyCurrent }}
        purchaseOptions={purchaseOpts} baseCurrency={piBaseCur} onSaveOptions={isOwner ? savePurchaseOptions : undefined}
        sourceNote={piSource ? `${piSource.kind==="grn" ? (bnL?"মাল গ্রহণ থেকে":"From Goods Received") : (bnL?"পারচেজ অর্ডার থেকে":"From Purchase Order")}: ${piSource.no}` : ""}
        onSelectProduct={piSelectProduct} onChangeCurrentUnit={piChangeCurrentUnit} onAddCurrent={piAddCurrentItem} onDelLine={piDelLine} onPickVendor={piPickVendor}
        onConfirm={piConfirm} onSaveDraft={piSaveDraft}
        onClose={()=>{ if (piLeaveUnsavedOk()) setPiView("list"); }}
        onNew={()=>{ if (piLeaveUnsavedOk()) piOpenNew(); }}
        onOpenInvoice={piOpenFromDesktop}
        onCancelInvoice={isOwner ? async (inv)=>{ if (await piCancelInv(inv)) setPiView("detail"); } : undefined}
        onDeleteInvoice={isOwner ? (inv)=>piDelete(inv) : undefined}
        onOpenProductMaster={onOpenProductMaster}
        toast={toast}
      />
    </div>
  );

  const pmInputStyle = piMobile
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
  const closeForm = ()=>{ if (piLeaveUnsavedOk()) setPiView("list"); };
  const priorDoc = editInvoiceId ? invoices.find(inv=>inv.id===editInvoiceId) : null;
  const enterAdd = (e)=>{ if (e.key==="Enter") piAddCurrentItem(); };

  return (
    <div ref={piRootRef} className="si-root" style={piRootStyle}>
      <style>{PM_CSS}</style>
      <style>{SI_CSS}</style>

      <div className="pm-reference-title">
        <strong style={{ color:piAccent }}>{editInvoiceId?(bnL?"ক্রয় ইনভয়েস এডিট":"EDIT PURCHASE INVOICE"):(bnL?"নতুন ক্রয় ইনভয়েস":"NEW PURCHASE INVOICE")}</strong>
        <span>{piInvoiceNo}</span>
      </div>

      <div className="si-body">
        {fPanel(`${t.pi_invoiceNo} & ${t.pi_date}`, <>
          {fRow(t.pi_invoiceNo, <div className="si-val is-strong" style={{ color:piAccent, fontFamily:"Consolas, monospace" }}>{piInvoiceNo}</div>)}
          {fRow(t.pi_date, <input type="date" className="pm-input" value={piForm.invoiceDate} onChange={e=>piUpd("invoiceDate",e.target.value)} />)}
          {fRow(<>{t.pi_supplierInvoiceNo} <span style={{ color:"#b91c1c" }}>*</span></>,
            <input className="pm-input" style={piForm.supplierInvoiceNo.trim()?undefined:{ borderColor:"#b91c1c" }} placeholder={t.pi_supplierInvoiceNoPh} value={piForm.supplierInvoiceNo} onChange={e=>piUpd("supplierInvoiceNo",e.target.value)} />)}
          {(purchaseOpts.refNo||piForm.refNo)&&fRow("Ref. No", <input className="pm-input" value={piForm.refNo||""} onChange={e=>piUpd("refNo",e.target.value)} placeholder={bnL?"PO / চালান নং":"PO / challan no"} />)}
          {(purchaseOpts.multiCurrency||piForm.currency)&&fRow(bnL?"মুদ্রা":"Currency", (
            <div style={{ display:"flex", gap:4 }}>
              <select className="pm-input" style={{ flex:1 }} value={piForm.currency||""} onChange={e=>{ piUpd("currency",e.target.value); if (!e.target.value) piUpd("exchangeRate",""); }}>
                <option value="">{piBaseCur}</option>
                {CURRENCIES.filter(([c])=>c!==piBaseCur).map(([c,label])=><option key={c} value={c}>{label}</option>)}
              </select>
              {isForeign(piForm, piBaseCur)&&<input className="pm-input" style={{ flex:1 }} inputMode="decimal" value={piForm.exchangeRate||""} onChange={e=>piUpd("exchangeRate",e.target.value)} placeholder={`1 ${piForm.currency} = ? ${piBaseCur}`} />}
            </div>
          ))}
          {isForeign(piForm, piBaseCur)&&<div className="si-hint" style={{ marginLeft:0 }}>{bnL?`দাম ${piForm.currency}-এ লিখুন; সেভের সময় ${piBaseCur}-এ বদলে stock আর হিসাবে যাবে।`:`Enter prices in ${piForm.currency}; they are converted to ${piBaseCur} for stock and accounts when saved.`}</div>}
        </>)}

        {fPanel(`🏭 ${t.pi_vendor}`, <>
          {vendors.length>0&&(
            <div ref={vendorSearchRef} style={{ position:"relative" }}>
              <div style={{ display:"flex", gap:3 }}>
                <input className="pm-input" style={{ flex:1 }} autoComplete="off"
                  placeholder={bnL?"ভেন্ডর খুঁজুন (নাম / কোড / মোবাইল)...":"Search vendor (name / code / mobile)..."}
                  value={vendorSearchQ}
                  onChange={e=>{ setVendorSearchQ(e.target.value); setVendorDropOpen(true); if(!e.target.value.trim()){ piUpd("vendorId",""); piUpd("vendorName",""); piUpd("vendorMobile",""); } }}
                  onFocus={()=>setVendorDropOpen(true)} />
                {piForm.vendorId&&<button type="button" className="pm-btn-secondary" title="Clear vendor" onClick={piClearVendor}>✕</button>}
                <button type="button" className="pm-btn-secondary" onClick={()=>setVendorDropOpen(o=>!o)}>▾</button>
              </div>
              {piForm.vendorId&&!vendorDropOpen&&(
                <div className="si-paid-box" style={{ marginTop:3 }}><span>✅ {piForm.vendorName}</span><span style={{ fontWeight:400 }}>{piForm.vendorMobile}</span></div>
              )}
              {vendorDropOpen&&(
                <div className="si-box" style={{ position:"absolute", top:"100%", left:0, right:0, zIndex:999, maxHeight:240, boxShadow:"0 6px 18px rgba(0,0,0,0.25)" }}>
                  {filteredVendorOpts.length===0
                    ? <div className="si-empty">{bnL?"কোনো ভেন্ডর পাওয়া যায়নি":"No vendors found"}</div>
                    : filteredVendorOpts.map(v=>(
                      <button key={v.id} type="button" className="si-mrow" style={{ display:"block", width:"100%", textAlign:"left", padding:"5px 7px", border:0, borderBottom:"1px solid #cbd5e1", background:piForm.vendorId===v.id?"#dbeafe":"#fff", font:"inherit", cursor:"pointer" }}
                        onClick={()=>piPickVendor(v)}>
                        <div className="si-strong">{v.vendorName}{piForm.vendorId===v.id?" ✓":""}</div>
                        <div className="si-muted" style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                          {v.vendorCode&&<span style={{ fontFamily:"Consolas, monospace" }}>{v.vendorCode}</span>}
                          {(v.mobileNumber||v.whatsappNumber)&&<span>📱 {v.mobileNumber||v.whatsappNumber}</span>}
                          {v.city&&<span>📍 {v.city}</span>}
                        </div>
                      </button>
                    ))}
                </div>
              )}
            </div>
          )}
          {fRow(<>{bnL?"নাম":"Name"} <span style={{ color:"#b91c1c" }}>*</span></>,
            <input className="pm-input" style={piForm.vendorName.trim()?undefined:{ borderColor:"#b91c1c" }} placeholder={t.pi_vendorManual} value={piForm.vendorName} onChange={e=>{ piUpd("vendorName",e.target.value); if (piForm.vendorId) piUpd("vendorId",""); }} />)}
          {fRow(bnL?"মোবাইল":"Mobile", <input className="pm-input" inputMode="tel" value={piForm.vendorMobile} onChange={e=>piUpd("vendorMobile",e.target.value)} />)}
        </>)}

        {fPanel(`📦 ${t.pi_items}`, <>
          <div className="si-entry">
            {fField(t.pi_itemName, (
              <ProductTypeaheadInput
                products={products}
                value={piCurrent.name}
                onChange={(value)=>setPiCurrent((p)=>({ ...p, name:value, productId:null }))}
                onSelectProduct={piSelectProduct}
                field="name"
                inputRef={piNameRef}
                placeholder={t.pi_itemName}
                th={PM_TH}
                lang={lang}
                onKeyDown={enterAdd}
                style={{ ...pmInputStyle, fontWeight:700 }}
              />
            ))}
            <div className="si-grid2">
              {fField("Code / Model", (
                <ProductTypeaheadInput
                  products={products}
                  value={piCurrent.code}
                  onChange={(value)=>setPiCurrent((p)=>({ ...p, code:value }))}
                  onSelectProduct={piSelectProduct}
                  field="code"
                  placeholder="Code / Model"
                  th={PM_TH}
                  lang={lang}
                  onKeyDown={enterAdd}
                  style={pmInputStyle}
                />
              ))}
              {fField(t.pi_brand, <input className="pm-input" value={piCurrent.brand} onChange={e=>setPiCurrent(p=>({...p,brand:e.target.value}))} />)}
            </div>
            {piCurrent.productId && <StockBadge product={products.find(pr=>pr.id===piCurrent.productId)} products={products} shopId={shopId} refreshKey={invoices} lang={lang} />}
            {piCurrent.productId && (
              <ProductInvoiceEntryInfo
                product={products.find((pr) => pr.id === piCurrent.productId)}
                lang={lang}
                fmt={piFmt2}
                canSeeCost={canManagePurchase || can("manageProducts")}
              />
            )}
            <div className="si-grid3" style={{ gridTemplateColumns:"minmax(0,1fr) minmax(0,1fr) minmax(0,1fr)" }}>
              {fField(t.pi_qty, <input className="pm-input" style={{ textAlign:"center" }} inputMode="decimal" placeholder="0" value={piCurrent.qty}
                ref={piQtyRef} onChange={e=>setPiCurrent(p=>({...p,qty:e.target.value}))} onKeyDown={enterAdd} />)}
              {fField(t.pi_unit, (
                <select className="pm-input" value={piCurrent.unit} onChange={e=>piChangeCurrentUnit(e.target.value)}>
                  {siUnitOptionsFor(products.find(pr=>pr.id===piCurrent.productId), piCurrent.unit).map(u=><option key={u} value={u}>{u}</option>)}
                </select>
              ))}
              {fField(t.pi_unitCost, <input className="pm-input" style={{ fontWeight:700 }} inputMode="decimal" placeholder="0.00" value={piCurrent.unitCost}
                onChange={e=>setPiCurrent(p=>({...p,unitCost:e.target.value}))} onKeyDown={enterAdd} />)}
            </div>
            <div className="si-grid3" style={{ gridTemplateColumns:"70px 62px minmax(0,1fr)" }}>
              {fField(t.pi_discPerc, <input className="pm-input" inputMode="decimal" placeholder="0" value={piCurrent.discountPerc} onChange={e=>setPiCurrent(p=>({...p,discountPerc:e.target.value}))} />)}
              {fField("VAT%", <input className="pm-input" inputMode="decimal" placeholder="5" value={piCurrent.taxPerc} onChange={e=>setPiCurrent(p=>({...p,taxPerc:e.target.value}))} />)}
              {fField(`💰 ${t.pi_salePrice}`, <input className="pm-input" style={{ color:"#15803d", fontWeight:700 }} inputMode="decimal" placeholder={t.pi_salePricePh} value={piCurrent.salePrice}
                onChange={e=>setPiCurrent(p=>({...p,salePrice:e.target.value}))} onKeyDown={enterAdd} />)}
            </div>
            <div style={{ display:"flex", gap:4, alignItems:"center" }}>
              <button type="button" className="pm-btn pm-btn--primary" style={{ flex:1, minHeight:piMobile?38:24 }} onClick={piAddCurrentItem}>
                {piEditLineId ? (bnL?"✅ আপডেট করুন":"✅ Update Item") : (bnL?"✅ পণ্য যোগ করুন":"✅ Add Item")}
              </button>
              {piEditLineId&&<button type="button" className="pm-btn-secondary" style={{ minHeight:piMobile?38:24 }} onClick={()=>{ setPiEditLineId(null); setPiCurrent(piEmptyCurrent()); }}>{bnL?"বাদ":"Cancel"}</button>}
              {(piN2(piCurrent.qty)>0&&piN2(piCurrent.unitCost)>0)&&(
                <b style={{ color:piAccent, whiteSpace:"nowrap" }}>= {t.cur} {piFmt2(piCalcLine(piCurrent).total)}</b>
              )}
            </div>
          </div>
          {piLines.length===0
            ? <div className="pm-hint" style={{ textAlign:"center" }}>{bnL?"↑ উপরে পণ্য যোগ করুন":"↑ Add items above"}</div>
            : <PiItemsTable items={piLines} lang={lang} onEdit={piEditLine} onDelete={piDelLine} editId={piEditLineId} />}
        </>, piLines.length>0 ? ` (${piLines.length})` : "")}

        {fPanel(`📊 ${t.pi_summary}`, <>
          <div className="si-total-row"><span>{t.pi_subtotal}</span><b>{t.cur} {piFmt2(totals.sub)}</b></div>
          {totals.disc>0&&<div className="si-total-row"><span>{t.pi_totalDiscount}</span><b style={{ color:"#b91c1c" }}>- {t.cur} {piFmt2(totals.disc)}</b></div>}
          {totals.tax>0&&<div className="si-total-row"><span>{t.pi_totalTax}</span><b style={{ color:"#0e7490" }}>+ {t.cur} {piFmt2(totals.tax)}</b></div>}
          <div className="si-total-row is-grand"><span>{t.pi_grandTotal}</span><span style={{ color:piAccent }}>{t.cur} {piFmt2(totals.grand)}</span></div>
        </>)}

        {fPanel(`💳 ${t.pi_payment}`, <>
          {fRow(bnL?"পেমেন্টের ধরন":"Payment method", (
            <select className="pm-input" value={piForm.paymentMethod} onChange={e=>{
              const key = e.target.value;
              setPiForm(p=>({ ...p, paymentMethod:key, ...(p.paymentMethod==="cash"&&key!=="cash" ? { amountPaid:"" } : {}) }));
            }}>
              {Object.entries(PI_PAY_METHODS).map(([key,pm])=><option key={key} value={key}>{pm.icon} {pm[lang]}</option>)}
            </select>
          ))}
          {piForm.paymentMethod==="cash" ? (
            <div className="si-paid-box"><span>✅ {bnL?"নগদে সম্পূর্ণ পরিশোধিত":"Fully paid (cash)"}</span><span>{t.cur} {piFmt2(totals.grand)}</span></div>
          ) : (
            <>
              {fRow(t.pi_amountPaid, (
                <div style={{ display:"flex", gap:4 }}>
                  <input className="pm-input" inputMode="decimal" placeholder="0.00" value={piForm.amountPaid} onChange={e=>piUpd("amountPaid",e.target.value)} />
                  {totals.grand>0&&<button type="button" className="pm-btn-secondary" onClick={()=>piUpd("amountPaid",piFmt2(totals.grand))}>{bnL?"পুরো":"Full"}</button>}
                </div>
              ))}
              {totals.grand>0&&<div className={`si-paid-box${balance>0.01?" is-due":""}`}><span>{t.pi_balanceDue}</span><span>{t.cur} {piFmt2(balance)}</span></div>}
            </>
          )}
        </>)}

        {fPanel(`📝 ${t.pi_note}`, (
          <textarea className="pm-input" placeholder={t.pi_notePh} value={piForm.note} onChange={e=>piUpd("note",e.target.value)} />
        ))}
      </div>

      <div className="si-actions si-sticky-actions">
        <button type="button" className="pm-btn pm-btn--primary" onClick={piConfirm} disabled={piSaving}>{piSaving?"...":t.pi_confirm}</button>
        {(!priorDoc || priorDoc.status==="draft")&&<button type="button" className="pm-btn" onClick={piSaveDraft} disabled={piSaving}>{t.pi_saveDraft}</button>}
        <button type="button" className="pm-btn-secondary" onClick={closeForm}>{t.pi_cancelForm}</button>
      </div>
    </div>
  );
}
