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

export function normalizeBrandToken(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

export function nameWordsToken(value, wordCount = 1) {
  const words = String(value || "").toUpperCase().match(/[A-Z0-9]+/g) || [];
  return words.slice(0, Math.max(1, Math.min(6, wordCount))).join("") || "ITEM";
}

export function formatShopPartNumber(serial, originalPartNumber = "", settings = DEFAULT_SHOP_PART_FORMAT, extras = {}) {
  const format = normalizeShopPartFormat(settings);
  const original = String(originalPartNumber || "").trim().replace(/[^A-Za-z0-9]/g, "");
  const brand = normalizeBrandToken(extras.brand || extras.company);
  const productName = String(extras.name || extras.productName || "").trim();
  const nameCompact = normalizeBrandToken(productName);
  const safeSerial = Math.max(1, Number(serial) || 1);
  const output = format.pattern.replace(
    /\{(ORIGINAL|FIRST|LAST|SERIAL|BRAND|COMPANY|NAMEWORD|NAME)(\d{0,2})\}/gi,
    (_, token, countText) => {
      const key = token.toUpperCase();
      if (key === "BRAND" || key === "COMPANY") {
        const source = brand || "GEN";
        const count = countText
          ? Math.max(1, Math.min(30, Number(countText) || source.length))
          : source.length;
        return source.slice(0, count);
      }
      if (key === "NAMEWORD") {
        return nameWordsToken(productName, Number(countText) || 1);
      }
      if (key === "NAME") {
        const source = nameCompact || "ITEM";
        const count = countText
          ? Math.max(1, Math.min(30, Number(countText) || source.length))
          : Math.min(16, source.length);
        return source.slice(0, count);
      }
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
  const text = String(value || "").trim();
  const sp = text.match(/^SP-(\d+)$/i);
  if (sp) return Number(sp[1]) || 0;
  const groups = [...text.matchAll(/(\d+)/g)].map((match) => match[1]);
  if (!groups.length) return 0;
  const padded = groups.filter((group) => group.length >= 4).sort((a, b) => b.length - a.length)[0];
  return Number(padded || groups[groups.length - 1]) || 0;
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
