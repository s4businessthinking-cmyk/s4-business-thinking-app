// Industry starter presets: one owner action in Shop Info that adds a starter set for the kind of shop - never deletes
// or rewrites anything. Applying a preset only ADDS what is missing (an item already there, by name / code, is skipped),
// so applying it twice changes nothing the second time. It never touches products, bills, vouchers or balances.
// What a preset can add (all optional, each listed in the confirm before saving):
// - expense type suggestions: names offered on the Expenses page when the type is "Other" (shop.expenseNameSuggestions);
// - a chart-of-accounts expense group (shop.coaGroups, coaGroups.js) for the trade's own costs;
// - starter cost centres (shop.costCentres, accounts/costCentres.js);
// - the payment reminder wording for the trade, only while the shop still uses the default wording;
// - Arabic + English bill printing for a UAE shop, only while the owner has not chosen a print language.
// Things that must stay a per-product or per-shop choice (serial / IMEI on a product, reorder levels, warranty and job
// cards) are given as tips only. The preset and when it was applied are kept on shop.industryPreset.
import { countryKey } from "../reports/taxDomain.js";

const clean = (v) => String(v ?? "").trim();
const lc = (v) => clean(v).toLowerCase();

export const INDUSTRY_PRESETS = {
  autoParts: {
    en: "Auto spare parts / garage", bn: "গাড়ির পার্টস / গ্যারেজ", recommended: true,
    expenseNames: ["Oil & Lubricants", "Workshop Labour", "Freight / Customs Clearing", "Garage Consumables", "Tools & Equipment", "Parts Courier", "Scrap Disposal"],
    coaGroup: { code: "6500", nameEn: "Workshop & Parts Costs", nameBn: "ওয়ার্কশপ ও পার্টসের খরচ", nature: "expense" },
    costCentres: [
      { code: "SHOP", name: "Parts Counter", nameBn: "পার্টস কাউন্টার", type: "branch", branchId: "main" },
      { code: "WORKSHOP", name: "Workshop", nameBn: "ওয়ার্কশপ", type: "department" },
    ],
    reminder: {
      en: "Dear {name}, this is {shop}. {amount} for parts / service is overdue on {bills} bill(s), the oldest due on {due} ({days} days). Kindly settle it on your next visit or by transfer. Thank you.",
      bn: "প্রিয় {name}, {shop} থেকে বলছি। পার্টস / সার্ভিসের {bills}টি বিলে {amount} বকেয়া, সবচেয়ে পুরোনোটার শেষ তারিখ ছিল {due} ({days} দিন)। পরের বার এসে বা ট্রান্সফারে দিয়ে দিন। ধন্যবাদ।",
    },
    tips: [
      { en: "Mark parts that carry a serial (ECUs, batteries, injectors, phones) as \"Serial / IMEI\" on the product master, then require serials on the Serial / IMEI page.", bn: "যে পার্টসে সিরিয়াল থাকে (ECU, ব্যাটারি, ইনজেক্টর) প্রোডাক্ট মাস্টারে \"Serial / IMEI\" দিন, তারপর Serial / IMEI পাতায় বাধ্যতামূলক করুন।" },
      { en: "Set reorder levels on fast-moving parts (filters, pads, oil) so the low-stock list and the bell work.", bn: "দ্রুত বিক্রি হওয়া পার্টসে (ফিল্টার, প্যাড, অয়েল) রি-অর্ডার লেভেল দিন, তাহলে স্টক কম তালিকা আর বেল কাজ করবে।" },
      { en: "Use Warranty Claims for supplier warranty returns and Job Cards for workshop jobs.", bn: "সাপ্লায়ারের ওয়ারেন্টির জন্য Warranty Claim আর ওয়ার্কশপের কাজের জন্য Job Card ব্যবহার করুন।" },
      { en: "Give batteries and fluids an expiry on their purchase batch if you track it.", bn: "ব্যাটারি আর তরলের ক্রয় ব্যাচে মেয়াদ দিন, যদি রাখেন।" },
    ],
  },
  retail: {
    en: "Retail / trading", bn: "খুচরা / ট্রেডিং",
    expenseNames: ["Packing Material", "Delivery Charges", "Shop Supplies", "Card Machine Charges"],
    coaGroup: null,
    costCentres: [],
    reminder: {
      en: "Dear {name}, a friendly reminder from {shop}: {amount} is due on {bills} bill(s) since {due}. Thank you for shopping with us.",
      bn: "প্রিয় {name}, {shop} থেকে মনে করিয়ে দিচ্ছি: {due} থেকে {bills}টি বিলে {amount} বাকি আছে। আমাদের সাথে কেনার জন্য ধন্যবাদ।",
    },
    tips: [
      { en: "Set reorder levels on your best sellers so the low-stock list and the bell work.", bn: "বেশি বিক্রি হওয়া পণ্যে রি-অর্ডার লেভেল দিন, তাহলে স্টক কম তালিকা আর বেল কাজ করবে।" },
      { en: "Switch on payment reminders on the Payment Reminders page for customers who buy on credit.", bn: "বাকিতে কেনা কাস্টমারদের জন্য বকেয়ার রিমাইন্ডার পাতায় রিমাইন্ডার চালু করুন।" },
    ],
  },
};
export const PRESET_KEYS = Object.keys(INDUSTRY_PRESETS);
const idFor = (prefix, text) => `${prefix}_${lc(text).replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "")}`;

