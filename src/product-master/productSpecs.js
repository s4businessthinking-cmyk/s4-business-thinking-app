export function parseSpecs(text) {
  return String(text || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const at = line.indexOf(":");
      if (at < 0) return { key: line, value: "" };
      return { key: line.slice(0, at).trim(), value: line.slice(at + 1).trim() };
    });
}

export const serializeSpecs = (rows) => rows.map((r) => `${r.key}: ${r.value}`).join("\n");

export function specsInline(product) {
  return parseSpecs(product?.specificationText)
    .map((r) => (r.value ? `${r.key}: ${r.value}` : r.key))
    .join("  •  ");
}

const valuesCache = new WeakMap();
export function specValues(product) {
  if (!product?.specificationText) return "";
  let text = valuesCache.get(product);
  if (text === undefined) {
    text = parseSpecs(product.specificationText).map((r) => r.value || r.key).join(" ");
    valuesCache.set(product, text);
  }
  return text;
}

export function salesSpecs(product) {
  return product?.specShowInSales ? specsInline(product) : "";
}
