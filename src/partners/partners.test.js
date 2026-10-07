import test from "node:test";
import assert from "node:assert/strict";
import { periodOf, endedPeriods, periodLabel, computeDistribution, partnerLedger, partnerAlerts, partnerSettingsOf, capitalOf, partnerDirectoryFrom, matchPartnerName } from "./partners.js";

const P = (o) => ({ shopId: "s", status: "active", joinDate: "2026-01-01", ...o });
const E = (o) => ({ shopId: "s", ...o });

test("periods follow the frequency and first month", () => {
  const q = partnerSettingsOf({ partnerSettings: { frequency: "quarterly", startMonth: 1 } });
  assert.deepEqual(periodOf("2026-10-07", q), { from: "2026-10-01", to: "2026-12-31", months: 3 });
  assert.deepEqual(endedPeriods("2026-10-07", q, 2).map((p) => p.from), ["2026-07-01", "2026-04-01"]);
  const fy = partnerSettingsOf({ partnerSettings: { frequency: "yearly", startMonth: 4 } });
  assert.deepEqual(periodOf("2026-02-10", fy), { from: "2025-04-01", to: "2026-03-31", months: 12 });
  assert.equal(periodLabel({ from: "2026-07-01", to: "2026-09-30" }, false), "Jul – Sep 2026");
});

test("profit is split after reserve, salary and interest; shares follow %", () => {
  const partners = [
    P({ id: "a", name: "Faisal", sharePercent: 60, monthlySalary: 1000 }),
    P({ id: "b", name: "Karim", sharePercent: 40, interestRate: 12 }),
  ];
  const entries = [E({ id: "c1", partnerId: "b", kind: "capitalIn", amount: 100000, date: "2026-01-05" })];
  const d = computeDistribution({ netProfit: 30000, partners, entries, from: "2026-07-01", to: "2026-09-30", reservePct: 10 });
  assert.equal(d.reserve, 3000);
  assert.equal(d.salaries, 3000);
  assert.equal(d.interest, 3000);
  assert.equal(d.distributable, 21000);
  const [a, b] = d.allocations;
  assert.equal(a.share, 12600);
  assert.equal(a.total, 15600);
  assert.equal(b.share, 8400);
  assert.equal(b.total, 11400);
  assert.equal(d.unallocated, 0);
});

test("a loss is shared by loss % and a mid-period joiner gets part", () => {
  const partners = [P({ id: "a", sharePercent: 50, lossPercent: 70 }), P({ id: "b", sharePercent: 50, lossPercent: 30, joinDate: "2026-08-16" })];
  const d = computeDistribution({ netProfit: -1000, partners, from: "2026-07-01", to: "2026-09-30" });
  assert.equal(d.isLoss, true);
  assert.equal(d.reserve, 0);
  assert.equal(d.allocations[0].share, -700);
  assert.ok(d.allocations[1].share > -300 && d.allocations[1].share < -100);
  assert.ok(d.unallocated < 0, "the part before the joiner came stays with the business");
});

test("ledger keeps capital and profit apart", () => {
  const entries = [
    E({ id: "1", partnerId: "a", kind: "capitalIn", amount: 50000, date: "2026-01-01" }),
    E({ id: "2", partnerId: "a", kind: "drawing", amount: 2000, date: "2026-08-10" }),
    E({ id: "3", kind: "distribution", periodFrom: "2026-07-01", periodTo: "2026-09-30", dueDate: "2026-10-15", allocations: [{ partnerId: "a", total: 9000 }] }),
    E({ id: "4", partnerId: "a", kind: "payout", amount: 4000, date: "2026-10-12" }),
    E({ id: "5", partnerId: "a", kind: "reinvest", amount: 1000, date: "2026-10-12" }),
    E({ id: "6", partnerId: "a", kind: "payout", amount: 999, date: "2026-10-12", status: "cancelled" }),
  ];
  const l = partnerLedger("a", entries, "s");
  assert.equal(l.capital, 51000);
  assert.equal(l.current, 2000);
  assert.equal(capitalOf("a", entries, "2026-10-01"), 50000);
});

