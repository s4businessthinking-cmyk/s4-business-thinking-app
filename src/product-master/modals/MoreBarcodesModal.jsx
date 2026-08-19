import React, { useState } from "react";
import Modal from "../Modal";

export default function MoreBarcodesModal({ form, products, currentProductId, upd, onClose, notify, onDuplicate }) {
  const rows = Array.isArray(form.moreBarcodes) ? form.moreBarcodes.map(String) : [];
  const [barcode, setBarcode] = useState("");
  const [selectedBarcode, setSelectedBarcode] = useState("");

  function add() {
    const code = barcode.trim();
    const normalized = code.toLowerCase();
    if (!code) return notify("Barcode is required", "err");
    const inCurrentProduct = [form.barcode, form.ean, ...rows]
      .map((value) => String(value || "").trim().toLowerCase())
      .filter(Boolean);
    if (inCurrentProduct.includes(normalized)) {
      const message = `The number "${code}" is already entered in this product. The same number cannot be used in Barcode, EAN Code, or More Barcodes.`;
      onDuplicate?.(message);
      return notify(message, "err");
    }
    const owner = products.find((product) => product.id !== currentProductId && [
      product.barcode,
      product.ean,
      ...(Array.isArray(product.moreBarcodes) ? product.moreBarcodes : []),
    ].map((value) => String(value || "").trim().toLowerCase()).includes(normalized));
    if (owner) {
      const message = `The number "${code}" already belongs to product "${owner.name}".`;
      onDuplicate?.(message);
      return notify(message, "err");
    }
    upd("moreBarcodes", [...rows, code]);
    setBarcode("");
  }

  function remove(code) {
    upd("moreBarcodes", rows.filter((r) => r !== code));
    setSelectedBarcode("");
    const labels = form.moreBarcodeLabels && typeof form.moreBarcodeLabels === "object" ? form.moreBarcodeLabels : {};
    if (labels[code]) {
      const next = { ...labels };
      delete next[code];
      upd("moreBarcodeLabels", next);
    }
  }

  return (
    <Modal title="Additional Barcodes" onClose={onClose} width="lg">
      <div className="pm-additional-barcodes">
        <div className="pm-additional-barcodes__main">
          <div className="pm-field pm-additional-barcodes__input">
            <label className="pm-label">Barcode</label>
            <input
              className="pm-input"
              value={barcode}
              onChange={(e) => setBarcode(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") add(); }}
              autoFocus
            />
          </div>
          <div className="pm-additional-barcodes__list" role="listbox" aria-label="Additional barcodes">
            <div className="pm-additional-barcodes__head">
              <span>Sl.No.</span>
              <span>Barcode</span>
            </div>
            {rows.length === 0 && <div className="pm-additional-barcodes__empty">No additional barcode entered.</div>}
            {rows.map((code, index) => (
              <button
                type="button"
                key={code}
                className={selectedBarcode === code ? "is-selected" : ""}
                onClick={() => setSelectedBarcode(code)}
                role="option"
                aria-selected={selectedBarcode === code}
              >
                <span>{index + 1}</span>
                <span>{code}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="pm-additional-barcodes__actions">
          <button type="button" className="pm-btn pm-btn--primary" onClick={add}>Add</button>
          <button
            type="button"
            className="pm-btn pm-btn--danger"
            disabled={!selectedBarcode}
            onClick={() => remove(selectedBarcode)}
          >
            Delete
          </button>
          <button type="button" className="pm-btn" onClick={onClose}>Close</button>
        </div>
      </div>
    </Modal>
  );
}
