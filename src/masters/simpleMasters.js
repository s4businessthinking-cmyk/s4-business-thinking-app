// Small shop masters kept on the shop record (owner edits, everyone in the shop reads):
// - allowanceTypes: employee allowance types. The four salary parts on the employee profile (housing, transport,
//   food, other) are system rows tied to those payroll fields and are always there; extra types are chosen on an
//   employee "Allowance" expense (allowanceTypeId / allowanceTypeName on the expense). Payroll itself is unchanged.
// - adjustmentReasons: why a bill's Adjustment (+/-) was given. Used on the sales invoice adjustment today
//   (adjustmentReasonId / adjustmentReason on the bill); "purchase" / "both" rows are ready for a purchase bill
//   adjustment, which purchase bills do not have yet.
import { SALARY_PARTS } from "../employees/employeeProfile.js";

const clean = (v) => String(v ?? "").trim();
const newId = (p) => `${p}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

const SYSTEM_ALLOWANCES = SALARY_PARTS.filter((p) => p.k !== "basicSalary").map((p, i) => ({
  id: `sys_${p.k}`, code: `AL${String(i + 1).padStart(2, "0")}`, nameEn: p.en, nameBn: p.bn, field: p.k, active: true, system: true,
}));

/** Saved list + the system rows (system rows can be renamed / recoded, never removed or switched off). */
export function normalizeAllowances(saved) {
  const list = (Array.isArray(saved) ? saved : []).filter((a) => a && (clean(a.nameEn) || clean(a.nameBn)));
  const byId = new Map(list.map((a) => [a.id, a]));
  const system = SYSTEM_ALLOWANCES.map((s) => ({ ...s, ...(byId.get(s.id) ? { code: clean(byId.get(s.id).code) || s.code, nameEn: clean(byId.get(s.id).nameEn) || s.nameEn, nameBn: clean(byId.get(s.id).nameBn) || s.nameBn } : {}), active: true, system: true }));
  const custom = list.filter((a) => !String(a.id || "").startsWith("sys_"))
    .map((a) => ({ id: a.id || newId("al_"), code: clean(a.code), nameEn: clean(a.nameEn), nameBn: clean(a.nameBn), field: "", active: a.active !== false, system: false }));
  return [...system, ...custom];
}

export const ADJUSTMENT_SIDES = ["sales", "purchase", "both"];
export const DEFAULT_ADJUSTMENT_REASONS = [
  { id: "adj_round", code: "ADJ01", nameEn: "Rounding", nameBn: "রাউন্ডিং", side: "both", active: true },
  { id: "adj_freight", code: "ADJ02", nameEn: "Freight / delivery charge", nameBn: "ভাড়া / ডেলিভারি চার্জ", side: "both", active: true },
  { id: "adj_goodwill", code: "ADJ03", nameEn: "Goodwill discount", nameBn: "গুডউইল ছাড়", side: "sales", active: true },
  { id: "adj_rate", code: "ADJ04", nameEn: "Rate difference", nameBn: "রেট পার্থক্য", side: "both", active: true },
];
/** Saved reasons, or the defaults until the owner saves a list. */
export function normalizeAdjustments(saved) {
  const list = (Array.isArray(saved) ? saved : []).filter((a) => a && (clean(a.nameEn) || clean(a.nameBn)))
    .map((a) => ({ id: a.id || newId("adj_"), code: clean(a.code), nameEn: clean(a.nameEn), nameBn: clean(a.nameBn), side: ADJUSTMENT_SIDES.includes(a.side) ? a.side : "both", active: a.active !== false }));
  return list.length ? list : DEFAULT_ADJUSTMENT_REASONS.map((a) => ({ ...a }));
}
/** Active reasons for one side ("sales" | "purchase"). */
export const reasonsFor = (list, side) => (list || []).filter((a) => a.active && (a.side === "both" || a.side === side));

/**
 * Add / change a row in either master. -> { error: "name" | "duplicate" | "duplicateCode" | "system" } | { ok, list }
 * A system allowance keeps its field and stays active.
 */
export function saveMasterRow(list, draft, { prefix = "row_" } = {}) {
  const nameEn = clean(draft?.nameEn), nameBn = clean(draft?.nameBn), code = clean(draft?.code);
  if (!nameEn && !nameBn) return { error: "name" };
  const others = list.filter((a) => a.id !== draft.id);
  if (others.some((a) => (nameEn && a.nameEn.toLowerCase() === nameEn.toLowerCase()) || (nameBn && a.nameBn === nameBn))) return { error: "duplicate" };
  if (code && others.some((a) => a.code && a.code.toLowerCase() === code.toLowerCase())) return { error: "duplicateCode" };
  const current = list.find((a) => a.id === draft.id);
  if (current?.system && draft.active === false) return { error: "system" };
  const row = { ...(current || {}), ...draft, id: current?.id || draft.id || newId(prefix), code, nameEn, nameBn, active: current?.system ? true : draft.active !== false };
  return { ok: true, list: current ? list.map((a) => (a.id === row.id ? row : a)) : [...list, row] };
}

/** What goes on the shop record (no derived fields). */
export const savedAllowances = (list) => list.map(({ id, code, nameEn, nameBn, active }) => ({ id, code, nameEn, nameBn, active }));
export const savedAdjustments = (list) => list.map(({ id, code, nameEn, nameBn, side, active }) => ({ id, code, nameEn, nameBn, side, active }));
export const rowName = (row, bn) => (bn ? row?.nameBn || row?.nameEn : row?.nameEn || row?.nameBn) || "";
