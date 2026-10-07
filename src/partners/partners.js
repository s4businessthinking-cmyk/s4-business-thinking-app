const num = (v) => parseFloat(String(v ?? "").replace(/,/g, "")) || 0;
export const r2 = (v) => Math.round((num(v) + Number.EPSILON) * 100) / 100;
const pad = (v) => String(v).padStart(2, "0");
const day10 = (v) => String(v || "").slice(0, 10);
const toDate = (d) => new Date(`${day10(d)}T12:00:00`);
const fmt = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const addDays = (d, n) => { const x = toDate(d); x.setDate(x.getDate() + n); return fmt(x); };
export const dayDiff = (a, b) => Math.round((toDate(a) - toDate(b)) / 86400000);

export const PARTNER_TYPES = [
  { key: "capital", bn: "টাকার পার্টনার (শুধু টাকা দেন)", en: "Capital / sleeping partner (money only)" },
  { key: "working", bn: "কাজের পার্টনার (কাজ করেন)", en: "Working partner (works in the business)" },
  { key: "both", bn: "টাকা + কাজ দুটোই", en: "Capital + working" },
];

export const FREQUENCIES = [
  { key: "monthly", months: 1, bn: "প্রতি মাসে", en: "Monthly" },
  { key: "quarterly", months: 3, bn: "প্রতি ৩ মাসে", en: "Quarterly" },
  { key: "halfYearly", months: 6, bn: "প্রতি ৬ মাসে", en: "Half-yearly" },
  { key: "yearly", months: 12, bn: "বছরে একবার", en: "Yearly" },
];

/**
 * Money between a partner and the business. Capital stays in the business; the current (profit) account holds
 * profit credited to the partner minus what they took out. A reinvest moves profit into capital without cash.
 */
export const ENTRY_KINDS = {
  capitalIn: { cash: "in", bn: "মূলধন জমা", en: "Capital brought in", icon: "💵" },
  capitalOut: { cash: "out", bn: "মূলধন ফেরত নেওয়া", en: "Capital withdrawn", icon: "🏧" },
  drawing: { cash: "out", bn: "অগ্রিম তোলা (Drawing)", en: "Drawing (advance on profit)", icon: "👛" },
  payout: { cash: "out", bn: "পার্টনারকে টাকা দেওয়া (লাভ / খরচ ফেরত)", en: "Paid to partner (profit / expense refund)", icon: "💸" },
  reinvest: { cash: "", bn: "লাভ মূলধনে যোগ", en: "Profit added to capital", icon: "🔁" },
};
export const PAY_METHODS = [["cash", "নগদ", "Cash"], ["bank_transfer", "ব্যাংক ট্রান্সফার", "Bank transfer"], ["cheque", "চেক", "Cheque"], ["card", "কার্ড", "Card"]];

export const PARTNER_SECTIONS = [
  { key: "basic", icon: "👤", bn: "মূল তথ্য", en: "Basic" },
  { key: "money", icon: "💰", bn: "শেয়ার ও টাকা", en: "Share & money" },
  { key: "id", icon: "🪪", bn: "পরিচয় ও ঠিকানা", en: "Identity & address" },
  { key: "agreement", icon: "📄", bn: "চুক্তি", en: "Agreement" },
  { key: "nominee", icon: "👪", bn: "নমিনি ও জরুরি যোগাযোগ", en: "Nominee & emergency" },
];

