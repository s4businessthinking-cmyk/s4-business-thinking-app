import { expiringItems, grossSalary } from "./employeeProfile.js";
import { daysInMonth, marksByDate, summarizeMonth, payableFor, wagesPaidByEmployee, WAGE_CATEGORIES } from "./attendance.js";

const num = (v) => parseFloat(String(v ?? "").replace(/,/g, "")) || 0;
const r2 = (v) => Math.round((num(v) + Number.EPSILON) * 100) / 100;
const pad = (v) => String(v).padStart(2, "0");
const day10 = (v) => String(v || "").slice(0, 10);
const dayDiff = (a, b) => Math.round((new Date(`${a}T12:00:00`) - new Date(`${b}T12:00:00`)) / 86400000);
const shiftMonth = (ym, by) => { const [y, m] = ym.split("-").map(Number); const d = new Date(y, m - 1 + by, 1); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; };
const dayIn = (ym, d) => `${ym}-${pad(Math.min(Math.max(d, 1), daysInMonth(ym)))}`;

/** Same day-of-month `months` later; the 31st lands on the month's last day. */
export function addMonths(date, months) {
  const d = day10(date);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return "";
  return dayIn(shiftMonth(d.slice(0, 7), months), Number(d.slice(8, 10)));
}

export const ALERT_DEFAULTS = { expiryDays: 30, salaryRemindDays: 3, probationDays: 7, ticketDays: 30, birthdayDays: 3, attendanceAfterHour: 11 };

/**
 * Salary for month M falls due on the employee's salary day: in M itself when the day is 25 or later
 * (paid at month end), otherwise in the next month. No salary day means the 1st of the next month.
 */
export function salaryDueDate(emp, ym) {
  const sd = Math.round(num(emp?.salaryDay));
  return sd >= 25 ? dayIn(ym, sd) : dayIn(shiftMonth(ym, 1), sd || 1);
}

const TONE_ORDER = { danger: 0, warn: 1, info: 2 };

/**
 * Everything about employees that needs the owner's attention today: papers expiring, salary due or coming up,
 * attendance not taken, probation ending, air ticket due, birthdays and work anniversaries.
 * Salary checks only start once the shop records wages in the app, so shops that pay outside it aren't nagged.
 */
