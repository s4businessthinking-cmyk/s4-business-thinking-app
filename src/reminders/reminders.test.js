import test from "node:test";
import assert from "node:assert/strict";
import { donePatch, dueState, nextDue, reminderAlerts } from "./reminders.js";

test("next due dates clamp month ends", () => {
  assert.equal(nextDue("2026-01-31", "monthly"), "2026-02-28");
  assert.equal(nextDue("2028-01-31", "monthly"), "2028-02-29");
  assert.equal(nextDue("2026-10-07", "weekly"), "2026-10-14");
  assert.equal(nextDue("2026-10-07", "yearly"), "2027-10-07");
  assert.equal(nextDue("2026-10-07", "none"), "");
});

test("due state with time, snooze and advance notice", () => {
  const today = "2026-10-07";
  assert.equal(dueState({ dueDate: "2026-10-06" }, today), "overdue");
  assert.equal(dueState({ dueDate: today, dueTime: "09:00" }, today, "10:00"), "overdue");
  assert.equal(dueState({ dueDate: today, dueTime: "11:00" }, today, "10:00"), "today");
  assert.equal(dueState({ dueDate: "2026-10-10", remindBefore: 3 }, today), "soon");
  assert.equal(dueState({ dueDate: "2026-10-10" }, today), "later");
  assert.equal(dueState({ dueDate: "2026-10-01", snoozedUntil: "2026-10-08" }, today), "later");
  assert.equal(dueState({ dueDate: "2026-10-01", status: "done" }, today), "done");
});

test("alerts only for my visible open reminders", () => {
  const list = [
    { id: "1", title: "Rent", dueDate: "2026-10-05", createdBy: "o" },
    { id: "2", title: "Secret", dueDate: "2026-10-05", createdBy: "o", private: true },
    { id: "3", title: "Call", dueDate: "2026-10-07", createdBy: "o", assignedTo: "s2" },
    { id: "4", title: "Done", dueDate: "2026-10-05", createdBy: "o", status: "done" },
    { id: "5", title: "Later", dueDate: "2026-12-01", createdBy: "o" },
  ];
  assert.deepEqual(reminderAlerts(list, { uid: "s1", today: "2026-10-07" }).map((a) => a.id), ["1"]);
  assert.deepEqual(reminderAlerts(list, { uid: "s2", today: "2026-10-07" }).map((a) => a.id), ["1", "3"]);
  assert.deepEqual(reminderAlerts(list, { uid: "o", isOwner: true, today: "2026-10-07" }).map((a) => a.id), ["1", "2", "3"]);
});

test("done rolls repeating reminders forward", () => {
  const now = new Date(2026, 9, 7, 12);
  assert.equal(donePatch({ dueDate: "2026-09-07", repeat: "monthly" }, { now }).dueDate, "2026-10-07");
  assert.equal(donePatch({ dueDate: "2026-10-01", repeat: "daily" }, { now }).dueDate, "2026-10-08");
  const once = donePatch({ dueDate: "2026-10-07", repeat: "none" }, { now, name: "Rahim" });
  assert.equal(once.status, "done");
  assert.equal(once.history[0].by, "Rahim");
});
