// Low-stock list for the dashboard card, the notification bell and the Reorder page (reorder.js). Stock is counted for
// the products with a reorder level only, from the saved documents (computeStockMap, the cached invoice rows), when the
// window comes back into focus and every few minutes - not on every render.
import { useEffect, useMemo, useState } from "react";
import { computeStockMap, loadInvoiceRows } from "./stockFromInvoices";
import { lowStockRows, watchedProducts } from "./reorder.js";

export function useLowStock(products, shopId, { enabled = true, intervalMs = 5 * 60 * 1000, tick = 0 } = {}) {
  const watched = useMemo(() => watchedProducts(products), [products]);
  const [stockMap, setStockMap] = useState(null);
  const [error, setError] = useState("");
  const [nudge, setNudge] = useState(0);

  useEffect(() => {
    if (!enabled || !watched.length) { setStockMap(new Map()); return undefined; }
    let cancelled = false;
    const load = async () => {
      try {
        const { purchaseInvoices, salesInvoices, deliveryNotes, extras } = await loadInvoiceRows();
        if (!cancelled) { setStockMap(computeStockMap(watched, purchaseInvoices, salesInvoices, shopId, deliveryNotes, extras)); setError(""); }
      } catch (err) {
        console.warn("[S4 Reorder] stock load failed", err);
        if (!cancelled) setError(String(err?.message || err));
      }
    };
    load();
    window.addEventListener("focus", load);
    const timer = window.setInterval(load, intervalMs);
    return () => { cancelled = true; window.clearInterval(timer); window.removeEventListener("focus", load); };
  }, [watched, shopId, enabled, intervalMs, tick, nudge]);

  const rows = useMemo(() => (stockMap ? lowStockRows(watched, stockMap) : []), [watched, stockMap]);
  return { rows, loaded: !!stockMap, watchedCount: watched.length, error, refresh: () => setNudge((v) => v + 1) };
}
