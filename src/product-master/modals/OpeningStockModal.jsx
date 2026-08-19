import React, { useState } from "react";
import Modal from "../Modal";

export default function OpeningStockModal({ form, upd, onClose, notify }) {
  const [quantity, setQuantity] = useState(form.openingStock || "");
  const [rate, setRate] = useState(form.openingRate || "");
  const [warehouse, setWarehouse] = useState(form.openingWarehouse || "");

  function save() {
    if (!String(quantity).trim()) return notify("Quantity is required", "err");
    upd("openingStock", String(quantity).trim());
    upd("openingRate", String(rate).trim());
    upd("openingWarehouse", warehouse.trim());
    notify("Opening stock set — press Save to store it");
    onClose();
  }

  return (
    <Modal title="Opening Stock Entry" onClose={onClose} width="sm">
      <div className="pm-field">
        <label className="pm-label">Opening Quantity *</label>
        <input className="pm-input" inputMode="decimal" value={quantity} onChange={(e) => setQuantity(e.target.value)} autoFocus />
      </div>
      <div className="pm-field">
        <label className="pm-label">Rate</label>
        <input className="pm-input" inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} />
      </div>
      <div className="pm-field">
        <label className="pm-label">Warehouse / Location</label>
        <input className="pm-input" value={warehouse} onChange={(e) => setWarehouse(e.target.value)} />
      </div>
      <div className="pm-window-foot">
        <button type="button" className="pm-btn-secondary" onClick={onClose}>Cancel</button>
        <button type="button" className="pm-btn" onClick={save}>Save</button>
      </div>
    </Modal>
  );
}
