import React, { useMemo, useState } from "react";
import Modal from "../Modal";
import { parseCsv } from "../csv";

const TARGET_FIELDS = [
  { value: "", label: "-- Ignore --" },
  { value: "id", label: "Product ID" },
  { value: "name", label: "Product Name *" },
  { value: "shopPartNumber", label: "Shop Part Number" },
  { value: "shopPartSerial", label: "Shop Part Serial" },
  { value: "shopPartFormatKey", label: "Shop Part Format Key" },
  { value: "originalPartKey", label: "Original Part Key" },
  { value: "shopPartGroupKey", label: "Shop Part Group Key" },
  { value: "code", label: "Code / Model (Original Part No)" },
  { value: "barcode", label: "Barcode" },
  { value: "ean", label: "EAN Code" },
  { value: "productGroup", label: "Product Group" },
  { value: "company", label: "Company" },
  { value: "category", label: "Category" },
  { value: "subcategory", label: "Sub Category" },
  { value: "commodityCode", label: "Commodity Code" },
  { value: "unit", label: "Base Unit" },
  { value: "productType", label: "Product Type" },
  { value: "arabicName", label: "Arabic Name" },
  { value: "salesVat", label: "Sales VAT %" },
  { value: "purchaseVat", label: "Purchase VAT %" },
  { value: "landingCost", label: "Landing Cost" },
  { value: "marginPerc", label: "Margin %" },
  { value: "marginAmount", label: "Margin Amount" },
  { value: "vatExclusive", label: "VAT Exclusive Rate" },
  { value: "vatInclusive", label: "VAT Inclusive Rate" },
  { value: "vatOnMrp", label: "VAT on MRP" },
  { value: "averageCost", label: "Average Cost" },
  { value: "mrp", label: "M.R.P" },
  { value: "openingStock", label: "Opening Stock" },
  { value: "openingRate", label: "Opening Rate" },
  { value: "openingWarehouse", label: "Warehouse" },
  { value: "rackLocation", label: "Rack" },
  { value: "defaultDiscount", label: "Default Discount" },
  { value: "reorderMin", label: "Reorder Min" },
  { value: "reorderMax", label: "Reorder Max" },
  { value: "reorderQty", label: "Reorder Qty" },
  { value: "weightBarcode", label: "Weight Barcode" },
  { value: "rateBarcode", label: "Rate Barcode" },
  { value: "moreBarcodes", label: "More Barcodes (; separated)" },
  { value: "unitPrices", label: "Unit Prices JSON" },
  { value: "customUnits", label: "Custom Units JSON" },
  { value: "unitDefinitions", label: "Unit Definitions JSON" },
  { value: "customerTypes", label: "Customer Types JSON" },
  { value: "multiCustomerRatesEnabled", label: "Multi Customer Rates Enabled" },
  { value: "specificationText", label: "Specification Text" },
  { value: "photoUrl", label: "Photo URL" },
  { value: "description", label: "Description" },
];

const MATCH_HINTS = {
  id: ["productid"],
  name: ["productname", "name", "item"],
  shopPartNumber: ["shoppartnumber", "shoppartno"],
  shopPartSerial: ["shoppartserial"],
  shopPartFormatKey: ["shoppartformatkey"],
  originalPartKey: ["originalpartkey"],
  shopPartGroupKey: ["shoppartgroupkey"],
  code: ["codemodel", "productcode", "code", "model"],
  barcode: ["barcode"],
  ean: ["ean"],
  productGroup: ["productgroup", "group"],
  company: ["company", "brand"],
  category: ["category"],
  subcategory: ["subcategory", "subcat"],
  commodityCode: ["commoditycode"],
  unit: ["baseunit", "unit"],
  productType: ["producttype"],
  arabicName: ["arabicname", "arabic"],
  salesVat: ["salesvat"],
  purchaseVat: ["purchasevat"],
  landingCost: ["landingcost", "landing", "cost"],
  marginPerc: ["marginpercent", "margin%", "margin"],
  marginAmount: ["marginamount"],
  vatExclusive: ["vatexclusive", "exclusive"],
  vatInclusive: ["vatinclusive", "inclusive"],
  vatOnMrp: ["vatonmrp"],
  averageCost: ["averagecost"],
  mrp: ["mrp"],
  openingStock: ["openingstock", "openingqty", "stock"],
  openingRate: ["openingrate"],
  openingWarehouse: ["warehouse", "openingwarehouse"],
  rackLocation: ["rack", "racklocation"],
  defaultDiscount: ["defaultdiscount", "discount"],
  reorderMin: ["reordermin", "minstock", "minimumstock"],
  reorderMax: ["reordermax", "maxstock", "maximumstock"],
  reorderQty: ["reorderqty", "reorderquantity"],
  weightBarcode: ["weightbarcode"],
  rateBarcode: ["ratebarcode"],
  moreBarcodes: ["morebarcodes", "additionalbarcodes"],
  unitPrices: ["unitprices", "unitpricesjson", "sellingrates"],
  customUnits: ["customunits", "customunitsjson"],
  unitDefinitions: ["unitdefinitions", "unitdefinitionsjson"],
  customerTypes: ["customertypes", "customertypesjson"],
  multiCustomerRatesEnabled: ["multicustomerratesenabled"],
  specificationText: ["specificationtext", "specification"],
  photoUrl: ["photourl", "photo"],
  description: ["description", "remarks"],
};

