import React, { useMemo, useState } from "react";

const BASE_UNITS = ["Number", "Pcs", "Set", "Nos", "Kg", "Litre", "Ltr", "Box", "Pair", "Cm", "Mtr"];

export default function ProductDetailsForm({
  form,
  upd,
  products,
  companies,
  masterUnits,
  onOpenMoreBarcodes,
  onOpenNewUnit,
  onPickSuggestion,
  onValidateIdentityCode,
  shopPartEnabled,
}) {
  const [lang, setLang] = useState("EN");
  const [showSuggestions, setShowSuggestions] = useState(false);

  const distinct = (values) => [...new Set(values.filter(Boolean).map(String))].sort();
  const productGroups = useMemo(() => distinct(products.map((p) => p.productGroup)), [products]);
  const companyOptions = useMemo(
    () => distinct([...companies.map((c) => c.name), ...products.map((p) => p.company || p.brand)]),
    [products, companies]
  );
  const categories = useMemo(() => distinct(products.map((p) => p.category)), [products]);
  const subCategories = useMemo(
    () => distinct(products.filter((p) => !form.category || p.category === form.category).map((p) => p.subcategory)),
    [products, form.category]
  );
  const units = useMemo(
    () => distinct([...(masterUnits?.length ? masterUnits : BASE_UNITS), ...(form.customUnits || [])]),
    [masterUnits, form.customUnits]
  );

  const suggestions = useMemo(() => {
    const query = String(form.name || "").trim().toLowerCase();
    if (!query) return [];
    return products.filter((p) => String(p.name || "").toLowerCase().includes(query)).slice(0, 8);
  }, [products, form.name]);

  const selectOptions = (id, values) => (
    <datalist id={id}>{values.map((v) => <option key={v} value={v} />)}</datalist>
  );

  return (
    <fieldset className="pm-panel pm-details-panel">
      <legend className="pm-panel-legend">Product Details</legend>
      <div className="pm-details-body">
        <div className="pm-form-row" style={{ position: "relative" }}>
          <label className="pm-label">Product Name</label>
          <input
            className="pm-input pm-nav-control"
            enterKeyHint="next"
            value={form.name || ""}
            onChange={(e) => { upd("name", e.target.value); setShowSuggestions(true); }}
            onFocus={() => setShowSuggestions(true)}
            onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
          />
          {showSuggestions && suggestions.length > 0 && (
            <div className="pm-suggest">
              {suggestions.map((p) => (
                <button key={p.id} type="button" onMouseDown={() => { onPickSuggestion(p); setShowSuggestions(false); }}>
                  {p.name}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="pm-form-row">
          <label className="pm-label">Code / Model</label>
          <input className="pm-input pm-nav-control" enterKeyHint="next" value={form.code || ""} onChange={(e) => upd("code", e.target.value)} />
        </div>

        {shopPartEnabled && (
          <div className="pm-form-row">
            <label className="pm-label">Shop Part No</label>
            <input
              className="pm-input"
              value={form.shopPartNumber || ""}
              readOnly
              title="Configured in Settings → Utilities → Shop Part Number Settings."
              placeholder="Auto on Save"
            />
          </div>
        )}

        <div className="pm-form-row pm-barcode-row">
          <label className="pm-label">Barcode</label>
          <input
            className="pm-input pm-nav-control"
            enterKeyHint="next"
            value={form.barcode || ""}
            onChange={(e) => upd("barcode", e.target.value)}
            onBlur={() => {
              if (!onValidateIdentityCode("barcode", form.barcode)) upd("barcode", "");
            }}
          />
          <div className="pm-barcode-checks">
            <label className="pm-check">
              <input type="checkbox" checked={!!form.weightBarcode} onChange={(e) => upd("weightBarcode", e.target.checked)} />
              Weight Barcode
            </label>
            <label className="pm-check">
              <input type="checkbox" checked={!!form.rateBarcode} onChange={(e) => upd("rateBarcode", e.target.checked)} />
              Rate Barcode
            </label>
          </div>
        </div>

        <div className="pm-form-row pm-ean-row">
          <label className="pm-label">EAN Code</label>
          <input
            className="pm-input pm-nav-control"
            enterKeyHint="next"
            value={form.ean || ""}
            onChange={(e) => upd("ean", e.target.value)}
            onBlur={() => {
              if (!onValidateIdentityCode("ean", form.ean)) upd("ean", "");
            }}
          />
          <button type="button" className="pm-btn-secondary" onClick={onOpenMoreBarcodes}>
            More Barcodes...
          </button>
        </div>

        <div className="pm-form-row">
          <label className="pm-label">Product Group</label>
          <input
            className="pm-input pm-nav-control"
            enterKeyHint="next"
            list="pm-group-options"
            value={form.productGroup || ""}
            onChange={(e) => upd("productGroup", e.target.value)}
          />
          {selectOptions("pm-group-options", productGroups)}
        </div>

        <div className="pm-form-row">
          <label className="pm-label">Company</label>
          <input
            className="pm-input pm-nav-control"
            enterKeyHint="next"
            list="pm-company-options"
            value={form.company || form.brand || ""}
            onChange={(e) => { upd("company", e.target.value); upd("brand", e.target.value); }}
          />
          {selectOptions("pm-company-options", companyOptions)}
        </div>

        <div className="pm-form-row">
          <label className="pm-label">Category</label>
          <input className="pm-input pm-nav-control" enterKeyHint="next" list="pm-category-options" value={form.category || ""}
            onChange={(e) => { upd("category", e.target.value); upd("subcategory", ""); }} />
          {selectOptions("pm-category-options", categories)}
        </div>

        <div className="pm-form-row">
          <label className="pm-label">Sub Category</label>
          <input className="pm-input pm-nav-control" enterKeyHint="next" list="pm-subcategory-options" value={form.subcategory || ""}
            onChange={(e) => upd("subcategory", e.target.value)} />
          {selectOptions("pm-subcategory-options", subCategories)}
        </div>

        <div className="pm-form-row">
          <label className="pm-label">Commodity<br />Code</label>
          <input className="pm-input pm-nav-control" enterKeyHint="next" value={form.commodityCode || ""} onChange={(e) => upd("commodityCode", e.target.value)} />
        </div>

        <div className="pm-form-row">
          <label className="pm-label">Description</label>
          <input className="pm-input pm-nav-control" enterKeyHint="next" value={form.description || ""} onChange={(e) => upd("description", e.target.value)} />
        </div>

        <div className="pm-form-row pm-unit-row">
          <label className="pm-label">Base Unit</label>
          <select className="pm-input pm-nav-control" value={form.unit || "Pcs"} onChange={(e) => upd("unit", e.target.value)}>
            {units.map((u) => <option key={u} value={u}>{u}</option>)}
          </select>
          <button type="button" className="pm-btn-secondary" onClick={onOpenNewUnit}>Create New Unit</button>
        </div>

        <div className="pm-form-row">
          <label className="pm-label">Product Type</label>
          <select className="pm-input pm-nav-control" value={form.productType || "Goods"} onChange={(e) => upd("productType", e.target.value)}>
            <option value="Goods">Goods</option>
            <option value="Service">Service</option>
          </select>
        </div>

        <div className="pm-form-row pm-arabic-row">
          <label className="pm-label">Arabic Name</label>
          <input
            className="pm-input pm-nav-control"
            enterKeyHint="done"
            dir={lang === "AR" ? "rtl" : "ltr"}
            value={form.arabicName || ""}
            onChange={(e) => upd("arabicName", e.target.value)}
          />
          <button type="button" className="pm-lang-btn" onClick={() => setLang(lang === "EN" ? "AR" : "EN")}>
            {lang}
          </button>
        </div>
      </div>
    </fieldset>
  );
}
