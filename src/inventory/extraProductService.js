import { offlineUpsert, offlineGetById, offlineList } from "../offline/offlineRepository";

/**
 * Collection names for extra/pending products
 */
export const EXTRA_PRODUCT_COLLECTIONS = {
  EXTRA_PRODUCTS: "extra_products",
  PRODUCT_APPROVAL_QUEUE: "product_approval_queue",
};

/**
 * Product status constants
 */
export const EXTRA_PRODUCT_STATUS = {
  PENDING: "pending",
  APPROVED: "approved",
  REJECTED: "rejected",
  MERGED: "merged", // Merged into master
};

/**
 * Creates an extra/pending product when a custom product is added during entry
 * that is not in the main Product Master
 */
export async function createExtraProduct({
  name,
  code,
  brand,
  unit,
  category,
  description,
  salePrice,
  purchasePrice,
  shopId,
  actor,
  sourceDocument, // Where it was created from (e.g., 'sales_invoice', 'purchase_invoice')
  sourceDocumentId,
} = {}) {
  if (!name) throw new Error("Product name is required");
  if (!shopId) throw new Error("Shop ID is required");

  const productId = `extra-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const now = new Date().toISOString();

  const product = {
    id: productId,
    name: String(name).trim(),
    code: String(code || "").trim(),
    brand: String(brand || "").trim(),
    unit: String(unit || "Pcs").trim(),
    category: String(category || "").trim(),
    description: String(description || "").trim(),
    salePrice: Number(salePrice) || 0,
    purchasePrice: Number(purchasePrice) || 0,
    shopId,
    status: EXTRA_PRODUCT_STATUS.PENDING,
    source: {
      documentType: sourceDocument || "manual",
      documentId: sourceDocumentId || "",
      createdBy: actor?.uid || actor?.id || "",
      createdByName: actor?.personName || actor?.displayName || "",
    },
    createdAt: now,
    updatedAt: now,
    approvalNotes: "",
    reviewedBy: "",
    reviewedAt: null,
    _offline_first: true,
  };

  try {
    const result = await offlineUpsert(
      EXTRA_PRODUCT_COLLECTIONS.EXTRA_PRODUCTS,
      productId,
      product
    );

    if (!result?.ok) {
      throw new Error(
        `Failed to create extra product: ${result?.error || "unknown error"}`
      );
    }

    // Queue for approval
    await queueProductForApproval(productId, product);

    console.log(
      "[S4 Product] Extra product created and queued for approval",
      productId
    );

    return {
      ok: true,
      productId,
      status: EXTRA_PRODUCT_STATUS.PENDING,
      message: `Product "${name}" created as pending. Review in the Product Approval section.`,
    };
  } catch (err) {
    console.error(
      "[S4 Product] Failed to create extra product",
      name,
      err
    );
    throw err;
  }
}

/**
 * Queues a product for approval review
 */
async function queueProductForApproval(productId, productData) {
  try {
    const queueItemId = `approval-${productId}-${Date.now()}`;

    const queueItem = {
      id: queueItemId,
      productId,
      productName: productData.name,
      status: "pending_review",
      queuedAt: new Date().toISOString(),
      priority: "normal",
    };

    await offlineUpsert(
      EXTRA_PRODUCT_COLLECTIONS.PRODUCT_APPROVAL_QUEUE,
      queueItemId,
      queueItem
    );

    console.log(
      "[S4 Product] Product queued for approval",
      productId
    );
  } catch (err) {
    console.warn(
      "[S4 Product] Failed to queue product for approval",
      productId,
      err
    );
  }
}

/**
 * Gets all extra products for a shop
 */
export async function getShopExtraProducts(
  shopId,
  status = EXTRA_PRODUCT_STATUS.PENDING
) {
  if (!shopId) throw new Error("Shop ID is required");

  try {
    const result = await offlineList(
      EXTRA_PRODUCT_COLLECTIONS.EXTRA_PRODUCTS
    );

    const products = (result.records || [])
      .filter(
        (rec) => rec.data?.shopId === shopId && (!status || rec.data?.status === status)
      )
      .map((rec) => ({ ...rec.data, id: rec.document_id }))
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );

    return products;
  } catch (err) {
    console.error(
      "[S4 Product] Failed to get extra products for shop",
      shopId,
      err
    );
    return [];
  }
}

/**
 * Gets a single extra product
 */
export async function getExtraProduct(productId) {
  if (!productId) throw new Error("Product ID is required");

  try {
    const result = await offlineGetById(
      EXTRA_PRODUCT_COLLECTIONS.EXTRA_PRODUCTS,
      productId
    );

    if (!result?.data) return null;
    return { ...result.data, id: productId };
  } catch (err) {
    console.error(
      "[S4 Product] Failed to get extra product",
      productId,
      err
    );
    return null;
  }
}

/**
 * Gets products pending approval for a shop
 */
export async function getShopPendingApprovalProducts(shopId) {
  return getShopExtraProducts(shopId, EXTRA_PRODUCT_STATUS.PENDING);
}

/**
 * Approves an extra product and marks it for import into Product Master
 * In production, this would trigger the main product creation flow
 */
export async function approveExtraProduct(productId, {
  approverUid,
  approverName,
  notes = "",
} = {}) {
  if (!productId) throw new Error("Product ID is required");
  if (!approverUid) throw new Error("Approver UID is required");

  try {
    const product = await getExtraProduct(productId);
    if (!product) throw new Error("Product not found");

    const now = new Date().toISOString();

    // Update product status
    await offlineUpsert(
      EXTRA_PRODUCT_COLLECTIONS.EXTRA_PRODUCTS,
      productId,
      {
        status: EXTRA_PRODUCT_STATUS.APPROVED,
        approvalNotes: notes,
        reviewedBy: approverUid,
        reviewedByName: approverName,
        reviewedAt: now,
        updatedAt: now,
      }
    );

    // Mark queue item as approved
    const queueItems = await offlineList(
      EXTRA_PRODUCT_COLLECTIONS.PRODUCT_APPROVAL_QUEUE
    );
    const queueItem = (queueItems.records || []).find(
      (rec) => rec.data?.productId === productId
    );

    if (queueItem) {
      await offlineUpsert(
        EXTRA_PRODUCT_COLLECTIONS.PRODUCT_APPROVAL_QUEUE,
        queueItem.document_id,
        {
          status: "approved",
          approvedAt: now,
          approvedBy: approverUid,
        }
      );
    }

    console.log(
      "[S4 Product] Product approved for import to master",
      productId
    );

    return {
      ok: true,
      productId,
      status: EXTRA_PRODUCT_STATUS.APPROVED,
      message: `Product "${product.name}" approved. It will be added to the main Product Master.`,
    };
  } catch (err) {
    console.error(
      "[S4 Product] Failed to approve extra product",
      productId,
      err
    );
    throw err;
  }
}

/**
 * Rejects an extra product
 */
export async function rejectExtraProduct(productId, {
  rejectorUid,
  rejectorName,
  reason = "",
} = {}) {
  if (!productId) throw new Error("Product ID is required");
  if (!rejectorUid) throw new Error("Rejector UID is required");
  if (!reason) throw new Error("Rejection reason is required");

  try {
    const product = await getExtraProduct(productId);
    if (!product) throw new Error("Product not found");

    const now = new Date().toISOString();

    // Update product status
    await offlineUpsert(
      EXTRA_PRODUCT_COLLECTIONS.EXTRA_PRODUCTS,
      productId,
      {
        status: EXTRA_PRODUCT_STATUS.REJECTED,
        approvalNotes: reason,
        reviewedBy: rejectorUid,
        reviewedByName: rejectorName,
        reviewedAt: now,
        updatedAt: now,
      }
    );

    // Mark queue item as rejected
    const queueItems = await offlineList(
      EXTRA_PRODUCT_COLLECTIONS.PRODUCT_APPROVAL_QUEUE
    );
    const queueItem = (queueItems.records || []).find(
      (rec) => rec.data?.productId === productId
    );

    if (queueItem) {
      await offlineUpsert(
        EXTRA_PRODUCT_COLLECTIONS.PRODUCT_APPROVAL_QUEUE,
        queueItem.document_id,
        {
          status: "rejected",
          rejectedAt: now,
          rejectedBy: rejectorUid,
          reason,
        }
      );
    }

    console.log(
      "[S4 Product] Product rejected",
      productId
    );

    return {
      ok: true,
      productId,
      status: EXTRA_PRODUCT_STATUS.REJECTED,
      message: `Product "${product.name}" rejected. Reason: ${reason}`,
    };
  } catch (err) {
    console.error(
      "[S4 Product] Failed to reject extra product",
      productId,
      err
    );
    throw err;
  }
}

/**
 * Gets approval statistics for a shop
 */
export async function getApprovalStats(shopId) {
  if (!shopId) return null;

  try {
    const products = await getShopExtraProducts(shopId);

    return {
      total: products.length,
      pending: products.filter(
        (p) => p.status === EXTRA_PRODUCT_STATUS.PENDING
      ).length,
      approved: products.filter(
        (p) => p.status === EXTRA_PRODUCT_STATUS.APPROVED
      ).length,
      rejected: products.filter(
        (p) => p.status === EXTRA_PRODUCT_STATUS.REJECTED
      ).length,
      merged: products.filter(
        (p) => p.status === EXTRA_PRODUCT_STATUS.MERGED
      ).length,
    };
  } catch (err) {
    console.error(
      "[S4 Product] Failed to get approval stats",
      shopId,
      err
    );
    return null;
  }
}
