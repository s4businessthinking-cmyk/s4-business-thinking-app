import { useState, useRef, useMemo, useEffect } from "react";
import { nsmatch } from "../shared/appShared.jsx";
import { CUSTOMER_PICKER_LIMIT } from "./siHelpers.js";
import { useEscapeKey } from "../components/WindowChrome.jsx";

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
