import { QT_VALID_DAYS, siAddDays, siEmptyForm, siToday } from "./siHelpers.js";
import { SI_PAY, siN2 } from "./salesInvoiceShared.js";
import { db } from "../firebase-config";
import { deviceSerialTag, reserveShopSerial } from "../shared/appShared.jsx";
import { doc, runTransaction } from "../backend/firestore";
import { isOpeningBill } from "../utils/openingBill.js";

export function createSiNumbering({ DOC_PREFIX, customers, editInvId, invoices, isDN, isOwner, isQuote, isSO, kind, lang, profile, serialField, serialRe, setEditInvId, setSiCurrent, setSiForm, setSiInvoiceNo, setSiLines, setSiView, setSourceQuote, shop, shopId, siEmptyCurrent, siInvoiceNo, siLoadedPaidRef, siSnapRef, team, toast, user }) {
  const siMaxLocalSerial = () => invoices.reduce((mx, inv) => {
    const m = String(inv.invoiceNo || "").match(serialRe);
    return m ? Math.max(mx, Number(m[1])) : mx;
  }, Number(shop?.[serialField] || 0));

  const siFormatInvoiceNo = (serial) =>
    `${DOC_PREFIX}${String(serial).padStart(4, "0")}`;

  const siPreviewNextInvoiceNo = () =>
    siFormatInvoiceNo(siMaxLocalSerial() + 1);

  const reserveSiInvoiceNo = async () => {
    if (editInvId) return siInvoiceNo;
    const local = siMaxLocalSerial();
    const serial = await reserveShopSerial(shopId, serialField, local);
    const no = serial ? siFormatInvoiceNo(serial)
      : isOwner ? siFormatInvoiceNo(local + 1)
      : `${siFormatInvoiceNo(local + 1)}-${deviceSerialTag()}`;
    setSiInvoiceNo(no);
    return no;
  };

  const bumpShopSiSerial = (invoiceNo) => {
    const m = String(invoiceNo || "").match(serialRe);
    if (!m || !navigator.onLine) return;
    const serial = Number(m[1]);
    if (!Number.isFinite(serial) || serial <= 0) return;
    runTransaction(db, async tx => {
      const shopRef = doc(db, "shops", shopId);
      const shopSnap = await tx.get(shopRef);
      const current = Number(shopSnap.data()?.[serialField] || 0);
      if (serial > current) tx.update(shopRef, { [serialField]: serial });
    }).catch(err => console.warn(`[S4 SI] ${serialField} background bump failed`, err));
  };

  const siOpenNew = (customer=null) => {
    setSiInvoiceNo(siPreviewNextInvoiceNo());
    const termDays = customer ? parseInt(String(customer.paymentTerms||"").replace(/[^\d]/g,""),10) : 0;
    const customerFields = customer ? {
      customerId:customer.id, customerName:customer.customerName||"", customerMobile:customer.mobileNumber||"",
      customerAddress:[customer.address,customer.area,customer.city].filter(Boolean).join(", "),
      customerTrn:customer.trnNumber||"", customerType:customer.customerType||"",
      creditDays:Number.isFinite(termDays)&&termDays>0 ? String(termDays) : "",
      ...(kind==="sales" && customer.paymentType==="credit" ? { paymentMethod:"credit", amountPaid:"" } : {}),
    } : {};
    const myDefaults = team.find(m=>(m.uid||m.id)===user?.uid)?.defaults || profile?.defaults || {};
    const salesmanDefault = myDefaults.salesmanId
      ? { salesmanId:myDefaults.salesmanId, salesmanName:myDefaults.salesmanName||"" }
      : { salesmanId:user?.uid||"", salesmanName:profile?.personName||"" };
    const payDefault = kind==="sales" ? {} : (SI_PAY[myDefaults.paymentMethod] ? { paymentMethod:myDefaults.paymentMethod } : {});
    const billTypeDefault = ["tax","regular"].includes(myDefaults.billType) ? { invoiceType:myDefaults.billType } : {};
    setSiForm({ ...siEmptyForm(), ...billTypeDefault, ...(isDN?{ invoiceType:"delivery" }:{}), ...salesmanDefault, ...payDefault, validUntil:isQuote&&!isSO?siAddDays(siToday(), QT_VALID_DAYS):"", ...customerFields });
    setSiLines([]);
    setSiCurrent(siEmptyCurrent());
    setEditInvId(null);
    setSourceQuote(null);
    setSiView("form");
  };

  const siLoadDoc=(inv)=>{
    siLoadedPaidRef.current = inv.paymentMethod==="cash" ? 0 : siN2(inv.amountPaid);
    setSiForm({
      invoiceType:inv.invoiceType||"regular", invoiceDate:inv.invoiceDate,
      customerId:inv.customerId||"", customerName:inv.customerName||"",
      customerMobile:inv.customerMobile||"", customerAddress:inv.customerAddress||"",
      customerTrn:inv.customerTrn||"", paymentMethod:inv.paymentMethod||"cash",
      customerType:(customers||[]).find(c=>c.id===inv.customerId)?.customerType||"",
      // Cash is always auto-paid — don't pre-fill amountPaid so switching to credit gives 0
      amountPaid: inv.paymentMethod==="cash" ? "" : (inv.amountPaid>0?String(inv.amountPaid):""),
      deliveryNoteNo:inv.deliveryNoteNo||"", vehicleNo:inv.vehicleNo||"", note:inv.note||"",
      refNo:inv.refNo||"", salesmanId:inv.salesmanId||"", salesmanName:inv.salesmanName||"",
      currency:inv.currency||"AED", stockLocation:inv.stockLocation||"main", stockLocationName:inv.stockLocationName||"Main",
      billDiscPerc:siN2(inv.billDiscPerc)>0?String(inv.billDiscPerc):"",
      billDiscAmt:siN2(inv.billDiscPerc)>0?"":(siN2(inv.billDiscAmt)>0?String(inv.billDiscAmt):""),
      adjustment:siN2(inv.adjustment)?String(inv.adjustment):"", roundOff:siN2(inv.roundOff)?String(inv.roundOff):"",
      creditDays:siN2(inv.creditDays)>0?String(inv.creditDays):"",
      hideCodeInPrint:!!inv.hideCodeInPrint,
      validUntil:inv.validUntil||"",
    });
    setSiLines((inv.items||[]).map(it=>({ id:`${Date.now()}-${Math.random().toString(36).slice(2,8)}`, productId:it.productId||null, name:it.name||"", code:it.code||"", brand:it.brand||"", qty:String(it.qty||""), unit:it.unit||"Pcs", unitPrice:String(it.unitPrice||""), discountPerc:String(it.discountPerc||"0"), discountFlat:siN2(it.discountFlat)>0?String(it.discountFlat):"", vatPerc:it.vatPerc!=null&&it.vatPerc!==""?String(it.vatPerc):"5", batchNo:it.batchNo||"", ...(it.isService?{ isService:true }:{}) })));
    setSiCurrent(siEmptyCurrent());
  };
  // viewOnly: load any saved document into the desktop form read-only (it shows Edit only where siCanEditDoc allows).
  const siOpenEdit=(inv, { viewOnly=false }={})=>{
    if (!viewOnly && isOpeningBill(inv)) { toast(lang==="bn" ? "এটা Opening Balance বিল — কাস্টমার মাস্টার থেকে শুরুর ব্যালেন্স বদলান।" : "This is an Opening Balance bill — change the opening balance in Customer Master.", "err"); return; }
    siSnapRef.current = "pending";
    siLoadDoc(inv);
    setSiInvoiceNo(inv.invoiceNo);
    setSourceQuote(null);
    setEditInvId(inv.id); setSiView("form");
  };
  return { bumpShopSiSerial, reserveSiInvoiceNo, siLoadDoc, siOpenEdit, siOpenNew, siPreviewNextInvoiceNo };
}