export function employeeAlerts({ employees = [], docs = [], expenses = [], attendance = [], shopId = "", shopCountry = "", today, nowHour = 12, settings = {} } = {}) {
  const s = { ...ALERT_DEFAULTS, ...settings };
  const mine = (r) => r && !r.isDeleted && (!shopId || r.shopId === shopId);
  const staff = employees.filter(mine);
  const working = staff.filter((e) => e.status !== "inactive" && (!e.joinDate || day10(e.joinDate) <= today));
  const out = [];

  expiringItems(working, docs.filter(mine), { today, withinDays: s.expiryDays, shopCountry }).forEach((x) => out.push({
    key: `exp:${x.employeeId}:${x.docId || x.field}:${x.date}`, kind: "expiry", employeeId: x.employeeId, name: x.name,
    label: x.label, labelBn: x.labelBn, date: x.date, daysLeft: x.daysLeft,
    tone: x.daysLeft < 0 ? "danger" : x.daysLeft <= 7 ? "warn" : "info",
    section: x.docId ? "docs" : x.field === "contractEnd" ? "pay" : "papers",
  }));

  const wages = expenses.filter((x) => mine(x) && x.status !== "cancelled" && x.employeeId && WAGE_CATEGORIES.has(x.category));
  const firstWageMonth = wages.reduce((m, x) => { const ym = String(x.forMonth || x.expenseDate || "").slice(0, 7); return ym && (!m || ym < m) ? ym : m; }, "");
  if (firstWageMonth) {
    const byDate = marksByDate(attendance, shopId);
    const thisMonth = today.slice(0, 7);
    const months = [shiftMonth(thisMonth, -2), shiftMonth(thisMonth, -1), thisMonth].filter((ym) => ym >= firstWageMonth);
    const paidBy = new Map(months.map((ym) => [ym, wagesPaidByEmployee(wages, shopId, ym)]));
    const soon = [];
    staff.forEach((e) => {
      const gross = grossSalary(e);
      if (!(gross > 0)) return;
      months.forEach((ym) => {
        const start = `${ym}-01`, end = dayIn(ym, 31);
        const join = day10(e.joinDate), left = e.status === "inactive" ? day10(e.leftDate) : "";
        if ((join && join > end) || (left && left < start) || (e.status === "inactive" && !left)) return;
        const due = salaryDueDate(e, ym);
        const daysLeft = dayDiff(due, today);
        if (daysLeft > s.salaryRemindDays) return;
        const sum = summarizeMonth(byDate, e.id, ym, join, left);
        const marked = sum.days - sum.unmarked > 0;
        const payable = marked && daysLeft <= 0 ? payableFor({ ...e, salary: gross }, sum, ym).total : r2((gross * sum.days) / daysInMonth(ym));
        const owed = r2(payable - (paidBy.get(ym).get(e.id) || 0));
        if (owed <= 0.01) return;
        if (daysLeft > 0) { soon.push({ e, ym, owed, due, daysLeft }); return; }
        out.push({ key: `sal:${e.id}:${ym}`, kind: "salaryDue", employeeId: e.id, name: e.name, month: ym, amount: owed, date: due, daysLeft, tone: daysLeft < -7 ? "danger" : "warn" });
      });
    });
    if (soon.length) {
      const first = soon.reduce((a, b) => (b.daysLeft < a.daysLeft ? b : a));
      out.push({ key: `salSoon:${first.due}:${soon.length}`, kind: "salarySoon", count: soon.length, amount: r2(soon.reduce((t, x) => t + x.owed, 0)), date: first.due, daysLeft: first.daysLeft, month: first.ym, tone: "info", name: soon.length === 1 ? soon[0].e.name : "" });
    }
  }

  if (nowHour >= s.attendanceAfterHour && working.length) {
    const d = new Date(`${today}T12:00:00`);
    d.setDate(d.getDate() - 14);
    const since = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const recent = attendance.filter((d) => mine(d) && d.date >= since && d.date < today && Object.keys(d.marks || {}).length);
    if (recent.length) {
      const marks = marksByDate(attendance, shopId).get(today)?.marks || {};
      const missing = working.filter((e) => !marks[e.id]);
      if (missing.length) out.push({ key: `att:${today}`, kind: "attendance", count: missing.length, total: working.length, date: today, daysLeft: 0, tone: "warn", name: missing.length === 1 ? missing[0].name : "" });
    }
  }

  working.forEach((e) => {
    const join = day10(e.joinDate);
    const probation = Math.round(num(e.probationMonths));
    if (join && probation > 0) {
      const end = addMonths(join, probation);
      const left = dayDiff(end, today);
      if (left >= -3 && left <= s.probationDays) out.push({ key: `prob:${e.id}:${end}`, kind: "probation", employeeId: e.id, name: e.name, date: end, daysLeft: left, tone: left <= 0 ? "warn" : "info", section: "pay" });
    }

    const every = e.ticketEntitlement === "yearly" ? 12 : e.ticketEntitlement === "2years" ? 24 : 0;
    const base = day10(e.lastTicketDate) || join;
    if (every && base) {
      const next = addMonths(base, every);
      const left = dayDiff(next, today);
      if (left <= s.ticketDays) out.push({ key: `tkt:${e.id}:${next}`, kind: "ticket", employeeId: e.id, name: e.name, date: next, daysLeft: left, tone: left < 0 ? "warn" : "info", section: "papers" });
    }

    const yearly = (d, kind) => {
      if (!d) return;
      const md = d.slice(5, 10);
      for (const y of [Number(today.slice(0, 4)), Number(today.slice(0, 4)) + 1]) {
        const on = md === "02-29" && daysInMonth(`${y}-02`) === 28 ? `${y}-02-28` : `${y}-${md}`;
        const left = dayDiff(on, today);
        if (left < 0) continue;
        const years = y - Number(d.slice(0, 4));
        if (left <= s.birthdayDays && years >= 1) out.push({ key: `${kind}:${e.id}:${on}`, kind, employeeId: e.id, name: e.name, date: on, daysLeft: left, years, tone: "info" });
        break;
      }
    };
    yearly(day10(e.dob), "birthday");
    yearly(join, "anniversary");
  });

  return out.sort((a, b) => TONE_ORDER[a.tone] - TONE_ORDER[b.tone] || a.daysLeft - b.daysLeft || String(a.name || "").localeCompare(String(b.name || "")));
}

