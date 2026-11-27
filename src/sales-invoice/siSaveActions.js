import { applyInvoiceStockEffect, STOCK_AFFECTING_INVOICE_STATUSES, unlinkedStockOk } from "../shared/appShared.jsx";
import { afterInvoiceSaved } from "../share/autoWhatsApp.js";
import { logAudit } from "../utils/auditLog.js";
import { offlineCreate, offlineGetById, offlineUpdate } from "../offline/offlineRepository";
import { persistOfflineDb } from "../offline/sqliteDb.js";
import { siAddDays, siDeliveryLines, siResolveRate, sourceDocOf } from "./siHelpers.js";
import { siCalcLine, siCalcTotals, siFmt2, siInvoiceExtras, siIsSettledPay, siN2 } from "./salesInvoiceShared.js";
import { itemBaseQty, unitFactorFor } from "../inventory/unitConversion";
import { computeStockMap, loadInvoiceRows } from "../inventory/stockFromInvoices";
import { peekInvoiceRowsCache, rowsWithin } from "../inventory/stockRowsCache.js";
import { offlineList } from "../offline/offlineRepository";
import { rowsOf } from "../inventory/stockFromInvoices";
import { billLocationFields, billLocationId, billLocationStock, billLocationsOf, hasGodowns, locationShortfalls } from "../inventory/billLocation.js";
import { locationPath } from "../inventory/stockLocations.js";
import { isForeignSale, saleToBase } from "./siForex.js";
import { batchStockByProduct } from "../inventory/batchStock";
import { batchExpirySettingsOf, expiredSaleLines } from "../inventory/batchExpiry.js";
import { serialLineProblems, serialProblemText, serialSettingsOf, splitSerials } from "./serialRules.js";
import { invoicePaymentBankField } from "../ledger/ledgerShopOpts.js";

