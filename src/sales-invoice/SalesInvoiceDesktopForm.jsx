import { fetchRate } from "../reports/fxRates.js";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { ProductNameLookup, ProductCodeLookup, codeLine } from "./ProductLookupInputs.jsx";
import BillLocationPicker from "../inventory/BillLocationPicker.jsx";
import { billLocationId, hasGodowns } from "../inventory/billLocation.js";
import { nsq } from "../utils/productSearch";
import { parseScaleBarcode } from "./scaleBarcode";
import { salesSpecs } from "../product-master/productSpecs";
import { computeStockMap, loadInvoiceRows } from "../inventory/stockFromInvoices";
import { invoiceRowsCacheGen, subscribeInvoiceRowsCache } from "../inventory/stockRowsCache.js";
import { itemBaseQty } from "../inventory/unitConversion";
import { StockBadgeLabel } from "../inventory/StockBadge.jsx";
import { listShopRecords } from "../branch-transfer/branchTransferService";
import { SiBranchStockRequest } from "../branch-transfer/SiBranchStockRequest.jsx";
import GlobalSearchModal from "../product-master/modals/GlobalSearchModal";
import { PM_CSS } from "../product-master/pmStyles";
import WhatsAppButton from "../share/WhatsAppButton.jsx";
import { printWithSettings } from "../print/printSettings.js";
import { splitRack } from "./rackLocation.js";
import { dropdownMouseDown, shouldPreserveTextSelection } from "../utils/dropdownSelectionGuard.js";
import { siIsSettledPay } from "./salesInvoiceShared.js";
import DateField from "../components/DateField.jsx";
import InvoiceBankSelect from "../ledger/InvoiceBankSelect.jsx";
import { isInvoiceBankPayMethod } from "../ledger/invoiceBankPay.js";
import { invoiceStatusLabel } from "../invoices/invoiceSettleKind.js";
import { runDesktopBillShortcuts } from "../utils/desktopFormShortcuts.js";
import {
  docActionBar,
  docEntryGrid,
  docEntryRow,
  docFieldLbl,
  docFooterCol,
  docFooterGrid,
  docFooterTotals,
  docHdrGrid,
  docItemsPane,
  docNoBox,
  docNoHead,
  docNoValue,
  docPartyRow,
  docProductStrip,
  docSummaryLine,
  docTitleBar,
  docTitleText,
  docTotalAmt,
  docTotalBar,
} from "./docDesktopLayout.js";

const CURRENCIES = ["AED", "USD", "SAR", "OMR", "QAR", "KWD", "BHD", "INR", "BDT", "EUR"];

export const C = {
  bg: "#f3e6c8",
  panel: "#f3e6c8",
  bar: "#315eb8",
  label: "#07101c",
  border: "#7d94b7",
  input: "#ffffff",
  head: "#315eb8",
  rowAlt: "#fffdf6",
  sel: "#ffe9a8",
  red: "#b91c1c",
  green: "#166534",
};

export const inp = (extra = {}) => ({
  // longhands, so a caller can tint borderColor (required field) without React shorthand warnings
  height: 22, padding: "0 4px", borderWidth: 1, borderStyle: "solid", borderColor: C.border, borderRadius: 2, background: C.input,
  color: "#111", fontSize: 12, fontFamily: "inherit", outline: "none", width: "100%", boxSizing: "border-box", ...extra,
});
export const lbl = { fontSize: 10.5, fontWeight: 700, color: C.label, whiteSpace: "nowrap", lineHeight: 1.1 };
export const btn = (bg = "#e7eef9", color = C.label, extra = {}) => ({
  height: 24, padding: "0 10px", border: `1px solid ${C.border}`, borderRadius: 2, background: bg, color,
  fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap", ...extra,
});
export const th = { padding: "2px 5px", background: C.head, color: "#fff", fontSize: 11, fontWeight: 700, textAlign: "right", whiteSpace: "nowrap", position: "sticky", top: 0 };
export const td = { padding: "2px 5px", fontSize: 11.5, textAlign: "right", borderBottom: `1px solid #d3deef`, whiteSpace: "nowrap", color: "#0f172a" };

export { splitRack };

export function productBarcodeUnit(product, key) {
  if (!product || !key) return null;
  const plain = [product.code, product.barcode, product.ean, ...(Array.isArray(product.moreBarcodes) ? product.moreBarcodes : [])];
  if (plain.some((v) => v && nsq(v) === key)) return { product, unit: null };
  const row = (Array.isArray(product.unitPrices) ? product.unitPrices : []).find((r) => r?.barcode && nsq(r.barcode) === key);
  return row ? { product, unit: row.unit || null } : null;
}

export function Modal({ title, onClose, width = 640, children }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") { e.stopPropagation(); onClose(); } };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(10,25,55,0.45)", zIndex: 10050, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ width: "100%", maxWidth: width, maxHeight: "85vh", display: "flex", flexDirection: "column", background: C.panel, border: `1px solid ${C.bar}`, borderRadius: 4, boxShadow: "0 18px 40px rgba(0,0,0,0.35)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: C.bar, color: "#fff", padding: "6px 10px", fontWeight: 800, fontSize: 13 }}>
          <span>{title}</span>
          <button type="button"onClick={onClose} style={{ background: "transparent", border: "none", color: "#fff", fontSize: 16, cursor: "pointer" }}>✕</button>
        </div>
        <div style={{ padding: 12, overflow: "auto", minHeight: 0 }}>{children}</div>
      </div>
    </div>
  );
}

function customerHaystack(c) {
  return [c.customerName, c.mobileNumber, c.customerCode, c.code, c.trnNumber, c.area, c.city].filter(Boolean).join(" ");
}

