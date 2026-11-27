import { offlineGetById, offlineList, offlineUpdate, offlineUpsert } from "../offline/offlineRepository.js";
import { loadShopRecord, saveShopRecord } from "../offline/shopService.js";
import { writeCloudShop } from "../auth/firebaseAuthBridge.js";
import { isActiveProduct } from "../app/mainAppHelpers.js";
import { DEFAULT_BRANCH_TRANSFER_SETTINGS } from "./branchTransferDomain.js";
import { MAIN_BRANCH } from "../reports/groupView.js";
import { branchCompanyShopId } from "./branchCompanyFileIds.js";
import { sanitizeDocumentId } from "./branchTransferDomain.js";
import { seedPremierBranchCoa } from "./branchCoaSeed.js";

const BT_SETTINGS = "branchTransferSettings";
const BT_BRANCHES = "branches";

function settingsDocId(shopId) {
  return `branch-transfer-settings-${sanitizeDocumentId(shopId)}`;
}

async function loadBtSettings(shopId) {
  if (!shopId) return { ...DEFAULT_BRANCH_TRANSFER_SETTINGS };
  const existing = await offlineGetById(BT_SETTINGS, settingsDocId(shopId));
  return { ...DEFAULT_BRANCH_TRANSFER_SETTINGS, ...(existing?.data || {}) };
}

export { branchCompanyShopId };

function pickShopFields(parent) {
  const keep = [
    "country", "countryName", "area", "cur", "currency", "taxMode", "vatRegistered",
    "stockValuationMethod", "fyStartMonth", "chartOfAccounts", "coaGroups", "orderModuleEnabled",
    "invoiceSettings", "printSettings", "loyaltySettings",
  ];
  const out = {};
  keep.forEach((k) => { if (parent?.[k] !== undefined) out[k] = parent[k]; });
  return out;
}

async function seedPartiesFromParent(parentShopId, childShopId, collection, shopKey = "shopId") {
  if (!parentShopId || !childShopId || parentShopId === childShopId) return { count: 0 };
  const rows = await offlineList(collection).catch(() => []);
  const list = (Array.isArray(rows) ? rows : rows?.records || []).map((r) => r?.data || r).filter(Boolean);
  const parentRows = list.filter((p) => p[shopKey] === parentShopId && !p.isDeleted);
  const existingChild = new Set(list.filter((p) => p[shopKey] === childShopId).map((p) => p.id));
  let count = 0;
  const now = new Date().toISOString();
  for (const p of parentRows) {
    if (!p.id || existingChild.has(p.id)) continue;
    const doc = {
      ...p,
      shopId: childShopId,
      seededFromParentShopId: parentShopId,
      seededAt: now,
      updatedAt: now,
    };
    await offlineUpsert(collection, p.id, doc);
    count += 1;
  }
  return { count };
}

async function seedProductsFromParent(parentShopId, childShopId) {
  if (!parentShopId || !childShopId || parentShopId === childShopId) return { count: 0 };
  const rows = await offlineList("products").catch(() => []);
  const list = (Array.isArray(rows) ? rows : []).map((r) => r?.data || r).filter(Boolean);
  const parentRows = list.filter((p) => p.shopId === parentShopId && isActiveProduct(p));
  const existingChild = new Set(list.filter((p) => p.shopId === childShopId).map((p) => p.id));
  let count = 0;
  const now = new Date().toISOString();
  for (const p of parentRows) {
    if (!p.id || existingChild.has(p.id)) continue;
    const doc = {
      ...p,
      shopId: childShopId,
      seededFromParentShopId: parentShopId,
      seededAt: now,
      updatedAt: now,
    };
    await offlineUpsert("products", p.id, doc);
    count += 1;
  }
  return { count };
}

/**
 * Ensure a branch has its own shop record (company file). Returns ledgerShopId.
 */
