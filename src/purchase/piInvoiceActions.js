import { STOCK_AFFECTING_INVOICE_STATUSES, applyInvoiceStockEffect, deviceSerialTag, piFmt2, piN2, reserveShopSerial, unlinkedStockOk } from "../shared/appShared.jsx";
import { isBranchTransferBill } from "../branch-transfer/branchTransferDomain.js";
import { isForeign, lineToBase, rateOf } from "./purchaseOptions.js";
import { isOpeningBill } from "../utils/openingBill.js";
import { localIsoDate } from "../utils/localIsoDate.js";
import { logAudit } from "../utils/auditLog.js";
import { offlineCreate, offlineGetById, offlineList, offlinePatch, offlineRemove } from "../offline/offlineRepository";
import { applyBackorderToOrder, backorderItemsFromShortage, docTotals, mergeOrderItems, orderProgress, shortageAfterBill } from "./purchaseDocs.js";
import { persistOfflineDb } from "../offline/sqliteDb.js";
import { piCalcLine, piCalcTotals } from "./purchaseShared.js";
import { pricingPatchFromLanding } from "../product-master/pricingFromLanding.js";
import { unitFactorFor } from "../inventory/unitConversion";
import { averageCosts } from "../reports/averageCost.js";
import { livePurchasesOf, liveReturnsOf } from "../reports/reportFilters.js";

function unmatchedPurchaseNames(items) {
  return (items || []).filter((it) => !it?.productId && !it?.isService && String(it?.name || "").trim()).map((it) => it.name.trim());
}

function shopDocs(res, shopId) {
  return (res?.records || []).map((r) => ({ ...(r.data || r), id: r.data?.id || r.document_id || r.id })).filter((row) => !shopId || row.shopId === shopId);
}
function recDoc(rec) {
  if (!rec) return null;
  const data = rec.data || rec;
  return { ...data, id: data.id || rec.document_id };
}

