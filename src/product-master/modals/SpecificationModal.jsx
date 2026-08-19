import React, { useState } from "react";
import Modal from "../Modal";

function parseSpecs(text) {
  return String(text || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const at = line.indexOf(":");
      if (at < 0) return { key: line, value: "" };
      return { key: line.slice(0, at).trim(), value: line.slice(at + 1).trim() };
    });
}

const serializeSpecs = (rows) => rows.map((r) => `${r.key}: ${r.value}`).join("\n");

export default function SpecificationModal({ form, upd, onClose, notify }) {
  const [rows, setRows] = useState(() => parseSpecs(form.specificationText));
  const [key, setKey] = useState("");
  const [value, setValue] = useState("");

  function commit(next) {
    setRows(next);
    upd("specificationText", serializeSpecs(next));
  }

  function add() {
    if (!key.trim()) return notify("Spec name is required", "err");
    commit([...rows, { key: key.trim(), value: value.trim() }]);
    setKey("");
    setValue("");
  }

  return (
    <Modal title="Product Specification" onClose={onClose} width="md">
      <div className="pm-grid-2">
        <div className="pm-field">
          <label className="pm-label">Spec (e.g. Size)</label>
          <input
            className="pm-input"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") add(); }}
            autoFocus
          />
        </div>
        <div className="pm-field">
          <label className="pm-label">Value (e.g. Large)</label>
          <input
            className="pm-input"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") add(); }}
          />
        </div>
      </div>
      <button type="button" className="pm-btn-secondary" style={{ alignSelf: "flex-start" }} onClick={add}>+ Add Spec</button>

      <div className="pm-table-wrap" style={{ maxHeight: 200 }}>
        <table className="pm-table">
          <thead><tr><th>Spec</th><th>Value</th><th /></tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={3} className="pm-empty">No specifications added</td></tr>}
            {rows.map((r, idx) => (
              <tr key={`${r.key}-${idx}`}>
                <td>{r.key}</td>
                <td>{r.value || "-"}</td>
                <td style={{ textAlign: "right" }}>
                  <button type="button" className="pm-link-danger" onClick={() => commit(rows.filter((_, i) => i !== idx))}>Remove</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="pm-window-foot">
        <button type="button" className="pm-btn" onClick={onClose}>Done</button>
      </div>
    </Modal>
  );
}
