import React, { useEffect, useMemo, useRef, useState } from "react";

const EMPTY_FIELDS = {
  productName: "",
  productCode: "",
  shopPartNumber: "",
  barcode: "",
  ean: "",
  alternateCodes: "",
  company: "",
  category: "",
  subCategory: "",
  productGroup: "",
  commodityCode: "",
  mrp: "",
};

const SEARCH_COLUMNS = [
  { key: "productName", label: "Product Name", width: 180 },
  { key: "productCode", label: "Product Code", width: 240 },
  { key: "shopPartNumber", label: "Shop Part No", width: 110 },
  { key: "barcode", label: "Barcode", width: 130 },
  { key: "ean", label: "EAN", width: 115 },
  { key: "company", label: "Company Name", width: 135 },
  { key: "category", label: "Category Name", width: 120 },
  { key: "subCategory", label: "Subcategory Name", width: 130 },
  { key: "commodityCode", label: "Comm Code", width: 100 },
  { key: "landingCost", label: "Landing Cost", width: 95 },
  { key: "vatExclusive", label: "VAT Excl Rate", width: 95 },
  { key: "vatInclusive", label: "VAT Incl Rate", width: 95 },
  { key: "mrp", label: "M R P", width: 85 },
];

const defaultColumnSettings = () => SEARCH_COLUMNS.map((column) => ({ ...column }));
const loadColumnSettings = () => {
  try {
    const saved = JSON.parse(localStorage.getItem("s4-product-search-columns-v2") || localStorage.getItem("s4-product-search-columns") || "[]");
    if (!Array.isArray(saved) || saved.length !== SEARCH_COLUMNS.length) return defaultColumnSettings();
    const byKey = new Map(SEARCH_COLUMNS.map((column) => [column.key, column]));
    if (saved.some((column) => !byKey.has(column.key))) return defaultColumnSettings();
    return saved.map((column) => {
      const defaults = byKey.get(column.key);
      let width = Math.max(50, Math.min(800, Number(column.width) || defaults.width));
      if (column.key === "productCode" && width <= 115) width = defaults.width;
      return { ...defaults, width };
    });
  } catch {
    return defaultColumnSettings();
  }
};
const clean = (value) => String(value ?? "").trim().toLowerCase();

function productRefs(product) {
  return [
    product.code,
    product.barcode,
    product.ean,
    ...(Array.isArray(product.moreBarcodes) ? product.moreBarcodes : []),
    ...(Array.isArray(product.unitPrices) ? product.unitPrices.map((row) => row.barcode) : []),
  ].filter(Boolean);
}

