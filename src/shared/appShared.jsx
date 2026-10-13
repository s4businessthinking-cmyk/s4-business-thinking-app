import { runTransaction, doc } from "../backend/firestore";
import { db } from "../firebase-config";
import { itemBaseQty } from "../inventory/unitConversion";
import { buildStockLedgerEntry, STOCK_COLLECTIONS } from "../inventory/stockManagementService";
import { offlineBulkUpsert } from "../offline/offlineRepository";
import { useRef, useEffect } from "react";

// Invoice statuses that represent stock actually having moved (draft and
// cancelled invoices never touch stock).
export const STOCK_AFFECTING_INVOICE_STATUSES = ["confirmed", "paid", "partial"];

// Lines typed without picking a product (e.g. labour) never move stock, so the user confirms that knowingly.
export function unlinkedStockOk(items, lang) {
  const names = (items || []).filter((it) => !it?.productId && !it?.isService && String(it?.name || "").trim()).map((it) => it.name.trim());
  if (!names.length) return true;
  const list = names.slice(0, 5).join(", ") + (names.length > 5 ? " …" : "");
  return window.confirm(lang === "bn"
    ? `এই আইটেমগুলো Product Master থেকে বাছাই করা হয়নি, তাই স্টকে যোগ/বিয়োগ হবে না:\n${list}\n\nতবুও সেভ করবেন?`
    : `These items were not picked from the Product Master, so stock will not change:\n${list}\n\nSave anyway?`);
}

// Applies the stock-ledger delta between an invoice's previous saved state
// and its new state: reverses the old line items (if the old status had
// already moved stock) and applies the new line items (if the new status
// moves stock). This covers create, edit (items or status changed), and
// cancel in one place — a plain status change with unchanged items nets to
// zero and simply re-records a reversal + re-application, which is fine
// since we skip calling this when items truly didn't change (see call sites).
export async function applyInvoiceStockEffect({
  oldInvoice,
  newInvoice,
  invoiceId,
  applyType,
  reverseType,
  referenceType,
  unitCostKey,
  shopId,
  actor,
}) {
  const oldAffects = oldInvoice && STOCK_AFFECTING_INVOICE_STATUSES.includes(oldInvoice.status);
  const newAffects = newInvoice && STOCK_AFFECTING_INVOICE_STATUSES.includes(newInvoice.status);
  if (!oldAffects && !newAffects) return;
  const sig = (inv) => JSON.stringify((inv?.items || []).map((it) => [it.productId || "", Number(it.qty) || 0, it.unit || "", Number(it.unitFactor) || 1, Number(it[unitCostKey]) || 0]));
  if (oldAffects && newAffects && sig(oldInvoice) === sig(newInvoice)) return;

  const ledgerRows = [];
  const collectLine = (it, movementType) => {
    const qty = itemBaseQty(it);
    if (!it?.productId || qty <= 0) return;
    const factor = Number(it.unitFactor) > 0 ? Number(it.unitFactor) : 1;
    try {
      ledgerRows.push(buildStockLedgerEntry({
        productId: it.productId,
        shopId,
        quantity: qty,
        movementType,
        referenceType,
        referenceId: invoiceId,
        unitCost: (Number(it[unitCostKey]) || 0) / factor,
        actor,
      }));
    } catch (err) {
      console.warn(`[S4 Stock] ${movementType} ledger entry failed`, it.productId, err);
    }
  };

  if (oldAffects) {
    for (const it of (oldInvoice.items || [])) collectLine(it, reverseType);
  }
  if (newAffects) {
    for (const it of (newInvoice.items || [])) collectLine(it, applyType);
  }
  if (!ledgerRows.length) return;
  await offlineBulkUpsert(STOCK_COLLECTIONS.STOCK_LEDGER, ledgerRows, { skipPersist: true });
}

export const DEFAULT_PERMISSIONS = {
  sendOrder: true,
  manageCompanies: false,
  setPrices: false,
  setStatus: false,
  markDelivery: false,
  deleteOrder: false,
  viewProducts: true,
  manageProducts: false,
  manageSales: true,
  manageCustomers: true,

  viewVendors: false,
  viewSupplierLedger: false,
  vendorPayments: false,
  managePurchase: false,
  managePdc: false,
  manageExpenses: false,
  sendBranchTransfer: false,
  receiveBranchTransfer: false,
  printCheques: false,
  viewCustomerBalance: false,
  giveDiscount: false,
  cancelInvoices: false,
  manageVendors: false,
  manageReturns: false,
  stockAdjust: false,
  accountVouchers: false,
  manageEmployees: false,
  bankReconcile: false,
  manageJobs: false,
};

// Methods for the Vendor Payment Voucher system — cash & cheque only, as requested
export const PI_VOUCHER_METHODS = {
  cash:   { bn:"নগদ", en:"Cash",   icon:"💵" },
  cheque: { bn:"চেক",  en:"Cheque", icon:"📃" },
  bank_transfer: { bn:"ব্যাংক ট্রান্সফার", en:"Bank Transfer", icon:"🏦" },
  card:   { bn:"কার্ড", en:"Card", icon:"💳" },
};

export const piR2       = (n) => Math.round(((parseFloat(n)||0)+Number.EPSILON)*100)/100;

export const piFmt2     = (n) => piR2(n).toFixed(2);

export const piN2       = (v) => parseFloat(String(v??"").replace(/,/g,""))||0;

// ─── GLOBAL SEARCH NORMALIZER ─────────────────────────────────
// . - / \ space _ সরিয়ে lowercase করে — code search এর জন্য
export const nsq = (str) => String(str||"").replace(/[\.\-\/\\\s_,]+/g,"").toLowerCase();

