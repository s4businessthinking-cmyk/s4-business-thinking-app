const num = (v) => parseFloat(String(v ?? "").replace(/,/g, "")) || 0;
const r2 = (v) => Math.round((num(v) + Number.EPSILON) * 100) / 100;

export const NATIONALITIES = [
  { code: "BD", en: "Bangladesh", bn: "বাংলাদেশ" },
  { code: "IN", en: "India", bn: "ভারত" },
  { code: "PK", en: "Pakistan", bn: "পাকিস্তান" },
  { code: "NP", en: "Nepal", bn: "নেপাল" },
  { code: "LK", en: "Sri Lanka", bn: "শ্রীলঙ্কা" },
  { code: "PH", en: "Philippines", bn: "ফিলিপাইন" },
  { code: "EG", en: "Egypt", bn: "মিশর" },
  { code: "AE", en: "UAE", bn: "আমিরাত" },
  { code: "SA", en: "Saudi Arabia", bn: "সৌদি আরব" },
  { code: "OM", en: "Oman", bn: "ওমান" },
  { code: "QA", en: "Qatar", bn: "কাতার" },
  { code: "KW", en: "Kuwait", bn: "কুয়েত" },
  { code: "BH", en: "Bahrain", bn: "বাহরাইন" },
  { code: "MY", en: "Malaysia", bn: "মালয়েশিয়া" },
  { code: "SG", en: "Singapore", bn: "সিঙ্গাপুর" },
  { code: "GB", en: "UK", bn: "যুক্তরাজ্য" },
  { code: "US", en: "USA", bn: "যুক্তরাষ্ট্র" },
  { code: "OT", en: "Other", bn: "অন্যান্য" },
];

/**
 * What each country calls its papers. `resident*` applies to foreign workers on a visa,
 * `local*` to the country's own citizens.
 */
const GULF = { needsVisa: true, payroll: "WPS", ticket: true };
export const COUNTRY_RULES = {
  AE: { ...GULF, residentId: "Emirates ID", workPermit: "Labour Card / Work Permit (MOHRE)", localId: "Emirates ID", localSocial: "Pension (GPSSA) No" },
  SA: { ...GULF, residentId: "Iqama", workPermit: "Work Permit (Qiwa)", payroll: "Mudad / WPS", localId: "National ID", localSocial: "GOSI No" },
  OM: { ...GULF, residentId: "Resident Card", workPermit: "Labour Card", localId: "Civil ID", localSocial: "SPF No" },
  QA: { ...GULF, residentId: "QID", workPermit: "Work Permit", localId: "QID", localSocial: "GRSIA No" },
  KW: { ...GULF, residentId: "Civil ID", workPermit: "Work Permit", localId: "Civil ID", localSocial: "PIFSS No" },
  BH: { ...GULF, residentId: "CPR", workPermit: "LMRA Work Permit", localId: "CPR", localSocial: "SIO No" },
  MY: { needsVisa: true, residentId: "i-Kad / Pass", workPermit: "Work Permit (PLKS)", payroll: "Bank", localId: "MyKad", localSocial: "EPF / SOCSO No", ticket: false },
  SG: { needsVisa: true, residentId: "FIN", workPermit: "Work Pass (EP / S Pass / WP)", payroll: "Bank", localId: "NRIC", localSocial: "CPF No", ticket: false },
  BD: { needsVisa: true, residentId: "Visa", workPermit: "Work Permit (BIDA)", payroll: "Bank / Cash", localId: "NID", localSocial: "TIN", ticket: false },
  IN: { needsVisa: true, residentId: "FRRO Registration", workPermit: "Employment Visa", payroll: "Bank", localId: "Aadhaar", localSocial: "PAN / UAN", ticket: false },
  PK: { needsVisa: true, residentId: "Visa", workPermit: "Work Visa", payroll: "Bank", localId: "CNIC", localSocial: "NTN / EOBI", ticket: false },
  GB: { needsVisa: true, residentId: "BRP / eVisa", workPermit: "Right to Work share code", payroll: "Bank (PAYE)", localId: "Passport / Driving licence", localSocial: "NI Number", ticket: false },
  US: { needsVisa: true, residentId: "Green Card / Visa", workPermit: "EAD", payroll: "Bank", localId: "State ID", localSocial: "SSN", ticket: false },
};
const DEFAULT_RULE = { needsVisa: true, residentId: "Residence ID", workPermit: "Work Permit", payroll: "Bank", localId: "National ID", localSocial: "Tax / Social Security No", ticket: false };
export const countryRule = (code) => COUNTRY_RULES[String(code || "").toUpperCase()] || DEFAULT_RULE;

