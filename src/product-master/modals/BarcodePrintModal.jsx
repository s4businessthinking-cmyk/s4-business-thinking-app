import React, { useMemo, useState } from "react";
import Modal from "../Modal";
import { code128Bars, code128SvgMarkup } from "../code128";

const MODULE_WIDTH = 2;
const BAR_HEIGHT = 52;

export default function BarcodePrintModal({ productName, barcode, mrp, onClose, notify }) {
  const [copies, setCopies] = useState(1);
  const encoded = useMemo(() => (barcode ? code128Bars(barcode) : null), [barcode]);

  function printNow() {
    const markup = code128SvgMarkup(barcode, { moduleWidth: MODULE_WIDTH, height: BAR_HEIGHT });
    if (!markup) return notify("Barcode value cannot be encoded as CODE128", "err");
    const safe = (v) => String(v ?? "").replace(/[<>&]/g, "");
    const labels = Array.from({ length: copies })
      .map(() => `<div class="label"><div class="pname">${safe(productName)}</div>${markup}<div class="mrp">MRP: ${safe(mrp)}</div></div>`)
      .join("");
    const win = window.open("", "_blank", "width=520,height=640");
    if (!win) return notify("Allow popups to print barcodes", "err");
    win.document.write(`<html><head><title>Print Barcode</title><style>
      body{font-family:Arial,sans-serif;margin:10px}
      .label{text-align:center;border:1px dashed #999;padding:6px;margin:6px;display:inline-block}
      .pname{font-size:11px;font-weight:600;max-width:170px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .mrp{font-size:11px}
      @media print{.label{break-inside:avoid}}
    </style></head><body onload="window.print()">${labels}</body></html>`);
    win.document.close();
  }

  return (
    <Modal title="Print Barcode" onClose={onClose} width="sm">
      <div style={{ textAlign: "center", background: "#fff", border: "1px solid #cbd5e1", borderRadius: 3, padding: 10 }}>
        {!barcode && <p className="pm-hint">No barcode set for this product yet.</p>}
        {barcode && !encoded && <p className="pm-hint">"{barcode}" cannot be encoded as CODE128.</p>}
        {encoded && (
          <svg
            width={encoded.modules * MODULE_WIDTH}
            height={BAR_HEIGHT + 16}
            viewBox={`0 0 ${encoded.modules * MODULE_WIDTH} ${BAR_HEIGHT + 16}`}
            style={{ maxWidth: "100%" }}
          >
            {encoded.bars.map((b) => (
              <rect key={b.x} x={b.x * MODULE_WIDTH} y={0} width={b.width * MODULE_WIDTH} height={BAR_HEIGHT} fill="#000" />
            ))}
            <text
              x={(encoded.modules * MODULE_WIDTH) / 2}
              y={BAR_HEIGHT + 13}
              textAnchor="middle"
              fontFamily="monospace"
              fontSize={12}
            >
              {barcode}
            </text>
          </svg>
        )}
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
        <label className="pm-label" style={{ marginBottom: 0 }}>Copies</label>
        <input
          className="pm-input"
          style={{ width: 80 }}
          inputMode="numeric"
          value={copies}
          onChange={(e) => setCopies(Math.max(1, parseInt(e.target.value, 10) || 1))}
        />
      </div>
      <div className="pm-window-foot">
        <button type="button" className="pm-btn-secondary" onClick={onClose}>Close</button>
        <button type="button" className="pm-btn" onClick={printNow} disabled={!encoded}>Print</button>
      </div>
    </Modal>
  );
}
