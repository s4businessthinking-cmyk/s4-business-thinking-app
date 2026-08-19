import React, { useMemo, useState } from "react";

const BASE_UNITS = ["Number", "Pcs", "Set", "Nos", "Kg", "Litre", "Ltr", "Box", "Pair", "Cm", "Mtr"];
const BASE_CUSTOMER_TYPES = ["Customer", "Wholesale", "Retail"];
const EMPTY_ROW = { customerType: "", unit: "", barcode: "", vatExclusive: "", vatInclusive: "", mrp: "", altName: "" };

export default function SellingRatesPanel({
  form,
  upd,
  onOpenNewUnit,
  onOpenNewCustomerType,
  onPrintAlternateBarcode,
  notify,
  enabled,
  masterUnits,
  masterCustomerTypes,
  validateBarcode = () => true,
}) {
  const [draft, setDraft] = useState(EMPTY_ROW);
  const rows = Array.isArray(form.unitPrices) ? form.unitPrices : [];

  const units = useMemo(
    () => [...new Set([...(masterUnits?.length ? masterUnits : BASE_UNITS), ...(form.customUnits || [])])],
    [masterUnits, form.customUnits]
  );
  const customerTypes = useMemo(
    () => [...new Set([...(masterCustomerTypes?.length ? masterCustomerTypes : BASE_CUSTOMER_TYPES), ...(form.customerTypes || [])])],
    [masterCustomerTypes, form.customerTypes]
  );

  const setField = (field, value) => setDraft((prev) => ({ ...prev, [field]: value }));

  function addRow() {
    if (!draft.unit) return notify("Select a unit", "err");
    if (draft.barcode && !validateBarcode(draft.barcode)) return;
    const row = { ...draft, id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}` };
    upd("unitPrices", [...rows, row]);
    setDraft(EMPTY_ROW);
    notify("Rate added");
  }

  function removeRow(id) {
    upd("unitPrices", rows.filter((r) => r.id !== id));
  }

  return (
    <fieldset
      className={`pm-panel pm-selling-panel${enabled ? "" : " is-disabled"}`}
      disabled={!enabled}
      aria-disabled={!enabled}
    >
      <legend className="pm-panel-legend">Selling Rates and Barcode for Other Units of this Product</legend>
      <div className="pm-selling-body">
        <div className="pm-selling-top">
          <div className="pm-field">
            <label className="pm-label">Customer Type</label>
            <select className="pm-input pm-nav-control" value={draft.customerType} onChange={(e) => setField("customerType", e.target.value)}>
              <option value="">-- All / Default --</option>
              {customerTypes.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <button type="button" className="pm-link-btn" onClick={onOpenNewCustomerType}>New Customer Type</button>
          <button type="button" className="pm-btn-secondary" onClick={onPrintAlternateBarcode}>Print Alternate Barcode</button>
        </div>

        <div className="pm-selling-fields">
          <div className="pm-field">
            <label className="pm-label">Unit Symbol <button type="button" className="pm-link-btn" onClick={onOpenNewUnit}>New Unit</button></label>
            <select className="pm-input pm-nav-control" value={draft.unit} onChange={(e) => setField("unit", e.target.value)}>
              <option value="">--</option>
              {units.map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>
          <div className="pm-field">
            <label className="pm-label">Barcode</label>
            <input className="pm-input pm-nav-control" enterKeyHint="next" value={draft.barcode} onChange={(e) => setField("barcode", e.target.value)} />
          </div>
          <div className="pm-field">
            <label className="pm-label">VAT Excl. Rate</label>
            <input className="pm-input pm-nav-control" enterKeyHint="next" inputMode="decimal" value={draft.vatExclusive} onChange={(e) => setField("vatExclusive", e.target.value)} />
          </div>
          <div className="pm-field">
            <label className="pm-label">VAT Incl. Rate</label>
            <input className="pm-input pm-nav-control" enterKeyHint="next" inputMode="decimal" value={draft.vatInclusive} onChange={(e) => setField("vatInclusive", e.target.value)} />
          </div>
        </div>

        <div className="pm-selling-alt">
          <div className="pm-field">
            <label className="pm-label">MRP</label>
            <input className="pm-input pm-nav-control" enterKeyHint="next" inputMode="decimal" value={draft.mrp} onChange={(e) => setField("mrp", e.target.value)} />
          </div>
          <div className="pm-field">
            <label className="pm-label">Alternate Product Name (In Bill Print)</label>
            <input className="pm-input pm-nav-control" enterKeyHint="done" value={draft.altName} onChange={(e) => setField("altName", e.target.value)} />
          </div>
          <button type="button" className="pm-btn" onClick={addRow}>Add</button>
        </div>

        <div className="pm-table-wrap pm-selling-table">
          <table className="pm-table">
            <thead>
              <tr>
                <th>Unit</th><th>Barcode</th><th>VAT Excl.</th><th>VAT Incl.</th><th>MRP</th><th>Alternate Name</th><th />
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr><td colSpan={7} className="pm-empty">No alternate unit rates added</td></tr>
              )}
              {rows.map((r, idx) => (
                <tr key={r.id || idx}>
                  <td>{r.customerType ? `${r.unit} · ${r.customerType}` : r.unit}</td>
                  <td>{r.barcode || "-"}</td>
                  <td>{r.vatExclusive || "-"}</td>
                  <td>{r.vatInclusive || "-"}</td>
                  <td>{r.mrp || "-"}</td>
                  <td>{r.altName || "-"}</td>
                  <td style={{ textAlign: "right" }}>
                    <button type="button" className="pm-link-danger" onClick={() => removeRow(r.id)}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </fieldset>
  );
}
