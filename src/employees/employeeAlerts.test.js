import test from "node:test";
import assert from "node:assert/strict";
import { employeeAlerts, salaryDueDate, addMonths, alertText } from "./employeeAlerts.js";

const emp = (o) => ({ id: "e1", shopId: "s", name: "Rahim", status: "active", joinDate: "2025-01-10", basicSalary: 3000, ...o });
const kinds = (list) => list.map((a) => a.kind).sort();

test("salary falls due next month, or at month end when the salary day is 25+", () => {
  assert.equal(salaryDueDate({}, "2026-09"), "2026-10-01");
  assert.equal(salaryDueDate({ salaryDay: 5 }, "2026-09"), "2026-10-05");
  assert.equal(salaryDueDate({ salaryDay: 30 }, "2026-02"), "2026-02-28");
  assert.equal(addMonths("2026-01-31", 1), "2026-02-28");
});

test("unpaid salary shows after its due date, only once wages are kept in the app", () => {
  const base = { employees: [emp({ salaryDay: 5 })], shopId: "s", today: "2026-10-07" };
  assert.equal(employeeAlerts(base).filter((a) => a.kind === "salaryDue").length, 0, "no wages ever recorded -> no nagging");
  const paidAug = [{ id: "x0", shopId: "s", employeeId: "e1", category: "salary", amount: 3000, forMonth: "2026-08" }];
  const due = employeeAlerts({ ...base, expenses: [...paidAug, { id: "x1", shopId: "s", employeeId: "e1", category: "advance", amount: 1000, forMonth: "2026-09" }] });
  const sep = due.find((a) => a.kind === "salaryDue");
  assert.equal(sep.month, "2026-09");
  assert.equal(sep.amount, 2000);
  const visaOnly = employeeAlerts({ ...base, expenses: [...paidAug, { id: "x2", shopId: "s", employeeId: "e1", category: "visa", amount: 3000, forMonth: "2026-09" }] });
  assert.equal(visaOnly.find((a) => a.kind === "salaryDue").amount, 3000, "visa cost is not wages");
  const paid = employeeAlerts({ ...base, expenses: [...paidAug, { id: "x3", shopId: "s", employeeId: "e1", category: "salary", amount: 3000, forMonth: "2026-09" }] });
  assert.equal(paid.filter((a) => a.kind === "salaryDue").length, 0);
});

test("salary day coming up is one combined reminder", () => {
  const list = employeeAlerts({
    employees: [emp({ salaryDay: 28 }), emp({ id: "e2", name: "Karim", salaryDay: 28, basicSalary: 2000 })], shopId: "s", today: "2026-10-26",
    expenses: [{ id: "x", shopId: "s", employeeId: "e1", category: "salary", amount: 3000, forMonth: "2026-09" }, { id: "y", shopId: "s", employeeId: "e2", category: "salary", amount: 2000, forMonth: "2026-09" }],
  });
  const soon = list.filter((a) => a.kind === "salarySoon");
  assert.equal(soon.length, 1);
  assert.equal(soon[0].count, 2);
  assert.equal(soon[0].amount, 5000);
  assert.equal(soon[0].daysLeft, 2);
});

test("papers, probation, ticket, birthday and anniversary", () => {
  const list = employeeAlerts({
    employees: [emp({ visaExpiry: "2026-10-01", workerType: "expat", probationMonths: 3, joinDate: "2025-10-09", dob: "1990-10-08", ticketEntitlement: "yearly", lastTicketDate: "2025-10-20" }),
      emp({ id: "gone", status: "inactive", leftDate: "2026-01-01", visaExpiry: "2026-10-01", workerType: "expat" })],
    shopId: "s", shopCountry: "AE", today: "2026-10-07",
  });
  assert.deepEqual(kinds(list), ["anniversary", "birthday", "expiry", "ticket"]);
  assert.equal(list[0].kind, "expiry", "expired papers come first");
  const prob = employeeAlerts({ employees: [emp({ joinDate: "2026-07-10", probationMonths: 3 })], shopId: "s", today: "2026-10-07" });
  assert.equal(prob.find((a) => a.kind === "probation").daysLeft, 3);
  assert.match(alertText(list[0], true).title, /মেয়াদ শেষ/);
});

test("attendance reminder only for shops that take attendance, after the set hour", () => {
  const employees = [emp({}), emp({ id: "e2", name: "Karim" })];
  const yesterday = { id: "a1", shopId: "s", date: "2026-10-06", marks: { e1: { s: "P" }, e2: { s: "P" } } };
  const todayDoc = { id: "a2", shopId: "s", date: "2026-10-07", marks: { e1: { s: "P" } } };
  assert.equal(employeeAlerts({ employees, shopId: "s", today: "2026-10-07", nowHour: 12 }).some((a) => a.kind === "attendance"), false);
  assert.equal(employeeAlerts({ employees, attendance: [yesterday], shopId: "s", today: "2026-10-07", nowHour: 9 }).some((a) => a.kind === "attendance"), false);
  const att = employeeAlerts({ employees, attendance: [yesterday, todayDoc], shopId: "s", today: "2026-10-07", nowHour: 12 }).find((a) => a.kind === "attendance");
  assert.equal(att.count, 1);
  assert.equal(att.name, "Karim");
});
