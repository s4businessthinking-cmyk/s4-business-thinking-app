import React, { useEffect, useMemo, useRef, useState } from "react";
import Modal from "../Modal";

const EMPTY_UNIT = {
  id: "",
  category: "COUNT",
  name: "",
  symbol: "",
  alternateName: "",
  factor: "1",
  equalsUnit: "Number",
  printNameInBill: false,
};

const EMPTY_CUSTOMER = { id: "", name: "" };
const UNIT_CATEGORIES = ["AREA", "COUNT", "LENGTH", "VOLUME", "WEIGHT", "OTHER"];
const UNIT_RELATIONS = {
  Kg: { factor: "1000", equalsUnit: "Gram" },
  Gram: { factor: "1000", equalsUnit: "Milligram" },
  Litre: { factor: "1000", equalsUnit: "Millilitre" },
  Ltr: { factor: "1000", equalsUnit: "Millilitre" },
  Pair: { factor: "2", equalsUnit: "Number" },
  Cm: { factor: "10", equalsUnit: "Mm" },
  Mtr: { factor: "100", equalsUnit: "Cm" },
  Feet: { factor: "12", equalsUnit: "Inch" },
  "Sq.Feet": { factor: "144", equalsUnit: "Sq.Inch" },
  "Sq.Metre": { factor: "10000", equalsUnit: "Sq.Cm" },
  Dozen: { factor: "12", equalsUnit: "Number" },
  Ton: { factor: "1000", equalsUnit: "Kg" },
};

function nextId(records) {
  return Math.max(0, ...records.map((record) => Number(record.id) || 0)) + 1;
}

