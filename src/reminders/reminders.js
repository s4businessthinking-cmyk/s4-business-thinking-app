// Manual reminders: things to remember on a date (pay rent, renew licence, call a customer…).

export const REPEATS = [
  { key: "none", bn: "একবার", en: "Once" },
  { key: "daily", bn: "প্রতিদিন", en: "Daily" },
  { key: "weekly", bn: "প্রতি সপ্তাহ", en: "Weekly" },
  { key: "monthly", bn: "প্রতি মাস", en: "Monthly" },
  { key: "yearly", bn: "প্রতি বছর", en: "Yearly" },
];

export const MEMBER_DONE_FIELDS = ["status", "dueDate", "doneAt", "doneBy", "doneByName", "lastDoneAt", "snoozedUntil", "updatedAt", "updatedBy", "history"];

const pad = (n) => String(n).padStart(2, "0");
export const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parse = (s) => {
  const [y, m, d] = String(s || "").slice(0, 10).split("-").map(Number);
  return y && m && d ? new Date(y, m - 1, d) : null;
};

export function addDays(day, n) {
  const d = parse(day);
  if (!d) return day;
  d.setDate(d.getDate() + n);
  return ymd(d);
}

// Next due date after `day` for a repeating reminder; month ends clamp (31 Jan → 28/29 Feb).
export function nextDue(day, repeat) {
  const d = parse(day);
  if (!d || !repeat || repeat === "none") return "";
  if (repeat === "daily") return addDays(day, 1);
  if (repeat === "weekly") return addDays(day, 7);
  const months = repeat === "monthly" ? 1 : repeat === "yearly" ? 12 : 0;
  if (!months) return "";
  const wantDay = d.getDate();
  const t = new Date(d.getFullYear(), d.getMonth() + months, 1);
  const last = new Date(t.getFullYear(), t.getMonth() + 1, 0).getDate();
  t.setDate(Math.min(wantDay, last));
  return ymd(t);
}

export function canSee(r, uid) {
  return !!r && !r.isDeleted && (!r.private || r.createdBy === uid);
}

export function isMine(r, uid, isOwner) {
  return canSee(r, uid) && (!r.assignedTo || r.assignedTo === uid || r.createdBy === uid || isOwner);
}

// "overdue" | "today" | "soon" | "later" | "done"
export function dueState(r, today, nowTime = "") {
  if (r.status === "done") return "done";
  const due = String(r.dueDate || "").slice(0, 10);
  if (!due) return "later";
  const snooze = String(r.snoozedUntil || "").slice(0, 10);
  if (snooze && snooze > today) return "later";
  if (due < today) return "overdue";
  if (due === today) return r.dueTime && nowTime && r.dueTime < nowTime ? "overdue" : "today";
  const before = Math.max(0, Math.min(60, Number(r.remindBefore) || 0));
  return before && addDays(today, before) >= due ? "soon" : "later";
}

export function reminderAlerts(list = [], { uid, isOwner = false, today, nowTime = "" } = {}) {
  return list
    .filter((r) => r.status !== "done" && isMine(r, uid, isOwner) && (!r.assignedTo || r.assignedTo === uid || r.createdBy === uid))
    .map((r) => ({ r, state: dueState(r, today, nowTime) }))
    .filter((x) => x.state === "overdue" || x.state === "today" || x.state === "soon")
    .sort((a, b) => String(a.r.dueDate).localeCompare(String(b.r.dueDate)) || String(a.r.dueTime || "").localeCompare(String(b.r.dueTime || "")))
    .map(({ r, state }) => ({ key: `rem-${r.id}-${r.dueDate}`, id: r.id, state, title: r.title, note: r.note || "", dueDate: r.dueDate, dueTime: r.dueTime || "", tone: state === "overdue" ? "danger" : undefined }));
}

export function reminderAlertText(a, bn) {
  const when = `${String(a.dueDate || "").split("-").reverse().join("/")}${a.dueTime ? ` ${a.dueTime}` : ""}`;
  const label = a.state === "overdue" ? (bn ? "সময় পার হয়েছে" : "Overdue") : a.state === "today" ? (bn ? "আজ" : "Today") : (bn ? "আসছে" : "Coming up");
  return { icon: a.state === "overdue" ? "⏰" : "🔔", title: a.title, sub: `${label} · ${when}${a.note ? ` · ${a.note}` : ""}` };
}

// Patch for marking a reminder done: repeating ones roll to the next date.
export function donePatch(r, { uid = "", name = "", now = new Date() } = {}) {
  const at = now.toISOString();
  const history = [...(Array.isArray(r.history) ? r.history.slice(-29) : []), { dueDate: r.dueDate, doneAt: at, by: name }];
  const next = nextDue(r.dueDate, r.repeat);
  if (next) {
    let n = next;
    const today = ymd(now);
    if (r.repeat === "daily") n = n > today ? n : addDays(today, 1);
    else while (n && n < today) n = nextDue(n, r.repeat);
    return { dueDate: n, lastDoneAt: at, snoozedUntil: "", history, updatedAt: at, updatedBy: uid };
  }
  return { status: "done", doneAt: at, doneBy: uid, doneByName: name, lastDoneAt: at, history, updatedAt: at, updatedBy: uid };
}
