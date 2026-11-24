// Chart of accounts groups: the shop's own groups and sub-groups (kept on the shop record as coaGroups), e.g.
// "Fixed Assets > Furniture & Fittings" or "Indirect Expenses > Office". They are labels and a tree for the CoA,
// the Global Ledger and the CSV / print - the ledger, Balance Sheet, Funds and ageing never read them.
// Safety: every group has a nature, which is one of the ledger's own groups (GROUPS in globalLedger.js). An account
// can only sit in a group of the same nature as the group the ledger already gives it (ledgerGroupOf), so a custom
// group can never move an account to another side of the Balance Sheet. Customers and suppliers keep their own
// party ledgers and are not grouped here.
import { GROUPS } from "./globalLedger.js";

const clean = (v) => String(v ?? "").trim().replace(/\s+/g, " ");
const lc = (v) => clean(v).toLowerCase();
const newId = () => `grp_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export const GROUP_NATURES = GROUPS.map((g) => g.id).filter((id) => id !== "customer" && id !== "vendor");
export const MAX_DEPTH = 3;

/** Saved groups, cleaned: unknown natures dropped; a parent of another nature or missing is cleared. */
export function normalizeGroups(saved) {
  const list = (Array.isArray(saved) ? saved : []).filter((g) => g && GROUP_NATURES.includes(g.nature) && (clean(g.nameEn) || clean(g.nameBn)))
    .map((g) => ({ id: clean(g.id) || newId(), code: clean(g.code), nameEn: clean(g.nameEn), nameBn: clean(g.nameBn), nature: g.nature,
      parentId: clean(g.parentId), active: g.active !== false, createdAt: g.createdAt || "", updatedAt: g.updatedAt || "" }));
  const byId = new Map(list.map((g) => [g.id, g]));
  list.forEach((g) => { const p = byId.get(g.parentId); if (!p || p.nature !== g.nature || p.id === g.id) g.parentId = ""; });
  // a loop left by an old edit is broken at the group that closes it
  list.forEach((g) => {
    const seen = new Set([g.id]);
    for (let p = byId.get(g.parentId); p; p = byId.get(p.parentId)) {
      if (seen.has(p.id)) { g.parentId = ""; break; }
      seen.add(p.id);
    }
  });
  return list;
}

export const groupName = (g, bn = false) => (bn ? g?.nameBn || g?.nameEn : g?.nameEn || g?.nameBn) || "";
const ancestors = (groups, id) => {
  const byId = new Map(groups.map((g) => [g.id, g]));
  const out = [];
  for (let g = byId.get(id); g && out.length <= MAX_DEPTH + 1; g = byId.get(g.parentId)) out.unshift(g);
  return out;
};
/** "Fixed Assets > Furniture" for a group id ("" when unknown). */
export const groupPath = (groups, id, bn = false) => ancestors(groups, id).map((g) => groupName(g, bn)).join(" > ");
const descendantIds = (groups, id) => {
  const out = new Set();
  const walk = (pid) => groups.filter((g) => g.parentId === pid).forEach((g) => { if (!out.has(g.id)) { out.add(g.id); walk(g.id); } });
  walk(id);
  return out;
};

/** Groups of one nature in tree order: [{ group, depth }]. */
export function groupTree(groups, nature) {
  const of = groups.filter((g) => g.nature === nature);
  const out = [];
  const walk = (pid, depth) => of.filter((g) => (g.parentId || "") === pid)
    .sort((a, b) => (a.code || "~").localeCompare(b.code || "~", undefined, { numeric: true }) || groupName(a).localeCompare(groupName(b)))
    .forEach((g) => { out.push({ group: g, depth }); walk(g.id, depth + 1); });
  walk("", 0);
  return out;
}

/** Groups an account may go into: active, of the nature the ledger gives the account. */
export const groupsForAccount = (groups, account) => groups.filter((g) => g.active && g.nature === account?.group);

/** Account group check: "" fine | "group" (missing / off) | "nature" (other side of the ledger). */
export function assignIssue(account, groupId, groups) {
  if (!groupId) return "";
  const g = groups.find((x) => x.id === groupId);
  if (!g || !g.active) return "group";
  return g.nature === account?.group ? "" : "nature";
}

/** The chart with each account's groupId kept only where it is valid (wrong nature or missing -> no group). */
export const applyGroups = (chart, groups) => chart.map((a) => ({ ...a, groupId: a.groupId && groups.some((g) => g.id === a.groupId && g.nature === a.group) ? a.groupId : "" }));

/**
 * Add / change a group. draft: { id?, code, nameEn, nameBn, nature, parentId, active }; chart: normalized accounts.
 * -> { error } | { ok, group }   errors: name, nature, duplicate, duplicateCode, parent, cycle, depth, natureLocked, busy
 */
export function validateGroup(draft, groups, chart = []) {
  const nameEn = clean(draft?.nameEn), nameBn = clean(draft?.nameBn), code = clean(draft?.code), parentId = clean(draft?.parentId);
  const current = draft?.id ? groups.find((g) => g.id === draft.id) : null;
  if (!nameEn && !nameBn) return { error: "name" };
  if (!GROUP_NATURES.includes(draft?.nature)) return { error: "nature" };
  const parent = parentId ? groups.find((g) => g.id === parentId) : null;
  if (parentId && (!parent || parent.nature !== draft.nature)) return { error: "parent" };
  if (current && parentId && (parentId === current.id || descendantIds(groups, current.id).has(parentId))) return { error: "cycle" };
  const depth = (parent ? ancestors(groups, parent.id).length : 0) + 1
    + (current ? Math.max(0, ...[...descendantIds(groups, current.id)].map((id) => ancestors(groups, id).length - ancestors(groups, current.id).length)) : 0);
  if (depth > MAX_DEPTH) return { error: "depth" };
  const siblings = groups.filter((g) => g.id !== current?.id && g.nature === draft.nature && (g.parentId || "") === parentId);
  if (siblings.some((g) => (nameEn && lc(g.nameEn) === lc(nameEn)) || (nameBn && lc(g.nameBn) === lc(nameBn)))) return { error: "duplicate" };
  if (code && groups.some((g) => g.id !== current?.id && lc(g.code) === lc(code))) return { error: "duplicateCode" };
  const inUse = current && (chart.some((a) => a.groupId === current.id) || groups.some((g) => g.parentId === current.id));
  if (current && current.nature !== draft.nature && inUse) return { error: "natureLocked" };
  if (current && draft.active === false && current.active
    && (chart.some((a) => a.groupId === current.id) || groups.some((g) => g.parentId === current.id && g.active))) return { error: "busy" };
  return { ok: true, group: { ...(current || {}), id: current?.id || newId(), code, nameEn, nameBn, nature: draft.nature, parentId, active: draft.active !== false } };
}

/** A group can go only when no account and no sub-group is in it. */
export const canDeleteGroup = (group, groups, chart = []) => !!group && !chart.some((a) => a.groupId === group.id) && !groups.some((g) => g.parentId === group.id);

/** What goes on the shop record. */
export const toSavedGroups = (groups) => groups.map(({ id, code, nameEn, nameBn, nature, parentId, active, createdAt, updatedAt }) => ({ id, code, nameEn, nameBn, nature, parentId, active, createdAt, updatedAt }));
