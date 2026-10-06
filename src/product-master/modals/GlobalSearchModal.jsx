import React, { useEffect, useMemo, useRef, useState } from "react";
import { specValues } from "../productSpecs";

const EMPTY_FIELDS = {
  productName: "",
  productCode: "",
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
const cleanText = (value) => clean(value).replace(/\s+/g, " ");

function productRefs(product) {
  return [
    product.code,
    product.barcode,
    product.ean,
    ...(Array.isArray(product.moreBarcodes) ? product.moreBarcodes : []),
    ...(Array.isArray(product.unitPrices) ? product.unitPrices.map((row) => row.barcode) : []),
  ].filter(Boolean);
}

// Cleaned search fields per product object; a changed product is a new object, so it is re-indexed.
const searchIndexCache = new WeakMap();
function searchIndex(product) {
  let index = searchIndexCache.get(product);
  if (!index) {
    index = {
      name: cleanText(product.name),
      code: cleanText(product.code),
      ean: cleanText(product.ean),
      company: cleanText(product.company || product.brand),
      category: cleanText(product.category),
      subcategory: cleanText(product.subcategory),
      productGroup: cleanText(product.productGroup),
      commodityCode: cleanText(product.commodityCode),
      mrp: cleanText(product.mrp),
      refs: productRefs(product).map(cleanText),
      spec: cleanText(specValues(product)),
    };
    searchIndexCache.set(product, index);
  }
  return index;
}

const EMBEDDED_COLUMNS = [
  { key: "productName", label: "Product Name", width: 190 },
  { key: "productCode", label: "Code", width: 110 },
  { key: "mrp", label: "MRP", width: 70 },
];
const EMBEDDED_BASIC_FIELDS = 3;

export default function GlobalSearchModal({
  products, onSelect, onClose, embedded = false, selectedProductId = null,
  initialFields = null, rowTitle = "Double-click to recall this product in Product Master (tap once on mobile)",
  showCost = false,
  active = true,
}) {
  const [showAllFields, setShowAllFields] = useState(false);
  const [fields, setFields] = useState(() => ({ ...EMPTY_FIELDS, ...(initialFields || {}) }));
  const [results, setResults] = useState([]);
  const [extendedSearch, setExtendedSearch] = useState(true);
  const [autoSearch, setAutoSearch] = useState(true);
  const [showColumnSettings, setShowColumnSettings] = useState(false);
  const [columnSettings, setColumnSettings] = useState(loadColumnSettings);
  const [draftColumns, setDraftColumns] = useState(defaultColumnSettings);
  const [selectedColumn, setSelectedColumn] = useState("productName");
  const [selectedId, setSelectedId] = useState(null);
  const [photoView, setPhotoView] = useState(null);
  const firstInputRef = useRef(null);
  const gridRef = useRef(null);
  const columnSettingsRef = useRef(columnSettings);
  const activeColumnSettings = embedded
    ? EMBEDDED_COLUMNS
    : (showCost ? columnSettings : columnSettings.filter((column) => column.key !== "landingCost"));

  const hasCriteria = useMemo(
    () => Object.values(fields).some((value) => String(value).trim()),
    [fields]
  );

  function runSearch({ allowEmpty = true, nextFields = fields, keepSelection = false } = {}) {
    const criteria = Object.values(nextFields).some((value) => String(value).trim());
    if (!criteria && !allowEmpty) {
      setResults([]);
      setSelectedId(null);
      return;
    }

    const needles = Object.fromEntries(Object.entries(nextFields).map(([key, value]) => [key, cleanText(value)]));
    const matches = (haystack, needle) =>
      !needle || (extendedSearch ? haystack.includes(needle) : haystack.startsWith(needle));
    const catalog = Array.isArray(products) ? products : [];
    const found = catalog.filter((product) => {
      const p = searchIndex(product);
      return (
        (matches(p.name, needles.productName) || (needles.productName.length >= 2 && p.spec.includes(needles.productName))) &&
        matches(p.code, needles.productCode) &&
        (!needles.barcode || p.refs.some((value) => matches(value, needles.barcode))) &&
        matches(p.ean, needles.ean) &&
        (!needles.alternateCodes || p.refs.some((value) => matches(value, needles.alternateCodes))) &&
        matches(p.company, needles.company) &&
        matches(p.category, needles.category) &&
        matches(p.subcategory, needles.subCategory) &&
        matches(p.productGroup, needles.productGroup) &&
        matches(p.commodityCode, needles.commodityCode) &&
        matches(p.mrp, needles.mrp)
      );
    });
    const shown = found.slice(0, 500);
    setResults(shown);
    setSelectedId((previous) => (keepSelection && shown.some((p) => p.id === previous) ? previous : null));
  }

  useEffect(() => {
    // Embedded on mobile: focusing would pop the keyboard every time Product Master opens.
    if (!embedded) firstInputRef.current?.focus();
  }, [embedded]);

  useEffect(() => {
    columnSettingsRef.current = columnSettings;
  }, [columnSettings]);

  const lastSearchRef = useRef(null);
  useEffect(() => {
    // A hidden embedded search does no work until it is shown again.
    if (!autoSearch || !active) return undefined;
    const previous = lastSearchRef.current;
    const onlyProductsChanged = !!previous && previous.fields === fields && previous.extendedSearch === extendedSearch;
    const timer = setTimeout(() => {
      lastSearchRef.current = { fields, extendedSearch };
      runSearch({ allowEmpty: embedded, keepSelection: onlyProductsChanged });
    }, 220);
    return () => clearTimeout(timer);
    // Search is intentionally recalculated from all field values.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fields, autoSearch, extendedSearch, products, active]);

  useEffect(() => {
    if (embedded) return undefined;
    const onKey = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        if (photoView) setPhotoView(null);
        else if (showColumnSettings) setShowColumnSettings(false);
        else onClose();
        return;
      }
      // Only jump to grid when Control is pressed outside text fields.
      // Stealing focus on every Control keydown broke typing/paste in search boxes.
      if (event.key === "Control") {
        const tag = String(event.target?.tagName || "").toLowerCase();
        if (tag === "input" || tag === "textarea" || tag === "select" || event.target?.isContentEditable) {
          return;
        }
        gridRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose, showColumnSettings, embedded, photoView]);

  const updateField = (key, value) => setFields((prev) => ({ ...prev, [key]: value }));
  const focusGrid = () => {
    if (!results.length) return;
    if (!results.some((p) => p.id === selectedId)) setSelectedId(results[0].id);
    gridRef.current?.focus();
  };
  const onGridKeyDown = (event) => {
    if (embedded || !results.length) return;
    const index = results.findIndex((p) => p.id === selectedId);
    const step = { ArrowDown: 1, ArrowUp: -1, PageDown: 10, PageUp: -10 }[event.key];
    if (step) {
      event.preventDefault();
      const next = Math.max(0, Math.min(results.length - 1, (index < 0 ? -1 : index) + step));
      setSelectedId(results[next].id);
      gridRef.current?.querySelectorAll("tbody tr")[next]?.scrollIntoView({ block: "nearest" });
    } else if (event.key === "Enter" && index >= 0) {
      event.preventDefault();
      recall(results[index]);
    }
  };
  const recall = (product) => {
    onSelect(product);
    if (embedded) setSelectedId(product.id);
    else onClose();
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
    ["barcode", "Barcode / Additional Barcodes"],
    ["ean", "EAN"],
    ["alternateCodes", "Alternate Codes"],
    ["company", "Company"],
    ["category", "Category"],
    ["subCategory", "Sub Category"],
    ["productGroup", "Product Group"],
    ["commodityCode", "Commodity Code"],
    ["mrp", "M.R.P"],
  ];

  const highlightId = embedded ? selectedProductId : selectedId;
  const selectedProduct = results.find((p) => p.id === selectedId) || null;
  const visibleFields = embedded && !showAllFields ? fieldsConfig.slice(0, EMBEDDED_BASIC_FIELDS) : fieldsConfig;

  const windowBody = (
      <section className={`pm-search-window${embedded ? " pm-search-embedded" : ""}`} onMouseDown={(event) => event.stopPropagation()}>
        <header className="pm-search-title">
          <strong>Search Product</strong>
          {!embedded && <button type="button" aria-label="Close Search" onClick={onClose}>✕</button>}
          {embedded && <span className="pm-search-embedded-hint">Tap a product to open it</span>}
          {embedded && <button type="button" className="pm-search-back" onClick={onClose}>← Back</button>}
        </header>

        <div className="pm-search-content">
          <fieldset className="pm-search-fields">
            <legend>Type any part of the data to search in any of the following fields</legend>
            {!embedded && <span className="pm-search-control-hint">Press Control key to move focus in Search list Grid</span>}
            <div className="pm-search-field-grid">
              {visibleFields.map(([key, label], index) => (
                <label key={key} className="pm-search-field">
                  <span>{label}</span>
                  <input
                    ref={index === 0 ? firstInputRef : undefined}
                    type="text"
                    autoComplete="off"
                    spellCheck={false}
                    value={fields[key] ?? ""}
                    onChange={(event) => updateField(key, event.target.value)}
                    onInput={(event) => updateField(key, event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        runSearch({ nextFields: { ...fields, [key]: event.currentTarget.value } });
                      } else if (event.key === "ArrowDown" && !embedded) {
                        event.preventDefault();
                        focusGrid();
                      }
                    }}
                  />
                </label>
              ))}
              <div className="pm-search-command">
                {embedded && (
                  <button type="button" className="pm-search-more" onClick={() => setShowAllFields((v) => !v)}>
                    {showAllFields ? "Less fields ▲" : "More fields ▼"}
                  </button>
                )}
                <button type="button" onClick={() => runSearch()}>Search</button>
              </div>
            </div>
          </fieldset>

          <div className="pm-search-results-title">
            <strong>Search Result</strong>
            {results.length > 0 && <span>{results.length}{results.length === 500 ? "+" : ""} products</span>}
          </div>

          <div className="pm-search-result-row">
          <div ref={gridRef} tabIndex={0} className="pm-search-grid-wrap" onKeyDown={onGridKeyDown}
            onFocus={() => { if (!embedded && results.length && !results.some((p) => p.id === selectedId)) setSelectedId(results[0].id); }}>
            <table
              className="pm-search-grid"
              style={{ minWidth: activeColumnSettings.reduce((total, column) => total + Number(column.width), 0) }}
            >
              <thead>
                <tr>
                  {activeColumnSettings.map((column) => (
                    <th key={column.key} style={{ width: Number(column.width) }}>
                      <span className="pm-search-col-label">{column.label}</span>
                      {!embedded && (
                        <span
                          className="pm-search-col-resizer"
                          onMouseDown={(event) => startColumnResize(event, column.key)}
                          title="Drag to resize column"
                        />
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {results.map((product) => (
                  <tr
                    key={product.id}
                    className={highlightId === product.id ? "is-selected" : ""}
                    onClick={() => {
                      if (embedded || window.matchMedia?.("(pointer: coarse)").matches) recall(product);
                      else setSelectedId(product.id);
                    }}
                    onDoubleClick={() => recall(product)}
                    title={rowTitle}
                  >
                    {activeColumnSettings.map((column) => {
                      const value = columnValue(product, column.key);
                      return (
                        <td key={column.key} style={{ width: Number(column.width) }} title={String(value || "")}>
                          {column.key === "productName" && product.photoUrl ? (
                            <span className="pm-search-has-photo" title="View photo"
                              onClick={(event) => { event.stopPropagation(); setPhotoView(product); }}
                              onDoubleClick={(event) => event.stopPropagation()}>📷 </span>
                          ) : null}
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
          {!embedded && (
            <aside className="pm-search-photo">
              {selectedProduct?.photoUrl ? (
                <>
                  <img src={selectedProduct.photoUrl} alt={selectedProduct.name || "Product"} title="Click to enlarge"
                    onClick={() => setPhotoView(selectedProduct)} />
                  <span>{selectedProduct.name}</span>
                </>
              ) : (
                <em>{selectedProduct ? "No photo for this product" : "Select a product to see its photo"}</em>
              )}
            </aside>
          )}
          </div>
        </div>
        {photoView && (
          <div className="pm-photo-viewer" onMouseDown={(event) => { event.stopPropagation(); setPhotoView(null); }}>
            <img src={photoView.photoUrl} alt={photoView.name || "Product"} />
            <span>{photoView.name} — click anywhere to close</span>
          </div>
        )}

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
          {!embedded && <button type="button" className="pm-search-close" onClick={onClose}>Close</button>}
          {!embedded && (
            <button type="button" className="pm-search-columns-link" onClick={openColumnSettings}>
              Click here to change the Search List Column Settings
            </button>
          )}
          {!embedded && showColumnSettings && (
            <div className="pm-search-column-settings" role="dialog" aria-label="Column Settings">
              <div className="pm-search-column-settings__title">
                <strong>Column Settings</strong>
                <button type="button" onClick={() => setShowColumnSettings(false)} aria-label="Close">✕</button>
              </div>
              <div className="pm-search-column-settings__body">
                <div className="pm-search-column-settings__list">
                  <div className="pm-search-column-settings__head">Field List</div>
                  {draftColumns.filter((column) => showCost || column.key !== "landingCost").map((column) => (
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
  );

  if (embedded) return windowBody;
  return (
    <div className="pm-search-backdrop" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      {windowBody}
    </div>
  );
}
