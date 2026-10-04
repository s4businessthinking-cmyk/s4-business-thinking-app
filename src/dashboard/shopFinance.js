// Live money figures for the owner dashboard: sales, collections, customer
// credit (receivable), supplier credit (payable) and pending cheques.
import { useEffect, useState } from "react";
import { collection, onSnapshot, query, where } from "../backend/firestore.js";
import { db } from "../firebase-config";
import { offlineList } from "../offline/offlineRepository";
import { SYNC_QUEUED_EVENT } from "../offline/sqliteDb";

export const FINANCE_COLLECTIONS = ["salesInvoices", "salesReceipts", "purchaseInvoices", "purchasePayments", "expenses"];

const n2 = (v) => parseFloat(v) || 0;
const day = (v) => String(v || "").slice(0, 10);
const partyKey = (id, name) => id || `n:${String(name || "").trim().toLowerCase()}`;

export function localDateString(date = new Date()) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

// Quotations, delivery notes, drafts and cancelled bills carry no money.
const isLiveBill = (inv) =>
  inv && !inv.docKind && inv.invoiceType !== "delivery" && !["cancelled", "draft", "open", "converted", "invoiced"].includes(inv.status);
const isLiveVoucher = (v) => v && v.status !== "cancelled";
const isPendingCheque = (v) => isLiveVoucher(v) && v.method === "cheque" && (v.chequeStatus || "pending") === "pending";

function sumDue(bills, idField, nameField) {
  const parties = new Set();
  let amount = 0;
  for (const inv of bills) {
    const due = n2(inv.balanceDue);
    if (due < 0.01) continue;
    amount += due;
    parties.add(partyKey(inv[idField], inv[nameField]));
  }
  return { amount, parties: parties.size };
}

function sumCheques(vouchers, dateField, today) {
  const month = today.slice(0, 7);
  let amount = 0;
  let count = 0;
  let dueNow = 0;
  let monthAmount = 0;
  let monthCount = 0;
  for (const v of vouchers) {
    if (!isPendingCheque(v)) continue;
    amount += n2(v.totalAmount);
    count += 1;
    const chequeDay = day(v.chequeDate || v[dateField]);
    if (chequeDay && chequeDay <= today) dueNow += 1;
    if (chequeDay.startsWith(month)) {
      monthAmount += n2(v.totalAmount);
      monthCount += 1;
    }
  }
  return { amount, count, dueNow, monthAmount, monthCount };
}

const daysBetween = (fromDay, toDay) => Math.round((Date.parse(`${toDay}T00:00:00Z`) - Date.parse(`${fromDay}T00:00:00Z`)) / 86400000);

// Every pending cheque: received from customers, issued to vendors, and
// expenses paid by cheque. daysLate > 0 is overdue, daysLate < 0 is upcoming.
export function listPendingCheques({ salesReceipts = [], purchasePayments = [], expenses = [] }, today = localDateString()) {
  const rows = [];
  const add = (type, list, noField, dateField, partyOf, amountField = "totalAmount") => {
    for (const v of list) {
      if (!v || v.isDeleted || !isPendingCheque(v)) continue;
      if (type === "expense" && !v.chequeDate) continue;
      const chequeDate = day(v.chequeDate || v[dateField]);
      if (!chequeDate) continue;
      rows.push({
        key: `${type}:${v.id}`, type, id: v.id, no: v[noField] || "", party: partyOf(v) || "",
        chequeNo: v.chequeNo || "", bank: v.chequeBank || "", amount: n2(v[amountField]),
        chequeDate, daysLate: daysBetween(chequeDate, today), raw: v,
      });
    }
  };
  add("received", salesReceipts, "receiptNo", "receiptDate", (v) => v.customerName);
  add("issued", purchasePayments, "paymentNo", "paymentDate", (v) => v.vendorName);
  add("expense", expenses, "expenseNo", "expenseDate", (v) => v.paidTo || v.categoryName || v.category, "amount");
  return rows.sort((a, b) => a.chequeDate.localeCompare(b.chequeDate) || a.no.localeCompare(b.no));
}

// Pending cheques whose date has come (today or earlier): due for clearing.
export function listDueCheques(data, today = localDateString()) {
  return listPendingCheques(data, today).filter((c) => c.daysLate >= 0);
}