/** Every profile field: t = input type, opts = [value, bn, en], show(form) hides fields that don't apply. */
export const PARTNER_FIELDS = [
  { k: "name", sec: "basic", bn: "নাম *", en: "Name *" },
  { k: "partnerType", sec: "basic", t: "select", bn: "পার্টনারের ধরন", en: "Partner type", opts: PARTNER_TYPES.map((x) => [x.key, x.bn, x.en]), def: "capital" },
  { k: "role", sec: "basic", bn: "দায়িত্ব / পদ", en: "Role / position", ph: ["যেমন: ম্যানেজিং পার্টনার", "e.g. Managing partner"] },
  { k: "joinDate", sec: "basic", t: "date", bn: "যোগদানের তারিখ", en: "Joining date" },
  { k: "status", sec: "basic", t: "select", bn: "অবস্থা", en: "Status", opts: [["active", "সক্রিয়", "Active"], ["inactive", "পার্টনারশিপ ছেড়েছেন", "Left the partnership"]], def: "active" },
  { k: "leftDate", sec: "basic", t: "date", bn: "কবে ছেড়েছেন *", en: "Left on *", show: (f) => f.status === "inactive" },
  { k: "exitReason", sec: "basic", bn: "ছাড়ার কারণ / নিষ্পত্তি", en: "Reason / settlement", show: (f) => f.status === "inactive" },
  { k: "mobile", sec: "basic", t: "tel", bn: "মোবাইল (WhatsApp)", en: "Mobile (WhatsApp)" },
  { k: "mobile2", sec: "basic", t: "tel", bn: "অন্য মোবাইল", en: "Other mobile" },
  { k: "email", sec: "basic", t: "email", bn: "ইমেইল", en: "Email" },
  { k: "dateOfBirth", sec: "basic", t: "date", bn: "জন্ম তারিখ", en: "Date of birth" },
  { k: "nationality", sec: "basic", bn: "জাতীয়তা", en: "Nationality" },

  { k: "sharePercent", sec: "money", t: "decimal", bn: "লাভের শেয়ার % *", en: "Profit share % *", ph: ["যেমন: 40", "e.g. 40"] },
  { k: "lossPercent", sec: "money", t: "decimal", bn: "ক্ষতির ভাগ % (খালি = লাভের মতো)", en: "Loss share % (blank = same as profit)" },
  { k: "capitalCommitted", sec: "money", t: "decimal", bn: "চুক্তিমতো মোট মূলধন", en: "Capital agreed", cur: true },
  { k: "interestRate", sec: "money", t: "decimal", bn: "মূলধনের উপর সুদ / লাভ (% বছরে, ঐচ্ছিক)", en: "Interest on capital (% a year, optional)" },
  { k: "monthlySalary", sec: "money", t: "decimal", bn: "মাসিক বেতন (কাজের জন্য)", en: "Monthly salary (for working)", cur: true, show: (f) => f.partnerType !== "capital" },
  { k: "payMethod", sec: "money", t: "select", bn: "লাভ নেবেন কীভাবে", en: "Takes profit by", opts: PAY_METHODS, def: "cash" },
  { k: "bankName", sec: "money", bn: "ব্যাংকের নাম", en: "Bank name" },
  { k: "accountHolder", sec: "money", bn: "অ্যাকাউন্টের নাম", en: "Account holder" },
  { k: "bankAccount", sec: "money", bn: "অ্যাকাউন্ট নং", en: "Account no" },
  { k: "iban", sec: "money", bn: "IBAN", en: "IBAN" },

  { k: "nationalId", sec: "id", bn: "জাতীয় পরিচয়পত্র নং", en: "National ID no" },
  { k: "nationalIdExpiry", sec: "id", t: "date", bn: "আইডির মেয়াদ", en: "ID expiry" },
  { k: "passportNo", sec: "id", bn: "পাসপোর্ট নং", en: "Passport no" },
  { k: "passportExpiry", sec: "id", t: "date", bn: "পাসপোর্টের মেয়াদ", en: "Passport expiry" },
  { k: "residentId", sec: "id", bn: "রেসিডেন্স আইডি (যেমন Emirates ID)", en: "Residence ID (e.g. Emirates ID)" },
  { k: "residentIdExpiry", sec: "id", t: "date", bn: "রেসিডেন্স আইডির মেয়াদ", en: "Residence ID expiry" },
  { k: "taxNo", sec: "id", bn: "TIN / ট্যাক্স নং", en: "TIN / tax no" },
  { k: "address", sec: "id", bn: "বর্তমান ঠিকানা", en: "Current address", wide: true },
  { k: "permanentAddress", sec: "id", bn: "স্থায়ী ঠিকানা", en: "Permanent address", wide: true },

  { k: "agreementDate", sec: "agreement", t: "date", bn: "চুক্তির তারিখ", en: "Agreement date" },
  { k: "agreementEnd", sec: "agreement", t: "date", bn: "চুক্তি শেষ (থাকলে)", en: "Agreement ends (if any)" },
  { k: "signingAuthority", sec: "agreement", t: "select", bn: "চেক / কাগজে সই করতে পারবেন?", en: "Can sign cheques / papers?", opts: [["", "—", "—"], ["sole", "একাই পারবেন", "Alone"], ["joint", "অন্যের সাথে মিলে", "Jointly"], ["no", "না", "No"]] },
  { k: "noticeDays", sec: "agreement", t: "decimal", bn: "ছাড়ার আগে নোটিশ (দিন)", en: "Notice before leaving (days)" },
  { k: "witness1", sec: "agreement", bn: "সাক্ষী ১", en: "Witness 1" },
  { k: "witness2", sec: "agreement", bn: "সাক্ষী ২", en: "Witness 2" },
  { k: "note", sec: "agreement", t: "textarea", bn: "চুক্তির শর্ত / নোট", en: "Agreement terms / note", wide: true },

  { k: "nomineeName", sec: "nominee", bn: "নমিনির নাম", en: "Nominee name" },
  { k: "nomineeRelation", sec: "nominee", bn: "সম্পর্ক", en: "Relation" },
  { k: "nomineeMobile", sec: "nominee", t: "tel", bn: "নমিনির মোবাইল", en: "Nominee mobile" },
  { k: "nomineeId", sec: "nominee", bn: "নমিনির আইডি নং", en: "Nominee ID no" },
  { k: "emergencyName", sec: "nominee", bn: "জরুরি যোগাযোগ (নাম)", en: "Emergency contact (name)" },
  { k: "emergencyMobile", sec: "nominee", t: "tel", bn: "জরুরি মোবাইল", en: "Emergency mobile" },
];

