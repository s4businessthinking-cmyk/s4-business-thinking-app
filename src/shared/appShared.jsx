import { runTransaction, doc } from "../backend/firestore";
import { db } from "../firebase-config";
import { itemBaseQty } from "../inventory/unitConversion";
import { buildStockLedgerEntry, STOCK_COLLECTIONS } from "../inventory/stockManagementService";
import { offlineBulkUpsert } from "../offline/offlineRepository";
import { useRef, useEffect } from "react";
import s4LogoUrl from "../assets/s4-logo.png";

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

export const LOGO_URL = s4LogoUrl;

export const APP_NAME = "S4 Business Thinking";

// ─── THEME PALETTES ──────────────────────────────────────────
export const THEMES = {
  dark: {
    bgRoot:"#071427",
    bgCard:"#132238",
    bgInp:"#1e3350",
    bgSel:"#172a44",
    bgHdr:"#132238",
    bgSidebar:"#0f2a4f",
    bgOiCard:"#14243a",
    border:"#34506f",
    borderMid:"#4f6f92",
    txtPrimary:"#f8fafc",
    txtSecondary:"#dbeafe",
    txtMuted:"#b6c7df",
    txtFaint:"#8fa8c6",
    accent:"#60a5fa",
    accentDim:"#0b3b6a",
  },
  light: {
    bgRoot:"#eef6ff", bgCard:"#ffffff", bgInp:"#f8fbff", bgSel:"#ffffff",
    bgHdr:"#ffffff", bgSidebar:"#ffffff", bgOiCard:"#f8fbff",
    border:"#dbeafe", borderMid:"#bfdbfe",
    txtPrimary:"#0f172a", txtSecondary:"#1e293b", txtMuted:"#475569", txtFaint:"#64748b",
    accent:"#2563eb", accentDim:"#dbeafe",
  },
  // Product Master's Windows/ERP skin; applied to every menu on mobile.
  erp: {
    bgRoot:"#f3e6c8", bgCard:"#fbf5e6", bgInp:"#ffffff", bgSel:"#ffffff",
    bgHdr:"#d9e7f7", bgSidebar:"#d9e7f7", bgOiCard:"#fffaf0",
    border:"#b9c5d6", borderMid:"#7d94b7",
    txtPrimary:"#07101c", txtSecondary:"#1f2937", txtMuted:"#475569", txtFaint:"#64748b",
    accent:"#315eb8", accentDim:"#d4e3f4",
  },
  erpDark: {
    bgRoot:"#121b29", bgCard:"#1b2738", bgInp:"#0d1522", bgSel:"#0d1522",
    bgHdr:"#16243a", bgSidebar:"#16243a", bgOiCard:"#18233a",
    border:"#2f4766", borderMid:"#4f6f92",
    txtPrimary:"#f8fafc", txtSecondary:"#dbeafe", txtMuted:"#b6c7df", txtFaint:"#8fa8c6",
    accent:"#6b9cf0", accentDim:"#1e3a68",
  },
};

