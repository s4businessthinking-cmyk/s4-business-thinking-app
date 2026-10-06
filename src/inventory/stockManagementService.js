import { offlineUpsert, offlineList } from "../offline/offlineRepository";

/**
 * Collection names for stock management
 */
export const STOCK_COLLECTIONS = {
  STOCK_LEDGER: "stock_ledger",
  STOCK_BALANCES: "stock_balances",
};

/**
 * Creates a stock ledger entry for purchases or sales
 * Automatically increases stock on purchase, decreases on sale
 */
export async function createStockLedgerEntry(params = {}) {
  const entry = buildStockLedgerEntry(params);
  const { productId, movementType } = params;
  const entryId = entry.id;
  const signedQuantity = entry.quantity;

  try {
    const result = await offlineUpsert(
      STOCK_COLLECTIONS.STOCK_LEDGER,
      entryId,
      entry
    );

    if (!result?.ok) {
      throw new Error(
        `Failed to create stock ledger entry: ${result?.error || "unknown error"}`
      );
    }

    console.log(
      `[S4 Stock] Ledger entry created: ${movementType} +${signedQuantity} of product ${productId}`
    );

    return {
      ok: true,
      entryId,
      quantity: signedQuantity,
    };
  } catch (err) {
    console.error(
      "[S4 Stock] Failed to create stock ledger entry",
      productId,
      err
    );
    throw err;
  }
}

