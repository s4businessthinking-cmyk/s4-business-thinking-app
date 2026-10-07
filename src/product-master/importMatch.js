const norm = (v) => String(v ?? "").trim().replace(/\s+/g, " ").toLowerCase();
const splitCodes = (v) => String(v || "").split(/[;,|]/).map(norm).filter(Boolean);

function productCodes(product) {
  return [
    product?.barcode,
    product?.ean,
    ...(Array.isArray(product?.moreBarcodes) ? product.moreBarcodes : []),
    ...(Array.isArray(product?.unitPrices) ? product.unitPrices.map((row) => row?.barcode) : []),
  ].map(norm).filter(Boolean);
}

const recordCodes = (record) => [norm(record.barcode), norm(record.ean), ...splitCodes(record.moreBarcodes)].filter(Boolean);
const nameCodeKey = (name, code) => `${norm(name)}|${norm(code)}`;

// A file row is an existing product when its Name + Code/Model match one, or any of its barcodes is already used.
// Rows repeated inside the file are counted once, so importing the same file twice adds nothing.
export function splitNewRecords(records, products) {
  const keys = new Set((products || []).map((p) => nameCodeKey(p?.name, p?.code)));
  const codes = new Set((products || []).flatMap(productCodes));
  const freshKeys = new Set();
  const freshCodes = new Set();
  const fresh = [];
  const existing = [];
  const repeated = [];
  (records || []).forEach((record) => {
    if (!norm(record?.name)) return;
    const key = nameCodeKey(record.name, record.code);
    const rowCodes = recordCodes(record);
    if (keys.has(key) || rowCodes.some((c) => codes.has(c))) { existing.push(record); return; }
    if (freshKeys.has(key) || rowCodes.some((c) => freshCodes.has(c))) { repeated.push(record); return; }
    fresh.push(record);
    freshKeys.add(key);
    rowCodes.forEach((c) => freshCodes.add(c));
  });
  return { fresh, existing, repeated };
}
