import { useEffect, useState } from "react";
import { computeStockMap, loadInvoiceRows } from "./stockFromInvoices";

// Current stock of one product, from the same invoice-based calculation the PC forms use.
export default function StockBadge({ product, products, shopId, refreshKey, lang, extraQty = 0 }) {
  const [stock, setStock] = useState(null);
  const productId = product?.id || null;

  useEffect(() => {
    if (!productId) { setStock(null); return undefined; }
    let cancelled = false;
    loadInvoiceRows()
      .then(({ purchaseInvoices, salesInvoices, deliveryNotes }) => {
        if (cancelled) return;
        const map = computeStockMap(products || [product], purchaseInvoices, salesInvoices, shopId, deliveryNotes);
        setStock(map.has(productId) ? map.get(productId) : null);
      })
      .catch(() => { if (!cancelled) setStock(null); });
    return () => { cancelled = true; };
  }, [productId, products, shopId, refreshKey]);

  if (!productId || stock === null) return null;
  const left = stock - (Number(extraQty) || 0);
  const color = left < 0 ? "#ef4444" : left <= (Number(product.reorderMin) || 0) ? "#f59e0b" : "#22c55e";
  return (
    <div style={{ fontSize: 11, fontWeight: 800, color, marginTop: 4 }}>
      📦 {lang === "bn" ? "স্টক" : "Stock"}: {parseFloat(stock.toFixed(2))} {product.unit || "Pcs"}
      {extraQty > 0 && left < 0 ? (lang === "bn" ? " — স্টকের চেয়ে বেশি!" : " — more than in stock!") : ""}
    </div>
  );
}
