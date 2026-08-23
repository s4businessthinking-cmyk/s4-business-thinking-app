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

/**
 * Identity key for shop-part grouping.
 * Same Code/Model core → same shop code.
 * Different Code/Model core → different shop code.
 *
 * Examples:
 * - ALUMINUM/TYPE MAXICO → ALUMINUM
 * - COPPER/TYPE MAXICO → COPPER
 * - ME017242 MORE ROSA → ME017242
 * - 17801-78020 HINO → 1780178020
 * - 17801-77050 → 1780177050
 * - GC-1306 TAIWAN → GC1306
 * - 8098 MITSUBISHI → 8098
 */
export function coreOriginalPartKey(value) {
  const tokens = String(value || "").toUpperCase().match(/[A-Z0-9]+/g) || [];
  if (!tokens.length) return "";

  const isSizeToken = (token) =>
    /^\d{1,3}(MM|CM|M|IN|PK|V|W|A|LTR|L)$/i.test(token) ||
    /^\d{1,3}V\d*$/i.test(token);

  // GC-1306 / GC-86307R / MK-600069 — brand prefix + number first
  if (tokens.length >= 2 && /^[A-Z]{1,10}$/.test(tokens[0])) {
    if (/^\d{3,}$/.test(tokens[1]) || (/[A-Z]/.test(tokens[1]) && /\d/.test(tokens[1]) && tokens[1].length >= 4)) {
      return `${tokens[0]}${tokens[1]}`;
    }
  }

  // Leading catalog / OE numbers before later mixed tokens (28113-4H000, 8098 ...)
  if (/^\d{4,}$/.test(tokens[0])) {
    if (tokens[1] && /[A-Z]/.test(tokens[1]) && /\d/.test(tokens[1]) && /^[A-Z0-9]{2,}$/.test(tokens[1])) {
      return `${tokens[0]}${tokens[1]}`;
    }
    if (tokens[1] && /^\d{3,}$/.test(tokens[1]) && tokens[0].length <= 6) {
      return `${tokens[0]}${tokens[1]}`;
    }
    return tokens[0];
  }

  // Mixed OEM: ME013343, E420L, S5512 — skip sizes like 90MM / 24V
  const mixed = tokens.find((token) => {
    if (!(/[A-Z]/.test(token) && /\d/.test(token))) return false;
    if (isSizeToken(token)) return false;
    if (token.length >= 5) return true;
    return token.length >= 4 && /\d{3,}/.test(token);
  });
  if (mixed) return mixed;

  const longDigits = tokens.find((token) => /^\d+$/.test(token) && token.length >= 6);
  if (longDigits) return longDigits;

  const word = tokens.find((token) => /^[A-Z]{3,}$/.test(token));
  if (word) return word;

  return tokens.find((token) => token.length >= 3 && !isSizeToken(token)) || tokens[0];
}