export default function GlobalSearchModal({ products, shopPartEnabled = true, onSelect, onClose }) {
  const [fields, setFields] = useState(EMPTY_FIELDS);
  const [results, setResults] = useState([]);
  const [extendedSearch, setExtendedSearch] = useState(true);
  const [autoSearch, setAutoSearch] = useState(true);
  const [lang, setLang] = useState("EN");
  const [showColumnSettings, setShowColumnSettings] = useState(false);
  const [columnSettings, setColumnSettings] = useState(loadColumnSettings);
  const [draftColumns, setDraftColumns] = useState(defaultColumnSettings);
  const [selectedColumn, setSelectedColumn] = useState("productName");
  const [selectedId, setSelectedId] = useState(null);
  const firstInputRef = useRef(null);
  const gridRef = useRef(null);
  const columnSettingsRef = useRef(columnSettings);
  const activeColumnSettings = useMemo(
    () => columnSettings.filter((column) => shopPartEnabled || column.key !== "shopPartNumber"),
    [columnSettings, shopPartEnabled]
  );

  const hasCriteria = useMemo(
    () => Object.values(fields).some((value) => String(value).trim()),
    [fields]
  );

  function matches(actual, expected) {
    const haystack = clean(actual);
    const needle = clean(expected);
    if (!needle) return true;
    return extendedSearch ? haystack.includes(needle) : haystack.startsWith(needle);
  }

  function runSearch({ allowEmpty = true } = {}) {
    if (!hasCriteria && !allowEmpty) {
      setResults([]);
      setSelectedId(null);
      return;
    }

    const found = products.filter((product) => {
      const refs = productRefs(product);
      return (
        matches(product.name, fields.productName) &&
        matches(product.code, fields.productCode) &&
        (!shopPartEnabled || matches(product.shopPartNumber, fields.shopPartNumber)) &&
        (!fields.barcode || refs.some((value) => matches(value, fields.barcode))) &&
        matches(product.ean, fields.ean) &&
        (!fields.alternateCodes || refs.some((value) => matches(value, fields.alternateCodes))) &&
        matches(product.company || product.brand, fields.company) &&
        matches(product.category, fields.category) &&
        matches(product.subcategory, fields.subCategory) &&
        matches(product.productGroup, fields.productGroup) &&
        matches(product.commodityCode, fields.commodityCode) &&
        matches(product.mrp, fields.mrp)
      );
    });
    setResults(found.slice(0, 500));
    setSelectedId(null);
  }

  useEffect(() => {
    firstInputRef.current?.focus();
  }, []);

  useEffect(() => {
    columnSettingsRef.current = columnSettings;
  }, [columnSettings]);

  useEffect(() => {
    if (!autoSearch) return undefined;
    const timer = setTimeout(() => runSearch({ allowEmpty: false }), 220);
    return () => clearTimeout(timer);
    // Search is intentionally recalculated from all field values.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fields, autoSearch, extendedSearch, products]);

  useEffect(() => {
    const onKey = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        if (showColumnSettings) setShowColumnSettings(false);
        else onClose();
      } else if (event.key === "Control") {
        gridRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose, showColumnSettings]);

  const updateField = (key, value) => setFields((prev) => ({ ...prev, [key]: value }));
  const recall = (product) => {
    onSelect(product);
    onClose();
  };
  const openColumnSettings = () => {
    setDraftColumns(columnSettings.map((column) => ({ ...column })));
    setSelectedColumn(columnSettings[0]?.key || "productName");
    setShowColumnSettings(true);
  };
  const moveColumn = (direction) => {
    setDraftColumns((previous) => {
      const index = previous.findIndex((column) => column.key === selectedColumn);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= previous.length) return previous;
      const next = [...previous];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };
  const updateSelectedWidth = (value) => {
    setDraftColumns((previous) => previous.map((column) => (
      column.key === selectedColumn ? { ...column, width: value } : column
    )));
  };
  const applyColumnSettings = () => {
    const applied = draftColumns.map((column) => ({
      ...column,
      width: Math.max(50, Math.min(800, Number(column.width) || 50)),
    }));
    setColumnSettings(applied);
    localStorage.setItem("s4-product-search-columns-v2", JSON.stringify(applied));
    setShowColumnSettings(false);
  };
  const persistColumnSettings = (next) => {
    setColumnSettings(next);
    localStorage.setItem("s4-product-search-columns-v2", JSON.stringify(next));
  };
  const startColumnResize = (event, key) => {
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    const startWidth = Number(columnSettings.find((column) => column.key === key)?.width) || 80;
    const onMove = (moveEvent) => {
      const width = Math.max(50, Math.min(800, startWidth + (moveEvent.clientX - startX)));
      setColumnSettings((previous) => previous.map((column) => (
        column.key === key ? { ...column, width } : column
      )));
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      persistColumnSettings(columnSettingsRef.current);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const columnValue = (product, key) => ({
    productName: product.name,
    productCode: product.code,
    shopPartNumber: product.shopPartNumber,
    barcode: product.barcode,
    ean: product.ean,
    company: product.company || product.brand,
    category: product.category,
    subCategory: product.subcategory,
    commodityCode: product.commodityCode,
    landingCost: product.landingCost,
    vatExclusive: product.vatExclusive,
    vatInclusive: product.vatInclusive,
    mrp: product.mrp,
  })[key] || "";

  const fieldsConfig = [
    ["productName", "Product Name"],
    ["productCode", "Product Code"],
    ["shopPartNumber", "Shop Part No"],
    ["barcode", "Barcode / Additional Barcodes"],
    ["ean", "EAN"],
    ["alternateCodes", "Alternate Codes"],
    ["company", "Company"],
    ["category", "Category"],
    ["subCategory", "Sub Category"],
    ["productGroup", "Product Group"],
    ["commodityCode", "Commodity Code"],
    ["mrp", "M.R.P"],
  ].filter(([key]) => shopPartEnabled || key !== "shopPartNumber");

  return (
    <div className="pm-search-backdrop" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section className="pm-search-window" onMouseDown={(event) => event.stopPropagation()}>
        <header className="pm-search-title">
          <strong>Search Product</strong>
          <button type="button" aria-label="Close Search" onClick={onClose}>✕</button>
        </header>

        <div className="pm-search-content">
          <fieldset className="pm-search-fields">
            <legend>Type any part of the data to search in any of the following fields</legend>
            <span className="pm-search-control-hint">Press Control key to move focus in Search list Grid</span>
            <div className="pm-search-field-grid">
              {fieldsConfig.map(([key, label], index) => (
                <label key={key} className="pm-search-field">
                  <span>{label}</span>
                  <input
                    ref={index === 0 ? firstInputRef : undefined}
                    value={fields[key]}
                    onChange={(event) => updateField(key, event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") runSearch();
                    }}
                  />
                </label>
              ))}
              <div className="pm-search-command">
                <button type="button" onClick={() => runSearch()}>Search</button>
                <button type="button" className="pm-search-lang" onClick={() => setLang(lang === "EN" ? "AR" : "EN")}>
                  {lang}
                </button>
              </div>
            </div>
          </fieldset>

          <div className="pm-search-results-title">
            <strong>Search Result</strong>
            {results.length > 0 && <span>{results.length}{results.length === 500 ? "+" : ""} products</span>}
          </div>

          <div ref={gridRef} tabIndex={0} className="pm-search-grid-wrap">
            <table
              className="pm-search-grid"
              style={{ minWidth: activeColumnSettings.reduce((total, column) => total + Number(column.width), 0) }}
            >
              <thead>
                <tr>
                  {activeColumnSettings.map((column) => (
                    <th key={column.key} style={{ width: Number(column.width) }}>
                      <span className="pm-search-col-label">{column.label}</span>
                      <span
                        className="pm-search-col-resizer"
                        onMouseDown={(event) => startColumnResize(event, column.key)}
                        title="Drag to resize column"
                      />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {results.map((product) => (
                  <tr
                    key={product.id}
                    className={selectedId === product.id ? "is-selected" : ""}
                    onClick={() => {
                      if (window.matchMedia?.("(pointer: coarse)").matches) recall(product);
                      else setSelectedId(product.id);
                    }}
                    onDoubleClick={() => recall(product)}
                    title="Double-click to recall this product in Product Master (tap once on mobile)"
                  >
                    {activeColumnSettings.map((column) => {
                      const value = columnValue(product, column.key);
                      return (
                        <td key={column.key} style={{ width: Number(column.width) }} title={String(value || "")}>
                          {value}
                        </td>
                      );
                    })}
                  </tr>
                ))}
                {!results.length && (
                  <tr className="pm-search-empty-row">
                    <td colSpan={activeColumnSettings.length}>
                      {hasCriteria ? "No matching products" : "Enter search criteria above, or press Search"}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <footer className="pm-search-footer">
          <div className="pm-search-options">
            <label>
              <input type="checkbox" checked={extendedSearch} onChange={(event) => setExtendedSearch(event.target.checked)} />
              <strong>Extended Search</strong>
              <span>(Will display all products containing the search text in any part of the field)</span>
            </label>
            <label>
              <input type="checkbox" checked={autoSearch} onChange={(event) => setAutoSearch(event.target.checked)} />
              <strong>Auto Search while typing in text box</strong>
            </label>
          </div>
          <button type="button" className="pm-search-close" onClick={onClose}>Close</button>
          <button type="button" className="pm-search-columns-link" onClick={openColumnSettings}>
            Click here to change the Search List Column Settings
          </button>
          {showColumnSettings && (
            <div className="pm-search-column-settings" role="dialog" aria-label="Column Settings">
              <div className="pm-search-column-settings__title">
                <strong>Column Settings</strong>
                <button type="button" onClick={() => setShowColumnSettings(false)} aria-label="Close">✕</button>
              </div>
              <div className="pm-search-column-settings__body">
                <div className="pm-search-column-settings__list">
                  <div className="pm-search-column-settings__head">Field List</div>
                  {draftColumns.filter((column) => shopPartEnabled || column.key !== "shopPartNumber").map((column) => (
                    <button
                      type="button"
                      key={column.key}
                      className={selectedColumn === column.key ? "is-selected" : ""}
                      onClick={() => setSelectedColumn(column.key)}
                    >
                      {column.label}
                    </button>
                  ))}
                </div>
                <div className="pm-search-column-settings__arrows">
                  <button type="button" title="Move column up" onClick={() => moveColumn(-1)}>↑</button>
                  <button type="button" title="Move column down" onClick={() => moveColumn(1)}>↓</button>
                </div>
                <div className="pm-search-column-settings__width">
                  <label htmlFor="pm-search-column-width">Width</label>
                  <input
                    id="pm-search-column-width"
                    type="number"
                    min="50"
                    max="800"
                    value={draftColumns.find((column) => column.key === selectedColumn)?.width ?? ""}
                    onChange={(event) => updateSelectedWidth(event.target.value)}
                  />
                  <button type="button" onClick={applyColumnSettings}>OK</button>
                </div>
                <div className="pm-search-column-settings__actions">
                  <button type="button" onClick={() => {
                    const defaults = defaultColumnSettings();
                    setDraftColumns(defaults);
                    setSelectedColumn(defaults[0].key);
                  }}>Reset</button>
                  <button type="button" onClick={() => setShowColumnSettings(false)}>Close</button>
                </div>
              </div>
            </div>
          )}
        </footer>
      </section>
    </div>
  );
}
