import { loadShopRecord, saveShopRecord } from "../offline/shopService.js";
import { dueFromBranchAccountName, dueToHqAccountName } from "./interCompanyAccounts.js";
import { branchBankAccountName } from "./branchBankAccounts.js";

const lc = (v) => String(v || "").trim().toLowerCase();
const accId = (name) => `acc_${lc(name).replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "x"}`;

export function ensureAccountsOnChart(chart, names = []) {
  const list = Array.isArray(chart) ? [...chart] : [];
  const have = new Set(list.map((a) => lc(a?.name)));
  let changed = false;
  const now = new Date().toISOString();
  for (const name of names) {
    const clean = String(name || "").trim();
    if (!clean || have.has(lc(clean))) continue;
    list.push({ id: accId(clean), code: "", name: clean, active: true, createdAt: now, updatedAt: now });
    have.add(lc(clean));
    changed = true;
  }
  return { list, changed };
}

/** HQ + child CoA: inter-company due accounts and a dedicated bank name per branch. */
export async function seedPremierBranchCoa({ parentShopId, childShopId, branchName }) {
  const label = String(branchName || "").trim() || "Branch";
  const bank = branchBankAccountName(label);
  const dueFrom = dueFromBranchAccountName(label);
  const dueTo = dueToHqAccountName();
  if (!parentShopId || !childShopId) return { parent: null, child: null };

  const parent = (await loadShopRecord(parentShopId)) || { id: parentShopId, shopId: parentShopId };
  const child = (await loadShopRecord(childShopId)) || childShopId;

  const parentPatch = ensureAccountsOnChart(parent.chartOfAccounts, [dueFrom, bank]);
  const childPatch = ensureAccountsOnChart(child.chartOfAccounts || [], [dueTo, bank]);

  let parentSaved = parent;
  let childSaved = child;
  if (parentPatch.changed) {
    parentSaved = {
      ...parent,
      chartOfAccounts: parentPatch.list,
      branchBankByBranchId: {
        ...(parent.branchBankByBranchId || {}),
        [label]: bank,
      },
    };
    await saveShopRecord(parentShopId, parentSaved);
  }
  if (childPatch.changed || child.defaultBankAccount !== bank) {
    childSaved = {
      ...child,
      shopId: childShopId,
      chartOfAccounts: childPatch.list,
      defaultBankAccount: bank,
    };
    await saveShopRecord(childShopId, childSaved);
  }
  return { parent: parentSaved, child: childSaved, bank, dueFrom, dueTo };
}