export function createSiSaveActions({ shop = null, onInvoiceSaved, COL, billReturns, bumpShopSiSerial, canDiscount, customers, editInvId, invoices, isDN, isQuote, isSO, kind, lang, products, profile, receipts, reserveSiInvoiceNo, setInvoices, setSelInv, setSiPrintModal, setSiSaving, setSiView, setSourceQuote, shopId, siAutoDisc, siCurrent, siFindProduct, siForm, siInvoiceNo, siLines, siLoadedPaidRef, siOpenNew, siPrint, siSaveLockRef, sourceQuote, t, toast, user }) {
  const siBuild=(status, invoiceNoOverride, extras={})=>{
    if (String(siCurrent.name||"").trim()) {
      toast(lang==="bn"?"উপরের ঘরে একটা আইটেম আছে যা বিলে যোগ হয়নি — Add চাপুন বা ঘরটা খালি করুন":"An item in the entry row is not added to the bill yet — press Add or clear it","err");
      return null;
    }
    const valid=siLines.filter(it=>it.name.trim());
    if (!valid.length){ toast(t.si_errItems,"err"); return null; }
    const badLine = valid.find(it => siN2(it.discountPerc)<0 || siN2(it.discountPerc)>100 || siN2(it.discountFlat)<0 || siN2(it.vatPerc)<0 || siN2(it.unitPrice)<0);
    if (badLine) { toast(lang==="bn"?` "${badLine.name}": ছাড় ০–১০০% আর দাম/VAT মাইনাস হতে পারে না`:` "${badLine.name}": discount must be 0–100% and price/VAT cannot be negative`,"err"); return null; }
    const isDelivery = isDN || (kind==="sales" && siForm.invoiceType==="delivery");
    const isTax      = siForm.invoiceType==="tax";
    for (const it of valid){
      if (!it.qty.toString().trim()||siN2(it.qty)<=0){ toast(t.si_errQty,"err"); return null; }
      if (siN2(it.unitPrice)<0){ toast(t.si_errPrice,"err"); return null; }
    }
    const effectiveIsTax = isTax && !isDelivery;
    // Serial / IMEI on marked products when the owner requires it on sales (serialRules.js); drafts may wait
    if (kind === "sales" && !isQuote && status !== "draft") {
      const serialIssues = serialLineProblems(valid, products, { required: serialSettingsOf(shop).sales });
      if (serialIssues.length) { toast(serialProblemText(serialIssues, lang==="bn"), "err"); return null; }
    }
    const builtItems=valid.map(it=>{
      const item = isDelivery ? siDeliveryLines([it])[0] : it;
      const { disc, vat, total }=siCalcLine(item, effectiveIsTax);
      return { productId:it.productId||null, name:it.name.trim(), code:it.code.trim(), brand:it.brand.trim(), qty:siN2(it.qty), unit:it.unit, unitFactor:unitFactorFor(siFindProduct(it.productId), it.unit), unitPrice:siN2(it.unitPrice), discountPerc:isDelivery?0:siN2(it.discountPerc), discountFlat:isDelivery||siN2(it.discountPerc)>0?0:siN2(it.discountFlat), discountAmt:parseFloat(siFmt2(disc)), vatPerc:effectiveIsTax?siN2(it.vatPerc):0, vatAmt:parseFloat(siFmt2(vat)), lineTotal:parseFloat(siFmt2(total)), ...(it.batchNo?{ batchNo:it.batchNo }:{}), ...(splitSerials(it.serialNo).length?{ serialNo:splitSerials(it.serialNo).join(", ") }:{}), ...(it.isService&&!it.productId?{ isService:true }:{}), ...(String(siFindProduct(it.productId)?.arabicName||"").trim()?{ nameAr:String(siFindProduct(it.productId).arabicName).trim() }:{}) };
    });
    const formTotals = isDelivery ? siCalcTotals(siDeliveryLines(valid), false) : siCalcTotals(valid, effectiveIsTax, siInvoiceExtras(siForm));
    const { sub, disc, vat, grand } = formTotals;
    // A sales invoice typed in another currency is saved in the shop currency at its exchange rate (siForex.js);
    // amounts already on the bill (paid, receipts) are in the shop currency, so they are compared at that rate.
    const baseCur = String(shop?.currency || "AED").trim().toUpperCase() || "AED";
    const fxOn = kind === "sales" && !isQuote && !isDelivery && isForeignSale(siForm.currency, baseCur);
    const fxK = fxOn ? siN2(siForm.exchangeRate) : 1;
    if (fxOn && !(fxK > 0)) {
      toast(lang==="bn"?` ${String(siForm.currency).toUpperCase()} থেকে ${baseCur}-এর রেট (Exchange Rate) দিন`:`Enter the exchange rate from ${String(siForm.currency).toUpperCase()} to ${baseCur}`,"err"); return null;
    }
    if (grand < -0.001) { toast(lang==="bn"?"সর্বমোট মাইনাস হতে পারে না — সমন্বয়/ছাড় ঠিক করুন":"Grand total cannot be negative — check adjustment/discount","err"); return null; }
    const priorDoc = editInvId ? invoices.find(inv=>inv.id===editInvId) : null;
    if (!canDiscount && !isDelivery) {
      const reduction = (d, adj) => siN2(d) + Math.max(0, -siN2(adj));
      const baseDoc = priorDoc || sourceQuote;
      // The owner-set product/customer discount is automatic, so it never needs the discount permission.
      const autoAllowed = valid.reduce((sum, it) => {
        const auto = siAutoDisc(siFindProduct(it.productId));
        if (!auto) return sum;
        return sum + siCalcLine({ ...it, discountPerc: Math.min(siN2(it.discountPerc), auto), discountFlat: 0 }, effectiveIsTax).disc;
      }, 0);
      const allowed = Math.max(baseDoc ? reduction(baseDoc.totalDiscount, baseDoc.adjustment) : 0, autoAllowed);
      const noDiscountMsg = lang==="bn"?"ডিসকাউন্ট দেওয়ার অনুমতি নেই — মালিকের কাছে পারমিশন নিন":"You are not allowed to give discounts — ask the owner for permission";
      if (reduction(disc, formTotals.adjustment) > allowed + 0.01) {
        toast(noDiscountMsg,"err"); return null;
      }
      // Round Off is for coins only; a larger cut is a discount.
      const roundOff = siN2(siForm.roundOff);
      if (roundOff < -1 && roundOff < siN2(baseDoc?.roundOff) - 0.005) {
        toast(noDiscountMsg,"err"); return null;
      }
      // Lowering the rate below the product's price is a discount too, unless the line already had that rate.
      const underPriced = valid.find((it) => {
        const prod = siFindProduct(it.productId);
        if (!prod) return false;
        const listRate = siN2(siResolveRate(prod, it.unit, siForm.customerType).unitPrice);
        const prior = (baseDoc?.items || []).find((x) => x.productId === it.productId && (x.unit || "") === (it.unit || ""));
        const floor = prior ? Math.min(listRate, siN2(prior.unitPrice)) : listRate;
        return floor > 0 && siN2(it.unitPrice) < floor - 0.005;
      });
      if (underPriced) {
        toast(lang==="bn"?` "${underPriced.name}"-এর দাম কমানোর অনুমতি নেই — মালিকের কাছে পারমিশন নিন`:`You are not allowed to lower the price of "${underPriced.name}" — ask the owner for permission`,"err"); return null;
      }
    }
    if (status==="draft" && priorDoc && !isQuote && priorDoc.status && priorDoc.status!=="draft") {
      toast(lang==="bn"?"সেভ করা বিলকে আবার Draft করা যাবে না":"A saved invoice cannot be turned back into a draft","err"); return null;
    }
    const paymentMethod = extras.paymentMethod || siForm.paymentMethod;
    const isCash      = paymentMethod==="cash";
    // Cash / bank transfer / card settle the bill in full. "Partial cash"is an explicit opt-in
    // for transport-style customers who pay cash later across several bills.
    // Print-as-Cash passes cashPartial:false so a leftover partial tick cannot save the bill unpaid.
    const cashPartial = isCash && (extras.cashPartial != null ? !!extras.cashPartial : !!siForm.cashPartial);
    const plainCash   = siIsSettledPay(paymentMethod, cashPartial);
    // Receipts may have been posted since the form was opened: apply only the user's change on top of the latest paid amount.
    // forceAmountPaid: print-as-credit after cash — setSiForm clear is async; extras must win same tick.
    const typedPaid   = extras.forceAmountPaid != null ? siN2(extras.forceAmountPaid) : siN2(siForm.amountPaid);
    const trackedPaid = priorDoc && !plainCash
      ? siN2(priorDoc.amountPaid) / fxK + (typedPaid - siLoadedPaidRef.current)
      : typedPaid;
    const receiptsOnBill = priorDoc ? (receipts||[]).filter(r=>r.status!=="cancelled" && !r.isRefund)
      .reduce((s,r)=>s+(r.allocations||[]).filter(a=>a.invoiceId===priorDoc.id).reduce((x,a)=>x+siN2(a.amount),0),0) / fxK : 0;
    if (!isDelivery && !isQuote && !plainCash && priorDoc && receiptsOnBill > grand + 0.01) {
      toast(lang==="bn"?`এই বিলে আগেই ${siFmt2(receiptsOnBill)} টাকা নেওয়া হয়েছে — সর্বমোট এর চেয়ে কম করা যাবে না`:` ${siFmt2(receiptsOnBill)} has already been received on this bill — the total cannot go below it`,"err"); return null;
    }
    if (!isDelivery && !isQuote && plainCash && receiptsOnBill > 0.01) {
      toast(lang==="bn"?"এই বিলে Receipt Voucher আছে — Cash করা যাবে না, আগে Receipt বাতিল করুন":"This bill has receipt vouchers — it cannot be made cash; cancel the receipts first","err"); return null;
    }
    if (!isDelivery && !isQuote && !plainCash && (typedPaid < 0 || trackedPaid > grand + 0.01)) {
      toast(lang==="bn"?"পরিশোধিত টাকা মোট বিলের চেয়ে বেশি বা ঋণাত্মক হতে পারে না!":"Amount paid cannot exceed the grand total or be negative!","err"); return null;
    }
    // plain cash invoice: auto fully paid | delivery: confirmed | credit/partial-cash: normal; receipts already posted on the bill always stay counted
    const paid = isDelivery || isQuote ? 0
               : plainCash  ? parseFloat(siFmt2(grand))
               : Math.min(Math.max(trackedPaid,receiptsOnBill,0), Math.max(grand,0));
    const bal  = isDelivery || isQuote ? 0 : Math.max(0, grand - paid);
    const derivedStatus = isQuote ? (status==="confirmed" ? "open" : status)
                        : isDN ? status
                        : isDelivery ? "confirmed"
                        : (status==="confirmed" ? (bal<0.01?"paid":paid>0?"partial":"confirmed") : status);
    const keepConverted = priorDoc?.convertedInvoiceNo ? { convertedInvoiceId:priorDoc.convertedInvoiceId||"", convertedInvoiceNo:priorDoc.convertedInvoiceNo } : {};
    const sourceLink = (src) => { const m = sourceDocOf(src); return { [m.idKey]:src.id, [m.noKey]:src.invoiceNo||"" }; };
    // A delivery note made from a sales order keeps that link, and its invoice inherits it.
    const keepOrder = (doc) => doc?.salesOrderId ? { salesOrderId:doc.salesOrderId, salesOrderNo:doc.salesOrderNo||"" } : {};
    const quoteFields = isQuote ? { docKind:isSO?"salesOrder":"quotation", validUntil:siForm.validUntil||"", ...keepConverted }
      : isDN ? { docKind:"delivery", ...keepConverted, ...(sourceQuote ? sourceLink(sourceQuote) : keepOrder(priorDoc)) }
      : sourceQuote ? { ...keepOrder(sourceQuote), ...sourceLink(sourceQuote) }
      : priorDoc?.deliveryNoteId ? { deliveryNoteId:priorDoc.deliveryNoteId, deliveryNoteNo:priorDoc.deliveryNoteNo||"", ...keepOrder(priorDoc) }
      : priorDoc?.salesOrderId ? keepOrder(priorDoc)
      : priorDoc?.jobOrderId ? { jobOrderId:priorDoc.jobOrderId, jobOrderNo:priorDoc.jobOrderNo||"" }
      : priorDoc?.quotationId ? { quotationId:priorDoc.quotationId, quotationNo:priorDoc.quotationNo||"" } : {};
    const docType = isDN ? "delivery" : isQuote ? (isTax ? "tax" : "regular") : (siForm.invoiceType||"tax");
    // the godown the goods leave from (W01; nothing stored for a main-only shop or a quotation / sales order)
    const trim = (v) => String(v ?? "").trim();
    const fromDn = !isQuote && !isDelivery && sourceQuote && (sourceQuote.docKind === "delivery" || sourceQuote.invoiceType === "delivery");
    const billLocPick = trim(siForm.locationId) || (fromDn ? trim(sourceQuote.locationId) : "");
    const built = { ...quoteFields, ...(isQuote ? {} : billLocationFields(billLocPick, billLocationsOf(shop), { prior: priorDoc })), shopId, invoiceNo:invoiceNoOverride ?? siInvoiceNo, invoiceType:docType, invoiceDate:siForm.invoiceDate, customerId:siForm.customerId||null, customerCode:siForm.customerId?((customers||[]).find(c=>c.id===siForm.customerId)?.customerCode||""):"", customerName:siForm.customerName.trim(), customerMobile:siForm.customerMobile.trim(), customerAddress:siForm.customerAddress.trim(), customerTrn:siForm.customerTrn.trim(), items:builtItems, subtotal:parseFloat(siFmt2(sub)), totalDiscount:parseFloat(siFmt2(disc)), totalVat:parseFloat(siFmt2(vat)), grandTotal:parseFloat(siFmt2(grand)), paymentMethod, cashPartial, amountPaid:parseFloat(siFmt2(paid)), balanceDue:parseFloat(siFmt2(bal)), status:derivedStatus, ...(!isDelivery && !isQuote ? invoicePaymentBankField(paymentMethod, shop, paid, siForm.paymentBank) : {}), deliveryNoteNo:siForm.deliveryNoteNo.trim(), vehicleNo:siForm.vehicleNo.trim(), note:siForm.note.trim(), createdBy:priorDoc?.createdBy||user.uid, createdByName:priorDoc?.createdByName||profile.personName,
      refNo:String(siForm.refNo||"").trim(),
      salesmanId:siForm.salesmanId||"", salesmanName:String(siForm.salesmanName||"").trim(),
      currency:siForm.currency||"AED",
      stockLocation:siForm.stockLocation||"main", stockLocationName:siForm.stockLocationName||"Main",
      billDiscPerc:isDelivery?0:Math.min(Math.max(siN2(siForm.billDiscPerc),0),100),
      billDiscAmt:isDelivery?0:parseFloat(siFmt2(formTotals.billDisc)),
      billDiscount:isDelivery?0:parseFloat(siFmt2(formTotals.billDisc)),
      adjustment:isDelivery?0:siN2(siForm.adjustment),
      // why the adjustment was given (Merge / Masters - adjustment reasons); empty when there is no adjustment
      adjustmentReasonId:!isDelivery&&siN2(siForm.adjustment)?(siForm.adjustmentReasonId||""):"",
      adjustmentReason:!isDelivery&&siN2(siForm.adjustment)?String(siForm.adjustmentReason||"").trim():"",
      roundOff:isDelivery?0:siN2(siForm.roundOff),
      creditDays:Math.max(0, Math.round(siN2(siForm.creditDays))),
      dueDate:!isDelivery && !isQuote && siN2(siForm.creditDays)>0 && siForm.invoiceDate ? siAddDays(siForm.invoiceDate, Math.round(siN2(siForm.creditDays))) : "",
      hideCodeInPrint:!!siForm.hideCodeInPrint,
      // Arabic name / address of the customer for the printed bill (print/arabicPrint.js), from the customer master
      ...(()=>{ const c = siForm.customerId ? (customers||[]).find(x=>x.id===siForm.customerId) : null;
        return { customerNameAr:String(c?.customerNameAr||"").trim(), customerAddressAr:String(c?.addressAr||"").trim() }; })(),
      // a bill switched back to the shop currency drops the old rate and typed figures
      ...(kind==="sales" && !isQuote && !isDelivery && !fxOn ? { exchangeRate:null, fx:null } : {}),
    };
    return fxOn ? saleToBase(built, { rate:fxK, baseCurrency:baseCur }) : built;
  };

  // The customer's master settings: blocked customers can't be billed; cash-only and credit limit ask first.
  const siCustomerTermsOk = (p) => {
    if (kind!=="sales" || p.status==="draft" || p.invoiceType==="delivery" || !p.customerId) return true;
    const cust = (customers||[]).find(c=>c.id===p.customerId);
    if (!cust) return true;
    const priorDoc = editInvId ? invoices.find(inv=>inv.id===editInvId) : null;
    if (cust.status==="blocked" && priorDoc?.customerId!==cust.id) {
      toast(lang==="bn"?` "${cust.customerName}"ব্লক করা কাস্টমার — বিক্রি করা যাবে না`:` "${cust.customerName}"is a blocked customer — cannot be billed`,"err");
      return false;
    }
    if (p.balanceDue<=0.01) return true;
    if (cust.paymentType==="cash" && !window.confirm(lang==="bn"
      ? `"${cust.customerName}"শুধু নগদের কাস্টমার। তবুও বাকিতে ${siFmt2(p.balanceDue)} দেবেন?`
      : `"${cust.customerName}"is a cash-only customer. Give ${siFmt2(p.balanceDue)} on credit anyway?`)) return false;
    const limit = siN2(cust.creditLimit);
    if (limit>0) {
      const outstanding = invoices
        .filter(inv=>inv.id!==editInvId && inv.customerId===cust.id && !["cancelled","draft"].includes(inv.status))
        .reduce((s,inv)=>s+Math.max(0, siN2(inv.balanceDue)), 0);
      if (outstanding + p.balanceDue > limit + 0.01 && !window.confirm(lang==="bn"
        ? `ক্রেডিট লিমিট ছাড়িয়ে যাচ্ছে!\nলিমিট: ${siFmt2(limit)}\nআগের বাকি: ${siFmt2(outstanding)}\nএই বিলের বাকি: ${siFmt2(p.balanceDue)}\nতবুও সেভ করবেন?`
        : `Credit limit exceeded!\nLimit: ${siFmt2(limit)}\nOutstanding: ${siFmt2(outstanding)}\nThis bill due: ${siFmt2(p.balanceDue)}\nSave anyway?`)) return false;
    }
    return true;
  };

  // Selling a batch past its expiry date (inventory/batchExpiry.js): asks first, or refuses when the owner blocks it.
  // Only bills with batch lines are checked; products without batches never see this.
  const siExpiryOk = async (p) => {
    if (isQuote || p.status === "draft" || !(p.items || []).some((it) => it?.productId && it.batchNo)) return true;
    const rows = peekInvoiceRowsCache() || await loadInvoiceRows().catch(() => null);
    if (!rows) return true;
    const ids = new Set(p.items.filter((it) => it?.batchNo).map((it) => it.productId));
    const batchMap = batchStockByProduct((products || []).filter((pr) => ids.has(pr.id)), rows, shopId, new Map());
    const expired = expiredSaleLines(p.items, batchMap, p.invoiceDate);
    if (!expired.length) return true;
    const list = expired.map((x) => `${x.name} [${x.batchNo}] ${x.expiry.split("-").reverse().join("/")}`).join("\n");
    if (batchExpirySettingsOf(shop).blockExpired) {
      toast(lang==="bn"?`মেয়াদ শেষ হওয়া ব্যাচ বিক্রি বন্ধ (মালিকের সেটিং): ${expired.map((x)=>`${x.name} [${x.batchNo}]`).join(", ")}`:`Selling an expired batch is blocked (owner setting): ${expired.map((x)=>`${x.name} [${x.batchNo}]`).join(", ")}`,"err");
      return false;
    }
    return window.confirm(lang==="bn"?`এই ব্যাচগুলোর মেয়াদ বিলের তারিখে শেষ:\n${list}\n\nতবুও বিক্রি করবেন?`:`These batches are past their expiry on the bill date:\n${list}\n\nSell them anyway?`);
  };

  // Oversell check: warns (does not block) when a line needs more than what's actually in
  // stock, using the same invoice-based stock calculation StockBadge already shows on screen.
  const siStockOk = async (p) => {
    if (isQuote || p.status === "draft") return true;
    const productById = new Map((products || []).map((pr) => [pr.id, pr]));
    const needed = new Map();
    (p.items || []).forEach((it) => {
      if (!it?.productId) return;
      const qty = itemBaseQty(it, productById.get(it.productId));
      if (qty > 0) needed.set(it.productId, (needed.get(it.productId) || 0) + qty);
    });
    if (!needed.size) return true;
    // Advisory only. A cold cache is given a few seconds to load (a full wait made Confirm feel stuck); if the rows
    // still are not there the check did not run, and the person is told so instead of the bill passing as checked.
    const rows = await rowsWithin(() => peekInvoiceRowsCache({ allowStale: true }), loadInvoiceRows, 4000);
    if (!rows) {
      return window.confirm(lang==="bn"
        ? "স্টক মিলিয়ে দেখা গেল না (স্টকের হিসাব এখনও লোড হচ্ছে)। মিলিয়ে না দেখেই সেভ করবেন?"
        : "The stock check could not run (stock figures are still loading). Save without checking stock?");
    }
    const stockMap = computeStockMap(products, rows.purchaseInvoices, rows.salesInvoices, shopId, rows.deliveryNotes, {
      ...rows.extras,
      onlyProductIds: new Set(needed.keys()),
    });
    // Editing an already-confirmed invoice: its own old items were already subtracted from
    // the stock map above, so add them back before comparing against the new quantities.
    const priorDoc = editInvId ? invoices.find((inv) => inv.id === editInvId) : null;
    const restored = new Map();
    if (priorDoc && STOCK_AFFECTING_INVOICE_STATUSES.includes(priorDoc.status)) {
      (priorDoc.items || []).forEach((it) => {
        if (!it?.productId) return;
        const qty = itemBaseQty(it, productById.get(it.productId));
        if (qty > 0) restored.set(it.productId, (restored.get(it.productId) || 0) + qty);
      });
    }
    const short = [];
    needed.forEach((qty, id) => {
      const available = (stockMap.get(id) || 0) + (restored.get(id) || 0);
      if (qty > available + 0.0001) short.push({ name: productById.get(id)?.name || id, available, qty });
    });
    // W01: the godown the bill sells from must hold it too (same rule: warn, the person decides)
    if (!short.length) {
      const locations = billLocationsOf(shop);
      if (!hasGodowns(locations)) return true;
      const locationId = billLocationId(p, locations);
      let moves = [];
      try { moves = rowsOf(await offlineList("locationMoves")); } catch { moves = []; }
      const stock = billLocationStock({ products, rows, moves, locations, shopId, asOf: String(p.invoiceDate || "").slice(0, 10), skipDocId: editInvId || "" });
      const here = locationShortfalls(p.items, { products, stock, locationId });
      if (!here.length) return true;
      const where = locationPath(locations, locationId, lang==="bn");
      const list = here.slice(0, 5).map((s) => `${s.name}: ${lang==="bn"?"আছে":"have"} ${siFmt2(s.have)}, ${lang==="bn"?"লাগবে":"need"} ${siFmt2(s.need)}`).join("\n");
      return window.confirm(lang==="bn"
        ? `${where}-এ এত স্টক নেই (অন্য গুদামে থাকতে পারে - আগে স্টক হাব > গোডাউন থেকে সরান):\n${list}\n\nতবুও সেভ করবেন?`
        : `Not enough at ${where} (it may be in another godown - move it first in Stock Hub > Godowns):\n${list}\n\nSave anyway?`);
    }
    const list = short.slice(0, 5).map((s) => `${s.name}: ${lang==="bn"?"আছে":"have"} ${siFmt2(s.available)}, ${lang==="bn"?"লাগবে":"need"} ${siFmt2(s.qty)}`).join("\n");
    return window.confirm(lang==="bn"
      ? `স্টকের চেয়ে বেশি বিক্রি হচ্ছে:\n${list}\n\nতবুও সেভ করবেন?`
      : `Selling more than what's in stock:\n${list}\n\nSave anyway?`);
  };

  const saveSalesInvoiceOffline = async (payload, successMessage, options = {}) => {
    const nowIso = new Date().toISOString();
    const priorInvoice = editInvId ? invoices.find(inv => inv.id === editInvId) : null;
    let savedInvoice;
    const deferPersist = { deferPersist: true };

    if (editInvId) {
      const result = await offlineUpdate(COL, editInvId, {
        ...payload,
        updatedAt: nowIso,
        updatedBy: user?.uid || "",
      }, deferPersist);

      savedInvoice = { ...result.data, id: editInvId };
      setInvoices(prev => prev.map(inv => inv.id === editInvId ? savedInvoice : inv));
      setSelInv(prev => prev && prev.id === editInvId ? savedInvoice : prev);
      toast(successMessage || t.si_updated);
      if (priorInvoice && priorInvoice.status !== "draft") {
        logAudit({ shopId, user, profile, action:"edit", collection:COL, docId:editInvId, docNo:payload.invoiceNo, amount:payload.grandTotal,
          note:`${payload.customerName||""} · ${siFmt2(priorInvoice.grandTotal)} → ${siFmt2(payload.grandTotal)}` });
      }
    } else {
      const result = await offlineCreate(COL, {
        ...payload,
        createdAt: nowIso,
        updatedAt: nowIso,
      }, deferPersist);

      savedInvoice = { ...result.data, id: result.documentId };
      setInvoices(prev => [savedInvoice, ...prev]);
      toast(successMessage);
    }

    // Goods on an invoice made from a delivery note already left stock with the delivery note.
    if (!isQuote && !payload.deliveryNoteId) await applyInvoiceStockEffect({
      oldInvoice: priorInvoice,
      newInvoice: payload,
      invoiceId: savedInvoice.id,
      applyType: "sale",
      reverseType: "return",
      referenceType: isDN ? "delivery_note" : "sales_invoice",
      unitCostKey: "unitPrice",
      shopId,
      actor: { uid: user?.uid, personName: profile?.personName },
    });

    if (!editInvId) bumpShopSiSerial(payload.invoiceNo);

    if ((kind==="sales" || isDN) && !editInvId && sourceQuote?.id) {
      const src = sourceDocOf(sourceQuote);
      try {
        const latestSrc = await offlineGetById(src.col, sourceQuote.id).catch(() => null);
        const baseSrc = latestSrc?.data ? { ...latestSrc.data, id: sourceQuote.id } : sourceQuote;
        await offlineUpdate(src.col, sourceQuote.id, {
          ...baseSrc,
          ...(sourceQuote.docKind==="jobOrder" ? { prevStatus: baseSrc.status || "", invoicedAt: baseSrc.invoicedAt || nowIso, statusHistory: [...(baseSrc.statusHistory || []), { status: "invoiced", at: nowIso, by: profile?.personName || "" }] } : {}),
          status: sourceQuote.docKind==="quotation" || !sourceQuote.docKind ? "converted" : isDN ? "delivered" : "invoiced",
          convertedInvoiceId: savedInvoice.id,
          convertedInvoiceNo: payload.invoiceNo,
          updatedAt: nowIso,
          updatedBy: user?.uid || "",
        }, { deferPersist: true });
      } catch (err) {
        console.warn("[S4 SI] mark source document converted failed", err);
      }
      setSourceQuote(null);
    }

    persistOfflineDb().catch((err) => console.warn("[S4 SI] persist after save failed", err));

    if (navigator.onLine) {
      window.S4Offline?.syncNow?.().catch(err => console.warn("[S4 Sync] sales invoice save sync failed", err));
    }

    if (options.print === "direct") {
      siPrint?.(savedInvoice);
    }

    if (!editInvId) {
      siOpenNew(null, payload.invoiceNo);
    } else {
      setSelInv(savedInvoice);
      setSiView("detail");
    }

    if (options.print === true) {
      setSiPrintModal(savedInvoice);
    }

    // Optional cash-drawer kick after a successful cash sales confirm (Print Settings). Never fake success.
    if (kind === "sales" && !isQuote && !isDN && payload.status !== "draft" && payload.paymentMethod === "cash") {
      try {
        const { loadPrintSettings, kickCashDrawer } = await import("../print/printSettings.js");
        const { normalizeDrawerSettings } = await import("../counter/cashDrawer.js");
        if (normalizeDrawerSettings(loadPrintSettings()).openDrawerAfterCash) {
          const kick = await kickCashDrawer(lang);
          if (!kick.ok) toast?.(kick.error || (lang === "bn" ? "ড্রয়ার খোলা যায়নি" : "Could not open the drawer"), "err");
        }
      } catch (err) {
        console.warn("[S4 SI] drawer kick after cash failed", err);
      }
    }

    // Auto WhatsApp for customers who asked for it; the bill is already saved and nothing here can undo that.
    afterInvoiceSaved(onInvoiceSaved, savedInvoice, priorInvoice);

    return savedInvoice;
  };

  const siSaveRun = async (status, successMsg, options) => {
    if (siSaveLockRef.current) return;
    siSaveLockRef.current = true;
    setSiSaving(true);
    try {
      const lockedBy = editInvId ? billReturns.filter(r => r.status !== "cancelled" && r.invoiceId === editInvId) : [];
      if (lockedBy.length) {
        toast(lang==="bn" ? `এই বিলে রিটার্ন আছে (${lockedBy.map(r=>r.returnNo).join(", ")}) — আগে রিটার্ন বাতিল করুন` : `This bill has return(s) ${lockedBy.map(r=>r.returnNo).join(", ")}; cancel them before editing`, "err");
        return;
      }
      if ((kind==="sales" || isDN) && !editInvId && sourceQuote?.id) {
        const latest = await offlineGetById(sourceDocOf(sourceQuote).col, sourceQuote.id).catch(() => null);
        const src = latest?.data || null;
        if (src && ["converted","invoiced","delivered"].includes(src.status)) {
          toast(lang==="bn"
            ? `${sourceQuote.invoiceNo} আগেই ${src.convertedInvoiceNo ? `→ ${src.convertedInvoiceNo} ` : ""}রূপান্তরিত — আরেকটা ইনভয়েস বানানো যাবে না`
            : `${sourceQuote.invoiceNo} was already converted${src.convertedInvoiceNo ? `to ${src.convertedInvoiceNo}` : ""} — cannot create another invoice`, "err");
          return;
        }
        if (src?.status==="cancelled") {
          toast(lang==="bn" ? `${sourceQuote.invoiceNo} বাতিল করা হয়েছে` : `${sourceQuote.invoiceNo} has been cancelled`, "err");
          return;
        }
      }
      const p = siBuild(status, siInvoiceNo, options);
      if (!p) return;
      if (!siCustomerTermsOk(p)) return;
      if (status!=="draft" && !isQuote && !unlinkedStockOk(p.items, lang)) return;
      if (!(await siStockOk(p))) return;
      if (!(await siExpiryOk(p))) return;
      // Use the number already on the form. Awaiting Firebase reserveShopSerial used to block
      // every new Confirm for up to several seconds; bumpShopSiSerial still advances the shop
      // counter after a successful local save.
      if (!editInvId) p.invoiceNo = siInvoiceNo;
      await saveSalesInvoiceOffline(p, editInvId ? t.si_updated : successMsg, options);
    } catch(e) {
      toast(e.message,"err");
    } finally {
      siSaveLockRef.current = false;
      setSiSaving(false);
    }
  };
  const siSaveDraft = () => siSaveRun("draft", t.si_saved);
  const siConfirm = (options) => {
    const extra = options && typeof options === "object" && !options.nativeEvent ? options : {};
    // Default print modal; Save & Print callers pass print:"direct".
    return siSaveRun("confirmed", t.si_confirmed, { print: true, ...extra });
  };
  return { siConfirm, siSaveDraft };
}