export default function NewLookupModal({ isUnit, records, onRecordsChange, onClose, notify }) {
  const [draft, setDraft] = useState(isUnit ? EMPTY_UNIT : EMPTY_CUSTOMER);
  const [search, setSearch] = useState("");
  const searchRef = useRef(null);

  useEffect(() => {
    if (!isUnit) return undefined;
    const onKey = (event) => {
      if (event.ctrlKey && event.key.toLowerCase() === "h") {
        event.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isUnit]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return records;
    return records.filter((record) => [
      record.id,
      record.name,
      record.symbol,
      record.category,
    ].some((value) => String(value || "").toLowerCase().includes(query)));
  }, [records, search]);

  const setField = (field, value) => setDraft((current) => ({ ...current, [field]: value }));

  function beginNew() {
    setDraft(isUnit ? { ...EMPTY_UNIT } : { ...EMPTY_CUSTOMER });
  }

  function selectRecord(record) {
    const relation = UNIT_RELATIONS[record.symbol];
    const hasLegacyPlaceholder = isUnit && relation && (
      !record.factor ||
      !record.equalsUnit ||
      (String(record.factor) === "1" && record.equalsUnit === "Number")
    );
    setDraft(hasLegacyPlaceholder ? { ...record, ...relation } : { ...record });
  }

  function save() {
    const name = String(draft.name || "").trim();
    const symbol = String(draft.symbol || "").trim();
    if (!name) return notify(isUnit ? "Unit name is required" : "Customer type is required", "err");
    if (isUnit && !symbol) return notify("Unit symbol is required", "err");

    const duplicate = records.find((record) => {
      if (record.id === draft.id) return false;
      return isUnit
        ? String(record.symbol).toLowerCase() === symbol.toLowerCase()
        : String(record.name).toLowerCase() === name.toLowerCase();
    });
    if (duplicate) {
      return notify(`${isUnit ? symbol : name} already exists`, "err");
    }

    const saved = isUnit
      ? {
          ...EMPTY_UNIT,
          ...draft,
          id: draft.id || nextId(records),
          name,
          symbol,
          alternateName: String(draft.alternateName || "").trim(),
          factor: String(draft.factor || "1"),
          equalsUnit: draft.equalsUnit || "Number",
        }
      : { id: draft.id || nextId(records), name };
    const next = draft.id
      ? records.map((record) => record.id === draft.id ? saved : record)
      : [...records, saved];
    onRecordsChange(next);
    setDraft(saved);
    notify(`${isUnit ? "Unit" : "Customer type"} saved`);
  }

  function remove() {
    if (!draft.id) return;
    onRecordsChange(records.filter((record) => record.id !== draft.id));
    beginNew();
    notify(`${isUnit ? "Unit" : "Customer type"} deleted`);
  }

  if (!isUnit) {
    return (
      <Modal title="CUSTOMER TYPE CREATION" onClose={onClose} width="md">
        <div className="pm-customer-master">
          <div className="pm-field">
            <label className="pm-label">Customer Type</label>
            <input
              className="pm-input"
              value={draft.name}
              onChange={(event) => setField("name", event.target.value)}
              onKeyDown={(event) => { if (event.key === "Enter") save(); }}
              autoFocus
            />
          </div>
          <div className="pm-master-list pm-customer-master__list">
            <div className="pm-master-list__head"><span>ID</span><span>Customer Type</span></div>
            {filtered.map((record) => (
              <button
                type="button"
                key={record.id}
                className={draft.id === record.id ? "is-selected" : ""}
                onClick={() => selectRecord(record)}
              >
                <span>{record.id}</span><span>{record.name}</span>
              </button>
            ))}
          </div>
          <div className="pm-master-actions">
            <button type="button" className="pm-btn" onClick={beginNew}>New</button>
            <button type="button" className="pm-btn pm-btn--primary" onClick={save}>Save</button>
            <button type="button" className="pm-btn pm-btn--danger" onClick={remove} disabled={!draft.id}>Delete</button>
            <button type="button" className="pm-btn" onClick={onClose}>Close</button>
          </div>
        </div>
      </Modal>
    );
  }

  const unitChoices = [...new Set([
    ...records.map((record) => record.symbol),
    ...Object.values(UNIT_RELATIONS).map((relation) => relation.equalsUnit),
  ].filter(Boolean))];

  return (
    <Modal title="UNIT" onClose={onClose} width="xl">
      <div className="pm-unit-master">
        <div className="pm-unit-master__form">
          <div className="pm-field">
            <label className="pm-label">Unit Category</label>
            <select className="pm-input" value={draft.category} onChange={(event) => setField("category", event.target.value)} autoFocus>
              {UNIT_CATEGORIES.map((category) => <option key={category} value={category}>{category}</option>)}
            </select>
          </div>
          <div className="pm-field">
            <label className="pm-label">Unit Name</label>
            <input className="pm-input" value={draft.name} onChange={(event) => setField("name", event.target.value)} />
          </div>
          <div className="pm-field">
            <label className="pm-label">Unit Symbols</label>
            <input className="pm-input" value={draft.symbol} onChange={(event) => setField("symbol", event.target.value)} />
          </div>
          <div className="pm-field">
            <label className="pm-label">Alternate Unit Name in Bill</label>
            <input className="pm-input" value={draft.alternateName} onChange={(event) => setField("alternateName", event.target.value)} />
          </div>
          <div className="pm-unit-master__equals">
            <label className="pm-label">One Unit Equals</label>
            <div>
              <input
                className="pm-input"
                type="number"
                min="0"
                step="any"
                value={draft.factor}
                onChange={(event) => setField("factor", event.target.value)}
              />
              <select className="pm-input" value={draft.equalsUnit} onChange={(event) => setField("equalsUnit", event.target.value)}>
                {unitChoices.map((unit) => <option key={unit} value={unit}>{unit}</option>)}
              </select>
            </div>
          </div>
          <label className="pm-check pm-unit-master__print">
            <input
              type="checkbox"
              checked={!!draft.printNameInBill}
              onChange={(event) => setField("printNameInBill", event.target.checked)}
            />
            Print Unit name in Sales Bill Print instead of Unit symbol
          </label>
        </div>

        <div className="pm-unit-master__browser">
          <label className="pm-label" htmlFor="pm-unit-search">Search <span>(Ctrl+H)</span></label>
          <input
            id="pm-unit-search"
            ref={searchRef}
            className="pm-input"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <div className="pm-master-list">
            <div className="pm-master-list__head"><span>ID</span><span>Name</span></div>
            {filtered.map((record) => (
              <button
                type="button"
                key={record.id}
                className={draft.id === record.id ? "is-selected" : ""}
                onClick={() => selectRecord(record)}
              >
                <span>{record.id}</span>
                <span>{record.name}{record.symbol ? ` (${record.symbol})` : ""}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="pm-master-actions pm-unit-master__actions">
          <button type="button" className="pm-btn" onClick={beginNew}>New</button>
          <button type="button" className="pm-btn pm-btn--primary" onClick={save}>Save</button>
          <button type="button" className="pm-btn pm-btn--danger" onClick={remove} disabled={!draft.id}>Delete</button>
          <button type="button" className="pm-btn" onClick={onClose}>Close</button>
        </div>
      </div>
    </Modal>
  );
}
