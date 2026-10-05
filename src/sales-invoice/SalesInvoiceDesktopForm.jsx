import React, { useEffect, useMemo, useRef, useState } from "react";
import { ProductNameLookup, ProductCodeLookup, codeLine } from "./ProductLookupInputs.jsx";
import { nsq } from "../utils/productSearch";
import { computeStockMap, loadInvoiceRows } from "../inventory/stockFromInvoices";
import { itemBaseQty } from "../inventory/unitConversion";
import { listShopRecords } from "../branch-transfer/branchTransferService";
import GlobalSearchModal from "../product-master/modals/GlobalSearchModal";
import { PM_CSS } from "../product-master/pmStyles";
import { printWithSettings } from "../print/printSettings.js";

const CURRENCIES = ["AED", "USD", "SAR", "OMR", "QAR", "KWD", "BHD", "INR", "BDT", "EUR"];

export const C = {
  bg: "#c7d8ee",
  panel: "#dbe6f5",
  bar: "#1f3f73",
  label: "#0d2350",
  border: "#8aa3c7",
  input: "#ffffff",
  head: "#2c5aa0",
  rowAlt: "#eef3fb",
  sel: "#ffe9a8",
  red: "#b91c1c",
  green: "#166534",
};

export const inp = (extra = {}) => ({
  height: 26, padding: "2px 6px", border: `1px solid ${C.border}`, borderRadius: 2, background: C.input,
  color: "#111", fontSize: 13, fontFamily: "inherit", outline: "none", width: "100%", boxSizing: "border-box", ...extra,
});
export const lbl = { fontSize: 12, fontWeight: 700, color: C.label, whiteSpace: "nowrap" };
export const btn = (bg = "#e7eef9", color = C.label, extra = {}) => ({
  height: 30, padding: "0 14px", border: `1px solid ${C.border}`, borderRadius: 3, background: bg, color,
  fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap", ...extra,
});
export const th = { padding: "4px 6px", background: C.head, color: "#fff", fontSize: 12, fontWeight: 700, textAlign: "right", whiteSpace: "nowrap", position: "sticky", top: 0 };
export const td = { padding: "3px 6px", fontSize: 12.5, textAlign: "right", borderBottom: `1px solid #d3deef`, whiteSpace: "nowrap", color: "#0f172a" };

