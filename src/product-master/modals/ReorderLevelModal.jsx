import React, { useState } from "react";
import Modal from "../Modal";

export default function ReorderLevelModal({ form, upd, onClose, notify }) {
  const [minLevel, setMinLevel] = useState(form.reorderMin || "");
  const [maxLevel, setMaxLevel] = useState(form.reorderMax || "");
  const [reorderQty, setReorderQty] = useState(form.reorderQty || "");

  function save() {
    upd("reorderMin", String(minLevel).trim());
    upd("reorderMax", String(maxLevel).trim());
    upd("reorderQty", String(reorderQty).trim());
    notify("Reorder level set — press Save to store it");
    onClose();
  }

  return (
    <Modal title="Set Reorder Level" onClose={onClose} width="sm">
      <div className="pm-field">
        <label className="pm-label">Min Stock Level</label>
        <input className="pm-input" inputMode="decimal" value={minLevel} onChange={(e) => setMinLevel(e.target.value)} autoFocus />
      </div>
      <div className="pm-field">
        <label className="pm-label">Max Stock Level</label>
        <input className="pm-input" inputMode="decimal" value={maxLevel} onChange={(e) => setMaxLevel(e.target.value)} />
      </div>
      <div className="pm-field">
        <label className="pm-label">Reorder Quantity</label>
        <input className="pm-input" inputMode="decimal" value={reorderQty} onChange={(e) => setReorderQty(e.target.value)} />
      </div>
      <div className="pm-window-foot">
        <button type="button" className="pm-btn-secondary" onClick={onClose}>Cancel</button>
        <button type="button" className="pm-btn" onClick={save}>Save</button>
      </div>
    </Modal>
  );
}
