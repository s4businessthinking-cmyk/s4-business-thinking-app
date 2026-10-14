import { siCalcLine, siN2, siFmt2, SI_UNITS } from "./salesInvoiceShared.js";

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