/** Foreign worker on a visa vs a citizen of the shop's country; an explicit choice wins over the nationality guess. */
export function isExpat(emp, shopCountry) {
  if (emp?.workerType === "expat") return true;
  if (emp?.workerType === "local") return false;
  const nat = String(emp?.nationalityCode || "").toUpperCase();
  return !!nat && !!shopCountry && nat !== String(shopCountry).toUpperCase();
}

export const SALARY_PARTS = [
  { k: "basicSalary", bn: "মূল বেতন", en: "Basic" },
  { k: "housingAllowance", bn: "বাসা ভাতা", en: "Housing" },
  { k: "transportAllowance", bn: "যাতায়াত ভাতা", en: "Transport" },
  { k: "foodAllowance", bn: "খাবার ভাতা", en: "Food" },
  { k: "otherAllowance", bn: "অন্যান্য ভাতা", en: "Other" },
];

/** Monthly gross pay; older records that only have `salary` keep that figure. */
export function grossSalary(emp) {
  const parts = SALARY_PARTS.reduce((t, p) => t + num(emp?.[p.k]), 0);
  return r2(parts > 0 ? parts : emp?.salary);
}

export const EXPIRY_FIELDS = [
  { k: "visaExpiry", en: "Visa", bn: "ভিসা", expat: true },
  { k: "residentIdExpiry", en: "Residence ID", bn: "রেসিডেন্স আইডি", expat: true, ruleKey: "residentId" },
  { k: "workPermitExpiry", en: "Work permit", bn: "ওয়ার্ক পারমিট", expat: true, ruleKey: "workPermit" },
  { k: "passportExpiry", en: "Passport", bn: "পাসপোর্ট" },
  { k: "localIdExpiry", en: "National ID", bn: "জাতীয় পরিচয়পত্র", local: true, ruleKey: "localId" },
  { k: "insuranceExpiry", en: "Medical insurance", bn: "মেডিকেল ইনস্যুরেন্স" },
  { k: "contractEnd", en: "Contract", bn: "চুক্তি" },
  { k: "drivingLicenseExpiry", en: "Driving licence", bn: "ড্রাইভিং লাইসেন্স" },
];

const dayDiff = (a, b) => Math.round((new Date(`${a}T12:00:00`) - new Date(`${b}T12:00:00`)) / 86400000);

/** Papers that have expired or expire within `withinDays`, for working employees only. */
export function expiringItems(employees, docs, { today, withinDays = 30, shopCountry = "" } = {}) {
  const out = [];
  const rule = countryRule(shopCountry);
  (employees || []).forEach((e) => {
    if (!e || e.isDeleted || e.status === "inactive") return;
    const expat = isExpat(e, shopCountry);
    EXPIRY_FIELDS.forEach((f) => {
      if ((f.expat && !expat) || (f.local && expat)) return;
      const d = String(e[f.k] || "").slice(0, 10);
      if (!d) return;
      const left = dayDiff(d, today);
      if (left <= withinDays) out.push({ employeeId: e.id, name: e.name, label: f.ruleKey ? rule[f.ruleKey] : f.en, labelBn: f.bn, date: d, daysLeft: left, field: f.k });
    });
  });
  const live = new Set((employees || []).filter((e) => e && !e.isDeleted && e.status !== "inactive").map((e) => e.id));
  (docs || []).forEach((d) => {
    if (!d || d.isDeleted || !live.has(d.employeeId) || !d.expiryDate) return;
    const left = dayDiff(String(d.expiryDate).slice(0, 10), today);
    if (left <= withinDays) {
      const emp = employees.find((e) => e.id === d.employeeId);
      out.push({ employeeId: d.employeeId, name: emp?.name || "", label: d.label || d.docType, labelBn: d.label || d.docType, date: String(d.expiryDate).slice(0, 10), daysLeft: left, docId: d.id });
    }
  });
  return out.sort((a, b) => a.daysLeft - b.daysLeft);
}

/** Years and months of service up to `today` (or the leaving date). */
export function serviceLength(emp, today) {
  const start = String(emp?.joinDate || "").slice(0, 10);
  if (!start) return null;
  const end = emp?.status === "inactive" && emp?.leftDate ? emp.leftDate : today;
  const [y1, m1, d1] = start.split("-").map(Number);
  const [y2, m2, d2] = String(end).slice(0, 10).split("-").map(Number);
  let months = (y2 - y1) * 12 + (m2 - m1) - (d2 < d1 ? 1 : 0);
  if (months < 0) months = 0;
  return { years: Math.floor(months / 12), months: months % 12 };
}
