import { batchStockByProduct, saleBatchChoices } from "../inventory/batchStock";
import { computeStockMap, loadInvoiceRows } from "../inventory/stockFromInvoices";
import { nextPartyCode } from "../shared/appShared.jsx";
import { normCustomerType, siEmptyLine, siResolveRate } from "./siHelpers.js";
import { offlineCreate } from "../offline/offlineRepository";
import { siN2, siProductRateRows } from "./salesInvoiceShared.js";

export function createSiLineActions({ canManageCustomers, customers, isDN, isQuote, kind, lang, onCustomerCreated, products, setShowCustPicker, setSiBatchAsk, setSiCurrent, setSiEditLineId, setSiForm, setSiLines, shopId, siCurrent, siEditLineId, siEmptyCurrent, siForm, siLines, siNameRef, siQtyRef, t, toast, user }) {
  const siUpd=(k,v)=>setSiForm(p=>({...p,[k]:v}));
  const siAddLine=()=>setSiLines(p=>[...p,siEmptyLine()]);
  const siFindProduct = (productId) => productId ? products.find(p=>p.id===productId) : null;
  // Re-price a line for a new unit; keep a hand-typed name unless it is the product's own/alternate name.
  const siRepriceForUnit = (item, unit, customerType = siForm.customerType) => {
    const prod = siFindProduct(item.productId);
    if (!prod) return { ...item, unit };
    const rate = siResolveRate(prod, unit, customerType);
    const autoNames = new Set([prod.name, ...siProductRateRows(prod).map(r=>String(r.altName||"").trim())].filter(Boolean));
    return {
      ...item,
      unit,
      unitPrice: String(rate.unitPrice || item.unitPrice || ""),
      name: autoNames.has(item.name) ? rate.name : item.name,
    };
  };
  const siUpdLine=(id,f,v)=>setSiLines(p=>p.map(it=>{
    if (it.id!==id) return it;
    return f==="unit" ? siRepriceForUnit(it, v) : {...it,[f]:v};
  }));
  const siChangeCurrentUnit=(unit)=>setSiCurrent(p=>siRepriceForUnit(p, unit));
  const siDelLine=(id)=>setSiLines(p=>p.filter(it=>it.id!==id));

  // A line starts with the larger of the product's default discount and the customer's discount.
  const siAutoDisc = (prod, customer) => {
    if (isDN || siForm.invoiceType==="delivery" || !prod) return 0;
    const c = customer !== undefined ? customer : (customers||[]).find(x=>x.id===siForm.customerId);
    return Math.max(0, Math.min(100, Math.max(siN2(prod.defaultDiscount), siN2(c?.discountPerc))));
  };

  // Quick add: adds product as new line directly from picker
  const siAddProductLine = async (prod) => {
    const unit = prod.unit||"Pcs";
    const rate = siResolveRate(prod, unit, siForm.customerType);
    const draftLine = {
      ...siEmptyLine(),
      productId:  prod.id,
      name:       rate.name,
      code:       prod.code||prod.barcode||"",
      brand:      prod.brand||"",
      unit,
      unitPrice:  rate.unitPrice,
      discountPerc: String(siAutoDisc(prod)),
      vatPerc:    prod.salesVat||"5",
      qty:        "1",
    };
    const newLine = await siPickBatch(draftLine);
    if (newLine) setSiLines(p=>[...p, newLine]);
  };

  const siSelectProduct=(prod)=>{
    const unit = prod.unit||"Pcs";
    const rate = siResolveRate(prod, unit, siForm.customerType);
    setSiCurrent(p=>({
      ...p,
      productId: prod.id,
      name:      rate.name,
      code:      prod.code||prod.barcode||"",
      brand:     prod.brand||"",
      unit,
      unitPrice: rate.unitPrice||p.unitPrice,
      discountPerc: String(siAutoDisc(prod)),
      vatPerc:   prod.salesVat||"5",
      batchNo:   undefined,
    }));
    setTimeout(()=>siQtyRef.current?.focus(), 100);
  };

  // A product kept in separate batches asks which batch the goods leave from; null means the user closed the window.
  const siPickBatch = async (line) => {
    if (isQuote || !line.productId || line.batchNo !== undefined) return line;
    const prod = siFindProduct(line.productId);
    if (!prod) return line;
    let choices = [];
    try {
      const rows = await loadInvoiceRows();
      const stockMap = computeStockMap([prod], rows.purchaseInvoices, rows.salesInvoices, shopId, rows.deliveryNotes, rows.extras);
      choices = saleBatchChoices(batchStockByProduct([prod], rows, shopId, stockMap).get(prod.id));
    } catch (err) { console.warn("[S4 SI] batch lookup failed", err); }
    if (choices.length < 2) return choices[0] && !choices[0].isMain ? { ...line, batchNo:choices[0].batchNo } : line;
    const picked = await new Promise(resolve => setSiBatchAsk({ product:prod, choices, resolve }));
    setSiBatchAsk(null);
    if (!picked) return null;
    return picked.isMain ? line : { ...line, batchNo:picked.batchNo };
  };

  const siAddCurrentItem = async () => {
    if (!siCurrent.name.trim()) { toast(t.si_errName,"err"); return; }
    if (!siCurrent.qty||siN2(siCurrent.qty)<=0) { toast(t.si_errQty,"err"); return; }
    const editId = siEditLineId;
    const entry = editId && siCurrent.batchNo !== undefined ? siCurrent : await siPickBatch(siCurrent);
    if (!entry) { setTimeout(()=>siQtyRef.current?.focus(), 80); return; }
    setSiLines(prev=>editId && prev.some(x=>x.id===editId)
      ? prev.map(x=>x.id===editId ? { ...entry, id:editId } : x)
      : [...prev, { ...entry, id:`${Date.now()}-${Math.random().toString(36).slice(2,8)}` }]);
    setSiEditLineId(null);
    setSiCurrent(siEmptyCurrent());
    setTimeout(()=>siNameRef.current?.focus(), 80);
  };

  const siSelectCustomer=(c)=>{
    siUpd("customerId",c.id); siUpd("customerName",c.customerName);
    siUpd("customerMobile",c.mobileNumber||"");
    siUpd("customerAddress",[c.address,c.area,c.city].filter(Boolean).join(", ")||"");
    siUpd("customerTrn",c.trnNumber||"");
    siUpd("customerType",c.customerType||"");
    const termDays = parseInt(String(c.paymentTerms||"").replace(/[^\d]/g,""),10);
    siUpd("creditDays", Number.isFinite(termDays)&&termDays>0 ? String(termDays) : "");
    if (kind==="sales") {
      const pm = c.paymentType === "credit" ? "credit" : "cash";
      setSiForm((p) => ({ ...p, paymentMethod: pm, amountPaid: pm === "credit" ? "" : p.amountPaid }));
    }
    setShowCustPicker(false);
    // Lines still on the old automatic discount move to the new customer's; hand-typed discounts stay.
    const oldCustomer = (customers||[]).find(x=>x.id===siForm.customerId) || null;
    const applyDisc = (it) => {
      const prod = siFindProduct(it.productId);
      if (!prod) return it;
      const before = siAutoDisc(prod, oldCustomer);
      const after = siAutoDisc(prod, c);
      return before !== after && Math.abs(siN2(it.discountPerc) - before) < 0.001 ? { ...it, discountPerc:String(after) } : it;
    };
    const newType = c.customerType||"";
    if (normCustomerType(newType) === normCustomerType(siForm.customerType)) {
      setSiLines(p=>p.map(applyDisc));
      setSiCurrent(p=>applyDisc(p));
      return;
    }
    let changed = 0;
    const reprice = (raw) => {
      const it = applyDisc(raw);
      if (!it.productId) return it;
      const next = siRepriceForUnit(it, it.unit, newType);
      if (String(next.unitPrice) !== String(it.unitPrice) || next.name !== it.name) changed += 1;
      return next;
    };
    const repricedLines = siLines.map(reprice);
    const repricedCurrent = reprice(siCurrent);
    setSiLines(repricedLines);
    setSiCurrent(repricedCurrent);
    if (changed) toast(lang==="bn"
      ? `${changed}টি item-এর দাম নতুন customer type অনুযায়ী বদলানো হয়েছে`
      : `Prices of ${changed} item(s) updated for the new customer type`);
  };

  const siQuickAddCustomer = async (customerName) => {
    if (!canManageCustomers) {
      toast(lang==="bn"?"কাস্টমার যোগ করার permission নেই":"No permission to add customers","err");
      return;
    }
    const name = String(customerName || "").trim();
    if (!name) return;

    try {
      const now = new Date().toISOString();
      const result = await offlineCreate("customers", {
        shopId,
        customerName: name,
        customerCode: await nextPartyCode(shopId, "customers", customers),
        mobileNumber: "",
        createdBy: user.uid,
        createdAt: now,
      });
      const created = { ...result.data, id: result.documentId, customerName: name };
      onCustomerCreated?.(created);
      siSelectCustomer(created);
      toast(lang==="bn"?"✅ কাস্টমার যোগ হয়েছে":"✅ Customer added");

      if (navigator.onLine) {
        window.S4Offline?.syncNow?.().catch(err => console.warn("[S4 Sync] customer quick-add sync failed", err));
      }
    } catch (error) {
      toast(error?.message || String(error), "err");
    }
  };
  return { siAddCurrentItem, siAutoDisc, siChangeCurrentUnit, siDelLine, siFindProduct, siQuickAddCustomer, siSelectCustomer, siSelectProduct, siUpd };
}