export function createPiInvoiceActions({ billReturns, bumpShopPiSerial, can, canManagePurchase, canVendorPayments, editInvoiceId, invoices, isOwner, lang, onOpenProductMaster, onProductPatched, payments, piBaseCur, piCurrent, piForm, piInvoiceNo, piLines, piMoneyInvoices, piOpenNew, piSaveLockRef, piSource, piVendorRecord, products, profile, reservePiInvoiceNo, setInvoices, setPiSaving, setPiSource, setPiSubTab, setPiView, setPmtPrefillInvoiceId, setPmtPrefillVendorId, setPmtView, setSelInvoice, setSelVoucher, shop, shopId, t, toast, user }) {
  // ── Build payload ──
  const piBuild=(status, invoiceNoOverride)=>{
    if (!piForm.vendorName.trim()){ toast(lang==="bn"?"❌ Vendor / সাপ্লায়ারের নাম দিন — লিস্টে না থাকলে নাম লিখে দিন":"❌ Enter the vendor / supplier name — type it if it's not in the list","err"); return null; }
    if (!piForm.supplierInvoiceNo.trim()){ toast(lang==="bn"?"❌ সাপ্লায়ারের Invoice No দিন — নম্বর না থাকলে যেকোনো একটা রেফারেন্স লিখুন":"❌ Enter the supplier's invoice no — type any reference if there is none","err"); return null; }
    if (piCurrent.name.trim()){ toast(lang==="bn"?"❌ এন্ট্রি সারির আইটেম এখনো যোগ/আপডেট করা হয়নি — Add/Update চাপুন বা সারিটি খালি করুন":"❌ The item in the entry row is not added yet — press Add/Update or clear the row","err"); return null; }
    const priorInv = editInvoiceId ? invoices.find(inv=>inv.id===editInvoiceId) : null;
    if (status==="draft" && priorInv?.status && priorInv.status!=="draft") {
      toast(lang==="bn"?"❌ সেভ করা বিলকে আবার Draft করা যাবে না":"❌ A saved invoice cannot be turned back into a draft","err"); return null;
    }
    const valid=piLines.filter(it=>it.name.trim());
    if (!valid.length){ toast(t.pi_errItems,"err"); return null; }
    for (const it of valid){
      if (!it.name.trim()){ toast(t.pi_errName,"err"); return null; }
      if (!it.qty.toString().trim()||piN2(it.qty)<=0){ toast(t.pi_errQty,"err"); return null; }
      if (piN2(it.unitCost)<0){ toast(t.pi_errCost,"err"); return null; }
      if (piN2(it.taxPerc)<0){ toast(lang==="bn"?"❌ VAT % ঋণাত্মক হতে পারে না":"❌ VAT % cannot be negative","err"); return null; }
      if (piN2(it.discountPerc)<0||piN2(it.discountPerc)>100){ toast(lang==="bn"?`❌ "${it.name}": ছাড় ০–১০০% হতে হবে`:`❌ "${it.name}": discount must be 0–100%`,"err"); return null; }
      if (piN2(it.discountFlat)<0){ toast(lang==="bn"?`❌ "${it.name}": ছাড়ের টাকা ঋণাত্মক হতে পারে না`:`❌ "${it.name}": discount amount cannot be negative`,"err"); return null; }
    }
    const foreign = isForeign(piForm, piBaseCur);
    const rate = rateOf(piForm, piBaseCur);
    if (foreign && !(rate > 0)) { toast(lang==="bn"?`❌ ${piForm.currency} থেকে ${piBaseCur}-এর রেট (Exchange Rate) দিন`:`❌ Enter the exchange rate from ${piForm.currency} to ${piBaseCur}`,"err"); return null; }
    const baseLines = valid.map(it=>lineToBase(it, rate));
    const builtItems=baseLines.map((it,idx)=>{ const { disc, tax, total }=piCalcLine(it); return { productId:it.productId||null, name:it.name.trim(), code:it.code.trim(), brand:it.brand.trim(), qty:piN2(it.qty), unit:it.unit, unitFactor:unitFactorFor(it.productId ? products.find(p=>p.id===it.productId) : null, it.unit), unitCost:piN2(it.unitCost), discountPerc:piN2(it.discountPerc), ...(piN2(it.discountFlat)>0?{ discountFlat:piN2(it.discountFlat) }:{}), discountAmt:parseFloat(piFmt2(disc)), taxPerc:piN2(it.taxPerc), taxAmt:parseFloat(piFmt2(tax)), lineTotal:parseFloat(piFmt2(total)), salePrice:piN2(it.salePrice)||null,
      ...(foreign?{ fcUnitCost:piN2(valid[idx].unitCost), ...(piN2(valid[idx].discountFlat)>0?{ fcDiscountFlat:piN2(valid[idx].discountFlat) }:{}) }:{}), ...(it.batchNo?{ batchNo:it.batchNo, batchReasons:it.batchReasons||[] }:{}) }; });
    const { sub, disc, tax, grand } = piCalcTotals(baseLines);
    const fcGrand = piCalcTotals(valid).grand;
    // Paying the whole bill in a foreign currency settles it exactly, without a rounding paisa left over.
    const fcPaid = piN2(piForm.amountPaid);
    const typedPaid=piForm.paymentMethod==="cash" ? parseFloat(piFmt2(grand)) : (foreign && Math.abs(fcPaid-fcGrand)<0.01 ? grand : fcPaid*rate);
    if (typedPaid > grand + 0.01) { toast(lang==="bn"?"পরিশোধিত টাকা মোট বিলের চেয়ে বেশি হতে পারে না!":"Amount paid cannot exceed the grand total!","err"); return null; }
    const paid=Math.min(Math.max(typedPaid,0), grand), balanceDue=Math.max(0,grand-paid);
    const derivedStatus = status==="confirmed" ? (balanceDue<0.01?"paid":paid>0?"partial":"confirmed") : status;
    const linkFrom = piSource || priorInv || {};
    const sourceFields = {
      ...((piSource ? piSource.purchaseOrderId : linkFrom.purchaseOrderId) ? { purchaseOrderId:piSource ? piSource.purchaseOrderId : linkFrom.purchaseOrderId, purchaseOrderNo:piSource ? piSource.purchaseOrderNo : (linkFrom.purchaseOrderNo||"") } : {}),
      ...(piSource?.kind==="grn" ? { goodsReceiptId:piSource.id, goodsReceiptNo:piSource.no, ...((piSource.ids||[]).length>1 ? { goodsReceiptIds:piSource.ids, goodsReceiptNos:piSource.nos } : {}) }
        : priorInv?.goodsReceiptId ? { goodsReceiptId:priorInv.goodsReceiptId, goodsReceiptNo:priorInv.goodsReceiptNo||"", ...((priorInv.goodsReceiptIds||[]).length>1 ? { goodsReceiptIds:priorInv.goodsReceiptIds, goodsReceiptNos:priorInv.goodsReceiptNos } : {}) } : {}),
    };
    return { ...sourceFields, shopId, invoiceNo:invoiceNoOverride ?? piInvoiceNo, supplierInvoiceNo:piForm.supplierInvoiceNo.trim(), refNo:String(piForm.refNo||"").trim(), invoiceDate:piForm.invoiceDate, entryDate:piForm.entryDate||piForm.invoiceDate,
      currency:foreign?String(piForm.currency).trim().toUpperCase():"", exchangeRate:foreign?rate:null, fcGrandTotal:foreign?fcGrand:null, vendorId:piForm.vendorId||null, vendorName:piForm.vendorName.trim(), vendorMobile:piForm.vendorMobile.trim(), vendorAddress:String(piForm.vendorAddress||"").trim(), vendorTrn:String(piForm.vendorTrn||"").trim(), items:builtItems, subtotal:parseFloat(piFmt2(sub)), totalDiscount:parseFloat(piFmt2(disc)), totalTax:parseFloat(piFmt2(tax)), grandTotal:parseFloat(piFmt2(grand)), paymentMethod:piForm.paymentMethod, amountPaid:parseFloat(piFmt2(paid)), balanceDue:parseFloat(piFmt2(balanceDue)), status:derivedStatus, note:piForm.note.trim(), createdBy:priorInv?.createdBy||user.uid, createdByName:priorInv?.createdByName||profile.personName };
  };

  const nextPurchaseOrderNo = async () => {
    const rows = shopDocs(await offlineList("purchaseOrders"), shopId);
    const re = /^PO-?(\d+)(?:-[A-Z]{2})?$/i;
    const local = rows.reduce((mx, r) => {
      const m = String(r.orderNo || "").match(re);
      return m ? Math.max(mx, Number(m[1])) : mx;
    }, Number(shop?.lastPOSerial || 0));
    const fmt = (n) => `PO-${String(n).padStart(4, "0")}`;
    const serial = await reserveShopSerial(shopId, "lastPOSerial", local);
    if (serial) return fmt(serial);
    return isOwner ? fmt(local + 1) : `${fmt(local + 1)}-${deviceSerialTag()}`;
  };

  // After a PO is billed, leftover lines (supplier did not send them) become a new PO so they can be ordered elsewhere.
  const splitUnreceivedPurchaseOrder = async (payload, persistOpts) => {
    if (!payload?.purchaseOrderId || payload.goodsReceiptId || !["confirmed", "paid", "partial"].includes(payload.status)) return null;
    const order = recDoc(await offlineGetById("purchaseOrders", payload.purchaseOrderId));
    if (!order || order.status === "cancelled" || (order.shopId && order.shopId !== shopId)) return null;
    const [grnRes, piRes] = await Promise.all([offlineList("goodsReceipts"), offlineList("purchaseInvoices")]);
    const grns = shopDocs(grnRes, shopId);
    const bills = shopDocs(piRes, shopId).filter((p) => p.id !== payload.id);
    const miss = shortageAfterBill(order, payload.items, bills, grns);
    if (!miss.length) return null;
    const items = backorderItemsFromShortage(miss);
    const totals = docTotals(items, true);
    const nowIso = new Date().toISOString();
    const note = lang === "bn"
      ? `${order.orderNo}-এ পাওয়া যায়নি (${payload.invoiceNo}) — অন্য সাপ্লায়ারকে অর্ডার দিন`
      : `Not received on ${order.orderNo} (${payload.invoiceNo}) — order from another supplier`;
    let saved;
    const existingBo = order.backorderOrderId ? recDoc(await offlineGetById("purchaseOrders", order.backorderOrderId)) : null;
    const boLive = existingBo && existingBo.status !== "cancelled" && ["open", "partial"].includes(orderProgress(existingBo, bills, grns));
    if (boLive) {
      const merged = mergeOrderItems(existingBo.items || [], items);
      const nextTot = docTotals(merged, true);
      const patch = { items: merged, subtotal: nextTot.sub, totalTax: nextTot.tax, grandTotal: nextTot.grand, note: [existingBo.note, note].filter(Boolean).join(" · "), updatedAt: nowIso, updatedBy: user?.uid || "" };
      const res = await offlinePatch("purchaseOrders", existingBo.id, patch, existingBo, persistOpts);
      saved = { ...res.data, id: existingBo.id };
    } else {
      const orderNo = await nextPurchaseOrderNo();
      const res = await offlineCreate("purchaseOrders", {
        shopId, orderNo, orderDate: localIsoDate(), refNo: order.orderNo || "", vendorId: null, vendorName: "", vendorMobile: "",
        note, items, subtotal: totals.sub, totalTax: totals.tax, grandTotal: totals.grand, expectedDate: "",
        sourceOrderId: order.id, sourceOrderNo: order.orderNo || "", sourceInvoiceId: payload.id, sourceInvoiceNo: payload.invoiceNo || "",
        status: "open", createdAt: nowIso, createdBy: user?.uid || "", createdByName: profile?.personName || "",
      }, persistOpts);
      saved = { ...res.data, id: res.documentId };
    }
    const patchedItems = applyBackorderToOrder(order, miss);
    await offlinePatch("purchaseOrders", order.id, {
      items: patchedItems, backorderOrderId: saved.id, backorderOrderNo: saved.orderNo, updatedAt: nowIso, updatedBy: user?.uid || "",
    }, order, persistOpts);
    logAudit({ shopId, user, profile, action: boLive ? "edit" : "create", collection: "purchaseOrders", docId: saved.id, docNo: saved.orderNo, amount: saved.grandTotal, note: `${miss.length} from ${order.orderNo}` });
    return { orderNo: saved.orderNo, count: miss.length };
  };

  const savePurchaseInvoiceOffline = async (payload, successMessage) => {
    const nowIso = new Date().toISOString();
    const priorInvoice = editInvoiceId ? invoices.find(inv => inv.id === editInvoiceId) : null;
    let savedId;
    let savedDoc = null;
    const deferPersist = { deferPersist: true };

    if (editInvoiceId) {
      const result = await offlinePatch("purchaseInvoices", editInvoiceId, {
        ...payload,
        updatedAt: nowIso,
        updatedBy: user?.uid || "",
      }, priorInvoice, deferPersist);

      const updated = { ...result.data, id: editInvoiceId };
      savedId = editInvoiceId;
      savedDoc = updated;
      setInvoices(prev => prev.map(inv => inv.id === editInvoiceId ? updated : inv));
      setSelInvoice(prev => prev && prev.id === editInvoiceId ? updated : prev);
      toast(successMessage || t.pi_updated);
      if (priorInvoice && priorInvoice.status !== "draft") {
        logAudit({ shopId, user, profile, action:"edit", collection:"purchaseInvoices", docId:editInvoiceId, docNo:payload.invoiceNo, amount:payload.grandTotal,
          note:`${payload.vendorName||""} · ${piFmt2(priorInvoice.grandTotal)} → ${piFmt2(payload.grandTotal)}` });
      }
    } else {
      const result = await offlineCreate("purchaseInvoices", {
        ...payload,
        createdAt: nowIso,
        updatedAt: nowIso,
      }, deferPersist);

      const created = { ...result.data, id: result.documentId };
      savedId = result.documentId;
      savedDoc = created;
      setInvoices(prev => [created, ...prev]);
      toast(successMessage);
    }

    if (!payload.goodsReceiptId) await applyInvoiceStockEffect({
      oldInvoice: priorInvoice,
      newInvoice: payload,
      invoiceId: savedId,
      applyType: "purchase",
      reverseType: "adjustment",
      referenceType: "purchase_invoice",
      unitCostKey: "unitCost",
      shopId,
      actor: { uid: user?.uid, personName: profile?.personName },
    });

    if (!editInvoiceId) bumpShopPiSerial(payload.invoiceNo);

    let splitInfo = null;
    try { splitInfo = await splitUnreceivedPurchaseOrder({ ...payload, id: savedId }, deferPersist); }
    catch (err) { console.warn("[S4 PI] purchase-order split failed", err); }

    // Persist + sync immediately so Confirm unlocks; product cost/avg used to await every
    // line's SQLite read and made purchase save feel multi-second even offline.
    persistOfflineDb().catch((err) => console.warn("[S4 PI] persist after save failed", err));
    if (navigator.onLine) {
      window.S4Offline?.syncNow?.().catch(err => console.warn("[S4 Sync] purchase invoice save sync failed", err));
    }

    const costIds = [...(payload.items || []), ...(priorInvoice?.items || [])].map((it) => it.productId);
    const costList = [...invoices.filter((inv) => inv.id !== savedId), savedDoc];
    Promise.resolve().then(async () => {
      try {
        if (STOCK_AFFECTING_INVOICE_STATUSES.includes(payload.status)) await piUpdateProductCosts(payload, deferPersist);
        await refreshAverageCosts(costIds, costList, deferPersist);
        await persistOfflineDb();
      } catch (err) {
        console.warn("[S4 PI] post-save cost update failed", err);
      }
    });

    if (splitInfo) {
      toast(lang === "bn"
        ? `${splitInfo.count}টি পণ্য পাওয়া যায়নি — নতুন অর্ডার ${splitInfo.orderNo}-এ গেছে। অন্য সাপ্লায়ারকে অর্ডার দিন।`
        : `${splitInfo.count} product(s) were not received — moved to new order ${splitInfo.orderNo}. Order them from another supplier.`);
    }

    if (!editInvoiceId) {
      piOpenNew(payload.invoiceNo);
    } else if (savedDoc) {
      setSelInvoice(savedDoc);
      setPiView("detail");
    }
  };

  // A confirmed purchase becomes the product's latest cost, and a sale price typed on the line updates the product's price.
  // Avg. Cost on the product = the weighted average the reports use (opening stock + live purchases, after discount,
  // VAT excluded). It used to be set once when the product was created and never follow the purchases.
  const refreshAverageCosts = async (productIds, purchaseList, persistOpts = {}) => {
    if (!(canManagePurchase || can("manageProducts"))) return false;
    const ids = [...new Set(productIds.filter(Boolean))];
    if (!ids.length) return true;
    const live = livePurchasesOf(purchaseList, shopId).filter((inv) => inv.source !== "openingBalance");
    const livePr = liveReturnsOf(billReturns, shopId);
    for (const pid of ids) {
      try {
        const rec = await offlineGetById("products", pid).catch(() => null);
        const prod = rec?.data || products.find((p) => p.id === pid);
        if (!prod) continue;
        const avg = averageCosts([{ ...prod, id: pid }], live, undefined, livePr).get(pid);
        if (!(avg > 0)) continue;
        const next = String(parseFloat(avg.toFixed(4)));
        if (Math.abs(avg - (Number(prod.averageCost) || 0)) < 0.0001) continue;
        const patch = { averageCost: next, updatedAt: new Date().toISOString() };
        await offlinePatch("products", pid, patch, prod, persistOpts);
        onProductPatched?.(pid, patch);
      } catch (err) {
        console.warn("[S4 PI] average cost update failed", pid, err);
      }
    }
    return true;
  };

  const piUpdateProductCosts = async (payload, persistOpts = {}) => {
    if (!(canManagePurchase || can("manageProducts"))) return;
    const nowIso = new Date().toISOString();
    const billDay = String(payload.invoiceDate || nowIso).slice(0, 10);
    for (const it of payload.items || []) {
      if (!it.productId) continue;
      try {
        const rec = await offlineGetById("products", it.productId).catch(() => null);
        const prod = rec?.data || products.find(p => p.id === it.productId);
        if (!prod) continue;
        // A back-dated bill must not replace the cost/price of a newer purchase.
        if (prod.lastPurchaseDate && billDay < String(prod.lastPurchaseDate).slice(0, 10)) continue;
        const factor = Number(it.unitFactor) > 0 ? Number(it.unitFactor) : 1;
        const qty = Number(it.qty) || 0;
        const netCost = qty > 0 ? (Number(it.lineTotal) - Number(it.taxAmt || 0)) / qty / factor : Number(it.unitCost) / factor;
        const patch = {
          lastPurchaseVendorId: payload.vendorId || "",
          lastPurchaseVendorName: payload.vendorName || "",
          lastPurchaseInvoiceNo: payload.invoiceNo || "",
        };
        const lastDay = String(prod.lastPurchaseDate || "").slice(0, 10);
        if (!lastDay || billDay >= lastDay) patch.lastPurchaseDate = billDay;
        if (netCost > 0) {
          const lcStr = String(parseFloat(netCost.toFixed(4)));
          const costChanged = Math.abs(netCost - (Number(prod.landingCost) || 0)) > 0.0001;
          if (costChanged) {
            patch.landingCost = lcStr;
            patch.lastPurchaseCost = lcStr;
            Object.assign(patch, pricingPatchFromLanding(prod, netCost));
          } else if (!lastDay || billDay >= lastDay) {
            patch.lastPurchaseCost = lcStr;
          }
        }
        const sale = Number(it.salePrice) || 0;
        if (sale > 0 && factor === 1) {
          const priceKey = prod.vatInclusive ? "vatInclusive" : prod.mrp ? "mrp" : prod.vatExclusive ? "vatExclusive" : "vatInclusive";
          if (Math.abs(sale - (Number(prod[priceKey]) || 0)) > 0.0001) patch[priceKey] = String(sale);
        }
        const keys = Object.keys(patch).filter((k) => patch[k] !== undefined && patch[k] !== prod[k]);
        if (!keys.length) continue;
        const merged = { ...patch, updatedAt: nowIso };
        await offlinePatch("products", it.productId, merged, prod, persistOpts);
        onProductPatched?.(it.productId, merged);
      } catch (err) {
        console.warn("[S4 PI] product cost update failed", it.productId, err);
      }
    }
  };

  // ── Save ──
  const piSupplierInvoiceDuplicateOk = (payload) => {
    const key = (v) => String(v || "").trim().toLowerCase().replace(/\s+/g, " ");
    const supNo = key(payload.supplierInvoiceNo);
    const day = String(payload.invoiceDate || "").slice(0, 10);
    const sameVendor = (inv) => (payload.vendorId && inv.vendorId === payload.vendorId)
      || (!!key(payload.vendorName) && key(inv.vendorName) === key(payload.vendorName));
    const others = piMoneyInvoices.filter(inv => inv.id !== editInvoiceId && inv.status !== "cancelled" && sameVendor(inv));
    const bn = lang==="bn";

    if (supNo) {
      const same = others.filter(inv => key(inv.supplierInvoiceNo) === supNo);
      const sameDay = same.find(inv => String(inv.invoiceDate || "").slice(0, 10) === day);
      if (sameDay) {
        alert(bn
          ? `❌ ডুপ্লিকেট! এই সাপ্লায়ারের Supplier Invoice No "${payload.supplierInvoiceNo}" একই তারিখে (${day}) আগেই ${sameDay.invoiceNo}-এ এন্ট্রি করা আছে।\nআবার সেভ করা যাবে না।`
          : `❌ Duplicate! Supplier invoice "${payload.supplierInvoiceNo}" from this supplier on ${day} is already entered as ${sameDay.invoiceNo}.\nIt cannot be saved again.`);
        return false;
      }
      if (same.length) {
        const d = same[0];
        return window.confirm(bn
          ? `⚠️ এই সাপ্লায়ারের Supplier Invoice No "${payload.supplierInvoiceNo}" আগেই ${d.invoiceNo} (${d.invoiceDate||""})-এ এন্ট্রি করা আছে।\nতারিখ আলাদা — তবুও সেভ করবেন?`
          : `⚠️ Supplier invoice "${payload.supplierInvoiceNo}" from this supplier is already entered as ${d.invoiceNo} (${d.invoiceDate||""}).\nThe date differs — save anyway?`);
      }
      return true;
    }

    const lookalike = others.find(inv => String(inv.invoiceDate || "").slice(0, 10) === day && Math.abs(piN2(inv.grandTotal) - piN2(payload.grandTotal)) < 0.01);
    if (!lookalike) return true;
    return window.confirm(bn
      ? `⚠️ একই সাপ্লায়ার, একই তারিখ (${day}) আর একই টাকার (${piFmt2(payload.grandTotal)}) বিল আগেই ${lookalike.invoiceNo}-এ আছে।\nডুপ্লিকেট হতে পারে — তবুও সেভ করবেন?`
      : `⚠️ A bill from this supplier on ${day} for ${piFmt2(payload.grandTotal)} already exists as ${lookalike.invoiceNo}.\nIt may be a duplicate — save anyway?`);
  };

  // Early warning while just the header is filled in (date + vendor + supplier invoice no) — a toast,
  // not a block, so it fires before any line items exist. The hard check/confirm at save time (above)
  // still has the final say once the full invoice (and its total) is known.
  const piEarlyDuplicateCheck = () => {
    const key = (v) => String(v || "").trim().toLowerCase().replace(/\s+/g, " ");
    const supNo = key(piForm.supplierInvoiceNo);
    if (!supNo || !(piForm.vendorId || key(piForm.vendorName))) return;
    const day = String(piForm.invoiceDate || "").slice(0, 10);
    const sameVendor = (inv) => (piForm.vendorId && inv.vendorId === piForm.vendorId)
      || (!!key(piForm.vendorName) && key(inv.vendorName) === key(piForm.vendorName));
    const same = piMoneyInvoices.filter(inv => inv.id !== editInvoiceId && inv.status !== "cancelled" && sameVendor(inv) && key(inv.supplierInvoiceNo) === supNo);
    if (!same.length) return;
    const bn = lang === "bn";
    const match = same.find(inv => String(inv.invoiceDate || "").slice(0, 10) === day) || same[0];
    toast(bn
      ? `⚠️ এই সাপ্লায়ারের Supplier Invoice No "${piForm.supplierInvoiceNo}" আগেই ${match.invoiceNo}${match.invoiceDate ? ` (${match.invoiceDate})` : ""}-এ এন্ট্রি করা আছে — ডুপ্লিকেট হতে পারে।`
      : `⚠️ Supplier invoice "${piForm.supplierInvoiceNo}" from this supplier is already entered as ${match.invoiceNo}${match.invoiceDate ? ` (${match.invoiceDate})` : ""} — this may be a duplicate.`, "err");
  };

  // Vendor Master rules: a blocked vendor gets no new bills, the credit limit warns, credit days set the due date.
  const piVendorTermsOk = (payload, status) => {
    const bn = lang==="bn";
    const vendor = piVendorRecord(payload.vendorId, payload.vendorName);
    const prior = editInvoiceId ? invoices.find(inv => inv.id === editInvoiceId) : null;
    const sameVendorAsPrior = prior && ((vendor && prior.vendorId === vendor.id) || String(prior.vendorName||"").trim().toLowerCase() === String(payload.vendorName||"").trim().toLowerCase());
    if (vendor?.status === "blocked" && !sameVendorAsPrior) {
      toast(bn ? `❌ "${vendor.vendorName}" ব্লক করা — Vendor Master-এ Active না করলে নতুন বিল করা যাবে না` : `❌ "${vendor.vendorName}" is blocked — make it Active in Vendor Master to bill it`, "err");
      return false;
    }
    const days = Math.round(piN2(vendor?.paymentTerms));
    if (days > 0 && payload.invoiceDate) {
      const d = new Date(`${String(payload.invoiceDate).slice(0,10)}T00:00:00`);
      d.setDate(d.getDate() + days);
      payload.dueDate = localIsoDate(d);
      payload.creditDays = days;
    } else {
      payload.dueDate = "";
      payload.creditDays = 0;
    }
    const limit = piN2(vendor?.creditLimit);
    if (status === "draft" || limit <= 0 || piN2(payload.balanceDue) <= 0.01) return true;
    const outstanding = piMoneyInvoices
      .filter(inv => inv.id !== editInvoiceId && ["confirmed","partial"].includes(inv.status)
        && (inv.vendorId === vendor.id || String(inv.vendorName||"").trim().toLowerCase() === String(vendor.vendorName||"").trim().toLowerCase()))
      .reduce((sum, inv) => sum + Math.max(0, piN2(inv.balanceDue)), 0);
    const after = outstanding + piN2(payload.balanceDue);
    if (after <= limit + 0.01) return true;
    return window.confirm(bn
      ? `⚠️ "${vendor.vendorName}"-এর ক্রেডিট লিমিট ${piFmt2(limit)}।\nআগের বাকি ${piFmt2(outstanding)} + এই বিলের বাকি ${piFmt2(payload.balanceDue)} = ${piFmt2(after)} — লিমিট ছাড়িয়ে যাচ্ছে।\nতবুও সেভ করবেন?`
      : `⚠️ "${vendor.vendorName}" has a credit limit of ${piFmt2(limit)}.\nDue so far ${piFmt2(outstanding)} + this bill ${piFmt2(payload.balanceDue)} = ${piFmt2(after)} — over the limit.\nSave anyway?`);
  };

  const piSaveRun = async (status, successMsg) => {
    if (piSaveLockRef.current) return;
    piSaveLockRef.current = true;
    setPiSaving(true);
    try {
      const lockedBy = editInvoiceId ? billReturns.filter(r => r.status !== "cancelled" && r.invoiceId === editInvoiceId) : [];
      if (lockedBy.length) {
        toast(lang==="bn" ? `এই বিলে রিটার্ন আছে (${lockedBy.map(r=>r.returnNo).join(", ")}) — আগে রিটার্ন বাতিল করুন` : `This bill has return(s) ${lockedBy.map(r=>r.returnNo).join(", ")}; cancel them before editing`, "err");
        return;
      }
      const payload = piBuild(status, piInvoiceNo);
      if (!payload) return;
      if (!editInvoiceId && payload.goodsReceiptId) {
        const ids = payload.goodsReceiptIds?.length ? payload.goodsReceiptIds : [payload.goodsReceiptId];
        const already = invoices.find(inv => inv.status!=="cancelled" && (ids.includes(inv.goodsReceiptId) || (inv.goodsReceiptIds||[]).some(id=>ids.includes(id))));
        if (already) { toast(lang==="bn" ? `❌ ${payload.goodsReceiptNo}-এর বিল আগেই হয়েছে: ${already.invoiceNo}` : `❌ ${payload.goodsReceiptNo} is already billed as ${already.invoiceNo}`, "err"); return; }
      }
      const unmatched = unmatchedPurchaseNames(payload.items);
      if (status !== "draft" && unmatched.length && !piForm.scanFilled && !unlinkedStockOk(payload.items, lang)) return;
      if (status !== "draft" && unmatched.length && piForm.scanFilled) {
        toast(lang==="bn"
          ? `❌ মিলেনি — আগে Product Master-এ এন্ট্রি করুন, নাহলে ইনভয়েস সেভ হবে না: ${unmatched.slice(0, 5).join(", ")}${unmatched.length > 5 ? " …" : ""}`
          : `❌ Unmatched items must be added in Product Master before this invoice can save: ${unmatched.slice(0, 5).join(", ")}${unmatched.length > 5 ? " …" : ""}`, "err");
        onOpenProductMaster?.(unmatched[0]);
        return;
      }
      if (!piVendorTermsOk(payload, status)) return;
      if (!piSupplierInvoiceDuplicateOk(payload)) return;
      // Same as sales: keep the preview number — do not block Confirm on Firebase serial reserve.
      if (!editInvoiceId) payload.invoiceNo = piInvoiceNo;
      await savePurchaseInvoiceOffline(payload, editInvoiceId ? t.pi_updated : successMsg);
      if (!editInvoiceId) setPiSource(null);
    } catch(e) {
      toast(e.message,"err");
    } finally {
      piSaveLockRef.current = false;
      setPiSaving(false);
    }
  };
  const piSaveDraft = () => piSaveRun("draft", t.pi_saved);
  const piConfirm = () => piSaveRun("confirmed", t.pi_confirmed);

  // "Make Payment" from an invoice: jump to the Payments tab, New Voucher form, pre-selected for this vendor.
  // The new voucher form pre-fills this exact invoice's row with its full balance — other open invoices for
  // the same vendor are shown too, so the user can combine them into one voucher if they want.
  const piGoToMakePayment = (inv) => {
    if (!canVendorPayments) return;
    setPmtPrefillVendorId(inv.vendorId || inv.vendorName);
    setPmtPrefillInvoiceId(inv.id);
    setSelVoucher(null);
    setPmtView("new");
    setPiSubTab("payments");
    setPiView("list");
  };
  const piCancelInv = async (inv) => {
    if (!isOwner && !can("deletePurchase")) {
      toast(lang==="bn" ? "পারচেজ বিল বাতিল করার অনুমতি নেই" : "You are not allowed to cancel purchase bills", "err");
      return;
    }
    if (isOpeningBill(inv)) { toast(lang==="bn" ? "এটা Opening Balance বিল — ভেন্ডর মাস্টার থেকে শুরুর ব্যালেন্স বদলান।" : "This is an Opening Balance bill — change the opening balance in Vendor Master.", "err"); return; }
    if (isBranchTransferBill(inv)) { toast(lang==="bn" ? "এটা Branch Transfer রিসিভের বিল — Branch Transfer থেকে নিয়ন্ত্রণ হয়, এখানে বদলানো যাবে না।" : "This bill comes from a Branch Transfer receipt — manage it from Branch Transfer.", "err"); return; }
    const activeVouchers = payments.filter(p => p.status !== "cancelled" && (p.allocations||[]).some(a => a.invoiceId === inv.id));
    if (activeVouchers.length) {
      const nos = activeVouchers.map(p => p.paymentNo).join(", ");
      toast(lang==="bn" ? `আগে পেমেন্ট ভাউচার বাতিল করুন: ${nos}` : `Cancel the payment voucher(s) first: ${nos}`, "err");
      return false;
    }
    const activeReturns = billReturns.filter(r => r.status !== "cancelled" && r.invoiceId === inv.id);
    if (activeReturns.length) {
      const nos = activeReturns.map(r => r.returnNo).join(", ");
      toast(lang==="bn" ? `আগে পারচেজ রিটার্ন বাতিল করুন: ${nos}` : `Cancel the purchase return(s) first: ${nos}`, "err");
      return false;
    }
    if (!window.confirm(lang==="bn"
      ? `${inv.invoiceNo || ""} বাতিল করবেন?\n\nYes = বাতিল হবে\nNo = হবে না`
      : `Cancel invoice ${inv.invoiceNo || ""}?\n\nYes = cancel it\nNo = keep it`)) return false;
    try {
      const nowIso = new Date().toISOString();
      const result = await offlinePatch("purchaseInvoices", inv.id, {
        status:"cancelled",
        updatedAt:nowIso,
        updatedBy:user?.uid || "",
      }, inv);

      const updated = { ...result.data, id: inv.id };
      setInvoices(prev => prev.map(x => x.id === inv.id ? updated : x));
      setSelInvoice(updated);

      if (!inv.goodsReceiptId) await applyInvoiceStockEffect({
        oldInvoice: inv,
        newInvoice: updated,
        invoiceId: inv.id,
        applyType: "purchase",
        reverseType: "adjustment",
        referenceType: "purchase_invoice",
        unitCostKey: "unitCost",
        shopId,
        actor: { uid: user?.uid, personName: profile?.personName },
      });

      if (canManagePurchase || can("manageProducts")) {
        const ids = [...new Set((inv.items || []).map((it) => it.productId).filter(Boolean))];
        const live = piMoneyInvoices.filter((i) => i.id !== inv.id && i.status !== "cancelled" && i.status !== "draft");
        for (const pid of ids) {
          let latest = null;
          for (const row of live) {
            if (!(row.items || []).some((it) => it.productId === pid)) continue;
            if (!latest || String(row.invoiceDate) > String(latest.invoiceDate)) latest = row;
          }
          if (latest) await piUpdateProductCosts(latest);
        }
        await refreshAverageCosts(ids, invoices.map((x) => (x.id === inv.id ? updated : x)));
      }

      toast(t.pi_cancelledMsg,"err");
      logAudit({ shopId, user, profile, action:"cancel", collection:"purchaseInvoices", docId:inv.id, docNo:inv.invoiceNo, amount:inv.grandTotal, note:inv.vendorName });

      if (navigator.onLine) {
        window.S4Offline?.syncNow?.().catch(err => console.warn("[S4 Sync] purchase invoice cancel sync failed", err));
      }
      return true;
    } catch(e){ toast(e.message,"err"); return false; }
  };
  const piDelete = async (inv) => {
    if (!isOwner && !can("deletePurchase")) {
      toast(lang==="bn" ? "পারচেজ বিল মুছার অনুমতি নেই" : "You are not allowed to delete purchase bills", "err");
      return;
    }
    if (isOpeningBill(inv)) { toast(lang==="bn" ? "এটা Opening Balance বিল — ভেন্ডর মাস্টার থেকে শুরুর ব্যালেন্স বদলান।" : "This is an Opening Balance bill — change the opening balance in Vendor Master.", "err"); return; }
    if (isBranchTransferBill(inv)) { toast(lang==="bn" ? "এটা Branch Transfer রিসিভের বিল — Branch Transfer থেকে নিয়ন্ত্রণ হয়, এখানে বদলানো যাবে না।" : "This bill comes from a Branch Transfer receipt — manage it from Branch Transfer.", "err"); return; }
    if (!window.confirm(lang==="bn"
      ? `${inv.invoiceNo || ""} একেবারে মুছে ফেলবেন?\n\nYes = মুছে যাবে\nNo = হবে না`
      : `Delete invoice ${inv.invoiceNo || ""} permanently?\n\nYes = delete it\nNo = keep it`)) return;
    try {
      await offlineRemove("purchaseInvoices", inv.id);

      setInvoices(prev => prev.filter(x => x.id !== inv.id));
      setPiView("list");
      setSelInvoice(null);
      toast(t.pi_deleted,"err");
      logAudit({ shopId, user, profile, action:"delete", collection:"purchaseInvoices", docId:inv.id, docNo:inv.invoiceNo, amount:inv.grandTotal, note:inv.vendorName });

      if (navigator.onLine) {
        window.S4Offline?.syncNow?.().catch(err => console.warn("[S4 Sync] purchase invoice delete sync failed", err));
      }
    } catch(e){ toast(e.message,"err"); }
  };
  return { piCancelInv, piConfirm, piDelete, piEarlyDuplicateCheck, piGoToMakePayment, piSaveDraft, refreshAverageCosts };
}
