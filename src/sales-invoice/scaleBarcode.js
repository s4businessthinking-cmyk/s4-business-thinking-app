// Weighing-scale labels: EAN-13 starting with 2 → 2F + 5-digit item code + 5-digit value + check digit
// (or 2 + 6-digit item code + 5-digit value + check digit). Weight values are grams, rate values are price × 100.
const plainKey = (v) => String(v || "").replace(/[\s.\-/\\_,]+/g, "").toLowerCase();
const noLeadingZeros = (v) => v.replace(/^0+(?=\d)/, "");

function validEan13(code) {
  const digits = code.split("").map(Number);
  const sum = digits.slice(0, 12).reduce((acc, d, i) => acc + d * (i % 2 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === digits[12];
}

export function scaleRate(product) {
  return Number(product?.vatInclusive || product?.mrp || product?.vatExclusive || 0);
}

function findByItemCode(products, item) {
  const short = noLeadingZeros(item);
  return products.find((p) => {
    if (!p?.weightBarcode && !p?.rateBarcode) return false;
    if (String(p.status || "active").toLowerCase() !== "active") return false;
    return [p.barcode, p.ean, p.code].some((c) => {
      const key = plainKey(c);
      return key && (key === item || noLeadingZeros(key) === short);
    });
  });
}

export function parseScaleBarcode(raw, products = []) {
  const code = plainKey(raw);
  if (!/^2\d{12}$/.test(code) || !validEan13(code)) return null;
  const value = Number(code.slice(7, 12));
  const product = findByItemCode(products, code.slice(2, 7)) || findByItemCode(products, code.slice(1, 7));
  if (!product || !value) return null;
  if (product.weightBarcode) {
    return { product, kind: "weight", qty: Math.round(value) / 1000, amount: null };
  }
  const amount = value / 100;
  const rate = scaleRate(product);
  if (!rate) return null;
  return { product, kind: "rate", qty: Math.round((amount / rate) * 1000) / 1000, amount };
}
