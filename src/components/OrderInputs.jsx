import { query } from "../backend/firestore";
import { _globalS } from "../shared/appShared.jsx";

// ─── PRICE CELL ──────────────────────────────────────────────
export function PriceCell({ initialValue, disabled, placeholder, onOpen }) {
  const stop = (e) => e.stopPropagation();
  const displayValue = String(initialValue ?? "").trim();
  return (
    <div style={{ display:"flex", gap:7, marginBottom:7, alignItems:"center" }}
      onClick={stop} onMouseDown={stop} onPointerDown={stop} onTouchStart={stop}>
      <button
        type="button"
        disabled={disabled}
        onClick={(event)=>{ event.stopPropagation(); onOpen(); }}
        style={{ ..._globalS.inp, textAlign:"left", cursor:disabled?"not-allowed":"pointer", opacity:disabled?0.65:1 }}>
        {displayValue || placeholder}
      </button>
    </div>
  );
}

export function OrderSupplierPicker({ s, th, selectedSupplier, selectedSupplierId, canEdit, placeholder, onClear, onOpen }) {
  const displayText = selectedSupplier?.name || "";

  return (
    <div
      style={{ marginTop:8 }}
      onClick={e=>e.stopPropagation()}
      onMouseDown={e=>e.stopPropagation()}
      onPointerDown={e=>e.stopPropagation()}
      onTouchStart={e=>e.stopPropagation()}
    >
      <div style={{ position:"relative" }}>
        <input
          style={{ ...s.inp, paddingLeft:34 }}
          value={displayText}
          disabled={!canEdit}
          readOnly
          autoComplete="off"
          placeholder={placeholder}
          onClick={e=>{ e.stopPropagation(); onOpen(); }}
          onFocus={e=>e.currentTarget.blur()}
          onKeyDown={e=>e.stopPropagation()}
        />
        <span style={{ position:"absolute", left:11, top:"50%", transform:"translateY(-50%)", fontSize:14, pointerEvents:"none", color:th.txtMuted }}>🔍</span>
        {(selectedSupplierId||query)&&canEdit&&(
          <button
            type="button"
            onClick={(event)=>{
              event.stopPropagation();
              onClear();
            }}
            style={{ position:"absolute", right:10, top:"50%", transform:"translateY(-50%)", background:"none", border:"none", color:th.txtMuted, cursor:"pointer", fontSize:16, lineHeight:1 }}>
            ✕
          </button>
        )}
      </div>
    </div>
  );
}