const money = (v) => r2(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDay = (d) => (d ? day10(d).split("-").reverse().join("/") : "");
const MONTHS_BN = ["জানুয়ারি", "ফেব্রুয়ারি", "মার্চ", "এপ্রিল", "মে", "জুন", "জুলাই", "আগস্ট", "সেপ্টেম্বর", "অক্টোবর", "নভেম্বর", "ডিসেম্বর"];
const MONTHS_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const monthName = (ym, bn) => { const [y, m] = String(ym).split("-").map(Number); return `${(bn ? MONTHS_BN : MONTHS_EN)[m - 1] || ym} ${y}`; };
const when = (d, bn) => (d === 0 ? (bn ? "আজ" : "today") : d === 1 ? (bn ? "কাল" : "tomorrow") : d > 0 ? (bn ? `${d} দিন পর` : `in ${d} days`) : (bn ? `${-d} দিন আগে` : `${-d} day(s) ago`));

export const ALERT_ICONS = { expiry: "🛂", salaryDue: "💰", salarySoon: "📅", attendance: "🗓️", probation: "⏱️", ticket: "✈️", birthday: "🎂", anniversary: "🎉" };

/** { icon, title, sub } in the user's language for the bell, the panel and system notifications. */
export function alertText(a, bn, cur = "AED") {
  const icon = a.kind === "expiry" && a.daysLeft < 0 ? "⛔" : ALERT_ICONS[a.kind] || "🔔";
  switch (a.kind) {
    case "expiry": {
      const paper = bn ? a.labelBn : a.label;
      return { icon, title: a.daysLeft < 0 ? (bn ? `${paper}-এর মেয়াদ শেষ · ${a.name}` : `${paper} expired · ${a.name}`) : (bn ? `${paper}-এর মেয়াদ শেষ হবে ${when(a.daysLeft, true)} · ${a.name}` : `${paper} expires ${when(a.daysLeft, false)} · ${a.name}`),
        sub: `${bn ? "মেয়াদ" : "Expiry"} ${fmtDay(a.date)}${a.daysLeft < 0 ? ` · ${when(a.daysLeft, bn)}` : ""} · ${bn ? "রিনিউ করুন" : "renew it"}` };
    }
    case "salaryDue":
      return { icon, title: bn ? `${a.name}-এর ${monthName(a.month, true)} বেতন বাকি · ${cur} ${money(a.amount)}` : `${a.name}: ${monthName(a.month, false)} salary unpaid · ${cur} ${money(a.amount)}`,
        sub: bn ? `দেওয়ার তারিখ ছিল ${fmtDay(a.date)}${a.daysLeft < 0 ? ` (${-a.daysLeft} দিন পার)` : ""}` : `Was due ${fmtDay(a.date)}${a.daysLeft < 0 ? ` (${-a.daysLeft} day(s) late)` : ""}` };
    case "salarySoon":
      return { icon, title: bn ? `বেতনের দিন ${when(a.daysLeft, true)} · ${a.count === 1 ? a.name : `${a.count} জন`}` : `Salary day ${when(a.daysLeft, false)} · ${a.count === 1 ? a.name : `${a.count} employees`}`,
        sub: bn ? `${monthName(a.month, true)} · মোট ${cur} ${money(a.amount)} রেডি রাখুন` : `${monthName(a.month, false)} · keep ${cur} ${money(a.amount)} ready` };
    case "attendance":
      return { icon, title: bn ? `আজকের হাজিরা নেওয়া হয়নি · ${a.count === 1 ? a.name : `${a.count} জন`}` : `Today's attendance not taken · ${a.count === 1 ? a.name : `${a.count} employees`}`,
        sub: bn ? `${a.total} জনের মধ্যে ${a.count} জনের হাজিরা বাকি` : `${a.count} of ${a.total} not marked` };
    case "probation":
      return { icon, title: bn ? `${a.name}-এর প্রবেশন শেষ ${when(a.daysLeft, true)}` : `${a.name}'s probation ends ${when(a.daysLeft, false)}`,
        sub: bn ? `${fmtDay(a.date)} · স্থায়ী করবেন কিনা ঠিক করুন` : `${fmtDay(a.date)} · decide on confirmation` };
    case "ticket":
      return { icon, title: bn ? `${a.name}-এর দেশে যাওয়ার টিকিট পাওনা ${a.daysLeft < 0 ? "হয়ে গেছে" : when(a.daysLeft, true)}` : `${a.name}'s air ticket is ${a.daysLeft < 0 ? "due" : `due ${when(a.daysLeft, false)}`}`,
        sub: `${bn ? "তারিখ" : "Date"} ${fmtDay(a.date)}${a.daysLeft < 0 ? ` · ${when(a.daysLeft, bn)}` : ""}` };
    case "birthday":
      return { icon, title: bn ? `${a.name}-এর জন্মদিন ${when(a.daysLeft, true)}` : `${a.name}'s birthday ${when(a.daysLeft, false)}`, sub: bn ? `${a.years} বছর · ${fmtDay(a.date)}` : `Turns ${a.years} · ${fmtDay(a.date)}` };
    case "anniversary":
      return { icon, title: bn ? `${a.name}-এর চাকরির ${a.years} বছর পূর্ণ ${when(a.daysLeft, true)}` : `${a.name} completes ${a.years} year(s) ${when(a.daysLeft, false)}`,
        sub: bn ? "বার্ষিক ছুটি / গ্র্যাচুইটি / বেতন বাড়ানো দেখুন" : "Check annual leave, gratuity or a raise" };
    default:
      return { icon, title: a.name || "", sub: "" };
  }
}