function CustomerTypeahead({ customers, value, onChange, onSelect, placeholder, lang, inputRef, onEnterEmpty }) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const wrapRef = useRef(null);
  const q = String(value || "").trim();

  const matches = useMemo(() => {
    if (!open || !q) return [];
    const key = nsq(q);
    const lower = q.toLowerCase();
    return customers
      .filter((c) => c && !c.isDeleted && !c.deleted)
      .map((c) => {
        const name = String(c.customerName || "").toLowerCase();
        const hay = customerHaystack(c);
        let score = 0;
        if (name.startsWith(lower)) score = 3;
        else if (name.includes(lower)) score = 2;
        else if (hay.toLowerCase().includes(lower) || (key && nsq(hay).includes(key))) score = 1;
        return { c, score };
      })
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score || String(a.c.customerName || "").localeCompare(String(b.c.customerName || "")))
      .slice(0, 10)
      .map((r) => r.c);
  }, [customers, q, open]);

  useEffect(() => { setActive(0); }, [q]);
  useEffect(() => {
    const onDown = (e) => { if (!wrapRef.current?.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  const pick = (c) => { setOpen(false); onSelect(c); };

  return (
    <div ref={wrapRef} style={{ position: "relative", flex: 1, minWidth: 0 }}>
      <input ref={inputRef} style={inp({ fontWeight: 700 })} value={value} placeholder={placeholder} autoComplete="off"
        onChange={(e) => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => { if (q) setOpen(true); }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" && matches.length) { e.preventDefault(); setActive((i) => (i + 1) % matches.length); }
          else if (e.key === "ArrowUp" && matches.length) { e.preventDefault(); setActive((i) => (i - 1 + matches.length) % matches.length); }
          else if (e.key === "Enter") {
            e.preventDefault();
            if (matches.length) pick(matches[active] || matches[0]);
            else { setOpen(false); onEnterEmpty?.(); }
          }
          else if (e.key === "Escape") setOpen(false);
        }} />
      {open && q && (
        <div style={{ position: "absolute", top: "calc(100% + 2px)", left: 0, right: -30, zIndex: 1300, background: "#fff", border: `1px solid ${C.border}`, borderRadius: 3, boxShadow: "0 10px 24px rgba(0,0,0,0.25)", maxHeight: 260, overflowY: "auto" }}>
          {matches.length === 0 ? (
            <div style={{ padding: "8px 10px", fontSize: 12, color: "#4b5f86" }}>
              {lang === "bn" ? "এই নামে কোনো customer নেই — Walk-in হিসেবে থাকবে" : "No matching customer — will be saved as walk-in"}
            </div>
          ) : matches.map((c, i) => (
            <div key={c.id}
              onMouseDown={(e) => dropdownMouseDown(e, inputRef, () => setActive(i))}
              onClick={() => { if (!shouldPreserveTextSelection(inputRef)) pick(c); }}
              onMouseEnter={() => { if (!shouldPreserveTextSelection(inputRef)) setActive(i); }}
              style={{ padding: "5px 10px", cursor: "pointer", background: i === active ? "#fffdf6" : "#fff", borderBottom: "1px solid #fffdf6" }}>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: C.label }}>{c.customerName}</div>
              <div style={{ fontSize: 11, color: "#4b5f86" }}>{[c.mobileNumber, c.area || c.city, c.customerType].filter(Boolean).join(" · ")}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function SalesInvoiceDesktopForm({
  lang = "en", t = {}, shopId, products = [], customers = [], team = [], invoices = [], onSelectCustomer,
  form, setField, lines, setLines, current, setCurrent, totals, formPaid, balance, billLocations = [], locStock = null,
  invoiceNo, editInvId, saving, nameRef, qtyRef, codeRef: codeRefProp,
  helpers,
  onSelectProduct, onChangeCurrentUnit, onAddCurrent, onDelLine,
  onOpenCustomerPicker, onConfirm, onSaveDraft, onClose, onNew, onOpenInvoice, onPrintInvoice, onOpenProductMaster, onCancelInvoice, onDeleteInvoice, canDeleteInvoice, toast, canEditInvoice = () => true,
  onOpenReminder, reminderForm, onChangeReminder, onSaveReminder, onCloseReminder,
  kind = "sales", sourceQuoteNo = "", sourceIsDN = false, sourceKind = "", onConvertQuote, onConvertToDN, canDiscount = true, canSeeCost = false,
  loyalty = null, whatsAppDoc, adjustmentReasons = [], baseCurrency = "AED", rateApi = null,
  branchLocked = false,
  shop = null,
  user = null,
  profile = null,
}) {
  const { siCalcLine, siFmt2, siN2, siUnitOptionsFor, SI_PAY, SI_STATUSES } = helpers;
  const bn = lang === "bn";
  // A saved bill opens read-only (also when stepping with < >); the Edit button unlocks it.
  const [locked, setLocked] = useState(!!editInvId);
  useEffect(() => { setLocked(!!editInvId); }, [editInvId]);
  const isSO = kind === "salesOrder";
  const isQuote = kind === "quotation" || isSO;
  const isDN = kind === "delivery";
  const docName = isSO ? "SALES ORDER" : isQuote ? "QUOTATION" : isDN ? "DELIVERY NOTE" : "SALES INVOICE";
  const isDelivery = isDN || (kind === "sales" && form.invoiceType === "delivery");
  const isTax = form.invoiceType === "tax" && !isDelivery;
  const isCash = siIsSettledPay(form.paymentMethod, form.cashPartial);
  const cur = form.currency || "AED";
  const [fetchingRate, setFetchingRate] = useState(false);

  const localCodeRef = useRef(null);
  const codeRef = codeRefProp || localCodeRef;
  const adjRef = useRef(null);
  const [editingLineId, setEditingLineId] = useState(null);
  const [branchStockOpen, setBranchStockOpen] = useState(false);
  const [codeChoices, setCodeChoices] = useState(null);
  const custRef = useRef(null);
  const salesmanRef = useRef(null);
  const unitRef = useRef(null);
  const rateRef = useRef(null);
  const disPRef = useRef(null);
  const disARef = useRef(null);
  const vatRef = useRef(null);
  const nameOpenSignal = 0;
  const [codeOpenSignal, setCodeOpenSignal] = useState(0);
  const [branches, setBranches] = useState([]);
  const [stockMap, setStockMap] = useState(null);
  const [stockRev, setStockRev] = useState(invoiceRowsCacheGen);
  const [showHistory, setShowHistory] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [productSearchName, setProductSearchName] = useState(null);
  const productById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const currentProduct = current.productId ? productById.get(current.productId) : null;

  useEffect(() => {
    let cancelled = false;
    listShopRecords("branches", shopId)
      .then((rows) => { if (!cancelled) setBranches(rows.filter((b) => b.active !== false)); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [shopId]);

  useEffect(() => subscribeInvoiceRowsCache(setStockRev), []);
  useEffect(() => {
    let cancelled = false;
    loadInvoiceRows()
      .then(({ purchaseInvoices, salesInvoices, deliveryNotes, extras }) => {
        if (!cancelled) setStockMap(computeStockMap(products, purchaseInvoices, salesInvoices, shopId, deliveryNotes, extras));
      })
      .catch((err) => console.warn("[S4 SI] stock load failed", err));
    return () => { cancelled = true; };
  }, [products, shopId, stockRev]);

  const navIndex = editInvId ? invoices.findIndex((inv) => inv.id === editInvId) : -1;
  const olderInvoice = editInvId ? invoices[navIndex + 1] : invoices[0];
  const newerInvoice = navIndex > 0 ? invoices[navIndex - 1] : null;
  const savedInvoice = editInvId ? invoices.find((inv) => inv.id === editInvId) : null;

  const salesmen = useMemo(() => {
    const rows = team
      .filter((m) => m && m.status !== "disabled" && m.active !== false)
      .map((m) => ({ id: m.uid || m.id, name: m.personName || m.name || m.email || "" }))
      .filter((m) => m.id && m.name);
    if (form.salesmanId && !rows.some((m) => m.id === form.salesmanId)) {
      rows.unshift({ id: form.salesmanId, name: form.salesmanName || form.salesmanId });
    }
    return rows;
  }, [team, form.salesmanId, form.salesmanName]);

  const customerBills = useMemo(() => {
    const wantName = form.customerName.trim().toLowerCase();
    return invoices.filter((inv) => {
      if (inv.status === "cancelled" || inv.id === editInvId) return false;
      if (!form.customerId && !wantName) return true;
      return (form.customerId && inv.customerId === form.customerId)
        || (wantName && String(inv.customerName || "").trim().toLowerCase() === wantName);
    });
  }, [invoices, form.customerId, form.customerName, editInvId]);

  const resetEntry = () => {
    setEditingLineId(null);
    setCodeChoices(null);
    setCurrent(helpers.emptyCurrent());
    setTimeout(() => nameRef.current?.focus(), 60);
  };

  const warnLowStock = () => {
    if (isQuote || !stockMap || !currentProduct || siN2(current.qty) <= 0) return;
    const pid = currentProduct.id;
    const baseOf = (it) => itemBaseQty(it, productById.get(it.productId));
    const savedCounted = savedInvoice && (isDN ? ["confirmed", "invoiced"] : ["confirmed", "paid", "partial"]).includes(savedInvoice.status) && !savedInvoice.deliveryNoteId;
    const savedQty = savedCounted ? (savedInvoice.items || []).filter((it) => it.productId === pid).reduce((s, it) => s + baseOf(it), 0) : 0;
    const otherQty = lines.filter((it) => it.productId === pid && it.id !== editingLineId).reduce((s, it) => s + baseOf(it), 0);
    const available = (stockMap.get(pid) || 0) + savedQty - otherQty;
    const want = itemBaseQty(current, currentProduct);
    // W01: what the picked godown holds (this bill's saved lines are already left out of locStock)
    if (hasGodowns(billLocations) && locStock?.ready && want <= available + 1e-9) {
      const here = (locStock.qtyAt(billLocationId(form, billLocations), pid) || 0) - otherQty;
      if (want > here + 1e-9) toast(bn ? `এই গুদামে কম: আছে ${parseFloat(here.toFixed(2))} ${currentProduct.unit || "Pcs"}, দিচ্ছেন ${parseFloat(want.toFixed(2))}` : `Not enough in this godown: ${parseFloat(here.toFixed(2))} ${currentProduct.unit || "Pcs"} here, adding ${parseFloat(want.toFixed(2))}`, "err");
    }
    if (want > available + 1e-9) {
      toast(bn ? `স্টক কম: আছে ${parseFloat(available.toFixed(2))} ${currentProduct.unit || "Pcs"}, দিচ্ছেন ${parseFloat(want.toFixed(2))}` : `Low stock: ${parseFloat(available.toFixed(2))} ${currentProduct.unit || "Pcs"} available, entering ${parseFloat(want.toFixed(2))}`, "err");
    }
  };

  const addOrUpdate = () => {
    warnLowStock();
    if (!editingLineId) { onAddCurrent(); setCodeChoices(null); return; }
    if (!String(current.name || "").trim()) { toast(t.si_errName, "err"); return; }
    if (siN2(current.qty) <= 0) { toast(t.si_errQty, "err"); return; }
    setLines((prev) => prev.map((it) => (it.id === editingLineId ? { ...current, id: editingLineId } : it)));
    resetEntry();
  };

  // Enter walks Qty → Unit → Rate → Dis% → Dis Amt (→ VAT); on the last box it adds the line.
  const enterTo = (e, nextRef) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    if (nextRef?.current && !nextRef.current.disabled) nextRef.current.focus();
    else addOrUpdate();
  };

  const editLine = (it) => {
    setEditingLineId(it.id);
    setCurrent({ ...it });
    setTimeout(() => qtyRef.current?.focus(), 60);
  };

  const pickProduct = (prod) => {
    setCodeChoices(null);
    onSelectProduct(prod);
  };

  const exactCodeLookup = () => {
    const key = nsq(current.code);
    if (!key) return false;
    const hits = products.map((p) => productBarcodeUnit(p, key)).filter(Boolean);
    if (!hits.length) {
      const scale = parseScaleBarcode(current.code, products);
      if (!scale) return false;
      pickProduct(scale.product);
      setTimeout(() => setCurrent((p) => ({ ...p, qty: String(scale.qty) })), 0);
      toast(scale.kind === "weight"
        ? (bn ? `ওজনের লেবেল: ${scale.qty} kg` : `Weight label: ${scale.qty} kg`)
        : (bn ? `দামের লেবেল: ${siFmt2(scale.amount)} → Qty ${scale.qty}` : `Rate label: ${siFmt2(scale.amount)} → Qty ${scale.qty}`));
      return true;
    }
    if (hits.length > 1) {
      setCurrent((p) => ({ ...p, code: "", productId: null }));
      setCodeChoices(hits.map((h) => h.product));
      setCodeOpenSignal((n) => n + 1);
      return true;
    }
    const hit = hits[0];
    pickProduct(hit.product);
    if (hit.unit && hit.unit !== (hit.product.unit || "Pcs")) setTimeout(() => onChangeCurrentUnit(hit.unit), 0);
    return true;
  };

  const pickName = (name, items) => {
    if (items.length === 1) { pickProduct(items[0]); return; }
    setCurrent((p) => ({ ...p, name, productId: null, code: "" }));
    setCodeChoices(items);
    setCodeOpenSignal((n) => n + 1);
    setTimeout(() => codeRef.current?.focus(), 30);
  };

  const shortcutsRef = useRef({});
  shortcutsRef.current = {
    saving,
    locked,
    onSaveDraft: () => onSaveDraft(),
    canSaveDraft: () => !locked && !saving,
    onConfirm: () => onConfirm(),
    canConfirm: () => !locked && !saving,
    onNew: () => onNew(),
    canNew: () => !saving,
    onSearch: () => setShowSearch(true),
    canEdit: () => !!(locked && savedInvoice && canEditInvoice(savedInvoice) && !saving),
    onEdit: () => { setLocked(false); setTimeout(() => nameRef.current?.focus(), 0); },
    canPrint: () => !!(onPrintInvoice && (!!savedInvoice || lines.some((it) => String(it.name || "").trim())) && !saving),
    onPrint: () => onPrintInvoice(savedInvoice),
  };

  const handlersRef = useRef({});
  handlersRef.current = {
    locked,
    history: () => {
      if (!current.productId && !String(current.name || "").trim()) { toast(bn ? "আগে Product বাছাই করুন, তারপর F8 চাপুন" : "Select a product first, then press F8", "err"); return; }
      setShowHistory(true);
    },
    newProduct: () => {
      if (!onOpenProductMaster) { toast(bn ? "Product Master খোলার permission নেই" : "No permission to open Product Master", "err"); return; }
      onOpenProductMaster(current.productId ? "" : String(current.name || "").trim());
    },
    customer: onOpenCustomerPicker,
    productSearch: () => setProductSearchName(current.productId ? "" : String(current.name || "").trim()),
  };

  useEffect(() => {
    const onKey = (e) => {
      const s = shortcutsRef.current;
      if (runDesktopBillShortcuts(e, {
        canSaveDraft: () => s.canSaveDraft(),
        onSaveDraft: s.onSaveDraft,
        canConfirm: () => s.canConfirm(),
        onConfirm: s.onConfirm,
        canNew: () => s.canNew(),
        onNew: s.onNew,
        onSearch: s.onSearch,
        canEdit: () => s.canEdit(),
        onEdit: s.onEdit,
        canPrint: () => s.canPrint(),
        onPrint: s.onPrint,
      })) return;
      const h = handlersRef.current;
      if (h.locked && ["F9", "F10", "Home", "Insert"].includes(e.key)) return;
      const tag = String(e.target?.tagName || "").toLowerCase();
      const typing = tag === "select" || ((tag === "input" || tag === "textarea") && String(e.target.value || "").length > 0);
      if (e.key === "F8") { e.preventDefault(); h.history(); }
      else if (e.key === "F9") { e.preventDefault(); h.newProduct(); }
      else if (e.key === "F10") { e.preventDefault(); h.productSearch(); }
      else if (e.key === "Home" && !typing && !e.ctrlKey) { e.preventDefault(); h.customer(); }
      else if (e.key === "Insert") { e.preventDefault(); adjRef.current?.focus(); adjRef.current?.select?.(); }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [nameRef]);

  const lineRows = lines.filter((it) => String(it.name || "").trim());
  const lineSum = lineRows.reduce((a, it) => {
    const item = isDelivery ? { ...it, discountPerc: "0", discountFlat: "", vatPerc: "0" } : it;
    const c = siCalcLine(item, isTax);
    a.qty += siN2(it.qty); a.gross += c.gross; a.disc += c.disc; a.vat += c.vat; a.total += c.total;
    return a;
  }, { qty: 0, gross: 0, disc: 0, vat: 0, total: 0 });

  const stockOf = currentProduct && stockMap ? stockMap.get(currentProduct.id) : null;
  const stockExtraQty = (!isQuote && !editInvId && currentProduct)
    ? [...lines.filter((it) => it.productId === currentProduct.id && it.id !== editingLineId), current]
      .reduce((sum, it) => sum + itemBaseQty(it, currentProduct), 0)
    : 0;
  const rack = splitRack(currentProduct?.rackLocation);
  const unitOptions = siUnitOptionsFor(currentProduct, current.unit);
  const field = (label, node, labelWidth = 76) => (
    <div style={{ display: "flex", alignItems: "center", gap: 3, minWidth: 0 }}>
      <span style={{ ...lbl, width: labelWidth, flexShrink: 0 }}>{label}</span>
      <div style={{ flex: 1, minWidth: 0 }}>{node}</div>
    </div>
  );

  return (
    <div style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 4, minWidth: 1060, flex: 1, minHeight: 0, display: "flex", flexDirection: "column", overflow: "hidden", fontFamily: 'Tahoma, "MS Sans Serif", Arial, sans-serif', color: C.label }}>
      <fieldset disabled={locked} style={{ display: "contents" }}>
      {/* Header */}
      <div style={docHdrGrid}>
        <div style={docNoBox}>
          <div style={docNoHead}>{isSO ? "Order No" : isQuote ? "Quotation No" : isDN ? "DN No" : "Bill No"}</div>
          <div style={docNoValue}>{invoiceNo || "—"}</div>
        </div>
        <div style={{ ...docTitleBar, position: "relative" }}>
          <div style={{ position: "absolute", left: 4, top: 0, bottom: 0, display: "flex", alignItems: "center", gap: 4 }}>
            {!isDN && !isQuote && (
              <select style={inp({ width: 108, height: 20, fontSize: 11 })} value={form.invoiceType} onChange={(e) => setField("invoiceType", e.target.value)}
                title={bn ? "ইনভয়েস টাইপ" : "Invoice type"}>
                {form.invoiceType === "regular" && <option value="regular">{t.si_regular || "Regular"}</option>}
                <option value="tax">{t.si_tax || "Tax Invoice"}</option>
                {form.invoiceType === "delivery" && <option value="delivery">{t.si_delivery || "Delivery Note"}</option>}
              </select>
            )}
            {savedInvoice && (
              <span style={{ fontSize: 10, fontWeight: 800, padding: "0 6px", borderRadius: 8, background: SI_STATUSES[savedInvoice.status]?.color || "#64748b", color: "#fff" }}>
                {invoiceStatusLabel(savedInvoice, lang, SI_STATUSES) || savedInvoice.status}
              </span>
            )}
            {locked && (
              <span style={{ fontSize: 11, fontWeight: 800, padding: "1px 8px", borderRadius: 10, background: "#e2e8f0", color: "#334155" }}>
                 {bn ? "শুধু দেখা" : "View only"}
              </span>
            )}
          </div>
          <div style={{ textAlign: "center", lineHeight: 1.05 }}>
            <span style={{ ...docTitleText, color: isSO ? "#0e7490" : isQuote ? "#b45309" : isDN ? "#6d28d9" : "#111" }}>{docName}</span>
            {sourceQuoteNo && (
              <div style={{ fontSize: 11, fontWeight: 800, color: sourceIsDN ? "#6d28d9" : sourceKind === "salesOrder" ? "#0e7490" : sourceKind === "jobOrder" ? "#c2410c" : "#b45309" }}>
                {sourceIsDN ? (bn ? "ডেলিভারি নোট থেকে" : "From Delivery Note") : sourceKind === "salesOrder" ? (bn ? "সেলস অর্ডার থেকে" : "From Sales Order") : sourceKind === "jobOrder" ? (bn ? "জব কার্ড থেকে" : "From Job Card") : (bn ? "কোটেশন থেকে" : "From Quotation")}: {sourceQuoteNo}
              </div>
            )}
          </div>
          <div style={{ position: "absolute", right: 4, top: 0, bottom: 0, display: "flex", alignItems: "center", gap: 3, maxWidth: 168 }}>
            <span style={{ ...lbl, fontSize: 10 }}>{branches.length ? (bn ? "ব্রাঞ্চ" : "Branch") : "Loc."}</span>
            <select style={inp({ height: 20, fontSize: 11, width: 96 })} value={form.stockLocation || "main"} disabled={branchLocked}
              onChange={(e) => {
                const id = e.target.value;
                setField("stockLocation", id);
                setField("stockLocationName", id === "main" ? "Main" : (branches.find((b) => b.id === id)?.name || id));
              }}>
              <option value="main">&lt;Main&gt;</option>
              {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              {form.stockLocation && form.stockLocation !== "main" && !branches.some((b) => b.id === form.stockLocation) && (
                <option value={form.stockLocation}>{form.stockLocationName || form.stockLocation}</option>
              )}
            </select>
          </div>
        </div>
        <div style={docNoBox}>
          <div style={docNoHead}>Bill Date</div>
          <DateField style={inp({ borderStyle: "none", height: 26, fontWeight: 700 })} value={form.invoiceDate} onChange={(e) => setField("invoiceDate", e.target.value)} />
        </div>
      </div>

      <div style={docPartyRow("120px minmax(220px,1fr) minmax(200px,280px) minmax(120px,1fr) 112px")}>
        <div>
          <div style={docFieldLbl}>Ref.Number</div>
          <input style={inp()} value={form.refNo || ""} onChange={(e) => setField("refNo", e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); custRef.current?.focus(); } }} />
        </div>
        <div>
          <div style={{ ...lbl, display: "flex", justifyContent: "space-between" }}>
            <span><u>C</u>ustomer (Home Key)</span>
            <button type="button"onClick={() => handlersRef.current.history()}
              style={{ background: "none", border: "none", padding: 0, color: C.label, fontWeight: 800, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>
              F8 - Customer Bill History
            </button>
          </div>
          <div style={{ display: "flex", gap: 2 }}>
            <CustomerTypeahead customers={customers} value={form.customerName} lang={lang} inputRef={custRef}
              onEnterEmpty={() => salesmanRef.current?.focus()}
              placeholder={bn ? "Walk-in / নাম লিখুন" : "Walk-in / type name"}
              onChange={(v) => {
                setField("customerName", v);
                // A typed name is no longer the picked customer: drop that customer's details too.
                if (form.customerId) ["customerId", "customerMobile", "customerAddress", "customerTrn", "customerType", "creditDays"].forEach((f) => setField(f, ""));
              }}
              onSelect={(c) => { onSelectCustomer(c); setTimeout(() => nameRef.current?.focus(), 60); }} />
            <button type="button"onClick={onOpenCustomerPicker} title="Home"style={btn("#e7eef9", C.label, { height: 26, padding: "0 6px", fontSize: 11, whiteSpace: "nowrap" })}>▼ Home</button>
          </div>
          {kind === "sales" && !isDelivery && form.customerId && customers.find((c) => c.id === form.customerId)?.autoWhatsAppInvoice === true && (
            <div style={{ fontSize: 10, fontWeight: 700, color: "#166534", marginTop: 1, lineHeight: 1.1 }}>
              {bn ? "Confirm করলে WhatsApp খুলবে (PDF + মেসেজ)" : "Confirming opens WhatsApp (PDF + message)"}
            </div>
          )}
          {loyalty && (
            <div style={{ fontSize: 10, fontWeight: 700, color: "#15803d", marginTop: 1, lineHeight: 1.1 }} title={bn ? "লয়্যালটি: এখন শুধু পয়েন্ট জমা হয়" : "Loyalty: earn only for now"}>
              {bn ? "লয়্যালটি" : "Loyalty"} {loyalty.no} · {loyalty.points == null ? "…" : `${loyalty.points} ${bn ? "পয়েন্ট" : "pts"}`}
              {loyalty.earn ? ` · +${loyalty.earn} ${bn ? "এই বিলে" : "on this bill"}` : ""}
            </div>
          )}
        </div>
        <div>
          <div style={lbl}>Salesman/Executive Name</div>
          <select ref={salesmanRef} style={inp()} value={form.salesmanId || ""}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); nameRef.current?.focus(); } }}
            onChange={(e) => {
              const id = e.target.value;
              setField("salesmanId", id);
              setField("salesmanName", salesmen.find((m) => m.id === id)?.name || "");
            }}>
            <option value="">—</option>
            {salesmen.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </div>
        {isQuote ? (
          <div style={{ maxWidth: 170 }}>
            <div style={lbl}>{isSO ? "Delivery By" : "Valid Until"}</div>
            <DateField style={inp()} value={form.validUntil || ""} onChange={(e) => setField("validUntil", e.target.value)} />
          </div>
        ) : hasGodowns(billLocations) ? (
          <BillLocationPicker side="sale" bn={bn} locations={billLocations} value={billLocationId(form, billLocations)} onChange={(v) => setField("locationId", v)}
            labelStyle={lbl} inputStyle={inp({ maxWidth: 240 })}
            qtyHere={currentProduct && locStock?.ready ? locStock.qtyAt(billLocationId(form, billLocations), currentProduct.id) : null} unit={currentProduct?.unit || ""} />
        ) : <div />}
        <div>
          <div style={lbl}>Currency</div>
          <select style={inp()} value={cur} onChange={(e) => setField("currency", e.target.value)}>
            {[...new Set([cur, ...CURRENCIES])].map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          {kind === "sales" && !isDelivery && String(cur).toUpperCase() !== String(baseCurrency).toUpperCase() && (
            <div style={{ marginTop: 4 }}>
              <div style={lbl}>{bn ? `রেট: 1 ${cur} = ? ${baseCurrency}` : `Rate: 1 ${cur} = ? ${baseCurrency}`} *</div>
              <input style={inp()} inputMode="decimal" value={form.exchangeRate || ""} onChange={(e) => setField("exchangeRate", e.target.value)} placeholder="3.6725"
                title={bn ? `বিল ${cur}-এ লেখা ও প্রিন্ট হয়, হিসাবে ${baseCurrency}-এ এই রেটে যায়` : `The bill is typed and printed in ${cur} and booked in ${baseCurrency} at this rate`} />
              {rateApi?.url && (
                <button type="button" disabled={fetchingRate || locked} style={{ marginTop: 3, fontSize: 11, padding: "2px 6px", cursor: "pointer" }}
                  onClick={async () => {
                    setFetchingRate(true);
                    // only a real reply from the owner's rate service fills the rate; on any failure the typed rate stays
                    const r = await fetchRate(rateApi, cur, baseCurrency);
                    setFetchingRate(false);
                    if (r.rate) { setField("exchangeRate", String(r.rate)); toast?.(bn ? `রেট সার্ভিস থেকে: 1 ${cur} = ${r.rate} ${baseCurrency}` : `From the rate service: 1 ${cur} = ${r.rate} ${baseCurrency}`); }
                    else toast?.(bn ? `রেট আনা যায়নি (${r.error}${r.status ? ` ${r.status}` : ""}) - রেট হাতে দিন` : `Could not get the rate (${r.error}${r.status ? ` ${r.status}` : ""}) - type it by hand`, "err");
                  }}>{fetchingRate ? "..." : (bn ? "রেট আনুন" : "Fetch rate")}</button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Entry row */}
      <div style={docEntryRow}>
        <div style={docEntryGrid("minmax(220px,2fr) minmax(200px,2fr) 70px 92px 100px 64px 84px 64px auto")}>
          <div>
            <div style={{ ...lbl, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
              <span>Product Nam<u>e</u>{" "}
                <button type="button"onClick={() => handlersRef.current.productSearch()} title={bn ? "প্রোডাক্ট সার্চ" : "Search Product"}
                  style={{ background: "none", border: "none", padding: 0, color: "#1d4ed8", fontWeight: 700, fontSize: 12, cursor: "pointer", textDecoration: "underline", fontFamily: "inherit" }}>(F10)</button>
              </span>
              {!isQuote && currentProduct && stockOf != null && (
                <StockBadgeLabel
                  stock={stockOf}
                  extraQty={stockExtraQty}
                  unit={currentProduct.unit}
                  reorderMin={currentProduct.reorderMin}
                  lang={lang}
                  as="span"
                  style={{ marginTop: 0, fontSize: 11 }}
                />
              )}
              {!isQuote && currentProduct && !editInvId && (
                <button type="button" onClick={() => setBranchStockOpen(true)} title={bn ? "অন্য শাখার স্টক ও অনুরোধ" : "Other branches stock / request"}
                  style={{ background: "none", border: "none", padding: 0, color: "#0f766e", fontWeight: 700, fontSize: 11, cursor: "pointer", textDecoration: "underline", fontFamily: "inherit" }}>
                  {bn ? "অন্য শাখা" : "Other branches"}
                </button>
              )}
              <button type="button"onClick={() => handlersRef.current.newProduct()} style={{ background: "none", border: "none", padding: 0, color: "#1d4ed8", fontWeight: 700, fontSize: 11.5, cursor: "pointer", textDecoration: "underline", marginRight: 40 }}>
                New Product [F9]
              </button>
            </div>
            <ProductNameLookup products={products} value={current.name} inputRef={nameRef} openSignal={nameOpenSignal}
              onChange={(value) => { setCodeChoices(null); setCurrent((p) => ({ ...p, name: value, productId: null })); }}
              onPickName={pickName}
              onEnterClosed={() => (current.productId ? qtyRef : codeRef).current?.focus()}
              style={inp({ fontWeight: 700 })} />
          </div>
          <div>
            <div style={lbl}>Code / Barcode</div>
            <ProductCodeLookup products={products} value={current.code} inputRef={codeRef} openSignal={codeOpenSignal}
              choices={codeChoices} placeholder={bn ? "স্ক্যান করুন + Enter" : "Scan + Enter"}
              onChange={(value) => setCurrent((p) => ({ ...p, code: value }))}
              onPick={pickProduct} onExactLookup={exactCodeLookup} selectedProduct={currentProduct}
              onEnterEmpty={() => qtyRef.current?.focus()}
              onNotFound={() => toast(bn ? "এই Code/Barcode-এর কোনো পণ্য পাওয়া যায়নি" : "No product found for this code/barcode", "err")}
              style={inp()} />
          </div>
          <div>
            <div style={lbl}>Qty</div>
            <input ref={qtyRef} style={inp({ textAlign: "right" })} inputMode="decimal"value={current.qty}
              onChange={(e) => setCurrent((p) => ({ ...p, qty: e.target.value }))}
              onFocus={(e) => e.target.select()}
              onKeyDown={(e) => enterTo(e, unitRef)} />
          </div>
          <div>
            <div style={lbl}>Unit</div>
            <select ref={unitRef} style={inp()} value={current.unit} onChange={(e) => onChangeCurrentUnit(e.target.value)}
              onKeyDown={(e) => enterTo(e, rateRef)}>
              {unitOptions.map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>
          <div>
            <div style={lbl}>Rate [Excl]</div>
            <input ref={rateRef} style={inp({ textAlign: "right" })} inputMode="decimal"value={current.unitPrice}
              onChange={(e) => setCurrent((p) => ({ ...p, unitPrice: e.target.value }))}
              onFocus={(e) => e.target.select()}
              onKeyDown={(e) => enterTo(e, isDelivery ? null : !canDiscount ? (isTax ? vatRef : null) : disPRef)} />
          </div>
          <div>
            <div style={lbl}>Dis %</div>
            <input ref={disPRef} style={inp({ textAlign: "right" })} inputMode="decimal"disabled={isDelivery || !canDiscount} value={isDelivery ? "" : current.discountPerc}
              onChange={(e) => setCurrent((p) => ({ ...p, discountPerc: e.target.value, ...(siN2(e.target.value) > 0 ? { discountFlat: "" } : {}) }))}
              onFocus={(e) => e.target.select()}
              onKeyDown={(e) => enterTo(e, disARef)} />
          </div>
          <div>
            <div style={lbl}>Dis Amt</div>
            <input ref={disARef} style={inp({ textAlign: "right" })} inputMode="decimal"disabled={isDelivery || !canDiscount} value={isDelivery ? "" : current.discountFlat}
              onChange={(e) => setCurrent((p) => ({ ...p, discountFlat: e.target.value, ...(siN2(e.target.value) > 0 ? { discountPerc: "0" } : {}) }))}
              onFocus={(e) => e.target.select()}
              onKeyDown={(e) => enterTo(e, isTax ? vatRef : null)} />
          </div>
          <div>
            <div style={lbl}>VAT %</div>
            <input ref={vatRef} style={inp({ textAlign: "right" })} inputMode="decimal"disabled={!isTax} value={isTax ? current.vatPerc : ""}
              onChange={(e) => setCurrent((p) => ({ ...p, vatPerc: e.target.value }))}
              onFocus={(e) => e.target.select()}
              onKeyDown={(e) => enterTo(e, null)} />
          </div>
          <div style={{ display: "flex", gap: 4 }}>
            <button type="button"onClick={addOrUpdate} style={btn("#2c5aa0", "#fff", { height: 26 })}>{editingLineId ? (bn ? "আপডেট" : "Update") : (bn ? "যোগ" : "Add")}</button>
            {editingLineId && <button type="button"onClick={resetEntry} style={btn("#e7eef9", C.label, { height: 26, padding: "0 8px" })}>✕</button>}
          </div>
        </div>
        {/* Product info strip */}
        <div style={docProductStrip}>
          {currentProduct ? (
            <>
              {stockOf == null
                ? <span> {bn ? "স্টক" : "Stock"}: …</span>
                : <StockBadgeLabel stock={stockOf} extraQty={stockExtraQty} unit={currentProduct.unit} reorderMin={currentProduct.reorderMin} lang={lang} as="span"style={{ fontSize: 12.5 }} />}
              <span>MRP: <span style={{ color: "#1e3a8a" }}>{siFmt2(currentProduct.mrp)}</span></span>
              {canSeeCost && <span>Lnd. Cost: <span style={{ color: "#1e3a8a" }}>{siFmt2(currentProduct.landingCost)}</span></span>}
              {canSeeCost && <span>Avg. Cost: <span style={{ color: "#1e3a8a" }}>{siFmt2(currentProduct.averageCost || currentProduct.landingCost)}</span></span>}
              <span>Rack: {rack.rack || "—"}</span>
              <span>Floor: {rack.floor || "—"}</span>
              <span>Bin: {rack.bin || "—"}</span>
              {currentProduct.brand && <span>Brand: {currentProduct.brand}</span>}
            </>
          ) : (
            <span style={{ color: "#4b5f86", fontWeight: 600 }}>
              {bn ? "পণ্য বাছাই করলে Stock, Cost আর Rack/Floor/Bin এখানে দেখাবে" : "Select a product to see Stock, Cost and Rack/Floor/Bin"}
            </span>
          )}
        </div>
        {salesSpecs(currentProduct) && (
          <div title={salesSpecs(currentProduct)} style={{ marginTop: 4, padding: "3px 8px", background: "#fff8db", border: "1px solid #e6c65c", borderRadius: 3, fontSize: 12.5, fontWeight: 700, color: "#5b4300", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
             Spec: {salesSpecs(currentProduct)}
          </div>
        )}
      </div>

      {/* Items table */}
      <div style={docItemsPane}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={{ ...th, textAlign: "center", width: 34 }}>#</th>
              <th style={{ ...th, textAlign: "left" }}>Product Name</th>
              <th style={{ ...th, textAlign: "left" }}>Code/Model</th>
              <th style={th}>Qty</th>
              <th style={{ ...th, textAlign: "left" }}>Unit</th>
              <th style={th}>Rate</th>
              <th style={th}>Amount</th>
              <th style={th}>Dis Amt</th>
              <th style={th}>Net Value</th>
              <th style={th}>VAT%</th>
              <th style={th}>VAT AMT</th>
              <th style={th}>Net Amount</th>
              <th style={th}>MRP</th>
              <th style={{ ...th, width: 30 }} />
            </tr>
          </thead>
          <tbody>
            {lineRows.length === 0 && (
              <tr><td colSpan={14} style={{ ...td, textAlign: "center", color: "#64748b", padding: 14 }}>
                {bn ? "এখনো কোনো item নেই — উপরে পণ্য বাছাই করে Add দিন" : "No items yet — pick a product above and press Add"}
              </td></tr>
            )}
            {lineRows.map((it, i) => {
              const item = isDelivery ? { ...it, discountPerc: "0", discountFlat: "", vatPerc: "0" } : it;
              const c = siCalcLine(item, isTax);
              const prod = it.productId ? productById.get(it.productId) : null;
              const selected = it.id === editingLineId;
              return (
                <tr key={it.id} onClick={() => { if (!locked) editLine(it); }} title={locked ? undefined : (bn ? "এডিট করতে ক্লিক করুন" : "Click to edit")}
                  style={{ cursor: locked ? "default" : "pointer", background: selected ? C.sel : i % 2 ? C.rowAlt : "#fff" }}>
                  <td style={{ ...td, textAlign: "center" }}>{i + 1}</td>
                  <td style={{ ...td, textAlign: "left", whiteSpace: "normal", fontWeight: 600 }}>{it.name}{it.batchNo && <span style={{ marginLeft: 6, fontSize: 10.5, fontWeight: 800, color: "#7c3aed" }}>[{it.batchNo}]</span>}{(prod?.trackSerial || it.serialNo) && (<div onClick={(e) => e.stopPropagation()} style={{ marginTop: 2 }}><input disabled={locked} value={it.serialNo || ""} onChange={(e) => { const v = e.target.value; setLines((prev) => prev.map((x) => (x.id === it.id ? { ...x, serialNo: v } : x))); }} placeholder={bn ? `সিরিয়াল / IMEI (${it.qty || 1}টি, কমা দিয়ে)` : `Serial / IMEI (${it.qty || 1}, comma separated)`} style={{ width: "100%", fontSize: 11, height: 20, padding: "0 4px", border: "1px solid #93c5fd", borderRadius: 3, fontWeight: 400 }} /></div>)}</td>
                  <td style={{ ...td, textAlign: "left" }}>{it.code}</td>
                  <td style={td}>{it.qty}</td>
                  <td style={{ ...td, textAlign: "left" }}>{it.unit}</td>
                  <td style={td}>{siFmt2(it.unitPrice)}</td>
                  <td style={td}>{siFmt2(c.gross)}</td>
                  <td style={{ ...td, color: c.disc > 0 ? C.red : td.color }}>{siFmt2(c.disc)}</td>
                  <td style={td}>{siFmt2(c.gross - c.disc)}</td>
                  <td style={td}>{isTax ? siN2(it.vatPerc) : 0}</td>
                  <td style={td}>{siFmt2(c.vat)}</td>
                  <td style={{ ...td, fontWeight: 800 }}>{siFmt2(c.total)}</td>
                  <td style={td}>{prod?.mrp ? siFmt2(prod.mrp) : ""}</td>
                  <td style={{ ...td, textAlign: "center" }}>
                    <button type="button"title={bn ? "মুছুন" : "Delete"}
                      onClick={(e) => { e.stopPropagation(); if (selected) resetEntry(); onDelLine(it.id); }}
                      style={{ background: "none", border: "none", color: C.red, fontWeight: 900, cursor: "pointer", fontSize: 14 }}>×</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
          {lineRows.length > 0 && (
            <tfoot>
              <tr style={{ background: "#fffdf6", fontWeight: 800 }}>
                <td style={{ ...td, textAlign: "left", fontWeight: 900, position: "sticky", bottom: 0, background: "#fffdf6" }} colSpan={3}>TOTAL ({lineRows.length})</td>
                <td style={{ ...td, fontWeight: 900, position: "sticky", bottom: 0, background: "#fffdf6" }}>{parseFloat(lineSum.qty.toFixed(3))}</td>
                <td style={{ ...td, position: "sticky", bottom: 0, background: "#fffdf6" }} colSpan={2} />
                <td style={{ ...td, fontWeight: 900, position: "sticky", bottom: 0, background: "#fffdf6" }}>{siFmt2(lineSum.gross)}</td>
                <td style={{ ...td, fontWeight: 900, position: "sticky", bottom: 0, background: "#fffdf6" }}>{siFmt2(lineSum.disc)}</td>
                <td style={{ ...td, fontWeight: 900, position: "sticky", bottom: 0, background: "#fffdf6" }}>{siFmt2(lineSum.gross - lineSum.disc)}</td>
                <td style={{ ...td, position: "sticky", bottom: 0, background: "#fffdf6" }} />
                <td style={{ ...td, fontWeight: 900, position: "sticky", bottom: 0, background: "#fffdf6" }}>{siFmt2(lineSum.vat)}</td>
                <td style={{ ...td, fontWeight: 900, position: "sticky", bottom: 0, background: "#fffdf6" }}>{siFmt2(lineSum.total)}</td>
                <td style={{ ...td, position: "sticky", bottom: 0, background: "#fffdf6" }} colSpan={2} />
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {/* Bottom: payment + totals */}
      <div style={docFooterGrid}>
        <div style={docFooterCol}>
          {field("Disc %", (
            <input style={inp({ textAlign: "right" })} inputMode="decimal"disabled={isDelivery || !canDiscount} value={isDelivery ? "" : form.billDiscPerc}
              onChange={(e) => { setField("billDiscPerc", e.target.value); if (siN2(e.target.value) > 0) setField("billDiscAmt", ""); }} />
          ))}
          {field("Disc Amount", (
            <input style={inp({ textAlign: "right" })} inputMode="decimal"disabled={isDelivery || !canDiscount}
              value={isDelivery ? "" : (siN2(form.billDiscPerc) > 0 ? siFmt2(totals.billDisc) : form.billDiscAmt)}
              readOnly={siN2(form.billDiscPerc) > 0}
              onChange={(e) => setField("billDiscAmt", e.target.value)} />
          ))}
          {!isQuote && !isDN && field("Pay Mode", (
            <select style={inp()} value={form.paymentMethod} disabled={isDelivery}
              onChange={(e) => {
                const key = e.target.value;
                setField("paymentMethod", key);
                setField("amountPaid", "");
                if (key !== "cash") setField("cashPartial", false);
                if (!isInvoiceBankPayMethod(key)) setField("paymentBank", "");
              }}>
              {Object.entries(SI_PAY).map(([k, v]) => <option key={k} value={k}>{v.icon} {v[lang] || v.en}</option>)}
            </select>
          ))}
          {!isQuote && !isDN && isInvoiceBankPayMethod(form.paymentMethod) && field(bn ? "ব্যাংক অ্যাকাউন্ট" : "Bank account", (
            <InvoiceBankSelect
              lang={lang}
              method={form.paymentMethod}
              value={form.paymentBank}
              shop={shop}
              disabled={isDelivery || locked}
              showLabel={false}
              inpStyle={inp()}
              onChange={(v) => setField("paymentBank", v)}
            />
          ))}
          {field("Crdt. Period", (
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <input style={inp({ textAlign: "right", width: 80 })} inputMode="numeric"value={form.creditDays || ""}
                onChange={(e) => setField("creditDays", e.target.value.replace(/[^\d]/g, ""))} />
              <span style={{ ...lbl, fontWeight: 600 }}>{bn ? "দিন" : "days"}</span>
            </div>
          ))}
        </div>
        <div style={docFooterCol}>
          {isDelivery && !isDN && field(bn ? "ডেলিভারি নোট" : "DN No", <input style={inp()} value={form.deliveryNoteNo} onChange={(e) => setField("deliveryNoteNo", e.target.value)} />)}
          {!isSO && field(bn ? "গাড়ি নং" : "Vehicle No", <input style={inp()} value={form.vehicleNo || ""} placeholder="ABC-1234"onChange={(e) => setField("vehicleNo", e.target.value)} />)}
          <div>
            <div style={docFieldLbl}>Narration</div>
            <textarea style={inp({ height: isDelivery ? 22 : isQuote ? 36 : 30, resize: "none", padding: 2, lineHeight: 1.2 })} value={form.note} onChange={(e) => setField("note", e.target.value)} />
          </div>
        </div>
        <div style={docFooterTotals}>
          {[
            ["Gross Amount", siFmt2(totals.sub)],
            ["Discount", siFmt2(totals.disc)],
            ...(isTax ? [["VAT", siFmt2(totals.vat)]] : []),
          ].map(([l, v]) => (
            <div key={l} style={docSummaryLine}><span>{l}</span><span>{v}</span></div>
          ))}
          {field(<span>Adj. <span style={{ color: "#4b5f86", fontWeight: 600 }}>[Ins]</span></span>, (
            <input ref={adjRef} style={inp({ textAlign: "right", height: 20 })} inputMode="decimal"disabled={isDelivery || !canDiscount} value={isDelivery ? "" : form.adjustment}
              placeholder="+ / -"onChange={(e) => setField("adjustment", e.target.value)} />
          ), 72)}
          {!isDelivery && Number(String(form.adjustment || "").replace(/,/g, "")) !== 0 && adjustmentReasons.length > 0 && field(bn ? "কারণ" : "Reason", (
            <select style={inp({ height: 20 })} disabled={!canDiscount} value={form.adjustmentReasonId || ""}
              onChange={(e) => { const r = adjustmentReasons.find((x) => x.id === e.target.value); setField("adjustmentReasonId", r?.id || ""); setField("adjustmentReason", r?.name || ""); }}>
              <option value="">-</option>
              {form.adjustmentReasonId && !adjustmentReasons.some((x) => x.id === form.adjustmentReasonId) && <option value={form.adjustmentReasonId}>{form.adjustmentReason}</option>}
              {adjustmentReasons.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          ), 72)}
          {field(bn ? "রাউন্ড" : "Round", (
            <div style={{ display: "flex", gap: 3 }}>
              <input style={inp({ textAlign: "right", height: 20 })} inputMode="decimal"disabled={isDelivery} value={isDelivery ? "" : form.roundOff}
                title={canDiscount ? "" : (bn ? "অনুমতি ছাড়া শুধু ১ পর্যন্ত কমানো যাবে" : "Without discount permission only up to 1 can be rounded down")}
                placeholder="+ / -"onChange={(e) => setField("roundOff", e.target.value)} />
              <button type="button"disabled={isDelivery} title={bn ? "নিকটতম পূর্ণ সংখ্যায়" : "Round to nearest whole number"}
                onClick={() => {
                  const before = totals.grand - totals.roundOff;
                  const diff = Math.round(before) - before;
                  setField("roundOff", Math.abs(diff) < 0.005 ? "" : diff.toFixed(2));
                }}
                style={btn("#e7eef9", C.label, { height: 20, padding: "0 5px", fontSize: 10 })}>Auto</button>
            </div>
          ), 72)}
          <div style={docTotalBar}>
            <span style={{ fontWeight: 800 }}>TOTAL</span>
            <span style={docTotalAmt}>{cur} {siFmt2(totals.grand)}</span>
          </div>
          {!isDelivery && !isQuote && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 3, alignItems: "center" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
                <span style={{ ...lbl, whiteSpace: "nowrap" }}>Rcvd</span>
                {isCash
                  ? <input style={inp({ textAlign: "right", height: 20, fontWeight: 700 })} readOnly value={siFmt2(formPaid)} />
                  : <input style={inp({ textAlign: "right", height: 20, fontWeight: 700 })} inputMode="decimal"value={form.amountPaid}
                      onChange={(e) => setField("amountPaid", e.target.value)} />}
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5, fontWeight: 900, color: balance > 0.01 ? C.red : C.green }}>
                <span>Bal.</span><span>{siFmt2(balance)}</span>
              </div>
            </div>
          )}
        </div>
      </div>
      </fieldset>

      {/* Action bar */}
      <div style={docActionBar}>
        <div style={{ display: "flex", gap: 6 }}>
          <button type="button"title="Ctrl+N" onClick={onNew} disabled={saving} style={btn()}>{bn ? "নতুন (Ctrl+N)" : "New (Ctrl+N)"}</button>
          <button type="button"title="F7" onClick={() => setShowSearch(true)} style={btn()}> {bn ? "খুঁজুন (F7)" : "Search (F7)"}</button>
          {onPrintInvoice && (() => {
            const canPrintNow = !!savedInvoice || lines.some((it) => String(it.name || "").trim());
            return (
              <button type="button"disabled={!canPrintNow} title="Ctrl+P" onClick={() => onPrintInvoice(savedInvoice)}
                style={btn("#e7eef9", C.label, { opacity: canPrintNow ? 1 : 0.5 })}> {bn ? "প্রিন্ট (Ctrl+P)" : "Print (Ctrl+P)"}</button>
            );
          })()}
          {whatsAppDoc && savedInvoice && savedInvoice.status !== "draft" && (
            <WhatsAppButton lang={lang} toast={toast} className="" style={btn("#dcfce7", "#166534")} build={() => whatsAppDoc(savedInvoice)} />
          )}
          {onOpenReminder && savedInvoice && (
            <button type="button"onClick={() => onOpenReminder(savedInvoice)} style={btn("#fef3c7", "#92400e")}> {bn ? "রিমাইন্ডার" : "Remind me"}</button>
          )}
          {onConvertToDN && savedInvoice && ["draft", "open"].includes(savedInvoice.status) && (
            <button type="button"onClick={() => onConvertToDN(savedInvoice)} disabled={saving}
              style={btn("#6d28d9", "#fff")}> {bn ? "ডেলিভারি নোট বানান" : "Make Delivery Note"}</button>
          )}
          {onConvertQuote && savedInvoice && (isQuote ? ["draft", "open"] : isDN ? ["confirmed"] : []).includes(savedInvoice.status) && (
            <button type="button"onClick={() => onConvertQuote(savedInvoice)} disabled={saving}
              style={btn("#15803d", "#fff")}> {bn ? "সেলস ইনভয়েস বানান" : "Convert to Invoice"}</button>
          )}
          {onCancelInvoice && savedInvoice && (isQuote ? ["draft", "open"] : isDN ? ["draft", "confirmed"] : ["draft", "confirmed", "partial", "paid"]).includes(savedInvoice.status) && (
            <button type="button"onClick={() => onCancelInvoice(savedInvoice)} disabled={saving}
              style={btn("#fee2e2", C.red)}> {bn ? "বিল বাতিল" : "Cancel Bill"}</button>
          )}
          {onDeleteInvoice && savedInvoice && canDeleteInvoice?.(savedInvoice) && (
            <button type="button"onClick={() => onDeleteInvoice(savedInvoice)} disabled={saving}
              style={btn("#7f1d1d", "#fff")}> {bn ? "মুছুন" : "Delete"}</button>
          )}
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <button type="button"onClick={onClose} disabled={saving} style={btn()}>{bn ? "বাতিল" : "Cancel"}</button>
          {locked ? (
            canEditInvoice(savedInvoice) ? (
              <button type="button"onClick={() => { setLocked(false); setTimeout(() => nameRef.current?.focus(), 0); }}
                title="Ctrl+E" style={btn("#1d4ed8", "#fff", { padding: "0 22px" })}> {bn ? "এডিট (Ctrl+E)" : "Edit (Ctrl+E)"}</button>
            ) : (
              <button type="button"disabled title={bn ? "এই বিল এডিট করা যাবে না (বাতিল / রূপান্তরিত / রিসিট আছে / অনুমতি নেই)" : "This bill cannot be edited (cancelled / converted / has receipts / no permission)"}
                style={btn("#e5e7eb", "#6b7280", { padding: "0 22px", cursor: "not-allowed" })}> {bn ? "এডিট বন্ধ" : "Edit locked"}</button>
            )
          ) : (
            <>
              <button type="button"title="Ctrl+Shift+S" onClick={onSaveDraft} disabled={saving} style={btn("#fef3c7", "#92400e")}>{bn ? "ড্রাফট (Ctrl+Shift+S)" : "Draft (Ctrl+Shift+S)"}</button>
              <button type="button"title="Ctrl+S" onClick={onConfirm} disabled={saving} style={btn("#15803d", "#fff", { padding: "0 22px" })}>
                {saving ? "…" : (bn ? "সেভ (Ctrl+S)" : "Save (Ctrl+S)")}
              </button>
            </>
          )}
          <button type="button"title={bn ? "আগের বিল" : "Previous bill"} disabled={!olderInvoice} onClick={() => olderInvoice && onOpenInvoice(olderInvoice)}
            style={btn("#e7eef9", C.label, { padding: "0 12px", marginLeft: 10, opacity: olderInvoice ? 1 : 0.4 })}>&lt;</button>
          <button type="button"title={bn ? "পরের বিল" : "Next bill"} disabled={!newerInvoice} onClick={() => newerInvoice && onOpenInvoice(newerInvoice)}
            style={btn("#e7eef9", C.label, { padding: "0 12px", opacity: newerInvoice ? 1 : 0.4 })}>&gt;</button>
        </div>
      </div>

      {/* Status line */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "1px 6px", background: "#fff", borderTop: `1px solid ${C.border}`, minHeight: 20, flexShrink: 0 }}>
        <div style={{ flex: 1, textAlign: "center", color: C.red, fontWeight: 800, fontSize: 11, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {currentProduct ? (() => {
            const excl = siN2(current.unitPrice) || siN2(currentProduct.vatExclusive);
            const vatP = siN2(currentProduct.salesVat || current.vatPerc);
            const incl = siN2(currentProduct.vatInclusive) || excl * (1 + vatP / 100);
            return `${codeLine(currentProduct)} (Excl Rate:${siFmt2(excl)} ,Incl Rate:${siFmt2(incl)})`;
          })() : ""}
        </div>
        <label style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 10, color: C.label, whiteSpace: "nowrap", cursor: "pointer" }}>
          <input type="checkbox"checked={!!form.hideCodeInPrint} onChange={(e) => setField("hideCodeInPrint", e.target.checked)} />
          Do not Print Code in Bill
        </label>
      </div>

      {showHistory && (
        <div data-si-modal-open="">
          <ProductHistoryModal lang={lang} kind={kind} bills={customerBills} customerName={form.customerName}
            product={currentProduct} productName={current.name} siCalcLine={siCalcLine} siFmt2={siFmt2} siN2={siN2}
            onClose={() => setShowHistory(false)}
            onOpen={(inv) => { setShowHistory(false); onOpenInvoice(inv); }} />
        </div>
      )}

      {branchStockOpen && currentProduct && (
        <Modal title={bn ? "অন্য শাখায় স্টক / অনুরোধ" : "Other branch stock / request"} width={520} onClose={() => setBranchStockOpen(false)}>
          <SiBranchStockRequest
            lang={lang}
            shop={shop}
            shopId={shopId}
            user={user}
            profile={profile}
            team={team}
            product={currentProduct}
            toast={toast}
            onClose={() => setBranchStockOpen(false)}
          />
        </Modal>
      )}

      {productSearchName !== null && (
        <div data-si-modal-open="">
          <style>{PM_CSS}</style>
          <GlobalSearchModal
            products={products}
            showCost={canSeeCost}
            initialFields={productSearchName ? { productName: productSearchName } : null}
            rowTitle={bn ? "Double-click বা Enter চাপলে বিলে যোগ হবে" : "Double-click or press Enter to select"}
            onSelect={(p) => pickProduct(p)}
            onClose={() => {
              setProductSearchName(null);
              setTimeout(() => { if (document.activeElement === document.body) nameRef.current?.focus(); }, 120);
            }} />
        </div>
      )}

      {reminderForm && savedInvoice && reminderForm.invoiceId === savedInvoice.id && (
        <Modal title={bn ? "রিমাইন্ডার সেট করুন" : "Set a reminder"} width={420} onClose={onCloseReminder}>
          <div style={{ display: "grid", gap: 8 }}>
            <div style={{ fontSize: 12, color: C.label, fontWeight: 700 }}>{savedInvoice.invoiceNo}{savedInvoice.customerName ? ` — ${savedInvoice.customerName}` : ""}</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <DateField style={inp()} value={reminderForm.date} onChange={(e) => onChangeReminder?.((p) => ({ ...p, date: e.target.value }))} />
              <input type="time"style={inp()} value={reminderForm.time} onChange={(e) => onChangeReminder?.((p) => ({ ...p, time: e.target.value }))} />
            </div>
            <input style={inp()} placeholder={bn ? "নোট (ঐচ্ছিক)" : "Note (optional)"} value={reminderForm.note} onChange={(e) => onChangeReminder?.((p) => ({ ...p, note: e.target.value }))} />
            <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
              <button type="button"onClick={onCloseReminder} style={btn()}>{bn ? "বাতিল" : "Cancel"}</button>
              <button type="button"disabled={!reminderForm.date} onClick={onSaveReminder} style={btn("#15803d", "#fff")}> {bn ? "সেভ করুন" : "Save"}</button>
            </div>
          </div>
        </Modal>
      )}

      {showSearch && (
        <div data-si-modal-open="">
          <InvoiceSearchModal invoices={invoices} siFmt2={siFmt2} SI_PAY={SI_PAY} lang={lang}
            onClose={() => setShowSearch(false)}
            onPick={(inv) => { setShowSearch(false); onOpenInvoice(inv); }} />
        </div>
      )}
    </div>
  );
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
export const fmtDate = (iso) => {
  const m = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : String(iso || "");
};
export const fmtDateLong = (iso) => {
  const m = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}-${MONTHS[Number(m[2]) - 1]}-${m[1]}` : String(iso || "");
};
export const textMatch = (value, query, extended) => {
  const q = String(query || "").trim().toLowerCase();
  if (!q) return true;
  const v = String(value ?? "").toLowerCase();
  return extended ? v.includes(q) : v.startsWith(q);
};
const escapeHtml = (v) => String(v ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

export function GridTable({ columns, rows, rowKey, onRowDoubleClick, minRows = 12, emptyText }) {
  const filler = Math.max(0, minRows - rows.length);
  return (
    <table style={{ width: "100%", borderCollapse: "collapse", background: "#fff", tableLayout: "fixed" }}>
      <colgroup>{columns.map((c) => <col key={c.key} style={{ width: c.width }} />)}</colgroup>
      <thead>
        <tr>{columns.map((c) => <th key={c.key} style={{ ...th, textAlign: c.align || "left" }}>{c.label}</th>)}</tr>
      </thead>
      <tbody>
        {rows.length === 0 && emptyText && (
          <tr><td colSpan={columns.length} style={{ ...td, textAlign: "center", color: "#64748b", padding: 16 }}>{emptyText}</td></tr>
        )}
        {rows.map((r, i) => (
          <tr key={rowKey(r, i)} onDoubleClick={onRowDoubleClick ? () => onRowDoubleClick(r) : undefined}
            title={onRowDoubleClick ? "Double click to open" : undefined}
            style={{ cursor: onRowDoubleClick ? "pointer" : "default", background: i === 0 ? "#fffdf6" : "#fff" }}>
            {columns.map((c) => (
              <td key={c.key} style={{
                ...td, textAlign: c.align || "left", borderRight: "1px solid #d3deef", fontWeight: c.bold ? 700 : 400, color: c.color?.(r) || td.color,
                ...(c.wrap ? { whiteSpace: "pre-wrap", overflow: "visible", textOverflow: "clip", verticalAlign: "top" } : { overflow: "hidden", textOverflow: "ellipsis" }),
              }}>
                {c.render(r)}
              </td>
            ))}
          </tr>
        ))}
        {Array.from({ length: filler }, (_, i) => (
          <tr key={`f${i}`}>{columns.map((c) => <td key={c.key} style={{ ...td, height: 18, borderRight: "1px solid #d3deef" }} />)}</tr>
        ))}
      </tbody>
    </table>
  );
}

const normKey = (v) => String(v ?? "").trim().toLowerCase();
// Lines saved without a productId are matched by name; same-named products with different codes stay apart.
export const sameProductLine = (it, product, wantName) => {
  const code = normKey(product?.code || product?.barcode);
  const codeHit = !!code && normKey(it.code) === code;
  if (product && it.productId) return it.productId === product.id || codeHit;
  const name = normKey(wantName || product?.name);
  return codeHit || (!!name && normKey(it.name) === name);
};

function ProductHistoryModal({ lang, kind = "sales", bills, customerName, product, productName, siCalcLine, siFmt2, siN2, onClose, onOpen }) {
  const bn = lang === "bn";
  const docWord = kind === "quotation" ? "QUOTATION" : kind === "delivery" ? "DELIVERY" : "SALES";
  const verb = kind === "quotation" ? "QUOTED TO" : kind === "delivery" ? "DELIVERED TO" : "SOLD TO";
  const [billNo, setBillNo] = useState("");
  const [extended, setExtended] = useState(false);
  const wantName = String(product?.name || productName || "").trim().toLowerCase();
  const byProduct = !!(product || wantName);
  const allCustomers = !String(customerName || "").trim();

  const rows = useMemo(() => {
    const out = [];
    bills.forEach((inv) => {
      if (!textMatch(inv.invoiceNo, billNo, extended)) return;
      (inv.items || []).forEach((it, idx) => {
        if (byProduct && !sameProductLine(it, product, wantName)) return;
        const c = siCalcLine(it, false);
        out.push({
          key: `${inv.id}-${idx}`, inv, name: it.name, qty: siN2(it.qty), unit: it.unit || "",
          rate: siN2(it.unitPrice), amount: c.gross, discount: siN2(it.discountAmt) || c.disc, net: c.gross - (siN2(it.discountAmt) || c.disc),
        });
      });
    });
    return out.sort((a, b) => String(b.inv.invoiceDate || "").localeCompare(String(a.inv.invoiceDate || "")) || String(b.inv.invoiceNo).localeCompare(String(a.inv.invoiceNo)));
  }, [bills, billNo, extended, byProduct, product, wantName, siCalcLine, siN2]);

  const totalQty = rows.reduce((a, r) => a + r.qty, 0);
  const totalUnit = byProduct ? (rows[0]?.unit || product?.unit || "") : "";
  const title = byProduct
    ? `${docWord} HISTORY OF PRODUCT ${(product?.name || productName || "").toUpperCase()} ${verb} ${allCustomers ? "ALL CUSTOMERS" : String(customerName || "").toUpperCase()}`
    : `${docWord} HISTORY OF ${String(customerName || "").toUpperCase()}`;

  const columns = [
    { key: "no", label: "Bill No", width: 80, bold: true, render: (r) => r.inv.invoiceNo },
    { key: "date", label: "Bill Date", width: 90, render: (r) => fmtDate(r.inv.invoiceDate) },
    ...(byProduct ? [] : [{ key: "name", label: "Product", width: 170, render: (r) => r.name }]),
    { key: "qty", label: kind === "quotation" ? "Qty Quoted" : kind === "delivery" ? "Qty Delivered" : "Qty Sold", width: 80, align: "right", render: (r) => `${r.qty} ${r.unit}` },
    { key: "rate", label: "Rate", width: 80, align: "right", bold: true, render: (r) => siFmt2(r.rate) },
    { key: "amt", label: "Amount", width: 85, align: "right", render: (r) => siFmt2(r.amount) },
    { key: "disc", label: "Discount", width: 75, align: "right", render: (r) => siFmt2(r.discount) },
    { key: "net", label: "Net Amt", width: 85, align: "right", render: (r) => siFmt2(r.net) },
    { key: "to", label: kind === "quotation" ? "Quoted To" : kind === "delivery" ? "Delivered To" : "Sold To", width: 150, render: (r) => r.inv.customerName || "—" },
    { key: "by", label: "Sold By", width: 120, render: (r) => r.inv.salesmanName || r.inv.createdByName || "" },
  ];

  const printList = () => {
    const head = columns.map((c) => `<th style="text-align:${c.align || "left"}">${escapeHtml(c.label)}</th>`).join("");
    const body = rows.map((r) => `<tr>${columns.map((c) => `<td style="text-align:${c.align || "left"}">${escapeHtml(c.render(r))}</td>`).join("")}</tr>`).join("");
    printWithSettings(`<html><head><meta charset="UTF-8"><title>${escapeHtml(title)}</title><style>body{font-family:Segoe UI,Arial;font-size:12px;padding:16px}h3{font-size:14px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #999;padding:4px 6px}th{background:#e5eaf3}</style></head><body><h3>${escapeHtml(title)}</h3><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>${byProduct ? `<p><b>Total: ${totalQty} ${escapeHtml(totalUnit)}</b></p>` : ""}</body></html>`);
  };

  return (
    <Modal title={title} onClose={onClose} width={byProduct ? 900 : 1060}>
      <div style={{ border: `1px solid ${C.border}`, maxHeight: "48vh", overflow: "auto" }}>
        <GridTable columns={columns} rows={rows} rowKey={(r) => r.key} onRowDoubleClick={(r) => onOpen(r.inv)}
          emptyText={byProduct
            ? (allCustomers
              ? (bn ? "এই পণ্যের আগের কোনো রেকর্ড নেই" : "No previous records for this product")
              : kind === "quotation"
              ? (bn ? "এই কাস্টমারকে এই পণ্যের আগে কোনো কোটেশন দেওয়া হয়নি" : "This product was never quoted to this customer")
              : kind === "delivery"
                ? (bn ? "এই কাস্টমারকে এই পণ্য আগে ডেলিভারি দেওয়া হয়নি" : "This product was never delivered to this customer")
                : (bn ? "এই কাস্টমারকে এই পণ্য আগে বিক্রি হয়নি" : "This product was never sold to this customer"))
            : (bn ? "এই কাস্টমারের আগের কোনো বিল নেই" : "No previous bills for this customer")} />
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 8 }}>
        <span style={lbl}>Bill No</span>
        <input style={inp({ width: 110 })} value={billNo} onChange={(e) => setBillNo(e.target.value)} />
        <label style={{ ...lbl, fontWeight: 600, display: "flex", alignItems: "center", gap: 4, cursor: "pointer" }}>
          <input type="checkbox"checked={extended} onChange={(e) => setExtended(e.target.checked)} /> Extended Search
        </label>
        {byProduct && <span style={{ ...lbl, marginLeft: 20 }}>Total: <span style={{ color: C.green }}>{parseFloat(totalQty.toFixed(3))} {totalUnit}</span></span>}
        <span style={{ fontSize: 11.5, color: "#4b5f86", marginLeft: "auto" }}>{bn ? "Invoice খুলতে row-তে double click করুন" : "Double click a row to open the invoice"}</span>
        <button type="button"onClick={printList} disabled={!rows.length} style={btn()}>Print</button>
        <button type="button"onClick={onClose} style={btn()}>CLOSE</button>
      </div>
    </Modal>
  );
}

function InvoiceSearchModal({ invoices, siFmt2, SI_PAY, lang, onClose, onPick }) {
  const bn = lang === "bn";
  const [from, setFrom] = useState(todayIso);
  const [to, setTo] = useState(todayIso);
  const [crit, setCrit] = useState({ billNo: "", customer: "", employee: "", payMode: "", net: "", refNo: "" });
  const [extended, setExtended] = useState(false);
  const [autoSearch, setAutoSearch] = useState(true);
  const [applied, setApplied] = useState(() => ({ from: todayIso(), to: todayIso(), crit: { billNo: "", customer: "", employee: "", payMode: "", net: "", refNo: "" }, extended: false }));
  const setC = (k, v) => setCrit((p) => ({ ...p, [k]: v }));

  const active = autoSearch ? { from, to, crit, extended } : applied;
  const payLabel = (inv) => SI_PAY[inv.paymentMethod]?.en || inv.paymentMethod || "";
  const employee = (inv) => inv.salesmanName || inv.createdByName || "";

  const rows = useMemo(() => {
    const { from: f, to: tt, crit: c, extended: ext } = active;
    return invoices.filter((inv) => {
      const d = String(inv.invoiceDate || "").slice(0, 10);
      if (f && d < f) return false;
      if (tt && d > tt) return false;
      return textMatch(inv.invoiceNo, c.billNo, ext)
        && textMatch(inv.customerName, c.customer, ext)
        && textMatch(employee(inv), c.employee, ext)
        && textMatch(payLabel(inv), c.payMode, ext)
        && textMatch(siFmt2(inv.grandTotal), c.net, ext)
        && textMatch(inv.refNo, c.refNo, ext);
    }).slice(0, 500);
  }, [invoices, active.from, active.to, active.crit, active.extended]);

  const display = () => setApplied({ from, to, crit, extended });
  const box = (label, key) => (
    <label style={{ display: "grid", gap: 2 }}>
      <span style={lbl}>{label}</span>
      <input style={inp({ height: 26 })} value={crit[key]} onChange={(e) => setC(key, e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); if (!autoSearch) display(); else if (rows[0]) onPick(rows[0]); } }} />
    </label>
  );

  const columns = [
    { key: "no", label: "Bill No", width: 80, render: (r) => r.invoiceNo },
    { key: "date", label: "Bill Date", width: 100, render: (r) => fmtDateLong(r.invoiceDate) },
    { key: "cust", label: "Customer", width: 300, render: (r) => r.customerName || "—" },
    { key: "emp", label: "Employee", width: 100, render: employee },
    { key: "pay", label: "Paymode", width: 100, render: payLabel },
    { key: "net", label: "Net Amount", width: 110, align: "right", render: (r) => siFmt2(r.grandTotal),
      color: (r) => (r.status === "cancelled" ? "#9ca3af" : undefined) },
  ];

  return (
    <Modal title="Search"onClose={onClose} width={780}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <span style={lbl}><u>F</u>rom</span>
        <DateField style={inp({ width: 140 })} value={from} onChange={(e) => setFrom(e.target.value)} />
        <span style={{ ...lbl, marginLeft: 8 }}><u>T</u>o</span>
        <DateField style={inp({ width: 140 })} value={to} onChange={(e) => setTo(e.target.value)} />
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <button type="button"onClick={display} style={btn("#e7eef9", C.label, { width: 80 })}>Display</button>
          <button type="button"onClick={onClose} style={btn("#e7eef9", C.label, { width: 80 })}>Close</button>
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "6px 4px" }}>
        {box("Bill No", "billNo")}
        {box("Customer", "customer")}
        {box("Employee", "employee")}
        {box("Pay Mode", "payMode")}
        {box("Net Amount", "net")}
        {box("Reference No", "refNo")}
      </div>
      <label style={{ ...lbl, display: "flex", alignItems: "center", gap: 6, marginTop: 8, cursor: "pointer" }}>
        <input type="checkbox"checked={extended} onChange={(e) => setExtended(e.target.checked)} /> Extended Search
        <span style={{ color: "#8b1a1a", marginLeft: 20, fontWeight: 700 }}>(Will display all details containing the search text in any part of the field)</span>
      </label>
      <label style={{ ...lbl, display: "flex", alignItems: "center", gap: 6, marginTop: 4, marginBottom: 6, cursor: "pointer" }}>
        <input type="checkbox"checked={autoSearch} onChange={(e) => { setAutoSearch(e.target.checked); if (!e.target.checked) display(); }} /> Auto Search while typing in text box
      </label>
      <div style={{ border: `1px solid ${C.border}`, height: "44vh", overflow: "auto" }}>
        <GridTable columns={columns} rows={rows} rowKey={(r) => r.id} onRowDoubleClick={onPick} minRows={16} />
      </div>
      <div style={{ fontSize: 11.5, color: "#4b5f86", marginTop: 6 }}>
        {rows.length} {bn ? "টি বিল · খুলতে double click করুন" : "bill(s) · double click to open"}
      </div>
    </Modal>
  );
}
