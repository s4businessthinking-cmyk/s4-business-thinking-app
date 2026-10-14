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

// Part numbers inside a text: tokens with a digit and 4+ characters ("MC889604", "0001416002", "5023/M8"), the
// pieces around "/" or "-", and short neighbours joined ("8PK 1275" -> "8pk1275"). Shop codes often hold the part
// number plus more ("MC889604 CE1306 J&P RR LH"), so codes are matched by these tokens, not as a whole.
export function partTokens(text) {
  const raw = String(text || "").split(/\s+/).filter(Boolean);
  const out = new Set();
  // a bare number needs 5+ digits: "1992" or "2000" is a year or a size, not a part number
  const add = (t) => { if (/^[\d.,]+$/.test(t) && /[.,]/.test(t)) return; const n = norm(t); if (n.length >= (/^\d+$/.test(n) ? 5 : 4) && /\d/.test(n)) out.add(n); };
  raw.forEach((t, i) => {
    add(t);
    for (const piece of t.split(/[/\-,;]/)) add(piece);
    const next = raw[i + 1];
    if (next && t.length >= 2 && next.length >= 2 && t.length <= 6 && next.length <= 6 && /\d/.test(t + next)) add(t + next);
  });
  return [...out];
}

// One edit apart (OCR reads 9 as 3, drops or adds a character).
function oneEdit(a, b) {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0, j = 0, edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++edits > 1) return false;
    if (a.length > b.length) i++; else if (b.length > a.length) j++; else { i++; j++; }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}

export function buildProductIndex(products) {
  const byBarcode = new Map(), byCode = new Map(), byAlias = new Map(), byPart = new Map();
  const list = (products || []).filter((p) => p?.id && !p.isDeleted);
  for (const p of list) {
    for (const b of barcodesOf(p)) if (!byBarcode.has(b)) byBarcode.set(b, p);
    const c = norm(p.code);
    if (c && !byCode.has(c)) byCode.set(c, p);
    for (const a of Array.isArray(p.supplierAliases) ? p.supplierAliases : []) if (!byAlias.has(a)) byAlias.set(a, p);
    for (const t of new Set([...partTokens(p.code), ...partTokens(p.barcode), ...partTokens(p.ean), ...(Array.isArray(p.moreBarcodes) ? p.moreBarcodes.flatMap(partTokens) : [])])) {
      if (!byPart.has(t)) byPart.set(t, new Set());
      byPart.get(t).add(p);
    }
  }
  return { products: list, byBarcode, byCode, byAlias, byPart };
}

const sideOf = (s) => (/\b(LH|L\/H|LEFT)\b/i.test(s) ? "L" : /\b(RH|R\/H|RIGHT)\b/i.test(s) ? "R" : "");

// -> { status: "exact" | "suggest" | "none", product, how, candidates: [{ product, score }] }
export function matchLine(line, index, vendorId) {
  const code = norm(line.code);
  const tryKeys = [code, ...words(line.raw).filter((w) => /\d/.test(w) && w.length >= 4).map(norm)];
  for (const k of tryKeys) if (k && index.byBarcode.has(k)) return { status: "exact", product: index.byBarcode.get(k), how: "barcode", candidates: [] };
  for (const k of tryKeys) if (k && index.byCode.has(k)) return { status: "exact", product: index.byCode.get(k), how: "code", candidates: [] };
  const alias = index.byAlias.get(aliasKey(vendorId, line));
  if (alias) return { status: "exact", product: alias, how: "linked before", candidates: [] };

  // part number inside the shop's codes; OCR slips of one character only as suggestions.
  // Not the whole row: its qty / rate / amount would read as part numbers.
  const parts = partTokens(`${line.code || ""} ${line.name || ""}`);
  const hits = new Map(); // product -> { exact, fuzzy }
  const hit = (p, kind) => { const h = hits.get(p) || { exact: 0, fuzzy: 0 }; h[kind]++; hits.set(p, h); };
  for (const t of parts) {
    const exact = index.byPart?.get(t);
    if (exact) { exact.forEach((p) => hit(p, "exact")); continue; }
    if (t.length >= 6) for (const [k, set] of index.byPart || []) if (k.length >= 6 && oneEdit(t, k)) set.forEach((p) => hit(p, "fuzzy"));
  }
  if (hits.size) {
    // the bill's brand ("LG", "DFT", "ELR" for ELRING) in the product's code / company / brand
    const brands = words(line.brand).filter((b) => /[a-z]/.test(b));
    const side = sideOf(line.raw || `${line.code} ${line.name}`);
    const scored = [...hits].map(([p, h]) => {
      const hay = `${p.code || ""} ${p.name || ""} ${p.company || ""} ${p.brand || ""}`;
      let score = h.exact * 3 + h.fuzzy * 1.5 + nameScore(line.name, p.name);
      const hw = words(hay);
      if (brands.some((b) => hw.some((w) => w === b || (b.length >= 3 && w.startsWith(b))))) score += 2;
      const ps = sideOf(hay);
      if (side && ps) score += side === ps ? 1 : -2;
      return { product: p, score, exact: h.exact > 0 };
    }).sort((a, b) => b.score - a.score);
    const [top, second] = scored;
    const sure = top.exact && (!second || top.score - second.score >= 2);
    return { status: sure ? "exact" : "suggest", product: top.product, how: top.exact ? "part no" : "part no (close)", candidates: scored.slice(0, 8) };
  }

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