test("alerts: undistributed period, payout due, overdrawn, share total, agreement", () => {
  const settings = partnerSettingsOf({ partnerSettings: { frequency: "quarterly", payoutDays: 15 } });
  const partners = [P({ id: "a", name: "Faisal", sharePercent: 60, agreementEnd: "2026-10-20" }), P({ id: "b", name: "Karim", sharePercent: 30 })];
  const none = partnerAlerts({ partners, entries: [], shopId: "s", today: "2026-10-07", settings });
  assert.deepEqual(none.map((a) => a.kind).sort(), ["agreement", "shareTotal", "undistributed"]);
  const entries = [
    E({ id: "d", kind: "distribution", periodFrom: "2026-07-01", periodTo: "2026-09-30", dueDate: "2026-10-15", allocations: [{ partnerId: "a", total: 5000 }, { partnerId: "b", total: 2500 }] }),
    E({ id: "x", partnerId: "b", kind: "drawing", amount: 3000, date: "2026-10-01" }),
  ];
  const later = partnerAlerts({ partners, entries, shopId: "s", today: "2026-10-16", settings });
  const pay = later.find((a) => a.kind === "payout");
  assert.equal(pay.amount, 5000);
  assert.equal(pay.daysLeft, -1);
  assert.equal(later.find((a) => a.kind === "overdrawn").amount, 500);
  assert.equal(later.some((a) => a.kind === "undistributed"), false);
});

test("ID and document expiry alerts within 30 days", () => {
  const settings = partnerSettingsOf({ partnerSettings: { frequency: "yearly" } });
  const partners = [P({ id: "a", name: "Faisal", sharePercent: 100, joinDate: "2026-10-01", passportExpiry: "2026-10-20", nationalIdExpiry: "2027-06-01" })];
  const docs = [{ id: "d1", partnerId: "a", label: "Emirates ID", expiryDate: "2026-10-01" }, { id: "d2", partnerId: "a", label: "Deed", expiryDate: "2028-01-01" }];
  const out = partnerAlerts({ partners, entries: [], docs, shopId: "s", today: "2026-10-07", settings }).filter((a) => a.kind === "idExpiry");
  assert.deepEqual(out.map((a) => [a.docEn, a.daysLeft, a.tone]), [["Emirates ID", -6, "danger"], ["Passport", 13, "warn"]]);
});

test("partner names: directory and matching a typed 'paid to'", () => {
  const dir = partnerDirectoryFrom([P({ id: "a", name: "Karim Uddin" }), P({ id: "b", name: "করিম" }), P({ id: "c", name: "Old", status: "inactive" }), P({ id: "d", name: "X", shopId: "other" })], "s");
  assert.deepEqual(dir.map((p) => p.id), ["a", "b"]);
  assert.equal(matchPartnerName("karim uddin", dir)?.id, "a");
  assert.equal(matchPartnerName("Mr. Karim Uddin (cash)", dir)?.id, "a");
  assert.equal(matchPartnerName("করিম ভাই", dir)?.id, "b");
  assert.equal(matchPartnerName("Karimpur Traders", dir), null);
  assert.equal(matchPartnerName("ab", dir), null);
});

test("a shop expense paid from the partner's own pocket is owed to them", () => {
  const expenses = [
    { id: "x1", shopId: "s", status: "active", partnerId: "a", paidByPartner: true, amount: 400, expenseDate: "2026-10-02", expenseNo: "EXP-1" },
    { id: "x2", shopId: "s", status: "active", partnerId: "a", paidByPartner: false, amount: 900, expenseDate: "2026-10-02" },
    { id: "x3", shopId: "s", status: "cancelled", partnerId: "a", paidByPartner: true, amount: 50, expenseDate: "2026-10-02" },
  ];
  const entries = [E({ id: "p", partnerId: "a", kind: "payout", amount: 150, date: "2026-10-05" })];
  const led = partnerLedger("a", entries, "s", expenses);
  assert.equal(led.spentForShop, 400);
  assert.equal(led.current, 250);
  assert.equal(led.capital, 0);
});

