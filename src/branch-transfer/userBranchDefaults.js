// Per-user sales branch (stockLocation on bills) — one shop, many outlets like Best/Premier chains.
const clean = (v) => String(v ?? "").trim();

/** From staff defaults: { stockLocation, stockLocationName } or null (use main). */
export function branchDefaultsOf(defaults = {}) {
  const id = clean(defaults.stockLocation);
  if (!id) return null;
  if (id === "main") return { stockLocation: "main", stockLocationName: clean(defaults.stockLocationName) || "Main" };
  return {
    stockLocation: id,
    stockLocationName: clean(defaults.stockLocationName) || id,
  };
}

/** Merge login defaults with an explicit menu/shortcut override. */
export function branchForNewBill(defaults, override) {
  if (override?.stockLocation) {
    return {
      stockLocation: override.stockLocation,
      stockLocationName: clean(override.stockLocationName) || override.stockLocation,
    };
  }
  return branchDefaultsOf(defaults) || { stockLocation: "main", stockLocationName: "Main" };
}