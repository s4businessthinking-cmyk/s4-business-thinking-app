import React, { useEffect, useRef, useState } from "react";
import Modal from "../Modal";
import { normalizePartNumber, parsePartNumbers } from "../partNumberPaste";

export default function MoreBarcodesModal({ form, products, currentProductId, upd, onClose, notify, onDuplicate }) {
  const rows = Array.isArray(form.moreBarcodes) ? form.moreBarcodes.map(String) : [];
  const [barcode, setBarcode] = useState("");
  const [selectedBarcode, setSelectedBarcode] = useState("");
  const listRef = useRef(null);
  const inputRef = useRef(null);
  const prevCount = useRef(rows.length);
  useEffect(() => {
    if (rows.length > prevCount.current && listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
    prevCount.current = rows.length;
  }, [rows.length]);

  function addMany(text) {
    const codes = parsePartNumbers(text);
    if (!codes.length) return notify("No part number found in the pasted text", "err");
    const unitBarcodes = (product) => (Array.isArray(product?.unitPrices) ? product.unitPrices.map((row) => row?.barcode) : []);
    const taken = new Set([form.barcode, form.ean, ...rows, ...unitBarcodes(form)].map(normalizePartNumber).filter(Boolean));
    const owners = new Map();
    products.forEach((product) => {
      if (product.id === currentProductId) return;
      [product.barcode, product.ean, ...(Array.isArray(product.moreBarcodes) ? product.moreBarcodes : []), ...unitBarcodes(product)]
        .map(normalizePartNumber).filter(Boolean)
        .forEach((key) => { if (!owners.has(key)) owners.set(key, product.name); });
    });
    const added = [];
    let inThis = 0;
    const elsewhere = [];
    codes.forEach((code) => {
      const key = normalizePartNumber(code);
      if (taken.has(key)) { inThis += 1; return; }
      if (owners.has(key)) { elsewhere.push(`${code} (${owners.get(key)})`); return; }
      taken.add(key);
      added.push(code);
    });
    if (added.length) upd("moreBarcodes", [...rows, ...added]);
    setBarcode("");
    inputRef.current?.focus();
    const parts = [`${added.length} part number${added.length === 1 ? "" : "s"} added`];
    if (inThis) parts.push(`${inThis} already in this product skipped`);
    if (elsewhere.length) parts.push(`${elsewhere.length} belong to other products skipped: ${elsewhere.slice(0, 5).join(", ")}${elsewhere.length > 5 ? ", ..." : ""}`);
    if (added.length) notify(parts.join(". "));
    else notify(parts.join(". "), "err");
  }

  function onPaste(e) {
    const text = e.clipboardData?.getData("text") || "";
    if (parsePartNumbers(text).length < 2 && !/\n/.test(text.trim())) return;
    e.preventDefault();
    addMany(text);
  }

  function add() {
    if (parsePartNumbers(barcode).length > 1) return addMany(barcode);
    const code = barcode.trim();
    const normalized = normalizePartNumber(code);
    if (!code) return notify("Barcode is required", "err");
    const unitBarcodes = (product) => (Array.isArray(product?.unitPrices) ? product.unitPrices.map((row) => row?.barcode) : []);
    const inCurrentProduct = [form.barcode, form.ean, ...rows, ...unitBarcodes(form)]
      .map(normalizePartNumber)
      .filter(Boolean);
    if (inCurrentProduct.includes(normalized)) {
      const message = `The number "${code}" is already entered in this product. The same number cannot be used in Barcode, EAN Code, More Barcodes, or an alternate unit barcode.`;
      onDuplicate?.(message);
      return notify(message, "err");
    }
    const owner = products.find((product) => product.id !== currentProductId && [
      product.barcode,
      product.ean,
      ...(Array.isArray(product.moreBarcodes) ? product.moreBarcodes : []),
      ...unitBarcodes(product),
    ].map(normalizePartNumber).includes(normalized));
    if (owner) {
      const message = `The number "${code}" already belongs to product "${owner.name}".`;
      onDuplicate?.(message);
      return notify(message, "err");
    }
    upd("moreBarcodes", [...rows, code]);
    setBarcode("");
    inputRef.current?.focus();
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
              ref={inputRef}
              className="pm-input"
              value={barcode}
              onChange={(e) => setBarcode(e.target.value)}
              onPaste={onPaste}
              placeholder="Type one barcode, or paste a full list of OE / cross-reference numbers"
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
              autoFocus
            />
          </div>
          {rows.length > 0 && <div className="pm-additional-barcodes__count">{rows.length} barcode{rows.length === 1 ? "" : "s"}</div>}
          <div ref={listRef} className="pm-additional-barcodes__list" role="listbox" aria-label="Additional barcodes">
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
      <div className="pm-hint">Press Save on Product Master to store these barcodes.</div>
    </Modal>
  );
}
