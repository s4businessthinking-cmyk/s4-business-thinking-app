import React, { useState } from "react";
import Modal from "../Modal";

export default function DefaultDiscountModal({ form, upd, onClose }) {
  const [value, setValue] = useState(form.defaultDiscount || "");

  return (
    <Modal title="Default Discount" onClose={onClose} width="xs">
      <div className="pm-field">
        <label className="pm-label">Default Discount %</label>
        <input className="pm-input" inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} autoFocus />
      </div>
      <div className="pm-window-foot">
        <button type="button" className="pm-btn-secondary" onClick={onClose}>Cancel</button>
        <button
          type="button"
          className="pm-btn"
          onClick={() => { upd("defaultDiscount", String(value).trim()); onClose(); }}
        >
          Apply
        </button>
      </div>
    </Modal>
  );
}
