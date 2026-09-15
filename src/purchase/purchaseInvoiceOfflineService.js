import { offlineUpsert, offlineGetById, offlineList } from "../offline/offlineRepository";
import { isOnline } from "../auth/firebaseAuthBridge";

/**
 * Collection name constants for purchase invoices and related data
 */
export const PURCHASE_INVOICE_COLLECTIONS = {
  PURCHASE_INVOICES: "purchase_invoices",
  PURCHASE_INVOICE_ITEMS: "purchase_invoice_items",
  PURCHASE_INVOICE_PAYMENTS: "purchase_invoice_payments",
  PURCHASE_INVOICE_SYNC_QUEUE: "purchase_invoice_sync_queue",
};

/**
 * Validates purchase invoice data before saving
 */
function validatePurchaseInvoice(invoice) {
  if (!invoice?.id) throw new Error("Invoice ID is required");
  if (!invoice?.shopId) throw new Error("Shop ID is required");
  if (!invoice?.vendorName && !invoice?.supplierName) {
    throw new Error("Vendor/Supplier name is required");
  }
  if (!Array.isArray(invoice?.items) || invoice.items.length === 0) {
    throw new Error("At least one invoice item is required");
  }

  // Validate invoice items
  for (const item of invoice.items) {
    if (!item.name) throw new Error(`Item missing name`);
    if (item.qty <= 0) throw new Error(`Item quantity must be positive`);
    if (item.unitCost < 0) throw new Error(`Item unit cost cannot be negative`);
  }

  if (invoice.grandTotal <= 0) throw new Error("Invoice total must be positive");
  return true;
}

/**
 * Calculates invoice totals from line items
 */
function calculateInvoiceTotals(items = []) {
  let subtotal = 0;
  let totalDiscount = 0;
  let totalTax = 0;

  for (const item of items) {
    const qty = Number(item.qty) || 0;
    const unitCost = Number(item.unitCost) || 0;
    const discountPerc = Number(item.discountPerc) || 0;
    const taxPerc = Number(item.taxPerc) || 0;

    const lineSubtotal = qty * unitCost;
    const lineDiscount = (lineSubtotal * discountPerc) / 100;
    const lineBeforeTax = lineSubtotal - lineDiscount;
    const lineTax = (lineBeforeTax * taxPerc) / 100;

    subtotal += lineSubtotal;
    totalDiscount += lineDiscount;
    totalTax += lineTax;
  }

  const grandTotal = subtotal - totalDiscount + totalTax;

  return {
    subtotal: Math.round(subtotal * 100) / 100,
    totalDiscount: Math.round(totalDiscount * 100) / 100,
    totalTax: Math.round(totalTax * 100) / 100,
    grandTotal: Math.round(grandTotal * 100) / 100,
  };
}

/**
 * Creates or updates a purchase invoice in offline-first storage.
 * Data is saved locally first, then synced to cloud when online.
 */
export async function createPurchaseInvoiceOffline({
  invoiceData,
  shopId,
  actor,
} = {}) {
  if (!shopId) throw new Error("Shop ID is required");
  if (!invoiceData?.id) throw new Error("Invoice data with ID is required");

  const invoiceId = invoiceData.id;

  // Validate invoice before saving
  try {
    validatePurchaseInvoice(invoiceData);
  } catch (err) {
    console.error("[S4 Purchase] Invoice validation failed", err);
    throw err;
  }

  // Recalculate totals to ensure accuracy
  const totals = calculateInvoiceTotals(invoiceData.items);
  const normalizedInvoice = {
    ...invoiceData,
    id: invoiceId,
    shopId,
    ...totals,
    status: invoiceData.status || "confirmed",
    createdBy: actor?.uid || actor?.id || "",
    createdByName: actor?.personName || actor?.displayName || "",
    createdAt: invoiceData.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    _offline_first: true,
    _sync_status: "pending",
  };

  try {
    // Save to offline storage
    const result = await offlineUpsert(
      PURCHASE_INVOICE_COLLECTIONS.PURCHASE_INVOICES,
      invoiceId,
      normalizedInvoice
    );

    if (!result?.ok) {
      throw new Error(
        `Failed to save invoice offline: ${result?.error || "unknown error"}`
      );
    }

    console.log(
      "[S4 Purchase] Invoice saved to offline storage",
      invoiceId
    );

    // Queue for cloud sync
    await queueInvoiceForSync(invoiceId, normalizedInvoice);

    return {
      ok: true,
      invoiceId,
      syncStatus: isOnline() ? "syncing" : "queued",
      message: isOnline()
        ? "Invoice saved and syncing to cloud"
        : "Invoice saved offline - will sync when online",
    };
  } catch (err) {
    console.error(
      "[S4 Purchase] Failed to create invoice offline",
      invoiceId,
      err
    );
    throw err;
  }
}

