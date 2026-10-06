import React, { useEffect, useState } from "react";

const PAGE = 200;

export default function ProductListGrid({
  rows,
  selectedId,
  onSelect,
  loading,
  search = "",
  onSearchChange,
}) {
  // Rows are mounted in pages while scrolling; mounting thousands of rows at once freezes phones.
  // Only a new search starts again from the top; live product updates keep the scrolled position.
  const [limit, setLimit] = useState(PAGE);
  useEffect(() => { setLimit(PAGE); }, [search]);

  const selectedIndex = selectedId ? rows.findIndex((p) => p.id === selectedId) : -1;
  const shown = Math.min(rows.length, Math.max(limit, selectedIndex + 1));
  const visibleRows = shown < rows.length ? rows.slice(0, shown) : rows;

  const onScroll = (e) => {
    const el = e.currentTarget;
    if (shown < rows.length && el.scrollTop + el.clientHeight > el.scrollHeight - 300) {
      setLimit(shown + PAGE);
    }
  };

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
      <div className="pm-list-scroll" onScroll={onScroll}>
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
            {!loading && visibleRows.map((p) => (
              <tr
                key={p.id}
                className={`pm-clickable${selectedId === p.id ? " pm-selected" : ""}`}
                onClick={() => onSelect(p)}
              >
                <td>{p.photoUrl ? <span title="Has photo">📷 </span> : null}{p.name}</td>
                <td style={{ whiteSpace: "nowrap" }} title={p.code || p.barcode || ""}>{p.code || p.barcode || "-"}</td>
              </tr>
            ))}
            {!loading && shown < rows.length && (
              <tr>
                <td colSpan={2} className="pm-empty pm-clickable" onClick={() => setLimit(shown + PAGE)}>
                  Showing {shown} of {rows.length} — scroll for more
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
