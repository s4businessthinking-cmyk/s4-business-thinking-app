const n2 = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const q4 = (v) => parseFloat(n2(v).toFixed(4));

// Loosening opens one product into others (the single side goes out); bundling builds one kit from parts (the single side comes in).
export const CONVERT_KINDS = {
  loosen: { prefix: "PL", serial: "lastPLSerial", singleDirection: "out" },
  bundle: { prefix: "PB", serial: "lastPBSerial", singleDirection: "in" },
};

export function buildConvertItems(kind, single, singleQty, lines, stockMap) {
  const meta = CONVERT_KINDS[kind];
  if (!meta) return { error: "kind" };
  if (!single?.productId) return { error: "noSingle" };
  const sq = n2(singleQty);
  if (sq <= 0) return { error: "noQty" };
  const used = (lines || []).filter((l) => l?.productId && n2(l.per) > 0);
  if (!used.length) return { error: "noLines" };
  if (used.some((l) => l.productId === single.productId)) return { error: "same" };
  const stockOf = (id) => (stockMap?.has?.(id) ? stockMap.get(id) : null);
  const otherDirection = meta.singleDirection === "out" ? "in" : "out";
  const item = (l, role, direction, qty, per = null) => ({
    productId: l.productId, name: l.name || "", code: l.code || "", unit: l.unit || "Pcs", unitFactor: 1,
    direction, qty: q4(qty), role, ...(per != null ? { perUnit: q4(per) } : {}), stockBefore: stockOf(l.productId),
  });
  return {
    items: [
      item(single, "single", meta.singleDirection, sq),
      ...used.map((l) => item(l, "part", otherDirection, n2(l.per) * sq, n2(l.per))),
    ],
  };
}

// The last saved conversion of the same product gives the per-unit quantities to start from.
export function lastRecipe(rows, kind, productId) {
  const last = (rows || [])
    .filter((r) => r?.kind === kind && r.status !== "cancelled" && r.singleProductId === productId)
    .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")))[0];
  if (!last) return [];
  const sq = n2(last.singleQty) || 1;
  return (last.items || [])
    .filter((it) => it.role === "part" && it.productId)
    .map((it) => ({ productId: it.productId, per: it.perUnit != null ? n2(it.perUnit) : q4(n2(it.qty) / sq) }));
}
