// Tax-due alerts: how much VAT/GST (or Corporate Tax) is owed — or refundable — near filing time.
import { addDays } from "./taxDomain.js";

const fmtMoney = (v) => Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDay = (d) => String(d).slice(0, 10).split("-").reverse().join("/");

// "overdue" | "today" | "soon" | null — null means outside the alert window, stay quiet.
function dueTone(today, due, soonDays) {
  if (!due) return null;
  if (today > due) return "overdue";
  if (today === due) return "today";
  return today >= addDays(due, -soonDays) ? "soon" : null;
}

export function taxDueAlerts({ vat, ct, tn, cur, dueDate, ctDue, today, bn }) {
  const alerts = [];

  if (vat && dueDate) {
    const tone = dueTone(today, dueDate, 7);
    if (tone) {
      const payable = vat.payable || 0;
      const title = payable >= 0
        ? (bn ? `${tn} জমা দিতে হবে — ${cur} ${fmtMoney(payable)}` : `${tn} due — ${cur} ${fmtMoney(payable)}`)
        : (bn ? `${tn} ফেরত পাবেন — ${cur} ${fmtMoney(payable)}` : `${tn} refundable — ${cur} ${fmtMoney(payable)}`);
      const sub = tone === "overdue"
        ? (bn ? `সময় পার হয়েছে — ${fmtDay(dueDate)}` : `Overdue — ${fmtDay(dueDate)}`)
        : tone === "today"
          ? (bn ? "আজ শেষ তারিখ" : "Due today")
          : (bn ? `জমার শেষ তারিখ ${fmtDay(dueDate)}` : `Due ${fmtDay(dueDate)}`);
      alerts.push({ key: `taxdue-vat-${dueDate}`, kind: "vat", tone: tone === "overdue" ? "danger" : undefined, icon: tone === "overdue" ? "⏰" : "🧾", title, sub });
    }
  }

  if (ct && ctDue) {
    const tone = dueTone(today, ctDue, 14);
    if (tone) {
      const tax = ct.tax || 0;
      const title = tax > 0
        ? (bn ? `Corporate Tax দিতে হবে — ${cur} ${fmtMoney(tax)}` : `Corporate Tax due — ${cur} ${fmtMoney(tax)}`)
        : (bn ? "এই বছর Corporate Tax দিতে হবে না (0)" : "No Corporate Tax due this year (0)");
      const sub = tone === "overdue"
        ? (bn ? `সময় পার হয়েছে — ${fmtDay(ctDue)}` : `Overdue — ${fmtDay(ctDue)}`)
        : tone === "today"
          ? (bn ? "আজ শেষ তারিখ" : "Due today")
          : (bn ? `জমার শেষ তারিখ ${fmtDay(ctDue)}` : `Due ${fmtDay(ctDue)}`);
      alerts.push({ key: `taxdue-ct-${ctDue}`, kind: "ct", tone: tone === "overdue" ? "danger" : undefined, icon: tone === "overdue" ? "⏰" : "🏢", title, sub });
    }
  }

  return alerts;
}