/**
 * Queues purchase invoice for cloud sync
 */
async function queueInvoiceForSync(invoiceId, invoiceData) {
  try {
    const queueItem = {
      id: `sync-${invoiceId}-${Date.now()}`,
      invoiceId,
      status: "pending",
      queuedAt: new Date().toISOString(),
      retries: 0,
    };

    await offlineUpsert(
      PURCHASE_INVOICE_COLLECTIONS.PURCHASE_INVOICE_SYNC_QUEUE,
      queueItem.id,
      queueItem
    );

    console.log(
      "[S4 Purchase] Invoice queued for sync",
      invoiceId
    );
  } catch (err) {
    console.warn(
      "[S4 Purchase] Failed to queue invoice for sync",
      invoiceId,
      err
    );
  }
}

/**
 * Retrieves a purchase invoice from offline storage
 */
export async function getPurchaseInvoiceOffline(invoiceId) {
  if (!invoiceId) throw new Error("Invoice ID is required");

  try {
    const result = await offlineGetById(
      PURCHASE_INVOICE_COLLECTIONS.PURCHASE_INVOICES,
      invoiceId
    );

    if (!result?.data) return null;
    return { ...result.data, id: invoiceId };
  } catch (err) {
    console.error(
      "[S4 Purchase] Failed to retrieve invoice from offline storage",
      invoiceId,
      err
    );
    throw err;
  }
}

/**
 * Lists all purchase invoices for a shop from offline storage
 */
export async function listShopPurchaseInvoicesOffline(shopId) {
  if (!shopId) throw new Error("Shop ID is required");

  try {
    const result = await offlineList(
      PURCHASE_INVOICE_COLLECTIONS.PURCHASE_INVOICES
    );

    const invoices = (result.records || [])
      .filter((rec) => rec.data?.shopId === shopId)
      .map((rec) => ({ ...rec.data, id: rec.document_id }))
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );

    return invoices;
  } catch (err) {
    console.error(
      "[S4 Purchase] Failed to list invoices from offline storage",
      shopId,
      err
    );
    throw err;
  }
}

/**
 * Gets pending invoices that need to be synced to cloud
 */
export async function getPendingSyncInvoices() {
  try {
    const result = await offlineList(
      PURCHASE_INVOICE_COLLECTIONS.PURCHASE_INVOICE_SYNC_QUEUE
    );

    const pending = (result.records || [])
      .filter((rec) => rec.data?.status === "pending" && rec.data?.retries < 3)
      .map((rec) => ({ ...rec.data, id: rec.document_id }));

    return pending;
  } catch (err) {
    console.error(
      "[S4 Purchase] Failed to get pending sync invoices",
      err
    );
    return [];
  }
}

/**
 * Marks invoice as synced successfully
 */
export async function markInvoiceSynced(invoiceId, queueItemId) {
  try {
    await offlineUpsert(
      PURCHASE_INVOICE_COLLECTIONS.PURCHASE_INVOICES,
      invoiceId,
      {
        _sync_status: "synced",
        _synced_at: new Date().toISOString(),
      }
    );

    if (queueItemId) {
      await offlineUpsert(
        PURCHASE_INVOICE_COLLECTIONS.PURCHASE_INVOICE_SYNC_QUEUE,
        queueItemId,
        {
          status: "synced",
          syncedAt: new Date().toISOString(),
        }
      );
    }

    console.log("[S4 Purchase] Invoice marked as synced", invoiceId);
  } catch (err) {
    console.warn(
      "[S4 Purchase] Failed to mark invoice as synced",
      invoiceId,
      err
    );
  }
}

/**
 * Marks invoice sync as failed (increments retry count)
 */
export async function markInvoiceSyncFailed(invoiceId, queueItemId, error) {
  try {
    if (queueItemId) {
      const item = await offlineGetById(
        PURCHASE_INVOICE_COLLECTIONS.PURCHASE_INVOICE_SYNC_QUEUE,
        queueItemId
      );

      const retries = (item?.data?.retries || 0) + 1;
      const status = retries >= 3 ? "failed" : "pending";

      await offlineUpsert(
        PURCHASE_INVOICE_COLLECTIONS.PURCHASE_INVOICE_SYNC_QUEUE,
        queueItemId,
        {
          status,
          retries,
          lastError: String(error),
          lastRetryAt: new Date().toISOString(),
        }
      );
    }

    console.warn(
      "[S4 Purchase] Invoice sync failed, queued for retry",
      invoiceId,
      error
    );
  } catch (err) {
    console.error(
      "[S4 Purchase] Failed to mark invoice sync as failed",
      invoiceId,
      err
    );
  }
}