export const nsmatch = (haystack, needle) => {
  if (!needle) return true;
  const n = nsq(needle);
  // exact normalized match
  if (nsq(haystack).includes(n)) return true;
  // also try word-by-word raw lowercase match
  return haystack.toLowerCase().includes(needle.toLowerCase());
};

// ─── AUTO-RESIZE TEXTAREA ────────────────────────────────────
export function AutoTA({ style, ...props }) {
  const ref = useRef(null);
  const resize = () => {
    if (!ref.current) return;
    ref.current.style.height = "auto";
    ref.current.style.height = ref.current.scrollHeight + "px";
  };
  useEffect(()=>{ resize(); },[props.value]);
  return <textarea ref={ref} style={{ resize:"none", overflow:"hidden", ...style }} onInput={resize} {...props} />;
}

export const toVoucherView = (v, kind) => ({
  id:v.id, no:kind==="receipt" ? v.receiptNo : v.paymentNo, date:kind==="receipt" ? v.receiptDate : v.paymentDate,
  partyName:kind==="receipt" ? v.customerName : v.vendorName, method:v.method, totalAmount:v.totalAmount, status:v.status,
  chequeNo:v.chequeNo, chequeBank:v.chequeBank, chequeDate:v.chequeDate, chequeStatus:v.chequeStatus, note:v.note,
  refNo:v.refNo, refBank:v.refBank, refDate:v.refDate,
  chequeReceivedBy:v.chequeReceivedBy, vendorReceiptNo:v.vendorReceiptNo,
  collectedByName:v.collectedByName, allocations:v.allocations||[], raw:v,
});

// Party list for the voucher window: master records plus names that only appear on open bills.
export function voucherParties(masters, openInvoices, idKey, nameKey, masterName, masterMobile) {
  const pending = new Map();
  openInvoices.forEach(inv => {
    const k = inv[idKey] ? `i:${inv[idKey]}` : `n:${String(inv[nameKey]||"").trim()}`;
    pending.set(k, (pending.get(k)||0) + (parseFloat(inv.balanceDue)||0));
  });
  const rows = (masters||[]).filter(m=>m&&!m.isDeleted&&!m.deleted).map(m => ({ key:`i:${m.id}`, id:m.id, name:masterName(m)||"", mobile:masterMobile(m)||"", pending:pending.get(`i:${m.id}`)||0 }));
  const seen = new Set(rows.map(r=>r.key));
  openInvoices.forEach(inv => {
    if (inv[idKey]) return;
    const name = String(inv[nameKey]||"").trim();
    const k = `n:${name}`;
    if (!name || seen.has(k)) return;
    seen.add(k);
    rows.push({ key:k, id:null, name, mobile:"", pending:pending.get(k)||0 });
  });
  return rows.sort((a,b)=>(b.pending>0)-(a.pending>0) || a.name.localeCompare(b.name));
}

// ─── PI: MAIN PURCHASE INVOICE TAB ────────────────────────────
// Takes the next shop-wide serial in one server transaction so two devices never hand out the
// same bill number. Returns null when offline or the server does not answer in time.
// Reserves `count` consecutive numbers and returns the first one.
export async function reserveShopSerial(shopId, field, localMax, count = 1) {
  if (!shopId || !navigator.onLine) return null;
  const tx = runTransaction(db, async t => {
    const ref = doc(db, "shops", shopId);
    const snap = await t.get(ref);
    const next = Math.max(Number(snap.data()?.[field] || 0), Number(localMax) || 0) + 1;
    t.update(ref, { [field]: next + count - 1 });
    return next;
  });
  const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error("serial reservation timed out")), 6000));
  try {
    return await Promise.race([tx, timeout]);
  } catch (err) {
    console.warn(`[S4] ${field} reservation failed, using an offline number`, err);
    return null;
  }
}

// Offline staff numbers carry this device's tag (e.g. SI-0046-KQ) so phones offline at the same time can't clash.
export function deviceSerialTag() {
  try {
    let tag = localStorage.getItem("s4_device_serial_tag");
    if (!/^[A-Z]{2}$/.test(tag || "")) {
      const A = "ABCDEFGHJKLMNPQRSTUVWXYZ";
      tag = A[Math.floor(Math.random()*A.length)] + A[Math.floor(Math.random()*A.length)];
      localStorage.setItem("s4_device_serial_tag", tag);
    }
    return tag;
  } catch { return "XX"; }
}

export const PARTY_CODE = {
  vendors:   { prefix:"V", field:"vendorCode",   serial:"lastVendorCode" },
  customers: { prefix:"C", field:"customerCode", serial:"lastCustomerCode" },
};

export function partyCodeNumber(kind, code) {
  const m = String(code || "").match(new RegExp(`^${PARTY_CODE[kind].prefix}-(\\d+)`, "i"));
  return m ? Number(m[1]) : 0;
}

export function formatPartyCode(kind, n, tag = "") {
  return `${PARTY_CODE[kind].prefix}-${String(n).padStart(4, "0")}${tag ? `-${tag}` : ""}`;
}

// Next vendor/customer code (V-0001 / C-0001). Offline codes carry the device tag so they can't clash.
export async function nextPartyCode(shopId, kind, records = []) {
  const { field, serial } = PARTY_CODE[kind];
  const localMax = records.reduce((m, r) => Math.max(m, partyCodeNumber(kind, r?.[field])), 0);
  const n = await reserveShopSerial(shopId, serial, localMax);
  return n ? formatPartyCode(kind, n) : formatPartyCode(kind, localMax + 1, deviceSerialTag());
}

// The open sales/purchase bill form registers here so tab switches and the phone back
// button ask before discarding it. leave(): ok to navigate away; back(): handled the back.
export const billLeaveGuard = { current: null };

// ─── PURCHASE INVOICE — CONSTANTS ────────────────────────────
export const PI_PREFIX       = "PI-";
