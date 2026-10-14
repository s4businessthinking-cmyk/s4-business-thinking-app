import { localIsoDate } from "../utils/localIsoDate.js";
import { piR2, piN2 } from "../shared/appShared.jsx";

export const PMT_PREFIX      = "PMT-";

export const PI_UNITS        = ["Pcs","Set","Nos","Kg","Ltr","Box","Cm","Mtr","Dz"];

export const PI_PAY_METHODS  = {
  cash:   { bn:"নগদ",            en:"Cash",          icon:"💵" },
  bank:   { bn:"ব্যাংক ট্রান্সফার", en:"Bank Transfer",  icon:"🏦" },
  cheque: { bn:"চেক",             en:"Cheque",         icon:"📃" },
  credit: { bn:"বাকি (ক্রেডিট)",  en:"Credit",         icon:"📅" },
};

export const VOUCHER_CARD_TYPES = ["Visa", "Mastercard", "American Express", "Debit Card", "Other"];

export const PI_CHEQUE_STATUSES = {
  pending:  { bn:"⏳ অপেক্ষমান",      en:"⏳ Pending",  color:"#f59e0b", bg:"#451a03" },
  cleared:  { bn:"✅ ক্লিয়ার হয়েছে",  en:"✅ Cleared",  color:"#22c55e", bg:"#052e16" },
  bounced:  { bn:"❌ বাউন্স হয়েছে",   en:"❌ Bounced",  color:"#ef4444", bg:"#450a0a" },
};

export const PI_STATUSES = {
  draft:     { bn:"ড্রাফট",        en:"Draft",     color:"#f59e0b", bg:"#451a03" },
  confirmed: { bn:"নিশ্চিত",       en:"Confirmed", color:"#06b6d4", bg:"#083344" },
  partial:   { bn:"আংশিক পরিশোধ", en:"Partial",   color:"#a855f7", bg:"#2e1065" },
  paid:      { bn:"পরিশোধিত",     en:"Paid",      color:"#22c55e", bg:"#052e16" },
  cancelled: { bn:"বাতিল",        en:"Cancelled", color:"#71717a", bg:"#27272a" },
};

export const piToday    = () => localIsoDate();

export function piCalcLine(it) {
  const qty=piN2(it.qty), cost=piN2(it.unitCost), dp=Math.min(Math.max(piN2(it.discountPerc),0),100), tp=Math.max(piN2(it.taxPerc),0);
  // Dis % wins; with no % the flat Dis Amt applies (never more than the line amount), as on sales.
  const gross=piR2(qty*cost), disc=dp>0 ? piR2(gross*dp/100) : piR2(Math.min(Math.max(piN2(it.discountFlat),0), gross));
  const base=piR2(gross-disc), tax=piR2(base*tp/100);
  return { gross, disc, tax, total:piR2(base+tax) };
}

export function piCalcTotals(items) {
  let sub=0,disc=0,tax=0,grand=0;
  items.forEach(it=>{ const c=piCalcLine(it); sub+=c.gross; disc+=c.disc; tax+=c.tax; grand+=c.total; });
  return { sub:piR2(sub), disc:piR2(disc), tax:piR2(tax), grand:piR2(grand) };
}

export function piEmptyLine() {
  return { id:`${Date.now()}-${Math.random().toString(36).slice(2,8)}`, productId:null, name:"", code:"", brand:"", qty:"", unit:"Pcs", unitCost:"", discountPerc:"0", discountFlat:"", taxPerc:"5", salePrice:"" };
}

export function piEmptyCurrent() {
  return { productId:null, name:"", code:"", brand:"", qty:"", unit:"Pcs", unitCost:"", discountPerc:"0", discountFlat:"", taxPerc:"5", salePrice:"" };
}

export function piEmptyForm() {
  return { invoiceDate:piToday(), supplierInvoiceNo:"", refNo:"", currency:"", exchangeRate:"", vendorId:"", vendorName:"", vendorMobile:"", paymentMethod:"cash", amountPaid:"", note:"" };
}