export function splitRack(rackLocation) {
  const parts = String(rackLocation || "").split("/").map((v) => v.trim());
  return { rack: parts[0] || "", floor: parts[1] || "", bin: parts[2] || "" };
}

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
          <button type="button" onClick={onClose} style={{ background: "transparent", border: "none", color: "#fff", fontSize: 16, cursor: "pointer" }}>✕</button>
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
            <div key={c.id} onMouseDown={(e) => { e.preventDefault(); pick(c); }} onMouseEnter={() => setActive(i)}
              style={{ padding: "5px 10px", cursor: "pointer", background: i === active ? "#dbe6f5" : "#fff", borderBottom: "1px solid #eef3fb" }}>
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
  form, setField, lines, setLines, current, setCurrent, totals, formPaid, balance,
  invoiceNo, editInvId, saving, nameRef, qtyRef,
  helpers,
  onSelectProduct, onChangeCurrentUnit, onAddCurrent, onDelLine,
  onOpenCustomerPicker, onConfirm, onSaveDraft, onClose, onNew, onOpenInvoice, onPrintInvoice, onOpenProductMaster, onCancelInvoice, toast,
  kind = "sales", sourceQuoteNo = "", sourceIsDN = false, onConvertQuote, canDiscount = true,
}) {
  const { siCalcLine, siFmt2, siN2, siUnitOptionsFor, SI_PAY, SI_STATUSES } = helpers;
  const bn = lang === "bn";
  const isQuote = kind === "quotation";
  const isDN = kind === "delivery";
  const isDelivery = isDN || (kind === "sales" && form.invoiceType === "delivery");
  const isTax = form.invoiceType === "tax" && !isDelivery;
  const isCash = form.paymentMethod === "cash";
  const cur = form.currency || "AED";

  const codeRef = useRef(null);
  const adjRef = useRef(null);
  const [editingLineId, setEditingLineId] = useState(null);
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

  useEffect(() => {
    let cancelled = false;
    loadInvoiceRows()
      .then(({ purchaseInvoices, salesInvoices, deliveryNotes }) => {
        if (!cancelled) setStockMap(computeStockMap(products, purchaseInvoices, salesInvoices, shopId, deliveryNotes));
      })
      .catch((err) => console.warn("[S4 SI] stock load failed", err));
    return () => { cancelled = true; };
  }, [products, invoices, shopId]);

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
    if (want > available + 1e-9) {
      toast(bn ? `⚠ স্টক কম: আছে ${parseFloat(available.toFixed(2))} ${currentProduct.unit || "Pcs"}, দিচ্ছেন ${parseFloat(want.toFixed(2))}` : `⚠ Low stock: ${parseFloat(available.toFixed(2))} ${currentProduct.unit || "Pcs"} available, entering ${parseFloat(want.toFixed(2))}`, "err");
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
    if (!hits.length) return false;
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

  const handlersRef = useRef({});
  handlersRef.current = {
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
      if (document.querySelector("[data-si-modal-open]")) return;
      const h = handlersRef.current;
      const tag = String(e.target?.tagName || "").toLowerCase();
      const typing = (tag === "input" || tag === "textarea") && String(e.target.value || "").length > 0;
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
  const rack = splitRack(currentProduct?.rackLocation);
  const unitOptions = siUnitOptionsFor(currentProduct, current.unit);
  const field = (label, node, labelWidth = 92) => (
    <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
      <span style={{ ...lbl, width: labelWidth, flexShrink: 0 }}>{label}</span>
      <div style={{ flex: 1, minWidth: 0 }}>{node}</div>
    </div>
  );

  return (
    <div style={{ background: C.bg, border: `1px solid ${C.bar}`, borderRadius: 4, minWidth: 1060, flex: 1, minHeight: 0, display: "flex", flexDirection: "column", overflow: "hidden", fontFamily: "Segoe UI, Tahoma, sans-serif", color: C.label }}>
      {/* Header */}
      <div style={{ display: "grid", gridTemplateColumns: "130px 1fr 150px", gap: 8, padding: "8px 10px 4px", background: C.panel }}>
        <div style={{ border: `1px solid ${C.bar}`, borderRadius: 4, overflow: "hidden", background: "#fff" }}>
          <div style={{ background: C.head, color: "#fff", textAlign: "center", fontSize: 12.5, fontWeight: 800, textDecoration: "underline", padding: "2px 0" }}>{isQuote ? "Quotation No" : isDN ? "DN No" : "Bill No"}</div>
          <div style={{ textAlign: "center", fontSize: 16, fontWeight: 900, color: "#111", padding: "4px 0" }}>{invoiceNo || "—"}</div>
        </div>
        <div style={{ position: "relative", border: `1px solid ${C.bar}`, borderRadius: 4, background: "#dfe8f6", display: "flex", alignItems: "center", justifyContent: "center", minHeight: 50 }}>
          <div style={{ position: "absolute", left: 8, top: 0, bottom: 0, display: "flex", alignItems: "center", gap: 6 }}>
            {!isDN && !isQuote && (
              <select style={inp({ width: 130, height: 24, fontSize: 12 })} value={form.invoiceType} onChange={(e) => setField("invoiceType", e.target.value)}
                title={bn ? "ইনভয়েস টাইপ" : "Invoice type"}>
                {form.invoiceType === "regular" && <option value="regular">{t.si_regular || "Regular"}</option>}
                <option value="tax">{t.si_tax || "Tax Invoice"}</option>
                {form.invoiceType === "delivery" && <option value="delivery">{t.si_delivery || "Delivery Note"}</option>}
              </select>
            )}
            {savedInvoice && (
              <span style={{ fontSize: 11, fontWeight: 800, padding: "1px 8px", borderRadius: 10, background: SI_STATUSES[savedInvoice.status]?.color || "#64748b", color: "#fff" }}>
                {SI_STATUSES[savedInvoice.status]?.[lang] || savedInvoice.status}
              </span>
            )}
          </div>
          <div style={{ textAlign: "center", lineHeight: 1.1 }}>
            <span style={{ fontSize: 24, fontWeight: 900, color: isQuote ? "#b45309" : isDN ? "#6d28d9" : "#111", letterSpacing: 0.5 }}>{isQuote ? "QUOTATION" : isDN ? "DELIVERY NOTE" : "SALES INVOICE"}</span>
            {sourceQuoteNo && (
              <div style={{ fontSize: 11, fontWeight: 800, color: sourceIsDN ? "#6d28d9" : "#b45309" }}>
                {sourceIsDN ? (bn ? "ডেলিভারি নোট থেকে" : "From Delivery Note") : (bn ? "কোটেশন থেকে" : "From Quotation")}: {sourceQuoteNo}
              </div>
            )}
          </div>
          <div style={{ position: "absolute", right: 8, top: 4, width: 200 }}>
            <div style={{ ...lbl, fontSize: 11 }}><u>S</u>tock Location</div>
            <select style={inp({ height: 22, fontSize: 12 })} value={form.stockLocation || "main"}
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
        <div style={{ border: `1px solid ${C.bar}`, borderRadius: 4, overflow: "hidden", background: "#fff" }}>
          <div style={{ background: C.head, color: "#fff", textAlign: "center", fontSize: 12.5, fontWeight: 800, padding: "2px 0" }}>Bill Date</div>
          <input type="date" style={inp({ border: "none", height: 30, fontWeight: 700 })} value={form.invoiceDate} onChange={(e) => setField("invoiceDate", e.target.value)} />
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "150px minmax(280px,360px) minmax(240px,320px) 1fr 130px", gap: 10, padding: "2px 10px 8px", background: C.panel, borderBottom: `1px solid ${C.border}` }}>
        <div>
          <div style={lbl}>Ref.Number</div>
          <input style={inp()} value={form.refNo || ""} onChange={(e) => setField("refNo", e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); custRef.current?.focus(); } }} />
        </div>
        <div>
          <div style={{ ...lbl, display: "flex", justifyContent: "space-between" }}>
            <span><u>C</u>ustomer (Home Key)</span>
            <button type="button" onClick={() => handlersRef.current.history()}
              style={{ background: "none", border: "none", padding: 0, color: C.label, fontWeight: 800, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>
              F8 - Customer Bill History
            </button>
          </div>
          <div style={{ display: "flex", gap: 2 }}>
            <CustomerTypeahead customers={customers} value={form.customerName} lang={lang} inputRef={custRef}
              onEnterEmpty={() => salesmanRef.current?.focus()}
              placeholder={bn ? "Walk-in / নাম লিখুন" : "Walk-in / type name"}
              onChange={(v) => { setField("customerName", v); if (form.customerId) setField("customerId", ""); }}
              onSelect={(c) => { onSelectCustomer(c); setTimeout(() => nameRef.current?.focus(), 60); }} />
            <button type="button" onClick={onOpenCustomerPicker} title="Home" style={btn("#e7eef9", C.label, { height: 26, padding: "0 6px", fontSize: 11 })}>▼</button>
          </div>
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
            <div style={lbl}>Valid Until</div>
            <input type="date" style={inp()} value={form.validUntil || ""} onChange={(e) => setField("validUntil", e.target.value)} />
          </div>
        ) : <div />}
        <div>
          <div style={lbl}>Currency</div>
          <select style={inp()} value={cur} onChange={(e) => setField("currency", e.target.value)}>
            {[...new Set([cur, ...CURRENCIES])].map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
      </div>

      {/* Entry row */}
      <div style={{ padding: "8px 12px", background: "#e9f0fa", borderBottom: `1px solid ${C.border}` }}>
        <div style={{ display: "grid", gridTemplateColumns: "minmax(220px,2fr) minmax(200px,2fr) 70px 92px 100px 64px 84px 64px auto", gap: 6, alignItems: "end" }}>
          <div>
            <div style={{ ...lbl, display: "flex", justifyContent: "space-between" }}>
              <span>Product Nam<u>e</u>{" "}
                <button type="button" onClick={() => handlersRef.current.productSearch()} title={bn ? "প্রোডাক্ট সার্চ" : "Search Product"}
                  style={{ background: "none", border: "none", padding: 0, color: "#1d4ed8", fontWeight: 700, fontSize: 12, cursor: "pointer", textDecoration: "underline", fontFamily: "inherit" }}>(F10)</button>
              </span>
              <button type="button" onClick={() => handlersRef.current.newProduct()} style={{ background: "none", border: "none", padding: 0, color: "#1d4ed8", fontWeight: 700, fontSize: 11.5, cursor: "pointer", textDecoration: "underline", marginRight: 40 }}>
                New Product [F9]
              </button>
            </div>
            <ProductNameLookup products={products} value={current.name} inputRef={nameRef} openSignal={nameOpenSignal}
              onChange={(value) => { setCodeChoices(null); setCurrent((p) => ({ ...p, name: value })); }}
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
            <input ref={qtyRef} style={inp({ textAlign: "right" })} inputMode="decimal" value={current.qty}
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
            <input ref={rateRef} style={inp({ textAlign: "right" })} inputMode="decimal" value={current.unitPrice}
              onChange={(e) => setCurrent((p) => ({ ...p, unitPrice: e.target.value }))}
              onFocus={(e) => e.target.select()}
              onKeyDown={(e) => enterTo(e, isDelivery ? null : !canDiscount ? (isTax ? vatRef : null) : disPRef)} />
          </div>
          <div>
            <div style={lbl}>Dis %</div>
            <input ref={disPRef} style={inp({ textAlign: "right" })} inputMode="decimal" disabled={isDelivery || !canDiscount} value={isDelivery ? "" : current.discountPerc}
              onChange={(e) => setCurrent((p) => ({ ...p, discountPerc: e.target.value, ...(siN2(e.target.value) > 0 ? { discountFlat: "" } : {}) }))}
              onFocus={(e) => e.target.select()}
              onKeyDown={(e) => enterTo(e, disARef)} />
          </div>
          <div>
            <div style={lbl}>Dis Amt</div>
            <input ref={disARef} style={inp({ textAlign: "right" })} inputMode="decimal" disabled={isDelivery || !canDiscount} value={isDelivery ? "" : current.discountFlat}
              onChange={(e) => setCurrent((p) => ({ ...p, discountFlat: e.target.value, ...(siN2(e.target.value) > 0 ? { discountPerc: "0" } : {}) }))}
              onFocus={(e) => e.target.select()}
              onKeyDown={(e) => enterTo(e, isTax ? vatRef : null)} />
          </div>
          <div>
            <div style={lbl}>VAT %</div>
            <input ref={vatRef} style={inp({ textAlign: "right" })} inputMode="decimal" disabled={!isTax} value={isTax ? current.vatPerc : ""}
              onChange={(e) => setCurrent((p) => ({ ...p, vatPerc: e.target.value }))}
              onFocus={(e) => e.target.select()}
              onKeyDown={(e) => enterTo(e, null)} />
          </div>
          <div style={{ display: "flex", gap: 4 }}>
            <button type="button" onClick={addOrUpdate} style={btn("#2c5aa0", "#fff", { height: 26 })}>{editingLineId ? (bn ? "আপডেট" : "Update") : (bn ? "যোগ" : "Add")}</button>
            {editingLineId && <button type="button" onClick={resetEntry} style={btn("#e7eef9", C.label, { height: 26, padding: "0 8px" })}>✕</button>}
          </div>
        </div>
        {/* Product info strip */}
        <div style={{ display: "flex", gap: 22, marginTop: 6, fontSize: 12.5, fontWeight: 700, minHeight: 18 }}>
          {currentProduct ? (
            <>
              <span>STOCK: <span style={{ color: stockOf != null && stockOf <= 0 ? C.red : C.green }}>{stockOf == null ? "…" : stockOf}</span> {currentProduct.unit || "Pcs"}</span>
              <span>MRP: <span style={{ color: "#1e3a8a" }}>{siFmt2(currentProduct.mrp)}</span></span>
              <span>Lnd. Cost: <span style={{ color: "#1e3a8a" }}>{siFmt2(currentProduct.landingCost)}</span></span>
              <span>Avg. Cost: <span style={{ color: "#1e3a8a" }}>{siFmt2(currentProduct.averageCost || currentProduct.landingCost)}</span></span>
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
      </div>

      {/* Items table */}
      <div style={{ flex: 1, minHeight: 90, overflow: "auto", background: "#fff", borderBottom: `1px solid ${C.border}` }}>
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
              <tr><td colSpan={14} style={{ ...td, textAlign: "center", color: "#64748b", padding: 24 }}>
                {bn ? "এখনো কোনো item নেই — উপরে পণ্য বাছাই করে Add দিন" : "No items yet — pick a product above and press Add"}
              </td></tr>
            )}
            {lineRows.map((it, i) => {
              const item = isDelivery ? { ...it, discountPerc: "0", discountFlat: "", vatPerc: "0" } : it;
              const c = siCalcLine(item, isTax);
              const prod = it.productId ? productById.get(it.productId) : null;
              const selected = it.id === editingLineId;
              return (
                <tr key={it.id} onClick={() => editLine(it)} title={bn ? "এডিট করতে ক্লিক করুন" : "Click to edit"}
                  style={{ cursor: "pointer", background: selected ? C.sel : i % 2 ? C.rowAlt : "#fff" }}>
                  <td style={{ ...td, textAlign: "center" }}>{i + 1}</td>
                  <td style={{ ...td, textAlign: "left", whiteSpace: "normal", fontWeight: 600 }}>{it.name}</td>
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
                    <button type="button" title={bn ? "মুছুন" : "Delete"}
                      onClick={(e) => { e.stopPropagation(); if (selected) resetEntry(); onDelLine(it.id); }}
                      style={{ background: "none", border: "none", color: C.red, fontWeight: 900, cursor: "pointer", fontSize: 14 }}>×</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
          {lineRows.length > 0 && (
            <tfoot>
              <tr style={{ background: "#dbe6f5", fontWeight: 800 }}>
                <td style={{ ...td, textAlign: "left", fontWeight: 900, position: "sticky", bottom: 0, background: "#dbe6f5" }} colSpan={3}>TOTAL ({lineRows.length})</td>
                <td style={{ ...td, fontWeight: 900, position: "sticky", bottom: 0, background: "#dbe6f5" }}>{parseFloat(lineSum.qty.toFixed(3))}</td>
                <td style={{ ...td, position: "sticky", bottom: 0, background: "#dbe6f5" }} colSpan={2} />
                <td style={{ ...td, fontWeight: 900, position: "sticky", bottom: 0, background: "#dbe6f5" }}>{siFmt2(lineSum.gross)}</td>
                <td style={{ ...td, fontWeight: 900, position: "sticky", bottom: 0, background: "#dbe6f5" }}>{siFmt2(lineSum.disc)}</td>
                <td style={{ ...td, fontWeight: 900, position: "sticky", bottom: 0, background: "#dbe6f5" }}>{siFmt2(lineSum.gross - lineSum.disc)}</td>
                <td style={{ ...td, position: "sticky", bottom: 0, background: "#dbe6f5" }} />
                <td style={{ ...td, fontWeight: 900, position: "sticky", bottom: 0, background: "#dbe6f5" }}>{siFmt2(lineSum.vat)}</td>
                <td style={{ ...td, fontWeight: 900, position: "sticky", bottom: 0, background: "#dbe6f5" }}>{siFmt2(lineSum.total)}</td>
                <td style={{ ...td, position: "sticky", bottom: 0, background: "#dbe6f5" }} colSpan={2} />
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {/* Bottom: payment + totals */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 340px", gap: 14, padding: "6px 12px", background: C.panel, flexShrink: 0 }}>
        <div style={{ display: "grid", gap: 6, alignContent: "start" }}>
          {field("Disc %", (
            <input style={inp({ textAlign: "right" })} inputMode="decimal" disabled={isDelivery || !canDiscount} value={isDelivery ? "" : form.billDiscPerc}
              onChange={(e) => { setField("billDiscPerc", e.target.value); if (siN2(e.target.value) > 0) setField("billDiscAmt", ""); }} />
          ))}
          {field("Disc Amount", (
            <input style={inp({ textAlign: "right" })} inputMode="decimal" disabled={isDelivery || !canDiscount}
              value={isDelivery ? "" : (siN2(form.billDiscPerc) > 0 ? siFmt2(totals.billDisc) : form.billDiscAmt)}
              readOnly={siN2(form.billDiscPerc) > 0}
              onChange={(e) => setField("billDiscAmt", e.target.value)} />
          ))}
          {!isQuote && !isDN && field("Pay Mode", (
            <select style={inp()} value={form.paymentMethod} disabled={isDelivery}
              onChange={(e) => { setField("paymentMethod", e.target.value); if (e.target.value === "cash") setField("amountPaid", ""); }}>
              {Object.entries(SI_PAY).map(([k, v]) => <option key={k} value={k}>{v[lang] || v.en}</option>)}
            </select>
          ))}
          {field("Crdt. Period", (
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <input style={inp({ textAlign: "right", width: 80 })} inputMode="numeric" value={form.creditDays || ""}
                onChange={(e) => setField("creditDays", e.target.value.replace(/[^\d]/g, ""))} />
              <span style={{ ...lbl, fontWeight: 600 }}>{bn ? "দিন" : "days"}</span>
            </div>
          ))}
        </div>
        <div style={{ display: "grid", gap: 6, alignContent: "start" }}>
          {isDelivery && !isDN && field(bn ? "ডেলিভারি নোট" : "DN No", <input style={inp()} value={form.deliveryNoteNo} onChange={(e) => setField("deliveryNoteNo", e.target.value)} />)}
          {!isQuote && field(bn ? "গাড়ি নং" : "Vehicle No", <input style={inp()} value={form.vehicleNo || ""} placeholder="ABC-1234" onChange={(e) => setField("vehicleNo", e.target.value)} />)}
          <div>
            <div style={lbl}>Narration</div>
            <textarea style={inp({ height: isDelivery ? 32 : isQuote ? 92 : 62, resize: "none", padding: 6 })} value={form.note} onChange={(e) => setField("note", e.target.value)} />
          </div>
        </div>
        <div style={{ display: "grid", gap: 3, alignContent: "start", background: "#eef3fb", border: `1px solid ${C.border}`, padding: "5px 8px", borderRadius: 3 }}>
          {[
            ["Gross Amount", siFmt2(totals.sub)],
            ["Discount", siFmt2(totals.disc)],
            ...(isTax ? [["VAT", siFmt2(totals.vat)]] : []),
          ].map(([l, v]) => (
            <div key={l} style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, fontWeight: 700 }}><span>{l}</span><span>{v}</span></div>
          ))}
          {field(<span>Adjustments <span style={{ color: "#4b5f86", fontWeight: 600 }}>[Insert]</span></span>, (
            <input ref={adjRef} style={inp({ textAlign: "right", height: 24 })} inputMode="decimal" disabled={isDelivery || !canDiscount} value={isDelivery ? "" : form.adjustment}
              placeholder="+ / -" onChange={(e) => setField("adjustment", e.target.value)} />
          ), 128)}
          {field("Round Off", (
            <div style={{ display: "flex", gap: 4 }}>
              <input style={inp({ textAlign: "right", height: 24 })} inputMode="decimal" disabled={isDelivery} value={isDelivery ? "" : form.roundOff}
                placeholder="+ / -" onChange={(e) => setField("roundOff", e.target.value)} />
              <button type="button" disabled={isDelivery} title={bn ? "নিকটতম পূর্ণ সংখ্যায়" : "Round to nearest whole number"}
                onClick={() => {
                  const before = totals.grand - totals.roundOff;
                  const diff = Math.round(before) - before;
                  setField("roundOff", Math.abs(diff) < 0.005 ? "" : diff.toFixed(2));
                }}
                style={btn("#e7eef9", C.label, { height: 24, padding: "0 6px", fontSize: 11 })}>Auto</button>
            </div>
          ), 128)}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: C.bar, color: "#fff", padding: "3px 8px", borderRadius: 2 }}>
            <span style={{ fontWeight: 800 }}>TOTAL</span>
            <span style={{ fontSize: 18, fontWeight: 900 }}>{cur} {siFmt2(totals.grand)}</span>
          </div>
          {!isDelivery && !isQuote && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, alignItems: "center" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <span style={{ ...lbl, whiteSpace: "nowrap" }}>Received</span>
                {isCash
                  ? <input style={inp({ textAlign: "right", height: 24, fontWeight: 700 })} readOnly value={siFmt2(formPaid)} />
                  : <input style={inp({ textAlign: "right", height: 24, fontWeight: 700 })} inputMode="decimal" value={form.amountPaid}
                      onChange={(e) => setField("amountPaid", e.target.value)} />}
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, fontWeight: 900, color: balance > 0.01 ? C.red : C.green }}>
                <span>Bal.</span><span>{siFmt2(balance)}</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Action bar */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, padding: "8px 12px", background: "#b9cde9", borderTop: `1px solid ${C.border}` }}>
        <div style={{ display: "flex", gap: 6 }}>
          <button type="button" onClick={onNew} disabled={saving} style={btn()}>{bn ? "নতুন" : "New"}</button>
          <button type="button" onClick={() => setShowSearch(true)} style={btn()}>🔍 {bn ? "খুঁজুন" : "Search"}</button>
          <button type="button" disabled={!savedInvoice} onClick={() => savedInvoice && onPrintInvoice(savedInvoice)}
            style={btn("#e7eef9", C.label, { opacity: savedInvoice ? 1 : 0.5 })}>🖨️ {bn ? "প্রিন্ট" : "Print"}</button>
          {onConvertQuote && savedInvoice && (isQuote ? ["draft", "open"] : isDN ? ["confirmed"] : []).includes(savedInvoice.status) && (
            <button type="button" onClick={() => onConvertQuote(savedInvoice)} disabled={saving}
              style={btn("#15803d", "#fff")}>🧾 {bn ? "সেলস ইনভয়েস বানান" : "Convert to Invoice"}</button>
          )}
          {onCancelInvoice && savedInvoice && (isQuote ? ["draft", "open"] : isDN ? ["draft", "confirmed"] : ["draft", "confirmed", "partial", "paid"]).includes(savedInvoice.status) && (
            <button type="button" onClick={() => onCancelInvoice(savedInvoice)} disabled={saving}
              style={btn("#fee2e2", C.red)}>⛔ {bn ? "বিল বাতিল" : "Cancel Bill"}</button>
          )}
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <button type="button" onClick={onClose} disabled={saving} style={btn()}>{bn ? "বাতিল" : "Cancel"}</button>
          <button type="button" onClick={onSaveDraft} disabled={saving} style={btn("#fef3c7", "#92400e")}>{bn ? "ড্রাফট সেভ" : "Save Draft"}</button>
          <button type="button" onClick={onConfirm} disabled={saving} style={btn("#15803d", "#fff", { padding: "0 22px" })}>
            {saving ? "…" : (bn ? "সেভ" : "Save")}
          </button>
          <button type="button" title={bn ? "আগের বিল" : "Previous bill"} disabled={!olderInvoice} onClick={() => olderInvoice && onOpenInvoice(olderInvoice)}
            style={btn("#e7eef9", C.label, { padding: "0 12px", marginLeft: 10, opacity: olderInvoice ? 1 : 0.4 })}>&lt;</button>
          <button type="button" title={bn ? "পরের বিল" : "Next bill"} disabled={!newerInvoice} onClick={() => newerInvoice && onOpenInvoice(newerInvoice)}
            style={btn("#e7eef9", C.label, { padding: "0 12px", opacity: newerInvoice ? 1 : 0.4 })}>&gt;</button>
        </div>
      </div>

      {/* Status line */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "4px 12px", background: "#fff", borderTop: `1px solid ${C.border}`, minHeight: 24 }}>
        <div style={{ flex: 1, textAlign: "center", color: C.red, fontWeight: 800, fontSize: 13, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {currentProduct ? (() => {
            const excl = siN2(current.unitPrice) || siN2(currentProduct.vatExclusive);
            const vatP = siN2(currentProduct.salesVat || current.vatPerc);
            const incl = siN2(currentProduct.vatInclusive) || excl * (1 + vatP / 100);
            return `${codeLine(currentProduct)} (Excl Rate:${siFmt2(excl)} ,Incl Rate:${siFmt2(incl)})`;
          })() : ""}
        </div>
        <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11.5, color: C.label, whiteSpace: "nowrap", cursor: "pointer" }}>
          <input type="checkbox" checked={!!form.hideCodeInPrint} onChange={(e) => setField("hideCodeInPrint", e.target.checked)} />
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

      {productSearchName !== null && (
        <div data-si-modal-open="">
          <style>{PM_CSS}</style>
          <GlobalSearchModal
            products={products}
            initialFields={productSearchName ? { productName: productSearchName } : null}
            rowTitle={bn ? "Double-click বা Enter চাপলে বিলে যোগ হবে" : "Double-click or press Enter to select"}
            onSelect={(p) => pickProduct(p)}
            onClose={() => {
              setProductSearchName(null);
              setTimeout(() => { if (document.activeElement === document.body) nameRef.current?.focus(); }, 120);
            }} />
        </div>
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
            style={{ cursor: onRowDoubleClick ? "pointer" : "default", background: i === 0 ? "#dbe6f5" : "#fff" }}>
            {columns.map((c) => (
              <td key={c.key} style={{ ...td, textAlign: c.align || "left", overflow: "hidden", textOverflow: "ellipsis", borderRight: "1px solid #d3deef", fontWeight: c.bold ? 700 : 400, color: c.color?.(r) || td.color }}>
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
          <input type="checkbox" checked={extended} onChange={(e) => setExtended(e.target.checked)} /> Extended Search
        </label>
        {byProduct && <span style={{ ...lbl, marginLeft: 20 }}>Total: <span style={{ color: C.green }}>{parseFloat(totalQty.toFixed(3))} {totalUnit}</span></span>}
        <span style={{ fontSize: 11.5, color: "#4b5f86", marginLeft: "auto" }}>{bn ? "Invoice খুলতে row-তে double click করুন" : "Double click a row to open the invoice"}</span>
        <button type="button" onClick={printList} disabled={!rows.length} style={btn()}>Print</button>
        <button type="button" onClick={onClose} style={btn()}>CLOSE</button>
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
    <Modal title="Search" onClose={onClose} width={780}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <span style={lbl}><u>F</u>rom</span>
        <input type="date" style={inp({ width: 140 })} value={from} onChange={(e) => setFrom(e.target.value)} />
        <span style={{ ...lbl, marginLeft: 8 }}><u>T</u>o</span>
        <input type="date" style={inp({ width: 140 })} value={to} onChange={(e) => setTo(e.target.value)} />
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <button type="button" onClick={display} style={btn("#e7eef9", C.label, { width: 80 })}>Display</button>
          <button type="button" onClick={onClose} style={btn("#e7eef9", C.label, { width: 80 })}>Close</button>
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
        <input type="checkbox" checked={extended} onChange={(e) => setExtended(e.target.checked)} /> Extended Search
        <span style={{ color: "#8b1a1a", marginLeft: 20, fontWeight: 700 }}>(Will display all details containing the search text in any part of the field)</span>
      </label>
      <label style={{ ...lbl, display: "flex", alignItems: "center", gap: 6, marginTop: 4, marginBottom: 6, cursor: "pointer" }}>
        <input type="checkbox" checked={autoSearch} onChange={(e) => { setAutoSearch(e.target.checked); if (!e.target.checked) display(); }} /> Auto Search while typing in text box
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
