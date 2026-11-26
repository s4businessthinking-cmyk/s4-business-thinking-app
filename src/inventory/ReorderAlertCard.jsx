import React from "react";
import { useLowStock } from "./useLowStock.js";

const MAX_ROWS = 50;

// Dashboard card: products at or below their reorder level (rules in reorder.js, stock from useLowStock).
export default function ReorderAlertCard({ products = [], shopId, lang = "en", s = {}, wrapStyle, onOpenProducts, onOpenList }) {
  const bn = lang === "bn";
  const { rows: lowStock } = useLowStock(products, shopId);

  if (!lowStock.length) return null;

  return (
    <div style={wrapStyle}>
    <div style={{ ...(s.card || {}), border: "1px solid #b45309", background: "rgba(180,83,9,0.08)", marginTop: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, gap: 8 }}>
        <div style={{ fontWeight: 700, color: "#f59e0b" }}>
          {bn ? `স্টক কম — রি-অর্ডার করুন (${lowStock.length})` : `Low stock — reorder needed (${lowStock.length})`}
        </div>
        {onOpenList && (
          <button type="button" onClick={onOpenList}
            style={{ background: "transparent", border: "1px solid #f59e0b", color: "#f59e0b", borderRadius: 6, padding: "3px 10px", cursor: "pointer", fontSize: 12 }}>
            {bn ? "রি-অর্ডার তালিকা" : "Reorder list"}
          </button>
        )}
        {onOpenProducts && (
          <button type="button" onClick={onOpenProducts}
            style={{ background: "transparent", border: "1px solid #f59e0b", color: "#f59e0b", borderRadius: 6, padding: "3px 10px", cursor: "pointer", fontSize: 12 }}>
            {bn ? "পণ্য দেখুন" : "Open Products"}
          </button>
        )}
      </div>
      <div style={{ maxHeight: 260, overflowY: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ textAlign: "left", opacity: 0.75 }}>
              <th style={{ padding: "4px 6px" }}>{bn ? "পণ্য" : "Product"}</th>
              <th style={{ padding: "4px 6px", textAlign: "right" }}>{bn ? "স্টক" : "Stock"}</th>
              <th style={{ padding: "4px 6px", textAlign: "right" }}>{bn ? "সর্বনিম্ন" : "Min"}</th>
              <th style={{ padding: "4px 6px", textAlign: "right" }}>{bn ? "অর্ডার Qty" : "Reorder Qty"}</th>
            </tr>
          </thead>
          <tbody>
            {lowStock.slice(0, MAX_ROWS).map((r) => (
              <tr key={r.id} style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}>
                <td style={{ padding: "4px 6px" }}>
                  {r.name}{r.code ? <span style={{ opacity: 0.6 }}> · {r.code}</span> : null}
                </td>
                <td style={{ padding: "4px 6px", textAlign: "right", color: r.out ? "#ef4444" : "#f59e0b", fontWeight: 600 }}>
                  {r.stock} {r.unit}
                </td>
                <td style={{ padding: "4px 6px", textAlign: "right" }}>{r.min}</td>
                <td style={{ padding: "4px 6px", textAlign: "right" }}>{r.suggest || "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {lowStock.length > MAX_ROWS && (
          <div style={{ opacity: 0.7, fontSize: 12, marginTop: 6 }}>
            {bn ? `আরও ${lowStock.length - MAX_ROWS}টি পণ্য…` : `+${lowStock.length - MAX_ROWS} more…`}
          </div>
        )}
      </div>
    </div>
    </div>
  );
}
