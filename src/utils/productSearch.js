export function nsq(str) {
  return String(str || "").replace(/[\.\-\/\\\s_,]+/g, "").toLowerCase();
}

export function nsmatch(haystack, needle) {
  if (!needle) return true;
  const n = nsq(needle);
  if (nsq(haystack).includes(n)) return true;
  return String(haystack || "").toLowerCase().includes(String(needle).toLowerCase());
}

export function buildProductHaystack(product) {
  if (!product) return "";
  return [
    product.name,
    product.code,
    product.brand,
    product.category,
    product.barcode,
    product.ean,
    ...(product.moreBarcodes || []),
  ]
    .filter(Boolean)
    .join(" ");
}

function productRank(product, query, field = "any") {
  const q = nsq(query);
  if (!q) return 0;

  const name = nsq(product.name);
  const code = nsq(product.code || product.barcode || "");
  let score = 0;

  if (field === "name" || field === "any") {
    if (name === q) score += 120;
    else if (name.startsWith(q)) score += 90;
    else if (name.includes(q)) score += 60;
  }

  if (field === "code" || field === "any") {
    if (code === q) score += 140;
    else if (code.startsWith(q)) score += 100;
    else if (code.includes(q)) score += 70;
  }

  if (nsmatch(buildProductHaystack(product), query)) score += 20;
  return score;
}

export function filterProducts(products = [], query = "", { field = "any", limit = 8 } = {}) {
  const q = String(query || "").trim();
  if (!q || q.length < 1) return [];

  return [...products]
    .map((product) => ({
      product,
      score: productRank(product, q, field),
    }))
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score || (a.product.name || "").localeCompare(b.product.name || ""))
    .slice(0, limit)
    .map((row) => row.product);
}

export function findExactProductMatch(products = [], { name = "", code = "" } = {}) {
  const codeKey = nsq(code);
  if (codeKey) {
    const byCode = products.find((p) => {
      const keys = [p.code, p.barcode, p.ean, ...(p.moreBarcodes || [])].filter(Boolean).map(nsq);
      return keys.includes(codeKey);
    });
    if (byCode) return byCode;
  }

  const nameKey = nsq(name);
  if (nameKey) {
    return products.find((p) => nsq(p.name) === nameKey) || null;
  }

  return null;
}
