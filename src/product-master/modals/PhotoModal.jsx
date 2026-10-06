import React, { useEffect, useRef, useState } from "react";
import Modal from "../Modal";

const MAX_SOURCE_BYTES = 25 * 1024 * 1024;
const MAX_SIDE = 1280;
const TARGET_BYTES = 350 * 1024;

const dataUrlBytes = (url) => Math.ceil(((url.length - url.indexOf(",") - 1) * 3) / 4);

function loadImage(blob) {
  return new Promise((resolve, reject) => {
    const src = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(src); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(src); reject(new Error("not-an-image")); };
    img.src = src;
  });
}

// Shrinks any photo or screenshot to a JPEG small enough to store with the product.
async function compressImage(blob) {
  const img = await loadImage(blob);
  let side = MAX_SIDE;
  let best = "";
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const scale = Math.min(1, side / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    for (const quality of [0.85, 0.72, 0.6]) {
      best = canvas.toDataURL("image/jpeg", quality);
      if (dataUrlBytes(best) <= TARGET_BYTES) return best;
    }
    side = Math.round(side * 0.75);
  }
  return best;
}

export default function PhotoModal({ form, upd, onClose, notify }) {
  const [url, setUrl] = useState(form.photoUrl || "");
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef(null);

  async function takeImage(blob) {
    if (!blob) return;
    if (!String(blob.type || "").startsWith("image/")) return notify("Only image files can be used", "err");
    if (blob.size > MAX_SOURCE_BYTES) return notify("Image is larger than 25 MB", "err");
    setBusy(true);
    try {
      const data = await compressImage(blob);
      setUrl(data);
      notify(`Photo ready (${Math.round(dataUrlBytes(data) / 1024)} KB) — press Apply, then Save`);
    } catch {
      notify("This image could not be read", "err");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    const onPaste = (e) => {
      const item = [...(e.clipboardData?.items || [])].find((it) => it.kind === "file" && it.type.startsWith("image/"));
      if (!item) return;
      e.preventDefault();
      takeImage(item.getAsFile());
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  });

  async function pasteFromButton() {
    try {
      const items = await navigator.clipboard.read();
      for (const item of items) {
        const type = item.types.find((t) => t.startsWith("image/"));
        if (type) return takeImage(await item.getType(type));
      }
      notify("No image in clipboard — take a screenshot first", "err");
    } catch {
      notify("Press Ctrl+V to paste the screenshot", "err");
    }
  }

  const isData = url.startsWith("data:");

  return (
    <Modal title="Product Photo Setting" onClose={onClose} width="md">
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); takeImage(e.dataTransfer.files?.[0]); }}
        onClick={() => !busy && fileRef.current?.click()}
        style={{
          border: `2px dashed ${dragging ? "#1f5fbf" : "#94a3b8"}`, borderRadius: 6, background: dragging ? "#eaf2ff" : "#f8fafc",
          minHeight: 170, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", padding: 8, textAlign: "center",
        }}
      >
        {busy ? (
          <span style={{ fontWeight: 700, color: "#1f3f73" }}>Processing image...</span>
        ) : url ? (
          <img src={url} alt="Product" style={{ maxWidth: "100%", maxHeight: 240, objectFit: "contain", background: "#fff" }} />
        ) : (
          <span style={{ fontSize: 12.5, color: "#334155", lineHeight: 1.7 }}>
            <b>Take a screenshot and press Ctrl+V</b><br />
            or drag a photo here, or click to choose a file / camera<br />
            <span style={{ color: "#64748b" }}>Any size — it is shrunk automatically</span>
          </span>
        )}
      </div>
      <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }}
        onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; takeImage(f); }} />
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        <button type="button" className="pm-btn-secondary" onClick={pasteFromButton} disabled={busy}>📋 Paste Screenshot</button>
        <button type="button" className="pm-btn-secondary" onClick={() => fileRef.current?.click()} disabled={busy}>📁 Choose Photo</button>
      </div>
      <div className="pm-field">
        <label className="pm-label">Or Photo URL</label>
        <input
          className="pm-input"
          value={isData ? "(uploaded image)" : url}
          readOnly={isData}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://..."
        />
      </div>
      <div className="pm-window-foot">
        {url && (
          <button type="button" className="pm-btn-danger" onClick={() => { setUrl(""); upd("photoUrl", ""); }} disabled={busy}>
            Remove
          </button>
        )}
        <button type="button" className="pm-btn-secondary" onClick={onClose}>Cancel</button>
        <button
          type="button"
          className="pm-btn"
          disabled={busy}
          onClick={() => { upd("photoUrl", url); notify("Photo set — press Save to store it"); onClose(); }}
        >
          Apply
        </button>
      </div>
    </Modal>
  );
}
