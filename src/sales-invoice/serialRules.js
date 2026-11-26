// Serial / IMEI on bills: a product can be marked "Serial / IMEI" on the product master (product.trackSerial), and the
// owner can make the serial a must on sales and / or purchase bills for those products (shop.requireSerialOnSales,
// shop.requireSerialOnPurchase; both off by default). Products not marked are never asked, so cables, oil or service
// lines save as before. A line's serialNo holds one serial per unit, separated by commas, semicolons or new lines;
// the Serial / IMEI registry (reports/serialRegistry.js) reads each of them.
import { itemBaseQty } from "../inventory/unitConversion.js";

export const serialSettingsOf = (shop) => ({ sales: shop?.requireSerialOnSales === true, purchase: shop?.requireSerialOnPurchase === true });

/** The serials typed on a line: trimmed, empty parts dropped. */
export const splitSerials = (text) => String(text ?? "").split(/[,;\n\r]+/).map((s) => s.trim()).filter(Boolean);
const norm = (v) => String(v || "").toUpperCase().replace(/[^0-9A-Z]/g, "");

/**
 * Lines that still need serials. items: the bill's lines; products: the master; required: the setting for this bill kind.
 * A marked product needs one serial per unit (base quantity, when it is a whole number; else at least one).
 * -> [{ name, need, have, duplicate }] - duplicate: a serial typed twice on the bill.
 */
export function serialLineProblems(items, products, { required = false } = {}) {
  if (!required) return [];
  const byId = new Map((products || []).filter((p) => p?.id).map((p) => [p.id, p]));
  const seen = new Set();
  const out = [];
  (items || []).forEach((it) => {
    const p = it?.productId ? byId.get(it.productId) : null;
    const serials = splitSerials(it?.serialNo);
    let duplicate = "";
    serials.forEach((s) => { const k = norm(s); if (k && seen.has(k)) duplicate = duplicate || s; if (k) seen.add(k); });
    if (!p?.trackSerial) { if (duplicate) out.push({ name: it.name || p?.name || "", need: 0, have: serials.length, duplicate }); return; }
    const qty = itemBaseQty(it, p);
    const need = Number.isInteger(qty) && qty > 0 ? qty : 1;
    if (serials.length < need || duplicate) out.push({ name: it.name || p.name || "", need, have: serials.length, duplicate });
  });
  return out;
}

/** The message for a refused bill (BN / EN). */
export function serialProblemText(problems, bn = false) {
  const p = problems[0];
  if (!p) return "";
  if (p.duplicate) return bn ? `"${p.name}": সিরিয়াল ${p.duplicate} বিলে দুবার লেখা` : `"${p.name}": serial ${p.duplicate} is typed twice on the bill`;
  return bn
    ? `"${p.name}"-এর সিরিয়াল / IMEI দিন: ${p.need}টি দরকার, ${p.have}টি দেওয়া (মালিকের সেটিং; কমা দিয়ে আলাদা করুন)`
    : `Enter the serial / IMEI for "${p.name}": ${p.need} needed, ${p.have} given (owner setting; separate with commas)`;
}
