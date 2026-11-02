import { useEffect, useState } from "react";
import { computeStockMap, loadInvoiceRows } from "./stockFromInvoices";
import { invoiceRowsCacheGen, subscribeInvoiceRowsCache } from "./stockRowsCache.js";
import { stockBadgeParts } from "./stockBadgeParts.js";

export function StockBadgeLabel({ stock, extraQty = 0, unit = "Pcs", reorderMin = 0, lang, as = "div", style }) {
  const { color, over } = stockBadgeParts(stock, extraQty, reorderMin);
  const Tag = as;
  return (
    <Tag style={{ fontSize: 11, fontWeight: 800, color, marginTop: as === "div" ? 4 : 0, ...style }}>
      📦 {lang === "bn" ? "স্টক" : "Stock"}: {parseFloat(Number(stock).toFixed(2))} {unit || "Pcs"}
      {over ? (lang === "bn" ? " — স্টকের চেয়ে বেশি!" : " — more than in stock!") : ""}
    </Tag>
  );
}

// Current stock of one product, from the same invoice-based calculation the PC forms use.
export default function StockBadge({ product, products, shopId, refreshKey, lang, extraQty = 0 }) {
  const [stock, setStock] = useState(null);
  const [stockRev, setStockRev] = useState(invoiceRowsCacheGen);
  const productId = product?.id || null;

  useEffect(() => subscribeInvoiceRowsCache(setStockRev), []);
  useEffect(() => {
    if (!productId) { setStock(null); return undefined; }
    let cancelled = false;
    loadInvoiceRows()
      .then(({ purchaseInvoices, salesInvoices, deliveryNotes, extras }) => {
        if (cancelled) return;
        const map = computeStockMap(products || [product], purchaseInvoices, salesInvoices, shopId, deliveryNotes, {
          ...extras,
          onlyProductIds: new Set([productId]),
        });
        setStock(map.has(productId) ? map.get(productId) : null);
      })
      .catch(() => { if (!cancelled) setStock(null); });
    return () => { cancelled = true; };
  }, [productId, products, shopId, refreshKey, stockRev]);

  if (!productId || stock === null) return null;
  return (
    <StockBadgeLabel
      stock={stock}
      extraQty={extraQty}
      unit={product.unit}
      reorderMin={product.reorderMin}
      lang={lang}
    />
  );
}
