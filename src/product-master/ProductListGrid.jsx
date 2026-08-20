import React from "react";

export default function ProductListGrid({
  rows,
  selectedId,
  onSelect,
  loading,
  shopPartEnabled,
}) {
  const columnCount = shopPartEnabled ? 3 : 2;
  return (
    <div className={`pm-list${shopPartEnabled ? " pm-list--shop-parts" : ""}`}>
      <div className="pm-list-scroll">
        <table className="pm-table">
          <thead>
            <tr>
              <th>Product Name</th>
              {shopPartEnabled && <th>Shop Part</th>}
              <th>Code Model</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={columnCount} className="pm-empty">Loading...</td></tr>}
            {!loading && rows.length === 0 && <tr><td colSpan={columnCount} className="pm-empty">No products found</td></tr>}
            {!loading && rows.map((p) => (
              <tr
                key={p.id}
                className={`pm-clickable${selectedId === p.id ? " pm-selected" : ""}`}
                onClick={() => onSelect(p)}
              >
                <td>{p.name}</td>
                {shopPartEnabled && <td style={{ whiteSpace: "nowrap" }} title={p.shopPartNumber || ""}>{p.shopPartNumber || "-"}</td>}
                <td style={{ whiteSpace: "nowrap" }} title={p.code || p.barcode || ""}>{p.code || p.barcode || "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