// Validates and builds a ledger row without saving it (bulk callers save many at once).
export function buildStockLedgerEntry({
  productId,
  shopId,
  quantity,
  movementType, // 'opening', 'purchase', 'sale', 'adjustment', 'transfer_in', 'transfer_out', 'damage', 'return'
  referenceType, // 'purchase_invoice', 'sales_invoice', 'branch_transfer', 'stock_adjustment'
  referenceId,
  unitCost = 0,
  actor,
} = {}) {
  if (!productId) throw new Error("Product ID is required");
  if (!shopId) throw new Error("Shop ID is required");
  if (!quantity || quantity === 0) throw new Error("Quantity must be non-zero");
  if (!movementType) throw new Error("Movement type is required");

  const entryId = `ledger-${productId}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const now = new Date().toISOString();

  // Determine sign based on movement type
  const signedQuantity = [
    "opening",
    "purchase",
    "transfer_in",
    "return",
  ].includes(movementType)
    ? Math.abs(quantity)
    : -Math.abs(quantity);

  const entry = {
    id: entryId,
    productId,
    shopId,
    quantity: signedQuantity,
    movementType,
    referenceType,
    referenceId: referenceId || "",
    unitCost: Math.abs(unitCost),
    valuedMovement: Math.abs(signedQuantity * (unitCost || 0)),
    actor: actor?.uid || actor?.id || "",
    actorName: actor?.personName || actor?.displayName || "",
    createdAt: now,
    _offline_first: true,
  };

  return entry;
}

/**
 * Balances are always derived from the ledger. The ledger syncs across devices
 * (append-only, one document per movement), while a stored running balance would
 * be overwritten by whichever device wrote last.
 */
function summarizeLedger(entries) {
  const byProduct = new Map();
  [...entries]
    .sort((a, b) => String(a.createdAt || "").localeCompare(String(b.createdAt || "")))
    .forEach((entry) => {
      const qty = Number(entry.quantity) || 0;
      if (!entry.productId || !qty) return;
      const cur = byProduct.get(entry.productId) || {
        productId: entry.productId,
        shopId: entry.shopId,
        quantity: 0,
        weightedAverageCost: 0,
      };
      const isPurchaseReversal = qty < 0 && entry.movementType === "adjustment" && entry.referenceType === "purchase_invoice";
      if (qty > 0 && Number(entry.unitCost) > 0 && entry.movementType !== "return") {
        const held = Math.max(cur.quantity, 0);
        cur.weightedAverageCost =
          (held * cur.weightedAverageCost + qty * Number(entry.unitCost)) / (held + qty);
      } else if (isPurchaseReversal && Number(entry.unitCost) > 0) {
        const held = Math.max(cur.quantity, 0);
        const left = held + qty;
        if (left > 1e-9) {
          cur.weightedAverageCost = Math.max(0, (held * cur.weightedAverageCost + qty * Number(entry.unitCost)) / left);
        }
      }
      cur.quantity += qty;
      byProduct.set(entry.productId, cur);
    });
  byProduct.forEach((b) => {
    b.quantity = parseFloat(b.quantity.toFixed(4));
    b.totalValue = Math.max(0, b.quantity) * b.weightedAverageCost;
  });
  return byProduct;
}

async function listShopLedger(shopId) {
  const result = await offlineList(STOCK_COLLECTIONS.STOCK_LEDGER);
  return (result.records || [])
    .map((rec) => ({ ...rec.data, id: rec.document_id }))
    .filter((entry) => entry.shopId === shopId);
}

/**
 * Gets current stock balance for a product
 */
export async function getStockBalance(productId, shopId) {
  if (!productId || !shopId) return null;

  try {
    const entries = (await listShopLedger(shopId)).filter((e) => e.productId === productId);
    const balance = summarizeLedger(entries).get(productId);
    return {
      productId,
      shopId,
      quantity: 0,
      weightedAverageCost: 0,
      totalValue: 0,
      ...(balance || {}),
      id: `balance-${productId}-${shopId}`,
    };
  } catch (err) {
    console.error("[S4 Stock] Failed to get stock balance", productId, err);
    return null;
  }
}

/**
 * Gets all stock balances for a shop
 */
export async function getShopStockBalances(shopId) {
  if (!shopId) return [];

  try {
    const balances = summarizeLedger(await listShopLedger(shopId));
    return [...balances.values()]
      .filter((b) => b.quantity > 0)
      .map((b) => ({ ...b, id: `balance-${b.productId}-${shopId}` }));
  } catch (err) {
    console.error("[S4 Stock] Failed to get shop stock balances", shopId, err);
    return [];
  }
}


/**
 * Gets stock ledger history for a product
 */
export async function getProductStockLedger(productId, shopId, limit = 50) {
  if (!productId || !shopId) return [];

  try {
    const result = await offlineList(STOCK_COLLECTIONS.STOCK_LEDGER);

    const ledger = (result.records || [])
      .filter(
        (rec) => rec.data?.productId === productId && rec.data?.shopId === shopId
      )
      .map((rec) => ({ ...rec.data, id: rec.document_id }))
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      )
      .slice(0, limit);

    return ledger;
  } catch (err) {
    console.error(
      "[S4 Stock] Failed to get product stock ledger",
      productId,
      err
    );
    return [];
  }
}

/**
 * Checks if there is sufficient stock for a sale/transfer
 */
export async function hasSufficientStock(productId, shopId, requiredQty) {
  const balance = await getStockBalance(productId, shopId);
  return balance && balance.quantity >= requiredQty;
}

/**
 * Validates stock availability before creating sale
 * Throws error if insufficient stock
 */
export async function validateStockAvailability(items = [], shopId) {
  if (!Array.isArray(items) || !shopId) {
    throw new Error("Items and shop ID are required");
  }

  const insufficient = [];

  for (const item of items) {
    const required = Number(item.qty) || 0;
    if (required <= 0) continue;

    const hasSufficent = await hasSufficientStock(
      item.productId,
      shopId,
      required
    );
    if (!hasSufficent) {
      insufficient.push({
        productId: item.productId,
        productName: item.name || "Unknown",
        required,
      });
    }
  }

  if (insufficient.length > 0) {
    const msg = insufficient
      .map((i) => `${i.productName}: need ${i.required}, not available`)
      .join("; ");
    throw new Error(`Insufficient stock: ${msg}`);
  }
}
