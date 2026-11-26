// A51-03 / A51-04: BOM on finished product; parts issue via Stock → Bundling (stockAdjustments).

const n2 = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const q4 = (v) => Math.round((n2(v) + Number.EPSILON) * 10000) / 10000;
const clean = (v) => String(v ?? "").trim();

/** Saved on product: [{ productId, qtyPer, name?, code?, unit? }] */
export function normalizeManufacturingBom(lines, { productId = "" } = {}) {
  const out = [];
  const seen = new Set();
  (Array.isArray(lines) ? lines : []).forEach((l) => {
    const id = clean(l?.productId);
    const qtyPer = q4(l?.qtyPer);
    if (!id || id === productId || qtyPer <= 0 || seen.has(id)) return;
    seen.add(id);
    out.push({
      productId: id,
      qtyPer,
      name: clean(l?.name),
      code: clean(l?.code),
      unit: clean(l?.unit) || "Pcs",
    });
  });
  return out;
}

/** For bundling screen: same shape as lastRecipe(). */
export function bomRecipeLines(product) {
  return normalizeManufacturingBom(product?.manufacturingBom, { productId: product?.id }).map((l) => ({
    productId: l.productId,
    per: l.qtyPer,
  }));
}

export function validateManufacturingBom(lines, { productId = "", productById = new Map() } = {}) {
  const norm = normalizeManufacturingBom(lines, { productId });
  if (!norm.length) return { ok: true, lines: [] };
  for (const l of norm) {
    if (!productById.has(l.productId)) return { ok: false, error: "missingProduct", productId: l.productId };
  }
  return { ok: true, lines: norm };
}