function normalizeHint(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9%]/g, "");
}

function autoMap(headers) {
  const mapping = {};
  const taken = new Set();
  const entries = Object.entries(MATCH_HINTS);
  headers.forEach((header) => {
    const norm = normalizeHint(header);
    const exact = entries.find(
      ([field, hints]) => !taken.has(field) && hints.some((hint) => norm === normalizeHint(hint))
    );
    const fuzzy = exact || entries.find(
      ([field, hints]) => !taken.has(field) && hints.some((hint) => {
        const cleaned = normalizeHint(hint);
        return cleaned.length >= 4 && (norm.includes(cleaned) || cleaned.includes(norm));
      })
    );
    if (fuzzy) {
      mapping[header] = fuzzy[0];
      taken.add(fuzzy[0]);
    }
  });
  return mapping;
}

function matrixToRows(matrix) {
  if (!Array.isArray(matrix) || matrix.length < 2) return { headers: [], rows: [] };
  const seen = new Map();
  const headers = matrix[0].map((raw, index) => {
    const base = String(raw ?? "").trim() || `Column ${index + 1}`;
    const key = base.toLowerCase();
    const count = (seen.get(key) || 0) + 1;
    seen.set(key, count);
    return count === 1 ? base : `${base} (${count})`;
  });
  const rows = matrix.slice(1)
    .filter((cells) => cells.some((cell) => String(cell ?? "").trim()))
    .map((cells) => Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? ""])));
  return { headers, rows };
}