/**
 * What applying `key` would add to this shop. -> { key, changes: [{ id, en, bn }], patch, tips } - patch holds only the
 * shop fields that change (whole lists, the existing entries kept as they are); empty when everything is already there.
 */
export function planPreset(shop, key, { now = new Date(), by = "" } = {}) {
  const p = INDUSTRY_PRESETS[key];
  if (!p) return { key, changes: [], patch: {}, tips: [], error: "preset" };
  const changes = [];
  const patch = {};

  const names = Array.isArray(shop?.expenseNameSuggestions) ? shop.expenseNameSuggestions.map(clean).filter(Boolean) : [];
  const have = new Set(names.map(lc));
  const addNames = p.expenseNames.filter((n) => !have.has(lc(n)));
  if (addNames.length) {
    patch.expenseNameSuggestions = [...names, ...addNames];
    changes.push({ id: "expenseNames", en: `Expense types to pick: ${addNames.join(", ")}`, bn: `খরচের ধরন (বাছার জন্য): ${addNames.join(", ")}` });
  }

  if (p.coaGroup) {
    const groups = Array.isArray(shop?.coaGroups) ? shop.coaGroups : [];
    const exists = groups.some((g) => lc(g?.nameEn) === lc(p.coaGroup.nameEn) || (p.coaGroup.code && lc(g?.code) === lc(p.coaGroup.code)));
    if (!exists) {
      const at = new Date(now).toISOString();
      patch.coaGroups = [...groups, { id: idFor("grp", p.coaGroup.nameEn), ...p.coaGroup, parentId: "", active: true, createdAt: at, updatedAt: at }];
      changes.push({ id: "coaGroup", en: `Chart of accounts expense group: ${p.coaGroup.nameEn}`, bn: `হিসাবের খাতে খরচের গ্রুপ: ${p.coaGroup.nameBn}` });
    }
  }

  if (p.costCentres.length) {
    const centres = Array.isArray(shop?.costCentres) ? shop.costCentres : [];
    const branchTaken = new Set(centres.filter((c) => c?.type === "branch" && c.active !== false && clean(c.branchId)).map((c) => clean(c.branchId)));
    const add = p.costCentres.filter((c) => !centres.some((x) => lc(x?.code) === lc(c.code) || lc(x?.name) === lc(c.name)))
      .map((c) => (c.type === "branch" && branchTaken.has(c.branchId) ? { ...c, branchId: "" } : c));
    if (add.length) {
      patch.costCentres = [...centres, ...add.map((c) => ({ id: idFor("cc", c.code), branchId: "", ...c, active: true }))];
      changes.push({ id: "costCentres", en: `Cost centres: ${add.map((c) => c.name).join(", ")}`, bn: `কস্ট সেন্টার: ${add.map((c) => c.nameBn || c.name).join(", ")}` });
    }
  }

  const rem = shop?.overdueReminders || {};
  if (p.reminder && !clean(rem.textEn) && !clean(rem.textBn)) {
    patch.overdueReminders = { ...rem, textEn: p.reminder.en, textBn: p.reminder.bn };
    changes.push({ id: "reminderText", en: "Payment reminder wording for this trade (reminders stay off until you switch them on)", bn: "এই ব্যবসার জন্য বকেয়ার রিমাইন্ডারের লেখা (রিমাইন্ডার নিজে চালু না করা পর্যন্ত বন্ধ থাকে)" });
  }

  const uae = countryKey(shop?.country || shop?.taxSettings?.country) === "ae";
  if (uae && !clean(shop?.invoiceArabic)) {
    patch.invoiceArabic = "both";
    changes.push({ id: "invoiceArabic", en: "Bills print in English + Arabic (UAE)", bn: "বিল ইংরেজি + আরবিতে প্রিন্ট হবে (UAE)" });
  }

  if (changes.length) patch.industryPreset = { key, appliedAt: new Date(now).toISOString(), by };
  return { key, changes, patch, tips: p.tips };
}