export function computeShopFinance({ salesInvoices = [], salesReceipts = [], purchaseInvoices = [], purchasePayments = [], expenses = [] }, today = localDateString()) {
  const month = today.slice(0, 7);
  const sales = salesInvoices.filter(isLiveBill);
  const purchases = purchaseInvoices.filter(isLiveBill);
  const receipts = salesReceipts.filter(isLiveVoucher);

  const allocatedByInvoice = new Map();
  for (const r of receipts) {
    for (const a of r.allocations || []) allocatedByInvoice.set(a.invoiceId, (allocatedByInvoice.get(a.invoiceId) || 0) + n2(a.amount));
  }

  const out = {
    salesToday: 0,
    salesTodayCount: 0,
    salesMonth: 0,
    salesMonthCount: 0,
    collectedToday: 0,
    purchaseToday: 0,
    purchaseTodayCount: 0,
    purchaseMonth: 0,
    purchaseMonthCount: 0,
  };
  for (const inv of sales) {
    const d = day(inv.invoiceDate);
    if (d === today) {
      out.salesToday += n2(inv.grandTotal);
      out.salesTodayCount += 1;
      out.collectedToday += Math.max(0, n2(inv.amountPaid) - (allocatedByInvoice.get(inv.id) || 0));
    }
    if (d.startsWith(month)) {
      out.salesMonth += n2(inv.grandTotal);
      out.salesMonthCount += 1;
    }
  }
  for (const r of receipts) {
    if (day(r.receiptDate) === today && !isPendingCheque(r)) out.collectedToday += n2(r.totalAmount);
  }
  for (const inv of purchases) {
    if (day(inv.invoiceDate) === today) {
      out.purchaseToday += n2(inv.grandTotal);
      out.purchaseTodayCount += 1;
    }
    if (day(inv.invoiceDate).startsWith(month)) {
      out.purchaseMonth += n2(inv.grandTotal);
      out.purchaseMonthCount += 1;
    }
  }

  out.receivable = sumDue(sales, "customerId", "customerName");
  out.payable = sumDue(purchases, "vendorId", "vendorName");
  out.chequesReceived = sumCheques(salesReceipts, "receiptDate", today);
  out.chequesIssued = sumCheques(purchasePayments, "paymentDate", today);
  out.pendingCheques = listPendingCheques({ salesReceipts, purchasePayments, expenses }, today);
  out.dueCheques = out.pendingCheques.filter((c) => c.daysLate >= 0);
  out.upcomingCheques = out.pendingCheques.filter((c) => c.daysLate < 0 && c.daysLate >= -7);
  out.today = today;
  return out;
}

// Server snapshot and this device's local copy, newest `updatedAt` wins, so
// unsynced local saves show instantly and other devices' saves arrive live.
function mergeDocs(serverDocs, localDocs) {
  if (!serverDocs) return localDocs || [];
  const byId = new Map(serverDocs.map((d) => [d.id, d]));
  for (const d of localDocs || []) {
    const s = byId.get(d.id);
    if (!s || String(d.updatedAt || "") > String(s.updatedAt || "")) byId.set(d.id, d);
  }
  return [...byId.values()];
}

export function useShopFinance(shopId, { enabled = true, live = true } = {}) {
  const [data, setData] = useState({});
  const [today, setToday] = useState(localDateString);

  useEffect(() => {
    if (!enabled || !shopId) return undefined;
    let cancelled = false;
    const server = {};
    const local = {};
    const publish = () => {
      if (cancelled) return;
      const next = {};
      for (const name of FINANCE_COLLECTIONS) next[name] = mergeDocs(server[name], local[name]);
      setData(next);
    };
    const loadLocal = async () => {
      for (const name of FINANCE_COLLECTIONS) {
        try {
          const res = await offlineList(name);
          local[name] = res.records.map((r) => ({ id: r.document_id, ...(r.data || {}) })).filter((d) => d.shopId === shopId);
        } catch (error) {
          console.warn(`[S4 Dashboard] local ${name} read failed`, error);
        }
      }
      publish();
    };

    let queuedTimer = null;
    const onQueued = () => {
      clearTimeout(queuedTimer);
      queuedTimer = setTimeout(loadLocal, 100);
    };
    window.addEventListener(SYNC_QUEUED_EVENT, onQueued);
    loadLocal();

    const unsubs = live
      ? FINANCE_COLLECTIONS.map((name) =>
          onSnapshot(
            query(collection(db, name), where("shopId", "==", shopId)),
            (snap) => {
              server[name] = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
              publish();
            },
            (error) => console.warn(`[S4 Dashboard] ${name} listener failed`, error)
          )
        )
      : [];

    const dayTimer = setInterval(() => setToday(localDateString()), 60 * 1000);
    return () => {
      cancelled = true;
      window.removeEventListener(SYNC_QUEUED_EVENT, onQueued);
      clearTimeout(queuedTimer);
      clearInterval(dayTimer);
      unsubs.forEach((u) => u());
    };
  }, [shopId, enabled, live]);

  return computeShopFinance(data, today);
}