export async function ensureBranchCompanyFile({ parentShopId, branch, ownerUid = "", ownerName = "" }) {
  if (!parentShopId || !branch?.id) throw new Error("BRANCH_COMPANY_PARENT_REQUIRED");
  const settings = await loadBtSettings(parentShopId);
  if (settings?.companyFilePerBranch === false) {
    return { ledgerShopId: parentShopId, shop: await loadShopRecord(parentShopId), created: false, skipped: true };
  }

  const ledgerShopId = String(branch.ledgerShopId || "").trim() || branchCompanyShopId(parentShopId, branch.id);
  if (!ledgerShopId) throw new Error("BRANCH_COMPANY_ID_FAILED");

  const parentShop = (await loadShopRecord(parentShopId)) || { id: parentShopId, shopId: parentShopId };
  let child = await loadShopRecord(ledgerShopId);
  const created = !child?.isBranchCompanyFile;

  if (!child?.isBranchCompanyFile) {
    const companyName = [String(parentShop.companyName || "").trim(), String(branch.name || branch.code || "").trim()]
      .filter(Boolean)
      .join(" - ");
    child = {
      ...pickShopFields(parentShop),
      id: ledgerShopId,
      shopId: ledgerShopId,
      companyName: companyName || `Branch ${branch.name || branch.id}`,
      ownerName: parentShop.ownerName || ownerName || "",
      ownerUid: parentShop.ownerUid || ownerUid || "",
      parentShopId,
      branchId: branch.id,
      branchCode: String(branch.code || "").trim(),
      branchName: String(branch.name || "").trim(),
      isBranchCompanyFile: true,
      branchTransferSettings: { enabled: false },
      createdAt: new Date().toISOString(),
    };
    await saveShopRecord(ledgerShopId, child);
    try {
      if (typeof navigator !== "undefined" && navigator.onLine) {
        await writeCloudShop(ledgerShopId, child);
      }
    } catch (err) {
      console.warn("[S4 Branch company file] cloud shop write failed", err);
    }
    await seedProductsFromParent(parentShopId, ledgerShopId);
    if (settings?.sharePartiesFromHq !== false) {
      await seedPartiesFromParent(parentShopId, ledgerShopId, "customers");
      await seedPartiesFromParent(parentShopId, ledgerShopId, "vendors");
    }
  }

  if (branch.ledgerShopId !== ledgerShopId) {
    await offlineUpdate(BT_BRANCHES, branch.id, {
      ledgerShopId,
      updatedAt: new Date().toISOString(),
    });
  }

  const coa = await seedPremierBranchCoa({
    parentShopId,
    childShopId: ledgerShopId,
    branchName: branch.name || branch.code || branch.id,
  });
  if (coa?.child) child = coa.child;

  return { ledgerShopId, shop: child, created };
}

export async function resolveBranchLedgerShopId(parentShopId, branch, { ownerUid = "", ownerName = "" } = {}) {
  if (!branch?.id || branch.id === MAIN_BRANCH) return parentShopId;
  const settings = await loadBtSettings(parentShopId);
  if (settings?.companyFilePerBranch === false) return parentShopId;

  let ledgerShopId = String(branch.ledgerShopId || "").trim();
  if (!ledgerShopId) {
    const row = await offlineGetById(BT_BRANCHES, branch.id);
    ledgerShopId = String(row?.data?.ledgerShopId || "").trim();
  }
  if (ledgerShopId) return ledgerShopId;

  const { ledgerShopId: createdId } = await ensureBranchCompanyFile({
    parentShopId,
    branch: { ...branch, ledgerShopId },
    ownerUid,
    ownerName,
  });
  return createdId;
}

export async function listOwnerCompanyFiles(homeShopId) {
  if (!homeShopId) return [];
  const parent = await loadShopRecord(homeShopId);
  const rows = await offlineList(BT_BRANCHES).catch(() => []);
  const branches = (Array.isArray(rows) ? rows : []).map((r) => r?.data || r).filter((b) => b?.shopId === homeShopId && b.active !== false);
  const files = [{
    shopId: homeShopId,
    label: parent?.companyName ? `${parent.companyName} (HQ)` : "HQ (Main)",
    kind: "hq",
    branchId: "",
  }];
  for (const b of branches) {
    const lid = String(b.ledgerShopId || "").trim();
    if (!lid) continue;
    const child = await loadShopRecord(lid);
    files.push({
      shopId: lid,
      label: child?.companyName || b.name || lid,
      kind: "branch",
      branchId: b.id,
      branchCode: b.code || "",
    });
  }
  return files;
}