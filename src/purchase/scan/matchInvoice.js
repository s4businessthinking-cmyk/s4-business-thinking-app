// Matches a scanned invoice to the shop's vendors and products. Order: barcode / more barcodes, code / model,
// what was linked before for this vendor (product.supplierAliases), then name similarity (suggestions only).

export const norm = (v) => String(v || "").toLowerCase().replace(/[^a-z0-9ঀ-৿]+/g, "");
const words = (v) => String(v || "").toLowerCase().split(/[^a-z0-9ঀ-৿]+/).filter((w) => w.length > 1);

// Dice coefficient on word sets plus a bonus when one normalised name contains the other.
export function nameScore(a, b) {
  const A = new Set(words(a)), B = new Set(words(b));
  if (!A.size || !B.size) return 0;
  let common = 0;
  for (const w of A) if (B.has(w) || [...B].some((x) => x.length > 3 && w.length > 3 && (x.startsWith(w) || w.startsWith(x)))) common++;
  const dice = (2 * common) / (A.size + B.size);
  const na = norm(a), nb = norm(b);
  const contains = na.length > 3 && nb.length > 3 && (na.includes(nb) || nb.includes(na)) ? 0.25 : 0;
  return Math.min(1, dice + contains);
}

const barcodesOf = (p) => [p.barcode, p.ean, ...(Array.isArray(p.moreBarcodes) ? p.moreBarcodes : []),
  ...(Array.isArray(p.unitPrices) ? p.unitPrices.map((r) => r.barcode) : [])].map(norm).filter(Boolean);

export const aliasKey = (vendorId, line) => `${vendorId || "-"}|${norm(line.code) || norm(line.name)}`;

export function buildProductIndex(products) {
  const byBarcode = new Map(), byCode = new Map(), byAlias = new Map();
  for (const p of products || []) {
    if (!p?.id || p.isDeleted) continue;
    for (const b of barcodesOf(p)) if (!byBarcode.has(b)) byBarcode.set(b, p);
    const c = norm(p.code);
    if (c && !byCode.has(c)) byCode.set(c, p);
    for (const a of Array.isArray(p.supplierAliases) ? p.supplierAliases : []) if (!byAlias.has(a)) byAlias.set(a, p);
  }
  return { products: (products || []).filter((p) => p?.id && !p.isDeleted), byBarcode, byCode, byAlias };
}

// -> { status: "exact" | "suggest" | "none", product, how, candidates: [{ product, score }] }
export function matchLine(line, index, vendorId) {
  const code = norm(line.code);
  const tryKeys = [code, ...words(line.raw).filter((w) => /\d/.test(w) && w.length >= 4).map(norm)];
  for (const k of tryKeys) if (k && index.byBarcode.has(k)) return { status: "exact", product: index.byBarcode.get(k), how: "barcode", candidates: [] };
  for (const k of tryKeys) if (k && index.byCode.has(k)) return { status: "exact", product: index.byCode.get(k), how: "code", candidates: [] };
  const alias = index.byAlias.get(aliasKey(vendorId, line));
  if (alias) return { status: "exact", product: alias, how: "linked before", candidates: [] };
  const candidates = index.products
    .map((p) => ({ product: p, score: Math.max(nameScore(line.name, p.name), line.code && p.code ? nameScore(line.code, p.code) : 0) }))
    .filter((c) => c.score >= 0.34)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
  if (candidates.length) return { status: "suggest", product: candidates[0].product, how: "name", candidates };
  return { status: "none", product: null, how: "", candidates: [] };
}

// Vendor by TRN, then by mobile / name similarity.
export function matchVendor(header, vendors) {
  const list = (vendors || []).filter((v) => v && !v.isDeleted);
  if (header.trn) {
    const v = list.find((x) => String(x.trnNumber || x.trn || "").replace(/\D/g, "") === header.trn);
    if (v) return { status: "exact", vendor: v };
  }
  let best = null;
  for (const v of list) {
    const s = nameScore(header.supplierName, v.vendorName);
    if (s >= 0.5 && (!best || s > best.score)) best = { vendor: v, score: s };
  }
  return best ? { status: "suggest", vendor: best.vendor } : { status: "none", vendor: null };
}