export const PARTNER_DOC_TYPES = [
  ["nationalId", "জাতীয় পরিচয়পত্র (সামনে/পেছনে)", "National ID (front/back)"], ["passport", "পাসপোর্ট কপি", "Passport copy"],
  ["residentId", "রেসিডেন্স আইডি", "Residence ID"], ["agreement", "পার্টনারশিপ চুক্তিপত্র", "Partnership agreement / deed"],
  ["capitalReceipt", "মূলধন জমার রসিদ", "Capital deposit receipt"], ["tradeLicense", "ট্রেড লাইসেন্স", "Trade licence"],
  ["bankLetter", "ব্যাংক / IBAN কাগজ", "Bank / IBAN letter"], ["signature", "সইয়ের নমুনা", "Signature specimen"],
  ["nomineeId", "নমিনির আইডি", "Nominee's ID"], ["photo", "ছবি", "Photo"], ["other", "অন্যান্য", "Other"],
];
const ID_EXPIRY_FIELDS = [["nationalIdExpiry", "জাতীয় পরিচয়পত্র", "National ID"], ["passportExpiry", "পাসপোর্ট", "Passport"], ["residentIdExpiry", "রেসিডেন্স আইডি", "Residence ID"]];

export const PARTNER_DEFAULTS = { frequency: "quarterly", startMonth: 1, payoutDays: 15, reservePct: 0 };
export function partnerSettingsOf(shop) {
  const s = { ...PARTNER_DEFAULTS, ...(shop?.partnerSettings || {}) };
  if (!FREQUENCIES.some((f) => f.key === s.frequency)) s.frequency = PARTNER_DEFAULTS.frequency;
  s.startMonth = Math.min(12, Math.max(1, Math.round(num(s.startMonth)) || 1));
  s.payoutDays = Math.max(0, Math.round(num(s.payoutDays)));
  s.reservePct = Math.min(100, Math.max(0, num(s.reservePct)));
  return s;
}

const monthIdx = (d) => { const x = day10(d); return Number(x.slice(0, 4)) * 12 + Number(x.slice(5, 7)) - 1; };
const idxStart = (i) => `${Math.floor(i / 12)}-${pad((i % 12) + 1)}-01`;
const idxEnd = (i) => { const y = Math.floor(i / 12), m = (i % 12) + 1; return `${y}-${pad(m)}-${pad(new Date(y, m, 0).getDate())}`; };