export default function ImportModal({ onImport, onClose, notify, replacementMode = false }) {
  const [step, setStep] = useState("upload");
  const [headers, setHeaders] = useState([]);
  const [rows, setRows] = useState([]);
  const [mapping, setMapping] = useState({});
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const closeSafely = () => {
    if (busy) return;
    if (
      replacementMode &&
      step !== "result" &&
      !window.confirm("No new products have been imported. Finish replacement with an empty Product Master?")
    ) return;
    onClose();
  };

  const mappedRecords = useMemo(() => rows.map((row) => {
    const record = {};
    Object.entries(mapping).forEach(([header, field]) => {
      if (field) record[field] = String(row[header] ?? "").trim();
    });
    return record;
  }), [mapping, rows]);

  const preview = useMemo(() => {
    const seenCodes = new Set();
    const invalidRows = new Set();
    let missingName = 0;
    let duplicateCodes = 0;
    let invalidJson = 0;
    mappedRecords.forEach((record, rowIndex) => {
      if (!String(record.name || "").trim()) {
        missingName += 1;
        invalidRows.add(rowIndex);
      }
      const codes = [record.barcode, record.ean, ...String(record.moreBarcodes || "").split(/[;,|]/)]
        .map((value) => String(value || "").trim().toLowerCase())
        .filter(Boolean);
      if (codes.some((code) => seenCodes.has(code)) || new Set(codes).size !== codes.length) {
        duplicateCodes += 1;
        invalidRows.add(rowIndex);
      }
      codes.forEach((code) => seenCodes.add(code));
      ["unitPrices", "customUnits", "unitDefinitions", "customerTypes"].forEach((field) => {
        if (!record[field]) return;
        try {
          if (!Array.isArray(JSON.parse(record[field]))) {
            invalidJson += 1;
            invalidRows.add(rowIndex);
          }
        } catch {
          invalidJson += 1;
          invalidRows.add(rowIndex);
        }
      });
    });
    return {
      valid: mappedRecords.length - invalidRows.size,
      missingName,
      duplicateCodes,
      invalidJson,
    };
  }, [mappedRecords]);

  async function onFileSelected(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy(true);
    try {
      const isExcel = /\.xlsx$/i.test(file.name);
      const parsed = isExcel
        ? matrixToRows(await (await import("read-excel-file/browser")).default(file))
        : parseCsv(await file.text());
      if (!parsed.headers.length || !parsed.rows.length) throw new Error("No data rows found in the file");
      setHeaders(parsed.headers);
      setRows(parsed.rows);
      setMapping(autoMap(parsed.headers));
      setStep("map");
    } catch (err) {
      notify(err.message || "Failed to read file", "err");
    } finally {
      setBusy(false);
    }
  }

  async function commit() {
    if (!Object.values(mapping).includes("name")) {
      return notify("Map a column to Product Name before importing", "err");
    }
    const selectedFields = Object.values(mapping).filter(Boolean);
    if (new Set(selectedFields).size !== selectedFields.length) {
      return notify("The same Product Master field cannot be mapped more than once", "err");
    }
    setBusy(true);
    try {
      setResult(await onImport(mappedRecords));
      setStep("result");
    } catch (err) {
      notify(err.message || "Import failed", "err");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="Import Products" onClose={closeSafely} width="xl">
      {step === "upload" && (
        <>
          <p className="pm-hint">
            {replacementMode ? "The old Product Master is cleared and sync is locked. " : ""}
            Choose an Excel (.xlsx), CSV, TSV, or semicolon-delimited text file.
          </p>
          <input type="file" accept=".xlsx,.csv,.tsv,.txt,text/csv,text/tab-separated-values" onChange={onFileSelected} style={{ fontSize: 12 }} />
          {busy && <p className="pm-hint">Reading file...</p>}
        </>
      )}

      {step === "map" && (
        <>
          <p className="pm-hint">{rows.length} rows detected. Map each column from your file to a Product Master field.</p>
          <div className="pm-import-preview">
            <span>Ready: <strong>{preview.valid}</strong></span>
            <span>Missing name: <strong>{preview.missingName}</strong></span>
            <span>Duplicate barcode rows: <strong>{preview.duplicateCodes}</strong></span>
            <span>Invalid JSON values: <strong>{preview.invalidJson}</strong></span>
          </div>
          <div className="pm-table-wrap" style={{ maxHeight: 300 }}>
            <table className="pm-table">
              <thead><tr><th>Source Column</th><th>Sample</th><th>Maps To</th></tr></thead>
              <tbody>
                {headers.map((h) => (
                  <tr key={h}>
                    <td style={{ fontWeight: 600 }}>{h}</td>
                    <td style={{ color: "#64748b" }}>{String(rows[0]?.[h] ?? "")}</td>
                    <td>
                      <select
                        className="pm-input"
                        value={mapping[h] || ""}
                        onChange={(e) => setMapping((m) => ({ ...m, [h]: e.target.value }))}
                      >
                        {TARGET_FIELDS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="pm-window-foot">
            <button type="button" className="pm-btn-secondary" onClick={closeSafely} disabled={busy}>Cancel</button>
            <button type="button" className="pm-btn" onClick={commit} disabled={busy}>
              {busy ? "Importing..." : `Import ${rows.length} rows`}
            </button>
          </div>
        </>
      )}

      {step === "result" && result && (
        <>
          <div style={{ display: "flex", gap: 16, fontSize: 12.5, fontWeight: 700 }}>
            <span style={{ color: "#15803d" }}>Created: {result.created}</span>
            <span style={{ color: "#b91c1c" }}>Skipped: {result.skipped}</span>
          </div>
          {result.errors?.length > 0 && (
            <div className="pm-table-wrap" style={{ maxHeight: 240 }}>
              <table className="pm-table">
                <thead><tr><th>Row</th><th>Reason</th></tr></thead>
                <tbody>
                  {result.errors.map((err, i) => (
                    <tr key={i}><td>{err.row}</td><td style={{ color: "#b91c1c" }}>{err.reason}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="pm-window-foot">
            <button type="button" className="pm-btn" onClick={closeSafely}>Close</button>
          </div>
        </>
      )}
    </Modal>
  );
}
