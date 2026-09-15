import { offlineUpsert, offlineGetById, offlineList } from "../offline/offlineRepository";

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
export async function createStockLedgerEntry({
  productId,
  shopId,
  quantity,
  movementType, // 'purchase', 'sale', 'adjustment', 'transfer_in', 'transfer_out', 'damage', 'return'
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

    // Update stock balance
    await updateStockBalance(productId, shopId, signedQuantity, unitCost);

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

/**
 * Updates stock balance for a product in a shop
 * This is the running total of quantity on hand
 */
async function updateStockBalance(
  productId,
  shopId,
  quantityChange,
  unitCost = 0
) {
  if (!productId || !shopId) return;

  const balanceId = `balance-${productId}-${shopId}`;

  try {
    const existing = await offlineGetById(
      STOCK_COLLECTIONS.STOCK_BALANCES,
      balanceId
    );

    const currentQty = existing?.data?.quantity || 0;
    const currentValue = existing?.data?.totalValue || 0;
    const newQty = currentQty + quantityChange;
    const qtyAbsChange = Math.abs(quantityChange);

    // Calculate weighted average cost
    let waAccost = existing?.data?.weightedAverageCost || 0;
    if (newQty > 0) {
      if (quantityChange > 0) {
        // Inbound: update weighted average
        const inboundValue = qtyAbsChange * unitCost;
        waAccost =
          (currentValue + inboundValue) / (currentQty + quantityChange);
      } else if (currentQty > 0) {
        // Outbound: use existing WAC
        waAccost = existing?.data?.weightedAverageCost || 0;
      }
    }

    const newBalance = {
      id: balanceId,
      productId,
      shopId,
      quantity: Math.max(0, newQty),
      weightedAverageCost: waAccost,
      totalValue: Math.max(0, newQty) * waAccost,
      lastUpdated: new Date().toISOString(),
      _stock_computed: true,
    };

    await offlineUpsert(STOCK_COLLECTIONS.STOCK_BALANCES, balanceId, newBalance);

    console.log(
      `[S4 Stock] Balance updated: product ${productId}, qty: ${Math.max(0, newQty)}`
    );
  } catch (err) {
    console.warn(
      "[S4 Stock] Failed to update stock balance",
      productId,
      err
    );
  }
}

/**
 * Gets current stock balance for a product
 */
export async function getStockBalance(productId, shopId) {
  if (!productId || !shopId) return null;

  const balanceId = `balance-${productId}-${shopId}`;

  try {
    const result = await offlineGetById(
      STOCK_COLLECTIONS.STOCK_BALANCES,
      balanceId
    );

    if (!result?.data) {
      return {
        productId,
        shopId,
        quantity: 0,
        weightedAverageCost: 0,
        totalValue: 0,
      };
    }

    return { ...result.data, id: balanceId };
  } catch (err) {
    console.error(
      "[S4 Stock] Failed to get stock balance",
      productId,
      err
    );
    return null;
  }
}

/**
 * Gets all stock balances for a shop
 */
export async function getShopStockBalances(shopId) {
  if (!shopId) return [];

  try {
    const result = await offlineList(STOCK_COLLECTIONS.STOCK_BALANCES);

    const balances = (result.records || [])
      .filter((rec) => rec.data?.shopId === shopId)
      .map((rec) => ({ ...rec.data, id: rec.document_id }))
      .filter((b) => b.quantity > 0);

    return balances;
  } catch (err) {
    console.error(
      "[S4 Stock] Failed to get shop stock balances",
      shopId,
      err
    );
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
