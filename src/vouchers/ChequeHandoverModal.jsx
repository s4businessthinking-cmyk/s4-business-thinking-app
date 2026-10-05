import React, { useEffect, useRef, useState } from "react";
import { compressImage } from "./chequeDocs.js";
import { useEscapeKey } from "../components/WindowChrome.jsx";

const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

function useIsMobile() {
  const query = "(max-width: 759px)";
  const [mobile, setMobile] = useState(() => !!window.matchMedia?.(query).matches);
  useEffect(() => {
    const mq = window.matchMedia?.(query);
    if (!mq) return undefined;
    const on = () => setMobile(mq.matches);
    mq.addEventListener?.("change", on);
    return () => mq.removeEventListener?.("change", on);
  }, []);
  return mobile;
}

function SignaturePad({ value, onChange, bn }) {
  const canvasRef = useRef(null);
  const drawing = useRef(false);
  const dirty = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ratio = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * ratio;
    canvas.height = rect.height * ratio;
    const ctx = canvas.getContext("2d");
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 2.2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#0b1f4d";
    if (value) {
      const img = new Image();
      img.onload = () => ctx.drawImage(img, 0, 0, rect.width, rect.height);
      img.src = value;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const point = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };
  const down = (e) => {
    e.preventDefault();
    canvasRef.current.setPointerCapture?.(e.pointerId);
    drawing.current = true;
    const { x, y } = point(e);
    const ctx = canvasRef.current.getContext("2d");
    ctx.beginPath();
    ctx.moveTo(x, y);
  };
  const move = (e) => {
    if (!drawing.current) return;
    e.preventDefault();
    const { x, y } = point(e);
    const ctx = canvasRef.current.getContext("2d");
    ctx.lineTo(x, y);
    ctx.stroke();
    dirty.current = true;
  };
  const up = () => {
    if (!drawing.current) return;
    drawing.current = false;
    if (dirty.current) onChange(canvasRef.current.toDataURL("image/png"));
  };
  const clear = () => {
    const canvas = canvasRef.current;
    canvas.getContext("2d").clearRect(0, 0, canvas.width, canvas.height);
    dirty.current = false;
    onChange("");
  };

  return (
    <div>
      <canvas
        ref={canvasRef}
        onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerLeave={up} onPointerCancel={up}
        style={{ width: "100%", height: 150, background: "#fff", border: "1.5px dashed #94a3b8", borderRadius: 10, touchAction: "none", display: "block" }}
      />
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4, fontSize: 11, color: "#64748b" }}>
        <span>{bn ? "এখানে আঙুল বা মাউস দিয়ে সই করুন" : "Sign here with finger or mouse"}</span>
        <button type="button" onClick={clear} style={{ border: "none", background: "none", color: "#dc2626", fontWeight: 700, cursor: "pointer" }}>{bn ? "মুছুন" : "Clear"}</button>
      </div>
    </div>
  );
}

function PhotoField({ label, value, onChange, bn, wide }) {
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const pick = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy(true);
    try {
      onChange(await compressImage(file, wide ? { maxSide: 1400, quality: 0.6 } : {}));
    } catch (err) {
      alert(err.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ fontSize: 11, fontWeight: 800, color: "#334155", marginBottom: 4 }}>{label}</div>
      <div onClick={() => inputRef.current?.click()}
        style={{ height: wide ? 180 : 120, borderRadius: 10, border: value ? "1px solid #cbd5e1" : "1.5px dashed #94a3b8", background: "#f8fafc", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", cursor: "pointer", position: "relative" }}>
        {value
          ? <img src={value} alt="" style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} />
          : <span style={{ fontSize: 12, color: "#64748b", textAlign: "center", padding: 8 }}>{busy ? "…" : (bn ? "📷 ছবি তুলুন / বাছাই করুন" : "📷 Take or choose photo")}</span>}
      </div>
      {value && (
        <button type="button" onClick={() => onChange("")} style={{ marginTop: 4, border: "none", background: "none", color: "#dc2626", fontSize: 11, fontWeight: 700, cursor: "pointer", padding: 0 }}>
          {bn ? "সরান" : "Remove"}
        </button>
      )}
      <input ref={inputRef} type="file" accept="image/*" onChange={pick} style={{ display: "none" }} />
    </div>
  );
}

