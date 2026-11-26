// Stock at each godown for the purchase / sales forms (inventory/billLocation.js). Loads the saved documents and the
// location transfers only when the shop has a godown besides main; a main-only shop does no extra work.
import { useEffect, useMemo, useState } from "react";
import { offlineList } from "../offline/offlineRepository";
import { loadInvoiceRows, rowsOf } from "./stockFromInvoices";
import { localIsoDate } from "../utils/localIsoDate.js";
import { billLocationStock, hasGodowns } from "./billLocation.js";
import { qtyIn } from "./stockLocations.js";

export function useBillLocationStock({ shopId, products = [], locations = [], skipDocId = "", refreshKey = 0 }) {
  const on = hasGodowns(locations) && !!shopId;
  const [data, setData] = useState(null);
  useEffect(() => {
    if (!on) { setData(null); return undefined; }
    let cancelled = false;
    const load = () => Promise.all([loadInvoiceRows(), offlineList("locationMoves").catch(() => [])])
      .then(([rows, moves]) => { if (!cancelled) setData({ rows, moves: rowsOf(moves) }); })
      .catch((e) => console.warn("[S4 Bill godown] stock load failed", e));
    load();
    window.addEventListener("focus", load);
    return () => { cancelled = true; window.removeEventListener("focus", load); };
  }, [on, shopId, refreshKey]);
  const stock = useMemo(() => (on && data ? billLocationStock({ products, rows: data.rows, moves: data.moves, locations, shopId, asOf: localIsoDate(), skipDocId }) : null),
    [on, data, products, locations, shopId, skipDocId]);
  return { on, ready: !!stock, stock, qtyAt: (locationId, productId) => (stock ? qtyIn(stock, locationId, productId) : null) };
}
