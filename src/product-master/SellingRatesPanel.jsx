import React, { useEffect, useMemo, useState } from "react";

const BASE_UNITS = ["Number", "Pcs", "Set", "Nos", "Kg", "Litre", "Ltr", "Box", "Pair", "Cm", "Mtr"];
const BASE_CUSTOMER_TYPES = ["Customer", "Wholesale", "Retail"];
const EMPTY_ROW = { customerType: "", unit: "", factor: "", barcode: "", vatExclusive: "", vatInclusive: "", mrp: "", altName: "" };

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
  const [editingId, setEditingId] = useState(null);

  useEffect(() => {
    setEditingId(null);
    setDraft(EMPTY_ROW);
  }, [form.id]);
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
    const badRate = ["vatExclusive", "vatInclusive", "mrp"].find((k) => {
      const text = String(draft[k] ?? "").trim();
      return text && (!Number.isFinite(Number(text)) || Number(text) < 0);
    });
    if (badRate) return notify("Rates must be numbers of 0 or more", "err");
    const baseUnit = String(form.unit || "Pcs").trim();
    const sameUnit = (r) => String(r.unit).toLowerCase() === String(draft.unit).toLowerCase();
    const isBaseUnit = String(draft.unit).toLowerCase() === baseUnit.toLowerCase();
    let factorText = isBaseUnit ? "1" : String(draft.factor ?? "").trim();
    if (!factorText) {
      const known = rows.find((r) => r.id !== editingId && sameUnit(r) && Number(r.factor) > 0);
      if (!known) return notify(`Enter how many ${baseUnit} are in 1 ${draft.unit}, so stock is counted correctly`, "err");
      factorText = String(known.factor);
    }
    if (!Number.isFinite(Number(factorText)) || Number(factorText) <= 0) {
      return notify(`"1 ${draft.unit} = ? ${baseUnit}" must be a number more than 0`, "err");
    }
    const clash = rows.find((r) => r.id !== editingId && sameUnit(r)
      && String(r.customerType || "").toLowerCase() === String(draft.customerType || "").toLowerCase());
    if (clash) return notify(`A rate for ${draft.unit}${draft.customerType ? ` · ${draft.customerType}` : ""} already exists — edit that row instead`, "err");

    const finalRow = { ...draft, factor: factorText };
    // One unit has one physical size, so every customer-type row of that unit shares the factor.
    const withFactor = (list) => list.map((r) => (sameUnit(r) ? { ...r, factor: factorText } : r));
    if (editingId) {
      const original = rows.find((r) => r.id === editingId);
      const barcodeChanged = String(original?.barcode || "").trim() !== String(draft.barcode || "").trim();
      if (draft.barcode && barcodeChanged && !validateBarcode(draft.barcode)) return;
      upd("unitPrices", withFactor(rows.map((r) => (r.id === editingId ? { ...finalRow, id: editingId } : r))));
      setEditingId(null);
      setDraft(EMPTY_ROW);
      notify("Rate updated — press Save to store it");
      return;
    }
    if (draft.barcode && !validateBarcode(draft.barcode)) return;
    const row = { ...finalRow, id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}` };
    upd("unitPrices", withFactor([...rows, row]));
    setDraft(EMPTY_ROW);
    notify("Rate added");
  }

  function editRow(row, idx) {
    let id = row.id;
    if (!id) {
      id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      upd("unitPrices", rows.map((r, i) => (i === idx ? { ...r, id } : r)));
    }
    setEditingId(id);
    setDraft({ ...EMPTY_ROW, ...row, id });
  }

  function cancelEdit() {
    setEditingId(null);
    setDraft(EMPTY_ROW);
  }

  function removeRow(id) {
    upd("unitPrices", rows.filter((r) => r.id !== id));
    if (editingId === id) cancelEdit();
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
            <label className="pm-label">1 {draft.unit || "Unit"} = ? {form.unit || "Pcs"}</label>
            <input
              className="pm-input pm-nav-control"
              enterKeyHint="next"
              inputMode="decimal"
              placeholder={String(draft.unit || "").toLowerCase() === String(form.unit || "Pcs").toLowerCase() ? "1" : "e.g. 12"}
              value={draft.factor ?? ""}
              onChange={(e) => setField("factor", e.target.value)}
            />
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
            <input
              className="pm-input pm-nav-control"
              enterKeyHint="done"
              value={draft.altName}
              onChange={(e) => setField("altName", e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== "Enter") return;
                e.preventDefault();
                e.stopPropagation();
                addRow();
              }}
            />
          </div>
          <button type="button" className="pm-btn" onClick={addRow}>{editingId ? "Update" : "Add"}</button>
          {editingId && <button type="button" className="pm-btn-secondary" onClick={cancelEdit}>Cancel</button>}
        </div>

        <div className="pm-table-wrap pm-selling-table">
          <table className="pm-table">
            <thead>
              <tr>
                <th>Unit</th><th>= {form.unit || "Pcs"}</th><th>Barcode</th><th>VAT Excl.</th><th>VAT Incl.</th><th>MRP</th><th>Alternate Name</th><th />
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr><td colSpan={8} className="pm-empty">No alternate unit rates added</td></tr>
              )}
              {rows.map((r, idx) => (
                <tr key={r.id || idx} className={editingId === r.id ? "pm-selected" : ""}>
                  <td>{r.customerType ? `${r.unit} · ${r.customerType}` : r.unit}</td>
                  <td style={{ color: Number(r.factor) > 0 ? undefined : "#b91c1c" }}>{Number(r.factor) > 0 ? r.factor : "?"}</td>
                  <td>{r.barcode || "-"}</td>
                  <td>{r.vatExclusive || "-"}</td>
                  <td>{r.vatInclusive || "-"}</td>
                  <td>{r.mrp || "-"}</td>
                  <td>{r.altName || "-"}</td>
                  <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                    <button type="button" className="pm-link-btn" onClick={() => editRow(r, idx)}>Edit</button>{" "}
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
