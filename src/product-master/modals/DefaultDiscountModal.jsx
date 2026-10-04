import React, { useState } from "react";
import Modal from "../Modal";

export default function DefaultDiscountModal({ form, upd, onClose, notify }) {
  const [value, setValue] = useState(form.defaultDiscount || "");

  function apply() {
    const text = String(value).trim();
    const num = Number(text);
    if (text && (!Number.isFinite(num) || num < 0 || num > 100)) {
      notify?.("Default Discount must be between 0 and 100", "err");
      return;
    }
    upd("defaultDiscount", text);
    notify?.("Default discount set — press Save to store it");
    onClose();
  }

  return (
    <Modal title="Default Discount" onClose={onClose} width="xs">
      <div className="pm-field">
        <label className="pm-label">Default Discount %</label>
        <input className="pm-input" inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} autoFocus
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); apply(); } }} />
      </div>
      <div className="pm-window-foot">
        <button type="button" className="pm-btn-secondary" onClick={onClose}>Cancel</button>
        <button type="button" className="pm-btn" onClick={apply}>Apply</button>
      </div>
    </Modal>
  );
}
