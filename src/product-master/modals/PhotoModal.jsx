import React, { useState } from "react";
import Modal from "../Modal";

const MAX_INLINE_BYTES = 400 * 1024;

export default function PhotoModal({ form, upd, onClose, notify }) {
  const [url, setUrl] = useState(form.photoUrl || "");
  const [preview, setPreview] = useState(form.photoUrl || "");

  function onFile(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > MAX_INLINE_BYTES) {
      notify("Image is larger than 400 KB — use a photo URL instead", "err");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const data = String(reader.result || "");
      setUrl(data);
      setPreview(data);
    };
    reader.readAsDataURL(file);
  }

  return (
    <Modal title="Product Photo Setting" onClose={onClose} width="md">
      <div className="pm-field">
        <label className="pm-label">Photo URL</label>
        <input
          className="pm-input"
          value={url.startsWith("data:") ? "(uploaded image)" : url}
          readOnly={url.startsWith("data:")}
          onChange={(e) => { setUrl(e.target.value); setPreview(e.target.value); }}
          placeholder="https://..."
        />
      </div>
      <div className="pm-field">
        <label className="pm-label">Or upload an image (max 400 KB, stored with the product)</label>
        <input type="file" accept="image/*" onChange={onFile} style={{ fontSize: 12 }} />
      </div>
      {preview && (
        <img
          src={preview}
          alt="Product preview"
          style={{ width: 130, height: 130, objectFit: "cover", border: "1px solid #94a3b8", borderRadius: 3, background: "#fff" }}
        />
      )}
      <div className="pm-window-foot">
        {url && (
          <button type="button" className="pm-btn-danger" onClick={() => { setUrl(""); setPreview(""); upd("photoUrl", ""); }}>
            Remove
          </button>
        )}
        <button type="button" className="pm-btn-secondary" onClick={onClose}>Cancel</button>
        <button
          type="button"
          className="pm-btn"
          onClick={() => { upd("photoUrl", url); notify("Photo set — press Save to store it"); onClose(); }}
        >
          Apply
        </button>
      </div>
    </Modal>
  );
}