export default function ChequeHandoverModal({ lang = "en", cur = "AED", voucher, saving = false, onSave, onPrint, onClose }) {
  const bn = lang === "bn";
  const mobile = useIsMobile();
  const existing = voucher?.handover || {};
  const [receiverName, setReceiverName] = useState(existing.receiverName || voucher?.chequeReceivedBy || "");
  const [receivedAt, setReceivedAt] = useState(existing.receivedAt || todayIso());
  const [idFront, setIdFront] = useState(existing.idFront || "");
  const [idBack, setIdBack] = useState(existing.idBack || "");
  const [signature, setSignature] = useState(existing.signature || "");
  const [signedPaper, setSignedPaper] = useState(existing.signedPaper || "");

  useEscapeKey(() => { if (!saving) onClose?.(); }, { level: 6 });

  const current = () => ({ receiverName: receiverName.trim(), receivedAt, idFront, idBack, signature, signedPaper });
  const save = async () => {
    if (!receiverName.trim()) { alert(bn ? "গ্রহণকারীর নাম লিখুন" : "Enter the receiver's name"); return; }
    await onSave?.(current());
  };

  const field = { width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid #cbd5e1", fontSize: 14, boxSizing: "border-box", fontFamily: "inherit", background: "#fff", color: "#0f172a" };
  const lbl = { fontSize: 11, fontWeight: 800, color: "#334155", marginBottom: 4, display: "block" };
  const card = { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: 12, marginBottom: 10 };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 10050, background: "rgba(15,23,42,0.55)", display: "flex", alignItems: mobile ? "stretch" : "center", justifyContent: "center", padding: mobile ? 0 : 16 }}>
      <div style={{ width: "100%", maxWidth: mobile ? "none" : 760, height: mobile ? "100dvh" : "auto", maxHeight: mobile ? "100dvh" : "92vh", background: "#f1f5f9", borderRadius: mobile ? 0 : 14, display: "flex", flexDirection: "column", overflow: "hidden", color: "#0f172a", fontFamily: "inherit" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 14px", paddingTop: mobile ? "max(12px, env(safe-area-inset-top))" : 12, background: "linear-gradient(135deg,#1e3a8a,#2563eb)", color: "#fff" }}>
          <div>
            <div style={{ fontWeight: 900, fontSize: 15 }}>🪪 {bn ? "চেক হস্তান্তর ডকুমেন্ট" : "Cheque Handover Document"}</div>
            <div style={{ fontSize: 11, opacity: 0.85 }}>{voucher?.paymentNo} · {voucher?.vendorName} · {cur} {Number(voucher?.chequeAmount ?? voucher?.totalAmount ?? 0).toFixed(2)}</div>
          </div>
          <button type="button" onClick={onClose} disabled={saving} style={{ border: "none", background: "rgba(255,255,255,0.18)", color: "#fff", width: 34, height: 34, borderRadius: 8, fontSize: 18, cursor: "pointer" }}>✕</button>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: 12 }}>
          <div style={card}>
            <div style={{ display: "grid", gridTemplateColumns: mobile ? "1fr" : "1fr 170px", gap: 10 }}>
              <div><span style={lbl}>{bn ? "চেক গ্রহণকারীর নাম *" : "Receiver's name *"}</span><input style={field} value={receiverName} onChange={(e) => setReceiverName(e.target.value)} /></div>
              <div><span style={lbl}>{bn ? "তারিখ" : "Date"}</span><input type="date" style={field} value={receivedAt} onChange={(e) => setReceivedAt(e.target.value)} /></div>
            </div>
          </div>

          <div style={card}>
            <div style={{ display: "flex", gap: 10, flexDirection: mobile ? "column" : "row" }}>
              <PhotoField bn={bn} label={bn ? "আইডি কার্ড — সামনে" : "ID card — front"} value={idFront} onChange={setIdFront} />
              <PhotoField bn={bn} label={bn ? "আইডি কার্ড — পেছনে" : "ID card — back"} value={idBack} onChange={setIdBack} />
            </div>
          </div>

          <div style={card}>
            <span style={lbl}>{bn ? "গ্রহণকারীর সই (স্ক্রিনে)" : "Receiver's signature (on screen)"}</span>
            <SignaturePad bn={bn} value={signature} onChange={setSignature} />
          </div>

          <div style={card}>
            <PhotoField wide bn={bn} label={bn ? "অথবা: কাগজে সই করা কপির ছবি" : "Or: photo of the hand-signed paper"} value={signedPaper} onChange={setSignedPaper} />
            <div style={{ fontSize: 11, color: "#64748b", marginTop: 6 }}>
              {bn ? "কাগজে সই নিতে চাইলে আগে \"প্রিন্ট\" চাপুন, সই নিয়ে ছবি তুলে এখানে দিন।" : "To sign on paper, press Print first, get it signed, then photograph it here."}
            </div>
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, padding: 12, paddingBottom: mobile ? "max(12px, env(safe-area-inset-bottom))" : 12, background: "#fff", borderTop: "1px solid #e2e8f0" }}>
          <button type="button" onClick={() => onPrint?.(current())} style={{ flex: 1, padding: 12, borderRadius: 10, border: "1px solid #2563eb", background: "#eff6ff", color: "#1d4ed8", fontWeight: 800, cursor: "pointer" }}>
            🖨️ {bn ? "প্রিন্ট" : "Print"}
          </button>
          <button type="button" onClick={save} disabled={saving} style={{ flex: 2, padding: 12, borderRadius: 10, border: "none", background: saving ? "#94a3b8" : "linear-gradient(135deg,#15803d,#16a34a)", color: "#fff", fontWeight: 900, cursor: saving ? "default" : "pointer" }}>
            {saving ? "…" : `💾 ${bn ? "সেভ করুন" : "Save"}`}
          </button>
        </div>
      </div>
    </div>
  );
}