export function productPartGroupKey(product) {
  const fromCode = coreOriginalPartKey(product?.code);
  if (fromCode) return `PART:${fromCode}`;

  const fromStored = coreOriginalPartKey(product?.originalPartKey);
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
  const original = coreOriginalPartKey(originalPartNumber) || String(originalPartNumber || "").trim().replace(/[^A-Za-z0-9]/g, "");
  const brand = normalizeBrandToken(extras.brand || extras.company);
  const productName = String(extras.name || extras.productName || "").trim();
  const modelCode = String(extras.code || originalPartNumber || "").trim();
  const nameCompact = normalizeBrandToken(productName);
  const safeSerial = Math.max(1, Number(serial) || 1);
  const output = format.pattern.replace(
    /\{(ORIGINAL|FIRST|LAST|SERIAL|BRAND|COMPANY|NAMEWORD|NAME|CODEWORD)(\d{0,2})\}/gi,
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
      if (key === "CODEWORD") {
        return nameWordsToken(modelCode, Number(countText) || 1);
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

function pickWinnerByLowestSerial(members = []) {
  return members.reduce((best, item) => {
    const serial = Number(item.shopPartSerial) || shopPartSerial(item.shopPartNumber) || Number.MAX_SAFE_INTEGER;
    const bestSerial = Number(best.shopPartSerial) || shopPartSerial(best.shopPartNumber) || Number.MAX_SAFE_INTEGER;
    if (serial !== bestSerial) return serial < bestSerial ? item : best;
    return String(item.shopPartNumber || "").localeCompare(String(best.shopPartNumber || "")) < 0 ? item : best;
  });
}

/**
 * Correct shop part numbers:
 * 1) Same Code/Model core must share one shop code.
 * 2) Different Code/Model cores must NOT share one shop code (split & reassign).
 */
export function shopPartCorrectionPatches(products = [], format = DEFAULT_SHOP_PART_FORMAT) {
  const normalizedFormat = normalizeShopPartFormat(format);
  const formatKey = shopPartFormatKey(normalizedFormat);
  const byGroup = new Map();
  const byShopNumber = new Map();

  products.forEach((product) => {
    if (!product?.id) return;
    const groupKey = productPartGroupKey(product);
    if (!groupKey) return;
    if (!byGroup.has(groupKey)) byGroup.set(groupKey, []);
    byGroup.get(groupKey).push(product);

    const shopNo = String(product.shopPartNumber || "").trim().toLowerCase();
    if (!shopNo) return;
    if (!byShopNumber.has(shopNo)) byShopNumber.set(shopNo, []);
    byShopNumber.get(shopNo).push(product);
  });

  const patchMap = new Map();
  const usedNumbers = new Set(
    products
      .map((product) => String(product.shopPartNumber || "").trim().toLowerCase())
      .filter(Boolean)
  );
  let nextSerial = nextLocalShopPartSerial(products) - 1;

  const queuePatch = (product, assignment) => {
    const currentSerial = Number(product.shopPartSerial) || shopPartSerial(product.shopPartNumber) || 0;
    const already =
      String(product.shopPartNumber || "") === String(assignment.shopPartNumber || "") &&
      currentSerial === Number(assignment.shopPartSerial || 0) &&
      product.shopPartGroupKey === assignment.shopPartGroupKey &&
      product.originalPartKey === assignment.originalPartKey;
    if (already) return;
    patchMap.set(product.id, {
      id: product.id,
      shopPartNumber: assignment.shopPartNumber,
      shopPartSerial: assignment.shopPartSerial,
      originalPartKey: assignment.originalPartKey,
      shopPartGroupKey: assignment.shopPartGroupKey,
      shopPartFormatKey: product.shopPartFormatKey || formatKey,
    });
  };

  // A) Split wrongly shared shop numbers across different model cores.
  byShopNumber.forEach((members) => {
    const groups = new Map();
    members.forEach((product) => {
      const groupKey = productPartGroupKey(product);
      if (!groups.has(groupKey)) groups.set(groupKey, []);
      groups.get(groupKey).push(product);
    });
    if (groups.size < 2) return;

    const ordered = [...groups.entries()].sort(([, left], [, right]) => {
      const leftWin = pickWinnerByLowestSerial(left);
      const rightWin = pickWinnerByLowestSerial(right);
      const leftSerial = Number(leftWin.shopPartSerial) || shopPartSerial(leftWin.shopPartNumber) || Number.MAX_SAFE_INTEGER;
      const rightSerial = Number(rightWin.shopPartSerial) || shopPartSerial(rightWin.shopPartNumber) || Number.MAX_SAFE_INTEGER;
      return leftSerial - rightSerial;
    });

    ordered.forEach(([groupKey, groupMembers], index) => {
      const originalPartKey = coreOriginalPartKey(groupMembers[0].code) || groupKey.slice(5);
      if (index === 0) {
        const winner = pickWinnerByLowestSerial(groupMembers);
        const winnerSerial = Number(winner.shopPartSerial) || shopPartSerial(winner.shopPartNumber);
        groupMembers.forEach((product) => queuePatch(product, {
          shopPartNumber: winner.shopPartNumber,
          shopPartSerial: winnerSerial,
          originalPartKey,
          shopPartGroupKey: groupKey,
        }));
        return;
      }

      do { nextSerial += 1; } while (
        usedNumbers.has(
          formatShopPartNumber(nextSerial, groupMembers[0].code, normalizedFormat, {
            brand: groupMembers[0].company || groupMembers[0].brand,
            company: groupMembers[0].company || groupMembers[0].brand,
            name: groupMembers[0].name,
            code: groupMembers[0].code,
          }).toLowerCase()
        )
      );

      const candidate = formatShopPartNumber(nextSerial, groupMembers[0].code, normalizedFormat, {
        brand: groupMembers[0].company || groupMembers[0].brand,
        company: groupMembers[0].company || groupMembers[0].brand,
        name: groupMembers[0].name,
        code: groupMembers[0].code,
      });
      const shopPartNumber = uniqueShopPartNumber(candidate, usedNumbers, normalizedFormat.collisionSeparator);
      usedNumbers.add(shopPartNumber.toLowerCase());
      groupMembers.forEach((product) => queuePatch(product, {
        shopPartNumber,
        shopPartSerial: nextSerial,
        originalPartKey,
        shopPartGroupKey: groupKey,
      }));
    });
  });

  // B) Merge same model core onto one shop code (lowest serial wins).
  byGroup.forEach((members, groupKey) => {
    if (!groupKey.startsWith("PART:")) return;
    const effective = members.map((product) => patchMap.get(product.id) ? { ...product, ...patchMap.get(product.id) } : product);
    const numbered = effective.filter((item) => String(item.shopPartNumber || "").trim());
    if (!numbered.length) return;
    const uniqueNumbers = new Set(numbered.map((item) => String(item.shopPartNumber).toLowerCase()));
    if (uniqueNumbers.size < 2 && members.every((item) => {
      const key = coreOriginalPartKey(item.code);
      return item.shopPartGroupKey === groupKey && item.originalPartKey === key;
    })) return;

    const winner = pickWinnerByLowestSerial(numbered);
    const winnerSerial = Number(winner.shopPartSerial) || shopPartSerial(winner.shopPartNumber);
    const originalPartKey = coreOriginalPartKey(winner.code) || groupKey.slice(5);
    members.forEach((product) => queuePatch(product, {
      shopPartNumber: winner.shopPartNumber,
      shopPartSerial: winnerSerial,
      originalPartKey,
      shopPartGroupKey: groupKey,
    }));
  });

  return [...patchMap.values()];
}

/** @deprecated use shopPartCorrectionPatches */
export function shopPartAlignmentPatches(products = [], format = DEFAULT_SHOP_PART_FORMAT) {
  return shopPartCorrectionPatches(products, format);
}