// ─── STYLES FUNCTION ─────────────────────────────────────────
export function getStyles(th) { return {
  root:        { minHeight:"100vh", background:th.bgRoot, color:th.txtSecondary, fontFamily:"'Segoe UI', system-ui, sans-serif" },
  notif:       { position:"fixed", top:16, right:16, zIndex:20000, padding:"12px 20px", borderRadius:10, borderWidth:1, borderStyle:"solid", fontSize:13, fontWeight:600, maxWidth:320, boxShadow:"0 4px 20px rgba(0,0,0,0.3)" },
  hdr:         { display:"flex", alignItems:"center", justifyContent:"space-between", padding:"12px 14px", borderBottom:`1px solid ${th.border}`, background:th.bgHdr, position:"sticky", top:0, zIndex:10, flexWrap:"wrap", gap:8 },
  hLeft:       { display:"flex", alignItems:"center", gap:10 },
  title:       { fontSize:14, fontWeight:800, color:th.accent, lineHeight:1.1 },
  title3dBase: {
    fontSize:16,
    fontWeight:900,
    lineHeight:1.08,
    letterSpacing:.2,
    display:"inline-block",
    color:th.accent,
    backgroundClip:"text",
    WebkitBackgroundClip:"text",
    WebkitTextFillColor:"transparent",
    backgroundSize:"250% 250%",
    animation:"s4TitleFloat 2.4s ease-in-out infinite, s4TitleShine 4.8s ease-in-out infinite, s4TitleGlowPulse 2.8s ease-in-out infinite",
    transition:"all .45s ease",
    transformStyle:"preserve-3d",
    whiteSpace:"nowrap",
  },
  title3dVariants: [
    { backgroundImage:"linear-gradient(135deg,#bfdbfe,#60a5fa,#2563eb,#93c5fd)", textShadow:"0 1px 0 #0b1220, 0 2px 0 #0f172a, 0 8px 16px rgba(37,99,235,.45)" },
    { backgroundImage:"linear-gradient(135deg,#fff7ed,#fbbf24,#f97316,#fde68a)", textShadow:"0 1px 0 #451a03, 0 2px 0 #78350f, 0 8px 18px rgba(251,191,36,.38)" },
    { backgroundImage:"linear-gradient(135deg,#ecfeff,#22d3ee,#3b82f6,#a78bfa)", textShadow:"0 1px 0 #082f49, 0 2px 0 #1e1b4b, 0 0 18px rgba(34,211,238,.55)" },
    { backgroundImage:"linear-gradient(135deg,#ffffff,#cbd5e1,#60a5fa,#ffffff)", textShadow:"0 1px 0 #1e293b, 0 2px 0 #334155, 0 10px 20px rgba(148,163,184,.36)" },
  ],
  sub:         { fontSize:10, color:th.txtMuted },
  langSw:      { display:"flex", borderRadius:8, overflow:"hidden", border:`1px solid ${th.borderMid}` },
  lBtn:        { padding:"6px 12px", border:"none", background:"transparent", color:th.txtMuted, cursor:"pointer", fontSize:12, fontWeight:700 },
  lBtnA:       { background:th.accent, color:"#fff" },
  tabs:        { display:"flex", gap:5, flexWrap:"wrap", maxWidth:"100%", overflowX:"auto" },
  tab:         { padding:"7px 11px", borderRadius:8, border:`1px solid ${th.borderMid}`, background:"transparent", color:th.txtMuted, cursor:"pointer", fontSize:12, fontWeight:600, position:"relative" },
  tabA:        { background:th.accent, color:"#fff", border:`1px solid ${th.accent}` },
  badge:       { position:"absolute", top:-6, right:-6, background:"#ef4444", color:"#fff", borderRadius:"50%", width:16, height:16, fontSize:9, display:"flex", alignItems:"center", justifyContent:"center", fontWeight:800 },
  panel:       { maxWidth:660, margin:"0 auto", padding:"18px 14px 60px" },
  secTitle:    { fontSize:14, fontWeight:700, color:th.accent, marginBottom:10 },
  card:        { background:th.bgCard, border:`1px solid ${th.border}`, borderRadius:12, padding:14, marginBottom:10 },
  inp:         { padding:"10px 12px", borderRadius:8, border:`1px solid ${th.borderMid}`, background:th.bgInp, color:th.txtPrimary, fontSize:14, outline:"none", width:"100%", boxSizing:"border-box", fontFamily:"inherit" },
  ta:          { width:"100%", padding:"8px 10px", borderRadius:8, border:`1px solid ${th.borderMid}`, background:th.bgInp, color:th.txtPrimary, fontSize:13, outline:"none", resize:"none", marginBottom:8, boxSizing:"border-box", fontFamily:"inherit" },
  sendBtn:     { width:"100%", padding:"12px", borderRadius:10, border:"none", background:"linear-gradient(135deg, #f97316, #ea580c)", color:"#fff", fontSize:14, fontWeight:700, cursor:"pointer" },
  addInvoiceBtn:{ width:"100%", padding:"11px", borderRadius:10, border:`2px dashed ${th.accent}`, background:"rgba(249,115,22,0.08)", color:th.accent, fontSize:14, fontWeight:700, cursor:"pointer", letterSpacing:0.3 },
  invoiceCard: { background:th.bgCard, border:`1px solid ${th.border}`, borderRadius:12, overflow:"hidden", marginBottom:4 },
  invHeader:   { display:"flex", alignItems:"center", gap:8, padding:"8px 12px", background:th.border, fontSize:10, color:th.txtMuted, textTransform:"uppercase", letterSpacing:0, fontWeight:700 },
  invRow:      { display:"flex", alignItems:"center", gap:8, padding:"10px 12px", borderTop:`1px solid ${th.border}` },
  invSerial:   { fontSize:12, fontWeight:800, color:th.accent },
  invDelBtn:   { width:26, height:26, borderRadius:6, border:"none", background:"#450a0a", color:"#ef4444", cursor:"pointer", fontSize:11, fontWeight:700, flexShrink:0, display:"flex", alignItems:"center", justifyContent:"center" },
  oHdr:        { display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:6 },
  oId:         { fontSize:14, fontWeight:800, color:th.txtPrimary },
  sBadge:      { padding:"3px 9px", borderRadius:20, fontSize:11, fontWeight:700 },
  iSum:        { display:"flex", gap:8, alignItems:"center", padding:"5px 0", borderTop:`1px solid ${th.border}`, flexWrap:"wrap" },
  iName:       { fontSize:13, color:th.txtSecondary, fontWeight:600 },
  iMeta:       { fontSize:10, color:th.txtMuted, marginTop:2, display:"flex", flexWrap:"wrap", gap:4 },
  iQty:        { fontSize:12, color:th.txtMuted },
  iPrice:      { fontSize:13, fontWeight:700, color:"#22c55e" },
  empty:       { textAlign:"center", padding:"50px 20px", color:th.txtFaint, fontSize:14 },
  nBadge:      { fontSize:10, background:th.accentDim, color:th.accent, padding:"2px 7px", borderRadius:10, fontWeight:700 },
  div:         { height:1, background:th.border, margin:"10px 0" },
  oiCard:      { background:th.bgOiCard, borderRadius:10, padding:12, marginBottom:8, border:`1px solid ${th.border}` },
  row:         { display:"flex", gap:7, marginBottom:7, alignItems:"center" },
  sel:         { flex:1, padding:"10px 12px", borderRadius:8, border:`1px solid ${th.borderMid}`, background:th.bgSel, color:th.txtPrimary, fontSize:14, outline:"none", fontFamily:"inherit" },
  waBtn:       { display:"flex", alignItems:"center", gap:4, padding:"8px 12px", borderRadius:8, background:"#15803d", color:"#fff", textDecoration:"none", fontSize:12, fontWeight:700, whiteSpace:"nowrap", flexShrink:0 },
  savBtn:      { padding:"8px 14px", borderRadius:8, border:"none", background:"#1d4ed8", color:"#fff", fontSize:13, fontWeight:700, cursor:"pointer", flexShrink:0 },
  sRow:        { display:"flex", gap:7, marginBottom:7 },
  stBtn:       { flex:1, padding:"10px", borderRadius:8, border:`1px solid ${th.borderMid}`, background:th.bgCard, color:th.txtMuted, fontSize:12, fontWeight:700, cursor:"pointer" },
  stBtnC:      { background:"#052e16", color:"#22c55e", border:"1px solid #22c55e" },
  stBtnN:      { background:"#450a0a", color:"#ef4444", border:"1px solid #ef4444" },
  delBtn:      { width:"100%", padding:"11px", borderRadius:10, border:"none", background:"linear-gradient(135deg, #4f46e5, #7c3aed)", color:"#fff", fontSize:13, fontWeight:700, cursor:"pointer", marginTop:4 },
  delOrderBtn: { width:"100%", padding:"10px", borderRadius:10, border:"1px solid #450a0a", background:"transparent", color:"#ef4444", fontSize:12, fontWeight:700, cursor:"pointer", marginTop:8 },
  flowBtn:     { width:"100%", padding:"11px", borderRadius:10, fontSize:13, fontWeight:700, cursor:"pointer", marginBottom:6 },
  addCoBtn:    { padding:"7px 14px", borderRadius:8, border:`1px solid ${th.accent}`, background:"transparent", color:th.accent, cursor:"pointer", fontSize:12, fontWeight:700 },
  coIcon:      { width:40, height:40, background:th.border, borderRadius:10, display:"flex", alignItems:"center", justifyContent:"center", fontSize:22, flexShrink:0 },
  edBtn:       { padding:"6px 10px", borderRadius:8, border:`1px solid ${th.borderMid}`, background:th.bgCard, color:th.txtSecondary, cursor:"pointer", fontSize:13 },
  dlBtn:       { padding:"6px 9px", borderRadius:8, border:"1px solid #450a0a", background:"#450a0a", color:"#ef4444", cursor:"pointer", fontSize:13 },
  authWrap:    { maxWidth:440, margin:"0 auto", padding:"32px 18px 60px", textAlign:"center" },
  welcomeWrap: { maxWidth:440, margin:"0 auto", padding:"60px 18px", textAlign:"center" },
  authIcon:    { fontSize:48, marginBottom:8 },
  headerLogo:  { width:36, height:36, borderRadius:8, objectFit:"cover" },
  bigLogo:     { width:130, height:130, borderRadius:20, objectFit:"cover", marginBottom:16, boxShadow:"0 4px 20px rgba(0,0,0,0.4)" },
  authTitle:   { fontSize:24, fontWeight:800, color:th.accent, marginBottom:6 },
  authSub:     { fontSize:13, color:th.txtMuted, marginBottom:20 },
  authCard:    { background:th.bgCard, border:`1px solid ${th.border}`, borderRadius:12, padding:16, textAlign:"left" },
  authFooter:  { fontSize:12, color:th.txtMuted, marginTop:16 },
  linkBtn:     { background:"transparent", border:"none", color:th.accent, cursor:"pointer", fontSize:12, fontWeight:700, padding:"10px", marginTop:8, fontFamily:"inherit" },
  linkBtnInline:{ background:"transparent", border:"none", color:th.accent, cursor:"pointer", fontSize:12, fontWeight:700, padding:0, fontFamily:"inherit", textDecoration:"underline" },
  roleGrid:    { display:"flex", flexDirection:"column", gap:12 },
  roleCard:    { background:th.bgCard, border:`1px solid ${th.border}`, borderRadius:14, padding:"22px 18px", cursor:"pointer", color:th.txtSecondary, textAlign:"left", fontFamily:"inherit" },
  roleEmoji:   { fontSize:38, marginBottom:8 },
  roleName:    { fontSize:16, fontWeight:700, color:th.txtPrimary, marginBottom:4 },
  roleDesc:    { fontSize:12, color:th.txtMuted },
  settingsLbl: { fontSize:11, color:th.txtMuted, marginBottom:10, textTransform:"uppercase", letterSpacing:0, fontWeight:700 },
  inviteBox:   { fontSize:22, fontWeight:800, color:th.accent, textAlign:"center", padding:"16px", background:th.bgInp, borderRadius:10, border:`2px dashed ${th.accent}`, letterSpacing:2, fontFamily:"monospace" },
  logoutBtn:   { width:"100%", padding:"13px", borderRadius:10, border:"1px solid #450a0a", background:"#450a0a", color:"#ef4444", fontSize:14, fontWeight:700, cursor:"pointer", marginTop:16 },
  desktopLayout:  { display:"flex", height:"calc(100vh - 61px)", overflow:"hidden" },
  desktopContent: { flex:1, overflowY:"auto", background:th.bgRoot },
  desktopPanel:   { maxWidth:900, margin:"0 auto", padding:"24px 28px 60px" },
  sidebar:        { width:230, minWidth:230, background:th.bgSidebar, borderRight:`1px solid ${th.border}`, display:"flex", flexDirection:"column", padding:"20px 14px 16px", overflowY:"auto" },
  sideNav:        { display:"flex", flexDirection:"column", gap:6 },
  sideTab:        { display:"flex", alignItems:"center", gap:10, padding:"11px 14px", borderRadius:10, border:"none", background:"transparent", color:th.txtMuted, cursor:"pointer", fontSize:13, fontWeight:600, fontFamily:"inherit" },
  sideTabA:       { background:th.accent, color:"#fff" },
  sideKey:        { flexShrink:0, padding:"1px 6px", borderRadius:5, borderWidth:1, borderStyle:"solid", borderColor:th.borderMid, background:th.bgInp, color:th.txtMuted, fontSize:10, fontWeight:700, fontFamily:"Consolas, monospace", whiteSpace:"nowrap" },
  sideKeyA:       { background:"rgba(255,255,255,0.18)", borderColor:"rgba(255,255,255,0.45)", color:"#fff" },
  sideBadge:      { background:"#ef4444", color:"#fff", borderRadius:10, padding:"2px 7px", fontSize:10, fontWeight:800, marginLeft:"auto" },
  sideLogout:     { width:"100%", padding:"11px", borderRadius:10, border:"1px solid #450a0a", background:"#450a0a", color:"#ef4444", fontSize:13, fontWeight:700, cursor:"pointer", fontFamily:"inherit" },
  dayHeader:      { display:"flex", alignItems:"center", gap:8, margin:"18px 0 8px", paddingBottom:6, borderBottom:`1px solid ${th.border}` },
  dayDot:         { width:8, height:8, borderRadius:"50%", background:th.accent, flexShrink:0 },
  dayLabel:       { fontSize:13, fontWeight:700, color:th.accent, flex:1 },
  dayCount:       { fontSize:11, color:th.txtMuted, background:th.border, padding:"2px 8px", borderRadius:10 },
  settingsRow:    { width:"100%", display:"flex", alignItems:"center", gap:12, padding:"14px 16px", background:th.bgCard, border:`1px solid ${th.border}`, borderRadius:12, marginBottom:8, cursor:"pointer", fontFamily:"inherit", textAlign:"left" },
  settingsRowIcon:{ fontSize:22, flexShrink:0, width:32, textAlign:"center" },
  settingsRowLabel:{ fontSize:14, fontWeight:700, color:th.txtPrimary, marginBottom:2 },
  settingsRowSub: { fontSize:11, color:th.txtMuted },
  settingsArrow:  { fontSize:20, color:th.borderMid, flexShrink:0 },
  backRowBtn: {
  display:"flex",
  alignItems:"center",
  gap:8,
  background:"transparent",
  border:"none",
  color:th.accent,
  cursor:"pointer",
  fontSize:13,
  fontWeight:700,
  fontFamily:"inherit",
  padding:"0 0 14px 0"
},

modalOverlay: {
  position:"fixed",
  inset:0,
  background:"rgba(0,0,0,0.7)",
  zIndex:9999,
  display:"flex",
  justifyContent:"center",
  alignItems:"center",
  padding:20,
},

vendorModal: {
  width:"100%",
  maxWidth:1200,
  background:"#18181b",
  borderRadius:18,
  padding:20,
  maxHeight:"95vh",
  overflowY:"auto",
},

vendorHeader: {
  display:"flex",
  justifyContent:"space-between",
  alignItems:"center",
  marginBottom:20,
},

vendorTitle: {
  fontSize:24,
  fontWeight:700,
  color:"#fff",
},

modalCloseBtn: {
  width:40,
  height:40,
  borderRadius:10,
  border:"none",
  cursor:"pointer",
  background:"#27272a",
  color:"#fff",
},

vendorGrid: {
  display:"grid",
  gridTemplateColumns:"repeat(auto-fit,minmax(250px,1fr))",
  gap:12,
},

vendorFooter: {
  display:"flex",
  justifyContent:"flex-end",
  gap:10,
  marginTop:20,
},

};}

// Fallback styles (dark) used by components before theme prop arrives
export const _globalS = getStyles(THEMES.dark);
