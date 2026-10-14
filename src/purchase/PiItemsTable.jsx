import { piCalcLine } from "./purchaseShared.js";
import { piN2, piFmt2, nsmatch } from "../shared/appShared.jsx";
import { useState } from "react";

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