/** The profit-sharing period that contains `date`, aligned to the settings' first month. */
export function periodOf(date, settings) {
  const months = FREQUENCIES.find((f) => f.key === settings.frequency)?.months || 3;
  const m = monthIdx(date);
  const offset = (((m - (settings.startMonth - 1)) % months) + months) % months;
  const start = m - offset;
  return { from: idxStart(start), to: idxEnd(start + months - 1), months };
}

/** The last `count` periods that have fully ended before `today`, newest first. */
export function endedPeriods(today, settings, count = 6) {
  const out = [];
  let p = periodOf(today, settings);
  for (let i = 0; i < count; i += 1) {
    p = periodOf(addDays(p.from, -1), settings);
    out.push(p);
  }
  return out;
}

const MONTHS_BN = ["জানু", "ফেব্রু", "মার্চ", "এপ্রিল", "মে", "জুন", "জুলাই", "আগস্ট", "সেপ্টে", "অক্টো", "নভে", "ডিসে"];
const MONTHS_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export function periodLabel(p, bn) {
  const names = bn ? MONTHS_BN : MONTHS_EN;
  const a = day10(p.from), b = day10(p.to);
  const ma = names[Number(a.slice(5, 7)) - 1], mb = names[Number(b.slice(5, 7)) - 1];
  const whole = a.slice(8) === "01" && idxEnd(monthIdx(b)) === b;
  if (!whole) return `${a.split("-").reverse().join("/")} – ${b.split("-").reverse().join("/")}`;
  return a.slice(0, 7) === b.slice(0, 7) ? `${ma} ${a.slice(0, 4)}` : `${ma}${a.slice(0, 4) !== b.slice(0, 4) ? ` ${a.slice(0, 4)}` : ""} – ${mb} ${b.slice(0, 4)}`;
}

/** Names only, kept on the shop record so staff entering an expense can tell who is a partner. */
export const partnerDirectoryFrom = (partners, shopId) => (partners || [])
  .filter((p) => p && !p.isDeleted && (!shopId || p.shopId === shopId) && p.status !== "inactive" && String(p.name || "").trim())
  .map((p) => ({ id: p.id, name: String(p.name).trim() }))
  .sort((a, b) => a.name.localeCompare(b.name) || String(a.id).localeCompare(String(b.id)));
export const partnerDirectoryOf = (shop) => (Array.isArray(shop?.partnerDirectory) ? shop.partnerDirectory.filter((p) => p && p.id && p.name) : []);

