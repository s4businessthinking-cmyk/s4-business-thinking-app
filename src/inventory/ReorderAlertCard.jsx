import React, { useEffect, useMemo, useState } from "react";
import { computeStockMap, loadInvoiceRows } from "./stockFromInvoices";

const MAX_ROWS = 50;

export default function ReorderAlertCard({ products = [], shopId, lang = "en", s = {}, wrapStyle, onOpenProducts }) {
  const [stockMap, setStockMap] = useState(null);
  const bn = lang === "bn";

  const watched = useMemo(
    () => products.filter((p) => p && !p.isDeleted && !p.deleted && Number(p.reorderMin) > 0),
    [products]
  );

  useEffect(() => {
    if (!watched.length) return undefined;
    let cancelled = false;
    const load = async () => {
      try {
        const { purchaseInvoices, salesInvoices, deliveryNotes, extras } = await loadInvoiceRows();
        if (!cancelled) setStockMap(computeStockMap(watched, purchaseInvoices, salesInvoices, shopId, deliveryNotes, extras));
      } catch (err) {
        console.warn("[S4 Reorder] stock load failed", err);
      }
    };
    load();
    window.addEventListener("focus", load);
    const timer = window.setInterval(load, 30000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      window.removeEventListener("focus", load);
    };
  }, [watched, shopId]);

  const lowStock = useMemo(() => {
    if (!stockMap) return [];
    return watched
      .map((p) => ({ p, stock: stockMap.get(p.id) || 0, min: Number(p.reorderMin) || 0 }))
      .filter((r) => r.stock <= r.min)
      .sort((a, b) => (a.stock - a.min) - (b.stock - b.min));
  }, [watched, stockMap]);

  if (!lowStock.length) return null;

  return (
    <div style={wrapStyle}>
    <div style={{ ...(s.card || {}), border: "1px solid #b45309", background: "rgba(180,83,9,0.08)", marginTop: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, gap: 8 }}>
        <div style={{ fontWeight: 700, color: "#f59e0b" }}>
          {bn ? `স্টক কম — রি-অর্ডার করুন (${lowStock.length})` : `Low stock — reorder needed (${lowStock.length})`}
        </div>
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
            {lowStock.slice(0, MAX_ROWS).map(({ p, stock, min }) => (
              <tr key={p.id} style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}>
                <td style={{ padding: "4px 6px" }}>
                  {p.name}{p.code ? <span style={{ opacity: 0.6 }}> · {p.code}</span> : null}
                </td>
                <td style={{ padding: "4px 6px", textAlign: "right", color: stock <= 0 ? "#ef4444" : "#f59e0b", fontWeight: 600 }}>
                  {stock} {p.unit || ""}
                </td>
                <td style={{ padding: "4px 6px", textAlign: "right" }}>{min}</td>
                <td style={{ padding: "4px 6px", textAlign: "right" }}>
                  {Number(p.reorderQty) > 0 ? p.reorderQty : Math.max((Number(p.reorderMax) || min) - stock, 0) || "-"}
                </td>
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
