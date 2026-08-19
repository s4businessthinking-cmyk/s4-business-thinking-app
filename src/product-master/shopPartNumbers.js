export const SHOP_PART_PREFIX = "SP-";
export const SHOP_PART_DIGITS = 6;
export const DEFAULT_SHOP_PART_FORMAT = Object.freeze({
  pattern: "SP-{SERIAL6}",
  caseStyle: "upper",
  collisionSeparator: "-",
});

export function normalizeOriginalPartNumber(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

export function productPartGroupKey(product) {
  const fromCode = normalizeOriginalPartNumber(product?.code);
  if (fromCode) return `PART:${fromCode}`;

  const existingGroup = String(product?.shopPartGroupKey || "");
  if (existingGroup.startsWith("PART:") || existingGroup.startsWith("PRODUCT:")) return existingGroup;

  const fromStored = normalizeOriginalPartNumber(product?.originalPartKey);
  if (fromStored) return `PART:${fromStored}`;

  return product?.id ? `PRODUCT:${product.id}` : "";
}

export function normalizeShopPartFormat(value = {}) {
  const pattern = String(value.pattern || DEFAULT_SHOP_PART_FORMAT.pattern).trim().slice(0, 80);
  const caseStyle = ["upper", "lower", "asis"].includes(value.caseStyle)
    ? value.caseStyle
    : DEFAULT_SHOP_PART_FORMAT.caseStyle;
  const collisionSeparator = String(value.collisionSeparator ?? "-").slice(0, 3);
  return {
    pattern: pattern || DEFAULT_SHOP_PART_FORMAT.pattern,
    caseStyle,
    collisionSeparator,
  };
}

export function shopPartFormatKey(value) {
  const normalized = normalizeShopPartFormat(value);
  return `${normalized.pattern}|${normalized.caseStyle}|${normalized.collisionSeparator}`;
}

export function formatShopPartNumber(serial, originalPartNumber = "", settings = DEFAULT_SHOP_PART_FORMAT) {
  const format = normalizeShopPartFormat(settings);
  const original = String(originalPartNumber || "").trim().replace(/[^A-Za-z0-9]/g, "");
  const safeSerial = Math.max(1, Number(serial) || 1);
  const output = format.pattern.replace(
    /\{(ORIGINAL|FIRST|LAST|SERIAL)(\d{0,2})\}/gi,
    (_, token, countText) => {
      const key = token.toUpperCase();
      const count = Math.max(1, Math.min(30, Number(countText) || (key === "SERIAL" ? SHOP_PART_DIGITS : original.length || 1)));
      if (key === "SERIAL") return String(safeSerial).padStart(count, "0");
      if (key === "FIRST") return original.slice(0, count);
      if (key === "LAST") return original.slice(-count);
      return original;
    }
  ).replace(/\s+/g, "");

  let result = output || `${SHOP_PART_PREFIX}${String(safeSerial).padStart(SHOP_PART_DIGITS, "0")}`;
  if (!original && !/\{SERIAL\d*\}/i.test(format.pattern)) {
    result = `${result}${format.collisionSeparator}${String(safeSerial).padStart(SHOP_PART_DIGITS, "0")}`;
  }
  if (format.caseStyle === "upper") return result.toUpperCase();
  if (format.caseStyle === "lower") return result.toLowerCase();
  return result;
}

export function uniqueShopPartNumber(candidate, usedNumbers, separator = "-") {
  const used = usedNumbers instanceof Set ? usedNumbers : new Set(usedNumbers || []);
  if (!used.has(candidate.toLowerCase())) return candidate;
  let suffix = 2;
  while (used.has(`${candidate}${separator}${suffix}`.toLowerCase())) suffix += 1;
  return `${candidate}${separator}${suffix}`;
}

export function shopPartSerial(value) {
  const match = String(value || "").trim().match(/^SP-(\d+)$/i);
  return match ? Number(match[1]) || 0 : 0;
}

export function stableShopPartKey(value) {
  const input = String(value || "");
  let first = 2166136261;
  let second = 2246822519;
  for (let index = 0; index < input.length; index += 1) {
    const code = input.charCodeAt(index);
    first = Math.imul(first ^ code, 16777619);
    second = Math.imul(second ^ code, 3266489917);
  }
  return `${(first >>> 0).toString(36)}${(second >>> 0).toString(36)}`;
}

export function nextLocalShopPartSerial(products) {
  return products.reduce(
    (highest, product) => Math.max(
      highest,
      Number(product?.shopPartSerial) || shopPartSerial(product?.shopPartNumber)
    ),
    0
  ) + 1;
}