const normName = (v) => String(v || "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
/** The partner a typed "paid to" name points at, if any (exact, or one name containing the other). */
export function matchPartnerName(text, directory) {
  const t = normName(text);
  if (t.length < 3) return null;
  return (directory || []).find((p) => { const x = normName(p.name); return x.length >= 3 && (x === t || ` ${t} `.includes(` ${x} `) || ` ${x} `.includes(` ${t} `)); }) || null;
}
// A partner's pay comes out of the profit split, never out of expenses.
export const PARTNER_BLOCKED_EXPENSE_CATEGORIES = new Set(["salary", "advance", "overtime", "bonus", "allowance"]);

const live = (r, shopId) => r && !r.isDeleted && (!shopId || r.shopId === shopId) && r.status !== "cancelled";
export const liveEntries = (entries, shopId) => (entries || []).filter((e) => live(e, shopId));
export const distributionsOf = (entries, shopId) => liveEntries(entries, shopId).filter((e) => e.kind === "distribution");

/** Capital put in minus taken out, counting entries dated before `before` (all when empty). */
export function capitalOf(partnerId, entries, before = "") {
  return r2(liveEntries(entries).reduce((t, e) => {
    if (e.partnerId !== partnerId || (before && day10(e.date) >= before)) return t;
    if (e.kind === "capitalIn" || e.kind === "reinvest") return t + num(e.amount);
    if (e.kind === "capitalOut") return t - num(e.amount);
    return t;
  }, 0));
}

/**
 * Every line of a partner's account with running capital and current (profit) balances. A shop expense the partner
 * paid from their own pocket (expense.paidByPartner) is money the business owes them, so it adds to the current account.
 */
export function partnerLedger(partnerId, entries, shopId, expenses = []) {
  const rows = [];
  (expenses || []).forEach((x) => {
    if (!live(x, shopId) || x.status === "draft" || !x.paidByPartner || x.partnerId !== partnerId) return;
    const amt = r2(x.amount);
    rows.push({ id: x.id, date: day10(x.expenseDate), kind: "expensePaid", label: [x.expenseNo, x.categoryName || x.category, x.note].filter(Boolean).join(" · "), amount: amt, capital: 0, current: amt });
  });
  liveEntries(entries, shopId).forEach((e) => {
    if (e.kind === "distribution") {
      const a = (e.allocations || []).find((x) => x.partnerId === partnerId);
      if (a) rows.push({ id: e.id, date: day10(e.periodTo), kind: "distribution", label: e.label || "", amount: r2(a.total), capital: 0, current: r2(a.total), dueDate: e.dueDate || "", alloc: a });
      return;
    }
    if (e.partnerId !== partnerId || !ENTRY_KINDS[e.kind]) return;
    const amt = r2(e.amount);
    const capital = e.kind === "capitalIn" || e.kind === "reinvest" ? amt : e.kind === "capitalOut" ? -amt : 0;
    const current = e.kind === "drawing" || e.kind === "payout" || e.kind === "reinvest" ? -amt : 0;
    rows.push({ id: e.id, date: day10(e.date), kind: e.kind, label: e.note || "", amount: amt, capital, current, method: e.method || "", ref: e.refNo || "" });
  });
  rows.sort((a, b) => a.date.localeCompare(b.date) || (a.kind === "distribution") - (b.kind === "distribution"));
  let cap = 0, cur = 0;
  rows.forEach((r) => { cap = r2(cap + r.capital); cur = r2(cur + r.current); r.capitalBal = cap; r.currentBal = cur; });
  const sum = (k) => r2(rows.filter((r) => r.kind === k).reduce((t, r) => t + r.amount, 0));
  return { rows, capital: cap, current: cur, credited: sum("distribution"), drawings: sum("drawing"), paid: sum("payout"), reinvested: sum("reinvest"), spentForShop: sum("expensePaid") };
}

/**
 * Splits a period's net profit: first the reserve kept in the business (only on profit), then each working partner's
 * salary and interest on capital, then the rest by share % (loss % when it's a loss). A partner who joined or left
 * inside the period gets the share for the days they were in; whatever isn't given to anyone stays in the business.
 */
export function computeDistribution({ netProfit, partners = [], entries = [], from, to, reservePct = 0 }) {
  const periodDays = dayDiff(to, from) + 1;
  const periodMonths = Math.max(1, monthIdx(to) - monthIdx(from) + 1);
  const months = idxStart(monthIdx(from)) === day10(from) && idxEnd(monthIdx(to)) === day10(to) ? periodMonths : (periodDays * 12) / 365;
  const profit = r2(netProfit);
  const active = partners.filter((p) => p && !p.isDeleted && (!p.joinDate || day10(p.joinDate) <= to) && !(p.status === "inactive" && p.leftDate && day10(p.leftDate) < from));
  const rows = active.map((p) => {
    const a = p.joinDate && day10(p.joinDate) > from ? day10(p.joinDate) : from;
    const b = p.status === "inactive" && p.leftDate && day10(p.leftDate) < to ? day10(p.leftDate) : to;
    const frac = Math.max(0, Math.min(1, (dayDiff(b, a) + 1) / periodDays));
    return {
      partnerId: p.id, name: p.name || "", sharePct: num(p.sharePercent), lossPct: num(p.lossPercent) || num(p.sharePercent), frac,
      salary: r2(num(p.monthlySalary) * months * frac),
      interest: r2(capitalOf(p.id, entries, from) * (num(p.interestRate) / 100) * (months / 12) * frac),
    };
  });
  const reserve = profit > 0 ? r2((profit * num(reservePct)) / 100) : 0;
  const salaries = r2(rows.reduce((t, x) => t + x.salary, 0));
  const interest = r2(rows.reduce((t, x) => t + x.interest, 0));
  const distributable = r2(profit - reserve - salaries - interest);
  const isLoss = distributable < 0;
  rows.forEach((x) => { x.share = r2((distributable * (isLoss ? x.lossPct : x.sharePct) * x.frac) / 100); x.total = r2(x.salary + x.interest + x.share); });
  const shared = r2(rows.reduce((t, x) => t + x.share, 0));
  const shareTotal = r2(active.filter((p) => p.status !== "inactive").reduce((t, p) => t + num(p.sharePercent), 0));
  return { netProfit: profit, reserve, salaries, interest, distributable, isLoss, unallocated: r2(distributable - shared), shareTotal, allocations: rows };
}

const ALERT_ORDER = { danger: 0, warn: 1, info: 2 };

/**
 * What the owner should hear about: a finished period whose profit isn't shared yet, profit shares due to be paid
 * (period end + payout days), partners who took more than their share, agreements ending and capital still to come.
 */
export function partnerAlerts({ partners = [], entries = [], expenses = [], docs = [], shopId = "", today, settings }) {
  const s = settings || PARTNER_DEFAULTS;
  const active = partners.filter((p) => p && !p.isDeleted && (!shopId || p.shopId === shopId) && p.status !== "inactive");
  if (!active.length) return [];
  const out = [];
  const shareTotal = r2(active.reduce((t, p) => t + num(p.sharePercent), 0));
  if (Math.abs(shareTotal - 100) > 0.01) out.push({ key: `shareTotal:${shareTotal}`, kind: "shareTotal", tone: "warn", total: shareTotal, daysLeft: 0 });

  const dists = distributionsOf(entries, shopId);
  const last = endedPeriods(today, s, 1)[0];
  const firstJoin = active.reduce((m, p) => (p.joinDate && (!m || day10(p.joinDate) < m) ? day10(p.joinDate) : m), "");
  if (last && (!firstJoin || firstJoin <= last.to) && !dists.some((d) => day10(d.periodFrom) <= last.from && day10(d.periodTo) >= last.to)) {
    const late = dayDiff(today, last.to);
    out.push({ key: `undistributed:${last.from}`, kind: "undistributed", tone: late > s.payoutDays ? "danger" : "warn", from: last.from, to: last.to, daysLeft: -late });
  }

  active.forEach((p) => {
    const led = partnerLedger(p.id, entries, shopId, expenses);
    if (led.current > 0.01) {
      const taken = led.drawings + led.paid + led.reinvested;
      let cum = led.spentForShop;
      const oldestUnpaid = led.rows.filter((r) => r.kind === "distribution" && r.amount > 0).find((r) => { cum += r.amount; return cum > taken + 0.01; });
      const due = oldestUnpaid?.dueDate || "";
      if (due) {
        const left = dayDiff(due, today);
        if (left <= 3) out.push({ key: `payout:${p.id}:${due}`, kind: "payout", partnerId: p.id, name: p.name, amount: led.current, date: due, daysLeft: left, tone: left < -7 ? "danger" : left <= 0 ? "warn" : "info" });
      }
    } else if (led.current < -0.01) {
      out.push({ key: `overdrawn:${p.id}`, kind: "overdrawn", partnerId: p.id, name: p.name, amount: -led.current, daysLeft: 0, tone: "warn" });
    }
    const committed = num(p.capitalCommitted);
    if (committed > 0 && led.capital < committed - 0.01) out.push({ key: `capital:${p.id}`, kind: "capitalDue", partnerId: p.id, name: p.name, amount: r2(committed - led.capital), daysLeft: 0, tone: "info" });
    if (p.agreementEnd) {
      const left = dayDiff(day10(p.agreementEnd), today);
      if (left <= 30) out.push({ key: `agreement:${p.id}:${day10(p.agreementEnd)}`, kind: "agreement", partnerId: p.id, name: p.name, date: day10(p.agreementEnd), daysLeft: left, tone: left < 0 ? "danger" : "warn" });
    }
    const expiring = [
      ...ID_EXPIRY_FIELDS.filter(([k]) => p[k]).map(([k, bn, en]) => ({ id: k, date: day10(p[k]), bn, en })),
      ...(docs || []).filter((d) => d && !d.isDeleted && d.partnerId === p.id && d.expiryDate).map((d) => ({ id: d.id, date: day10(d.expiryDate), bn: d.label || "ডকুমেন্ট", en: d.label || "Document" })),
    ];
    expiring.forEach((x) => {
      const left = dayDiff(x.date, today);
      if (left <= 30) out.push({ key: `idExpiry:${p.id}:${x.id}:${x.date}`, kind: "idExpiry", partnerId: p.id, name: p.name, docBn: x.bn, docEn: x.en, date: x.date, daysLeft: left, tone: left < 0 ? "danger" : "warn" });
    });
  });
  return out.sort((a, b) => ALERT_ORDER[a.tone] - ALERT_ORDER[b.tone] || a.daysLeft - b.daysLeft);
}

const money = (v) => r2(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDay = (d) => (d ? day10(d).split("-").reverse().join("/") : "");
const when = (d, bn) => (d === 0 ? (bn ? "আজ" : "today") : d > 0 ? (bn ? `${d} দিন পর` : `in ${d} days`) : (bn ? `${-d} দিন আগে` : `${-d} day(s) ago`));

export function partnerAlertText(a, bn, cur = "AED") {
  switch (a.kind) {
    case "shareTotal":
      return { icon: "⚠️", title: bn ? `পার্টনারদের মোট শেয়ার ${a.total}% — ১০০% হওয়া উচিত` : `Partner shares add up to ${a.total}%, not 100%`, sub: bn ? "পার্টনার পাতায় শেয়ার % ঠিক করুন" : "Fix the share % on the Partners page" };
    case "undistributed":
      return { icon: "📊", title: bn ? `${periodLabel(a, true)}-এর লাভ এখনো ভাগ করা হয়নি` : `${periodLabel(a, false)} profit not shared yet`, sub: bn ? `সময় শেষ হয়েছে ${fmtDay(a.to)} · "লাভ ভাগ" থেকে ভাগ করুন` : `Period ended ${fmtDay(a.to)} · share it from "Profit sharing"` };
    case "payout":
      return { icon: "💸", title: bn ? `${a.name}-কে লাভের টাকা দিতে হবে · ${cur} ${money(a.amount)}` : `Pay ${a.name}'s profit share · ${cur} ${money(a.amount)}`, sub: bn ? `দেওয়ার তারিখ ${fmtDay(a.date)} (${when(a.daysLeft, true)})` : `Due ${fmtDay(a.date)} (${when(a.daysLeft, false)})` };
    case "overdrawn":
      return { icon: "👛", title: bn ? `${a.name} তার ভাগের চেয়ে ${cur} ${money(a.amount)} বেশি তুলেছেন` : `${a.name} has drawn ${cur} ${money(a.amount)} more than their share`, sub: bn ? "পরের লাভ থেকে কেটে যাবে, অথবা ফেরত নিন" : "It comes off the next profit, or get it back" };
    case "capitalDue":
      return { icon: "💵", title: bn ? `${a.name}-এর মূলধন বাকি · ${cur} ${money(a.amount)}` : `${a.name} still owes capital · ${cur} ${money(a.amount)}`, sub: bn ? "চুক্তি অনুযায়ী যত টাকা দেওয়ার কথা তার বাকি অংশ" : "The rest of the capital agreed in the agreement" };
    case "agreement":
      return { icon: "📄", title: bn ? `${a.name}-এর পার্টনারশিপ চুক্তি শেষ ${a.daysLeft < 0 ? "হয়ে গেছে" : when(a.daysLeft, true)}` : `${a.name}'s partnership agreement ${a.daysLeft < 0 ? "has ended" : `ends ${when(a.daysLeft, false)}`}`, sub: bn ? `${fmtDay(a.date)} · নবায়ন করুন` : `${fmtDay(a.date)} · renew it` };
    case "idExpiry":
      return { icon: "🪪", title: bn ? `${a.name}-এর ${a.docBn}-এর মেয়াদ ${a.daysLeft < 0 ? "শেষ হয়ে গেছে" : `শেষ হবে ${when(a.daysLeft, true)}`}` : `${a.name}'s ${a.docEn} ${a.daysLeft < 0 ? "has expired" : `expires ${when(a.daysLeft, false)}`}`, sub: bn ? `${fmtDay(a.date)} · নবায়ন করে নতুন কপি যোগ করুন` : `${fmtDay(a.date)} · renew it and attach the new copy` };
    default:
      return { icon: "🤝", title: a.name || "", sub: "" };
  }
}
