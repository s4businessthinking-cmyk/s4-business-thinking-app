// W01: which godown / location a purchase or sales bill puts stock into or takes it from. The bill keeps
// locationId + locationName; the stock engine is unchanged (the shop total still comes from the documents) and the
// godown side is placed by stockLocations.js documentMoves, so the locations always add up to the shop total and a
// godown changes no money. A shop with only the main location never sees a picker and its bills carry no location.
import { onHandAt, stockMovements } from "../reports/stockHub.js";
import { itemBaseQty } from "./unitConversion.js";
import { MAIN_LOCATION_ID, documentMoves, liveMoves, locationName, locationPath, locationStock, normalizeLocations, qtyIn } from "./stockLocations.js";

const clean = (v) => String(v ?? "").trim();

/** Active locations a bill can use (main first). shop: the shop record (shop.stockLocations). */
export const billLocationsOf = (shop) => normalizeLocations(shop?.stockLocations).filter((l) => l.active);
/** True when the shop has a godown besides the main location: only then do the bills show the picker. */
export const hasGodowns = (locations) => (locations || []).length > 1;

/** The bill's location id: the saved one when it is still a usable location, else main. */
export function billLocationId(doc, locations) {
  const id = clean(doc?.locationId);
  return id && (locations || []).some((l) => l.id === id) ? id : MAIN_LOCATION_ID;
}

/**
 * Fields stored on the bill. Nothing for a main-only shop, so its bills stay exactly as before. prior: the saved bill
 * being edited - one saved before it had a godown keeps having none (its stock stays on main) unless the user picks one,
 * so opening and re-saving an old bill never writes a godown nobody chose.
 */
export function billLocationFields(locationId, locations, { prior = null } = {}) {
  if (!hasGodowns(locations)) return {};
  if (prior && !clean(prior.locationId) && !clean(locationId)) return {};
  const id = (locations || []).some((l) => l.id === locationId) ? locationId : MAIN_LOCATION_ID;
  return { locationId: id, locationName: locationPath(locations, id) || locationName((locations || []).find((l) => l.id === id)) };
}

/**
 * Stock per location from the saved documents, location transfers and bill godowns, on a day. skipDocId: leave one
 * bill out of both the shop total and its godown (the bill being edited), so the answer is "what is there without it".
 * -> Map(locationId -> Map(productId -> base qty))
 */
export function billLocationStock({ products, rows, moves = [], locations, shopId = "", asOf = "", skipDocId = "" }) {
  const movements = stockMovements(products, rows, shopId).filter((m) => !skipDocId || m.docId !== skipDocId);
  return locationStock(onHandAt(products, movements, asOf), [...liveMoves(moves, shopId), ...documentMoves(movements)], locations, { asOf, shopId });
}

/**
 * Lines that need more than the location holds. items: bill lines; stock: billLocationStock().
 * -> [{ productId, name, have, need }] (base units)
 */
export function locationShortfalls(items, { products, stock, locationId }) {
  const byId = new Map((products || []).map((p) => [p.id, p]));
  const need = new Map();
  (items || []).forEach((it) => {
    if (!it?.productId) return;
    const q = itemBaseQty(it, byId.get(it.productId));
    if (q > 0) need.set(it.productId, (need.get(it.productId) || 0) + q);
  });
  const out = [];
  need.forEach((q, productId) => {
    const have = qtyIn(stock, locationId, productId);
    if (q > have + 1e-4) out.push({ productId, name: byId.get(productId)?.name || productId, have, need: Math.round(q * 10000) / 10000 });
  });
  return out;
}
