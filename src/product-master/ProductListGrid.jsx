import React from "react";

export default function ProductListGrid({
  rows,
  selectedId,
  onSelect,
  loading,
  search = "",
  onSearchChange,
}) {
  return (
    <div className="pm-list">
      {onSearchChange && (
        <input
          className="pm-input"
          style={{ marginBottom: 4 }}
          placeholder="Filter list: name / code / barcode..."
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
        />
      )}
      <div className="pm-list-scroll">
        <table className="pm-table">
          <thead>
            <tr>
              <th>Product Name</th>
              <th>Code Model</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={2} className="pm-empty">Loading...</td></tr>}
            {!loading && rows.length === 0 && <tr><td colSpan={2} className="pm-empty">No products found</td></tr>}
            {!loading && rows.map((p) => (
              <tr
                key={p.id}
                className={`pm-clickable${selectedId === p.id ? " pm-selected" : ""}`}
                onClick={() => onSelect(p)}
              >
                <td>{p.name}</td>
                <td style={{ whiteSpace: "nowrap" }} title={p.code || p.barcode || ""}>{p.code || p.barcode || "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
