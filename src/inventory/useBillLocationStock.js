// Stock at each godown for the purchase / sales forms (inventory/billLocation.js). Loads the saved documents and the
// location transfers only when the shop has a godown besides main; a main-only shop does no extra work.
// Mobile: do not rebuild on every window focus — wait FOCUS_MIN_MS so Android resume stays responsive.
import { useEffect, useMemo, useRef, useState } from "react";
import { offlineList } from "../offline/offlineRepository";
import { loadInvoiceRows, rowsOf } from "./stockFromInvoices";
import { localIsoDate } from "../utils/localIsoDate.js";
import { billLocationStock, hasGodowns } from "./billLocation.js";
import { qtyIn } from "./stockLocations.js";

const FOCUS_MIN_MS = 45 * 1000;

export function useBillLocationStock({ shopId, products = [], locations = [], skipDocId = "", refreshKey = 0 }) {
  const on = hasGodowns(locations) && !!shopId;
  const [data, setData] = useState(null);
  const lastLoad = useRef(0);
  useEffect(() => {
    if (!on) { setData(null); return undefined; }
    let cancelled = false;
    const load = (force = false) => {
      const now = Date.now();
      if (!force && lastLoad.current && now - lastLoad.current < FOCUS_MIN_MS) return;
      lastLoad.current = now;
      Promise.all([loadInvoiceRows(), offlineList("locationMoves").catch(() => [])])
        .then(([rows, moves]) => { if (!cancelled) setData({ rows, moves: rowsOf(moves) }); })
        .catch((e) => console.warn("[S4 Bill godown] stock load failed", e));
    };
    load(true);
    const onFocus = () => load(false);
    window.addEventListener("focus", onFocus);
    return () => { cancelled = true; window.removeEventListener("focus", onFocus); };
  }, [on, shopId, refreshKey]);
  const stock = useMemo(() => (on && data ? billLocationStock({ products, rows: data.rows, moves: data.moves, locations, shopId, asOf: localIsoDate(), skipDocId }) : null),
    [on, data, products, locations, shopId, skipDocId]);
  return { on, ready: !!stock, stock, qtyAt: (locationId, productId) => (stock ? qtyIn(stock, locationId, productId) : null) };
}
