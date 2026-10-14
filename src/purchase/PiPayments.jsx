import { PI_CHEQUE_STATUSES, piToday, VOUCHER_CARD_TYPES } from "./purchaseShared.js";
import { PI_VOUCHER_METHODS, piFmt2, piN2, AutoTA } from "../shared/appShared.jsx";
import { useState, useRef, useEffect } from "react";
import { UAE_BANKS } from "../cheque/chequeConfig.js";

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
  const [chequeMonth,setChequeMonth] = useState("");
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
      chequeMonth,
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
          <div style={{ marginBottom:14 }}>
            <div style={lbl}>{lang==="bn"?"চেক / পেমেন্ট কোন মাসের (ঐচ্ছিক)":"Cheque / payment for month (optional)"}</div>
            <input type="month" style={inp()} value={chequeMonth} onChange={e=>setChequeMonth(e.target.value)} />
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
        {voucher.chequeMonth&&<div style={dr}><span style={{ fontSize:12, color:th.txtMuted }}>🗓️ {lang==="bn"?"কোন মাসের":"For Month"}</span><span style={{ fontSize:13, fontWeight:700, color:th.txtPrimary }}>{new Date(`${voucher.chequeMonth}-01T00:00:00`).toLocaleString("en-GB",{ month:"short", year:"numeric" })}</span></div>}
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
