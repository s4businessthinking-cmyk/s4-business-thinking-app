import { useState } from "react";
import { offlineList, offlineBulkUpsert } from "../offline/offlineRepository";
import { syncOpeningBill } from "../utils/openingBill.js";

// ─── EXCEL IMPORT MODAL ──────────────────────────────────────
export function ExcelImportModal({ t, lang, th, shopId, user, onClose, onImported,
  type, // "customer" | "vendor"
  columnMap, defaultFields, collection: colName }) {

  const [rows,setRows]         = useState([]);
  const [status,setStatus]     = useState("idle"); // idle|parsing|preview|importing|done
  const [progress,setProgress] = useState(0);
  const [imported,setImported] = useState(0);
  const [skipped,setSkipped]   = useState(0);
  const [error,setError]       = useState("");

  const isBn = lang==="bn";
  const nameKey = type==="customer"?"customerName":"vendorName";
  const cleanVal = (v) => {
    if (v===null||v===undefined) return "";
    const s = String(v).trim();
    if (s==="nan"||s==="NaN"||s==="-"||s==="None"||s==="") return "";
    if (/^\d+\.0$/.test(s)) return s.slice(0,-2); // remove .0
    // Large numbers that might be TRN/phone stored as float
    if (/^\d+\.\d+$/.test(s) && s.length > 8) {
      // Convert float to int string
      try { return String(Math.round(parseFloat(s))); } catch { return s; }
    }
    return s;
  };

  const parseFile = async (file) => {
    setStatus("parsing"); setError("");
    try {
      const XLSX = await import("xlsx");
      const buf  = await file.arrayBuffer();
      const wb   = XLSX.read(buf, { type:"array" });
      const ws   = wb.Sheets[wb.SheetNames[0]];
      const data = XLSX.utils.sheet_to_json(ws, { defval:"" });
      if (!data.length) { setError(isBn?"ফাইলে কোনো ডেটা নেই":"No data found in file"); setStatus("idle"); return; }
      setRows(data);
      setStatus("preview");
    } catch(e) {
      setError(String(e)); setStatus("idle");
    }
  };

  const doImport = async () => {
    setStatus("importing"); setProgress(0); setImported(0); setSkipped(0);
    let skip=0;
    const NUMBER_FIELDS = ["creditLimit","openingBalance","paymentTerms","discountPerc"];
    const nameOf = (v) => String(v||"").trim().toLowerCase().replace(/\s+/g," ");
    try {
      // Re-importing the same sheet must not duplicate parties that already exist.
      const existing = await offlineList(colName);
      const seen = new Set((existing.records||[])
        .map(r => r.data||{})
        .filter(d => d.shopId===shopId && d.isDeleted!==true)
        .map(d => nameOf(d[nameKey])));
      const nowIso = new Date().toISOString();
      const records = [];
      rows.forEach((row, i) => {
        const mapped = { ...defaultFields, shopId, createdBy:user.uid, createdAt:nowIso, updatedAt:nowIso, updatedBy:user.uid };
        for (const [xlsCol, dbField] of Object.entries(columnMap)) {
          const v = cleanVal(row[xlsCol]);
          if (v) mapped[dbField] = v;
        }
        NUMBER_FIELDS.forEach(k => {
          if (!(k in mapped)) return;
          const n = Number(String(mapped[k]).replace(/,/g,""));
          mapped[k] = Number.isFinite(n) ? n : 0;
        });
        const key = nameOf(mapped[nameKey]);
        if (!key || seen.has(key)) { skip++; return; }
        seen.add(key);
        mapped.id = `${colName}-${Date.now().toString(36)}-${i}-${Math.random().toString(36).slice(2,8)}`;
        records.push(mapped);
      });
      setProgress(50);
      if (records.length) await offlineBulkUpsert(colName, records);
      const withOpening = records.filter(r => Number(r.openingBalance) > 0);
      let obFailed = 0;
      for (let i = 0; i < withOpening.length; i++) {
        const r = withOpening[i];
        try { await syncOpeningBill({ kind:colName, partyId:r.id, party:r, shopId, uid:user.uid, bn:isBn }); }
        catch (err) { obFailed++; console.warn("[S4 Import] opening bill failed", r.id, err); }
        setProgress(50 + Math.round(((i + 1) / withOpening.length) * 50));
      }
      if (obFailed) window.alert(isBn ? `${obFailed}টি opening balance লেজারে যায়নি — পার্টি খুলে আবার সেভ করুন।` : `${obFailed} opening balance(s) did not reach the ledger — open the party and save it again.`);
      setProgress(100);
      if (navigator.onLine) window.S4Offline?.syncNow?.().catch(err => console.warn("[S4 Sync] import sync failed", err));
      setStatus("done"); setImported(records.length); setSkipped(skip);
      onImported && onImported(records.length);
    } catch(e) { setError(String(e)); setStatus("preview"); }
  };

  const overlay = { position:"fixed", inset:0, background:"rgba(0,0,0,0.8)", zIndex:10000, display:"flex", alignItems:"center", justifyContent:"center", padding:16 };
  const modal   = { background:th.bgCard, border:`1px solid ${th.border}`, borderRadius:16, padding:24, maxWidth:600, width:"100%", maxHeight:"90vh", overflow:"auto" };
  const btn = (bg,col,onClick,label,disabled=false) => (
    <button onClick={onClick} disabled={disabled}
      style={{ padding:"12px 20px", borderRadius:10, border:"none", background:disabled?"#333":bg, color:col, fontSize:14, fontWeight:700, cursor:disabled?"not-allowed":"pointer" }}>
      {label}
    </button>
  );

  return (
    <div style={overlay} onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={modal}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
          <div style={{ fontSize:17, fontWeight:800, color:th.txtPrimary }}>
            {type==="customer"?t.cm_importBtn:t.vm_importBtn}
          </div>
          <button onClick={onClose} style={{ background:"none", border:"none", color:th.txtMuted, fontSize:20, cursor:"pointer" }}>✕</button>
        </div>

        {/* File picker */}
        {(status==="idle"||status==="parsing")&&(
          <div>
            <div style={{ border:`2px dashed ${th.borderMid}`, borderRadius:12, padding:32, textAlign:"center", marginBottom:16 }}>
              <div style={{ fontSize:36, marginBottom:8 }}>📂</div>
              <div style={{ fontSize:14, color:th.txtMuted, marginBottom:16 }}>
                {isBn?"XLS / XLSX ফাইল এখানে টেনে আনুন বা ক্লিক করুন":"Drag & drop XLS/XLSX file or click to browse"}
              </div>
              <label style={{ display:"inline-block", padding:"10px 24px", borderRadius:10, border:"none", background:"linear-gradient(135deg,#22c55e,#16a34a)", color:"#fff", fontSize:14, fontWeight:700, cursor:"pointer" }}>
                {status==="parsing"?(isBn?"পড়া হচ্ছে...":"Reading..."):(isBn?"ফাইল বেছে নিন":"Choose File")}
                <input type="file" accept=".xls,.xlsx" style={{ display:"none" }} disabled={status==="parsing"}
                  onChange={e=>e.target.files[0]&&parseFile(e.target.files[0])} />
              </label>
            </div>
            <div style={{ fontSize:12, color:"#f59e0b", background:"rgba(245,158,11,0.08)", borderRadius:8, padding:"8px 12px" }}>
              ⚠️ {isBn?"Import করলে নতুন রেকর্ড যোগ হবে। একই নামের পুরনো রেকর্ড মুছবে না।":"Import adds new records. Existing records with same name are not deleted."}
            </div>
            {error&&<div style={{ marginTop:10, color:"#ef4444", fontSize:13 }}>❌ {error}</div>}
          </div>
        )}

        {/* Preview */}
        {status==="preview"&&(
          <div>
            <div style={{ fontSize:14, fontWeight:700, color:"#22c55e", marginBottom:12 }}>
              ✅ {rows.length} {isBn?t.cm_importCount:t.cm_importCount}
            </div>
            <div style={{ overflowX:"auto", marginBottom:16, borderRadius:8, border:`1px solid ${th.border}` }}>
              <table style={{ width:"100%", borderCollapse:"collapse", fontSize:11 }}>
                <thead>
                  <tr style={{ background:th.bgInp }}>
                    {Object.keys(columnMap).slice(0,6).map(col=>(
                      <th key={col} style={{ padding:"6px 8px", textAlign:"left", color:th.txtMuted, fontWeight:700, whiteSpace:"nowrap", fontSize:10 }}>{col}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0,5).map((row,i)=>(
                    <tr key={i} style={{ borderTop:`1px solid ${th.border}` }}>
                      {Object.keys(columnMap).slice(0,6).map(col=>(
                        <td key={col} style={{ padding:"5px 8px", color:th.txtPrimary, maxWidth:120, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                          {cleanVal(row[col])||"—"}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {rows.length>5&&<div style={{ fontSize:11, color:th.txtMuted, marginBottom:12 }}>...{isBn?"আরও":"and"} {rows.length-5} {isBn?"টি রেকর্ড":"more records"}</div>}
            <div style={{ display:"flex", gap:10 }}>
              {btn("linear-gradient(135deg,#22c55e,#16a34a)","#fff",doImport, isBn?`✅ ${rows.length} টি ইমপোর্ট করুন`:`✅ Import ${rows.length} records`)}
              {btn("transparent","#a1a1aa",()=>{ setRows([]); setStatus("idle"); }, isBn?"বাতিল":"Cancel")}
            </div>
            {error&&<div style={{ marginTop:10, color:"#ef4444", fontSize:13 }}>❌ {error}</div>}
          </div>
        )}

        {/* Progress */}
        {status==="importing"&&(
          <div style={{ textAlign:"center", padding:"20px 0" }}>
            <div style={{ fontSize:32, marginBottom:12 }}>⏳</div>
            <div style={{ fontSize:16, fontWeight:700, color:th.txtPrimary, marginBottom:8 }}>
              {isBn?"ইমপোর্ট হচ্ছে...":"Importing..."}
            </div>
            <div style={{ background:th.bgInp, borderRadius:100, height:8, overflow:"hidden", marginBottom:8 }}>
              <div style={{ background:"#22c55e", height:"100%", width:`${progress}%`, transition:"width 0.3s", borderRadius:100 }} />
            </div>
            <div style={{ fontSize:13, color:"#22c55e", fontWeight:700 }}>{imported} {isBn?"টি সম্পন্ন":"done"}</div>
          </div>
        )}

        {/* Done */}
        {status==="done"&&(
          <div style={{ textAlign:"center", padding:"20px 0" }}>
            <div style={{ fontSize:48, marginBottom:12 }}>🎉</div>
            <div style={{ fontSize:18, fontWeight:800, color:"#22c55e", marginBottom:6 }}>
              {isBn?t.cm_importDone:t.cm_importDone}
            </div>
            <div style={{ fontSize:14, color:th.txtMuted, marginBottom:20 }}>
              {imported} {isBn?"টি রেকর্ড ইমপোর্ট হয়েছে":"records imported"}
              {skipped>0&&` · ${skipped} ${isBn?"টি skip":"skipped"}`}
            </div>
            {btn("linear-gradient(135deg,#22c55e,#16a34a)","#fff",onClose,isBn?"✅ বন্ধ করুন":"✅ Close")}
          </div>
        )}
      </div>
    </div>
  );
}
