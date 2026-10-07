export const ATTENDANCE_STATUSES = [
  { key: "P", bn: "উপস্থিত", en: "Present", color: "#15803d", pay: 1 },
  { key: "A", bn: "অনুপস্থিত", en: "Absent", color: "#b91c1c", pay: 0 },
  { key: "HD", bn: "অর্ধদিন", en: "Half day", color: "#b45309", pay: 0.5 },
  { key: "L", bn: "ছুটি (বেতনসহ)", en: "Paid leave", color: "#2563eb", pay: 1 },
  { key: "UL", bn: "ছুটি (বেতন ছাড়া)", en: "Unpaid leave", color: "#7c3aed", pay: 0 },
  { key: "H", bn: "সাপ্তাহিক/সরকারি ছুটি", en: "Weekly off / Holiday", color: "#64748b", pay: 1 },
];

const num = (v) => parseFloat(String(v ?? "").replace(/,/g, "")) || 0;
const r2 = (v) => Math.round((num(v) + Number.EPSILON) * 100) / 100;

export const statusInfo = (key) => ATTENDANCE_STATUSES.find((s) => s.key === key) || null;

export function daysInMonth(ym) {
  const [y, m] = String(ym || "").split("-").map(Number);
  if (!y || !m) return 0;
  return new Date(y, m, 0).getDate();
}

export const monthDates = (ym) => Array.from({ length: daysInMonth(ym) }, (_, i) => `${ym}-${String(i + 1).padStart(2, "0")}`);

/** Hours between two "HH:MM" times; an out time earlier than in time means an overnight shift. */
export function hoursBetween(inT, outT) {
  const toMin = (t) => { const m = String(t || "").match(/^(\d{1,2}):(\d{2})$/); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };
  const a = toMin(inT), b = toMin(outT);
  if (a == null || b == null) return 0;
  const diff = b >= a ? b - a : b + 1440 - a;
  return r2(diff / 60);
}

/**
 * Attendance docs are one per date: { date, marks: { [employeeId]: { s, in, out, ot, note } } }.
 * Two offline devices can each create a doc for the same date, so marks are merged with the newer doc winning per employee.
 */
export function marksByDate(docs, shopId) {
  const map = new Map();
  [...(docs || [])]
    .filter((d) => d && !d.isDeleted && (!shopId || d.shopId === shopId) && d.date)
    .sort((a, b) => String(a.updatedAt || "").localeCompare(String(b.updatedAt || "")))
    .forEach((d) => {
      const prev = map.get(d.date);
      map.set(d.date, { ...d, docIds: [...(prev?.docIds || []), d.id].filter(Boolean), marks: { ...(prev?.marks || {}), ...(d.marks || {}) } });
    });
  return map;
}

export function summarizeMonth(byDate, employeeId, ym, joinDate = "", leftDate = "") {
  const out = { P: 0, A: 0, HD: 0, L: 0, UL: 0, H: 0, unmarked: 0, otHours: 0, paidDays: 0, days: 0 };
  monthDates(ym).forEach((date) => {
    if ((joinDate && date < joinDate) || (leftDate && date > leftDate)) return;
    out.days += 1;
    const mark = byDate.get(date)?.marks?.[employeeId];
    const info = statusInfo(mark?.s);
    if (!info) { out.unmarked += 1; return; }
    out[info.key] += 1;
    out.paidDays += info.pay;
    out.otHours += num(mark.ot);
  });
  out.otHours = r2(out.otHours);
  return out;
}

/** Employee expenses that pay the month's wages; visa, ticket, medical and gratuity are separate costs. */
export const WAGE_CATEGORIES = new Set(["salary", "advance", "overtime", "bonus", "allowance"]);

/** Map(employeeId -> wages paid for `ym`), counting an expense by its "for month" (else its date). */
export function wagesPaidByEmployee(expenses, shopId, ym) {
  const map = new Map();
  (expenses || []).forEach((x) => {
    if (!x || x.isDeleted || (shopId && x.shopId !== shopId) || x.status === "cancelled" || !x.employeeId || !WAGE_CATEGORIES.has(x.category)) return;
    if (String(x.forMonth || x.expenseDate || "").slice(0, 7) !== ym) return;
    map.set(x.employeeId, r2((map.get(x.employeeId) || 0) + num(x.amount)));
  });
  return map;
}

/** Monthly salary pro-rated by paid days over the calendar month, plus overtime at the given hourly rate. */
export function payableFor(employee, summary, ym) {
  const salary = num(employee?.salary);
  const dim = daysInMonth(ym) || 30;
  const basic = r2((salary / dim) * summary.paidDays);
  const ot = r2(summary.otHours * num(employee?.otRate));
  return { basic, ot, total: r2(basic + ot) };
}
