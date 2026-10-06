import React, { useEffect, useMemo, useRef, useState } from "react";
import { ProductNameLookup, ProductCodeLookup, codeLine } from "../sales-invoice/ProductLookupInputs.jsx";
import { C, inp, lbl, btn, th, td, splitRack, productBarcodeUnit, Modal, GridTable, todayIso, fmtDate, fmtDateLong, textMatch, sameProductLine } from "../sales-invoice/SalesInvoiceDesktopForm.jsx";
import { nsq } from "../utils/productSearch";
import { computeStockMap, loadInvoiceRows } from "../inventory/stockFromInvoices";
import GlobalSearchModal from "../product-master/modals/GlobalSearchModal";
import { PM_CSS } from "../product-master/pmStyles";
import PartyPickerWindow, { VENDOR_PICKER_COLS } from "../components/PartyPickerWindow.jsx";

const ACCENT = "#c2410c";

function vendorHaystack(v) {
  return [v.vendorName, v.vendorCode, v.mobileNumber, v.whatsappNumber, v.city, v.trnNumber].filter(Boolean).join(" ");
}

function VendorPickerWindow({ vendors, onPick, onClose, lang }) {
  return <PartyPickerWindow title="Select Vendor" columns={VENDOR_PICKER_COLS} items={vendors} onPick={onPick} onClose={onClose} lang={lang} partyWord="vendor" modalId="vendor-picker" />;
}

function VendorTypeahead({ vendors, value, onChange, onSelect, placeholder, lang, inputRef, onEnterEmpty }) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const wrapRef = useRef(null);
  const q = String(value || "").trim();

  const matches = useMemo(() => {
    if (!open) return [];
    const key = nsq(q);
    const lower = q.toLowerCase();
    return vendors
      .filter((v) => v && !v.isDeleted && !v.deleted)
      .map((v) => {
        const name = String(v.vendorName || "").toLowerCase();
        const hay = vendorHaystack(v);
        let score = 0;
        if (!q) score = 1;
        else if (name.startsWith(lower)) score = 3;
        else if (name.includes(lower)) score = 2;
        else if (hay.toLowerCase().includes(lower) || (key && nsq(hay).includes(key))) score = 1;
        return { v, score };
      })
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score || String(a.v.vendorName || "").localeCompare(String(b.v.vendorName || "")))
      .slice(0, 50)
      .map((r) => r.v);
  }, [vendors, q, open]);

  useEffect(() => { setActive(0); }, [q]);
  useEffect(() => {
    const onDown = (e) => { if (!wrapRef.current?.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  const pick = (v) => { setOpen(false); onSelect(v); };

  return (
    <div ref={wrapRef} style={{ position: "relative", flex: 1, minWidth: 0 }}>
      <input ref={inputRef} style={inp({ fontWeight: 700 })} value={value} placeholder={placeholder} autoComplete="off"
        onChange={(e) => { onChange(e.target.value); setOpen(true); }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") { e.preventDefault(); if (!open) setOpen(true); else if (matches.length) setActive((i) => (i + 1) % matches.length); }
          else if (e.key === "ArrowUp" && matches.length) { e.preventDefault(); setActive((i) => (i - 1 + matches.length) % matches.length); }
          else if (e.key === "Enter") {
            e.preventDefault();
            if (open && matches.length) pick(matches[active] || matches[0]);
            else { setOpen(false); onEnterEmpty?.(); }
          }
          else if (e.key === "Escape" && open) { e.preventDefault(); e.stopPropagation(); setOpen(false); }
        }} />
      {open && (
        <div style={{ position: "absolute", top: "calc(100% + 2px)", left: 0, right: -30, zIndex: 1300, background: "#fff", border: `1px solid ${C.border}`, borderRadius: 3, boxShadow: "0 10px 24px rgba(0,0,0,0.25)", maxHeight: 260, overflowY: "auto" }}>
          {matches.length === 0 ? (
            <div style={{ padding: "8px 10px", fontSize: 12, color: "#4b5f86" }}>
              {lang === "bn" ? "এই নামে কোনো supplier নেই — নামটাই বিলে থাকবে" : "No matching supplier — the typed name will be used"}
            </div>
          ) : matches.map((v, i) => (
            <div key={v.id} onMouseDown={(e) => { e.preventDefault(); pick(v); }} onMouseEnter={() => setActive(i)}
              style={{ padding: "5px 10px", cursor: "pointer", background: i === active ? "#dbe6f5" : "#fff", borderBottom: "1px solid #eef3fb" }}>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: C.label }}>{v.vendorName}</div>
              <div style={{ fontSize: 11, color: "#4b5f86" }}>{[v.vendorCode && `#${v.vendorCode}`, v.mobileNumber || v.whatsappNumber, v.city].filter(Boolean).join(" · ")}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function PurchaseInvoiceDesktopForm({
  lang = "en", t = {}, shopId, products = [], vendors = [], invoices = [],
  form, setField, lines, setLines, current, setCurrent, totals, paid, balance,
  invoiceNo, editInvoiceId, saving, nameRef, qtyRef,
  helpers,
  onSelectProduct, onChangeCurrentUnit, onAddCurrent, onDelLine, onPickVendor,
  onConfirm, onSaveDraft, onClose, onNew, onOpenInvoice, onOpenProductMaster, onCancelInvoice, onDeleteInvoice, toast,
}) {
  const { piCalcLine, piFmt2, piN2, PI_PAY_METHODS, PI_STATUSES, PI_UNITS } = helpers;
  const bn = lang === "bn";

  const codeRef = useRef(null);
  const vendorRef = useRef(null);
  const supInvRef = useRef(null);
  const unitRef = useRef(null);
  const costRef = useRef(null);
  const discRef = useRef(null);
  const vatRef = useRef(null);
  const saleRef = useRef(null);
  const [editingLineId, setEditingLineId] = useState(null);
  const [vendorPickerOpen, setVendorPickerOpen] = useState(false);
  const [codeChoices, setCodeChoices] = useState(null);
  const [codeOpenSignal, setCodeOpenSignal] = useState(0);
  const [stockMap, setStockMap] = useState(null);
  const [showHistory, setShowHistory] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [productSearchName, setProductSearchName] = useState(null);
  const productById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const currentProduct = current.productId ? productById.get(current.productId) : null;

  useEffect(() => {
    let cancelled = false;
    loadInvoiceRows()
      .then(({ purchaseInvoices, salesInvoices, deliveryNotes, extras }) => {
        if (!cancelled) setStockMap(computeStockMap(products, purchaseInvoices, salesInvoices, shopId, deliveryNotes, extras));
      })
      .catch((err) => console.warn("[S4 PI] stock load failed", err));
    return () => { cancelled = true; };
  }, [products, invoices, shopId]);

  const navIndex = editInvoiceId ? invoices.findIndex((inv) => inv.id === editInvoiceId) : -1;
  const olderInvoice = editInvoiceId ? invoices[navIndex + 1] : invoices[0];
  const newerInvoice = navIndex > 0 ? invoices[navIndex - 1] : null;
  const savedInvoice = editInvoiceId ? invoices.find((inv) => inv.id === editInvoiceId) : null;

  const lastPurchase = useMemo(() => {
    if (!currentProduct) return null;
    let best = null;
    invoices.forEach((inv) => {
      if (inv.status === "cancelled" || inv.id === editInvoiceId) return;
      (inv.items || []).forEach((it) => {
        if (!sameProductLine(it, currentProduct, currentProduct.name)) return;
        if (!best || String(inv.invoiceDate || "") > String(best.inv.invoiceDate || "")) best = { inv, it };
      });
    });
    return best;
  }, [invoices, currentProduct, editInvoiceId]);

  const resetEntry = () => {
    setEditingLineId(null);
    setCodeChoices(null);
    setCurrent(helpers.emptyCurrent());
    setTimeout(() => nameRef.current?.focus(), 60);
  };

  const addOrUpdate = () => {
    if (!editingLineId) { onAddCurrent(); setCodeChoices(null); return; }
    if (!String(current.name || "").trim()) { toast(bn ? "আইটেমের নাম লিখুন!" : "Enter item name!", "err"); return; }
    if (piN2(current.qty) <= 0) { toast(bn ? "সঠিক পরিমাণ লিখুন!" : "Enter valid quantity!", "err"); return; }
    setLines((prev) => prev.map((it) => (it.id === editingLineId ? { ...current, id: editingLineId } : it)));
    resetEntry();
  };

  // Enter walks Qty → Unit → Cost → Dis% → VAT% → Sale Price; on the last box it adds the line.
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
    if (hit.unit) setTimeout(() => onChangeCurrentUnit(hit.unit), 0);
    return true;
  };

  const pickName = (name, items) => {
    if (items.length === 1) { pickProduct(items[0]); return; }
    setCurrent((p) => ({ ...p, name, productId: null, code: "" }));
    setCodeChoices(items);
    setCodeOpenSignal((n) => n + 1);
    setTimeout(() => codeRef.current?.focus(), 30);
  };

  const focusMissingHeader = () => {
    if (!String(form.vendorName || "").trim()) setTimeout(() => vendorRef.current?.focus(), 30);
    else if (!String(form.supplierInvoiceNo || "").trim()) setTimeout(() => supInvRef.current?.focus(), 30);
  };

  const handlersRef = useRef({});
  handlersRef.current = {
    history: () => {
      if (!currentProduct && !String(current.name || "").trim()) { toast(bn ? "আগে Product বাছাই করুন, তারপর F8 চাপুন" : "Select a product first, then press F8", "err"); return; }
      setShowHistory(true);
    },
    newProduct: () => {
      if (!onOpenProductMaster) { toast(bn ? "Product Master খোলার permission নেই" : "No permission to open Product Master", "err"); return; }
      onOpenProductMaster(current.productId ? "" : String(current.name || "").trim());
    },
    productSearch: () => setProductSearchName(current.productId ? "" : String(current.name || "").trim()),
  };

  useEffect(() => {
    const onKey = (e) => {
      if (document.querySelector("[data-si-modal-open]")) return;
      const h = handlersRef.current;
      const tag = String(e.target?.tagName || "").toLowerCase();
      const typing = tag === "select" || ((tag === "input" || tag === "textarea") && String(e.target.value || "").length > 0);
      if (e.key === "F8") { e.preventDefault(); h.history(); }
      else if (e.key === "F9") { e.preventDefault(); h.newProduct(); }
      else if (e.key === "F10") { e.preventDefault(); h.productSearch(); }
      else if (e.key === "Home" && !typing && !e.ctrlKey) { e.preventDefault(); setVendorPickerOpen(true); }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);

  const lineRows = lines.filter((it) => String(it.name || "").trim());
  const lineSum = lineRows.reduce((a, it) => {
    const c = piCalcLine(it);
    a.qty += piN2(it.qty); a.gross += c.gross; a.disc += c.disc; a.tax += c.tax; a.total += c.total;
    return a;
  }, { qty: 0, gross: 0, disc: 0, tax: 0, total: 0 });

  const stockOf = currentProduct && stockMap ? stockMap.get(currentProduct.id) : null;
  const rack = splitRack(currentProduct?.rackLocation);
  const unitOptions = currentProduct
    ? [...new Set([
      currentProduct.unit || "Pcs",
      ...(Array.isArray(currentProduct.unitPrices) ? currentProduct.unitPrices.filter((r) => r?.unit && Number(r.factor) > 0).map((r) => r.unit) : []),
      current.unit,
    ].filter(Boolean))]
    : [...new Set([current.unit, ...PI_UNITS].filter(Boolean))];
  const status = savedInvoice ? PI_STATUSES[savedInvoice.status] : null;
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
          <div style={{ background: C.head, color: "#fff", textAlign: "center", fontSize: 12.5, fontWeight: 800, textDecoration: "underline", padding: "2px 0" }}>PI No</div>
          <div style={{ textAlign: "center", fontSize: 16, fontWeight: 900, color: "#111", padding: "4px 0" }}>{invoiceNo || "—"}</div>
        </div>
        <div style={{ position: "relative", border: `1px solid ${C.bar}`, borderRadius: 4, background: "#dfe8f6", display: "flex", alignItems: "center", justifyContent: "center", minHeight: 50 }}>
          {status && (
            <span style={{ position: "absolute", left: 10, fontSize: 11, fontWeight: 800, padding: "1px 8px", borderRadius: 10, background: status.color, color: "#fff" }}>
              {status[lang] || savedInvoice.status}
            </span>
          )}
          <span style={{ fontSize: 24, fontWeight: 900, color: ACCENT, letterSpacing: 0.5 }}>PURCHASE INVOICE</span>
        </div>
        <div style={{ border: `1px solid ${C.bar}`, borderRadius: 4, overflow: "hidden", background: "#fff" }}>
          <div style={{ background: C.head, color: "#fff", textAlign: "center", fontSize: 12.5, fontWeight: 800, padding: "2px 0" }}>Bill Date</div>
          <input type="date" style={inp({ border: "none", height: 30, fontWeight: 700 })} value={form.invoiceDate} onChange={(e) => setField("invoiceDate", e.target.value)} />
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "170px minmax(300px,420px) 180px 1fr", gap: 10, padding: "2px 10px 8px", background: C.panel, borderBottom: `1px solid ${C.border}` }}>
        <div>
          <div style={lbl}>Supplier Inv. No <span style={{ color: C.red }}>*</span></div>
          <input ref={supInvRef} style={inp(form.supplierInvoiceNo.trim() ? {} : { borderColor: C.red })} value={form.supplierInvoiceNo} placeholder={bn ? "সাপ্লায়ারের বিল নং" : "Supplier's bill no"}
            onChange={(e) => setField("supplierInvoiceNo", e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); vendorRef.current?.focus(); } }} />
        </div>
        <div>
          <div style={{ ...lbl, display: "flex", justifyContent: "space-between" }}>
            <span><u>S</u>upplier (Home Key) <span style={{ color: C.red }}>*</span></span>
            <button type="button" onClick={() => handlersRef.current.history()}
              style={{ background: "none", border: "none", padding: 0, color: C.label, fontWeight: 800, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>
              F8 - Purchase History
            </button>
          </div>
          <div style={{ display: "flex", gap: 4 }}>
            <VendorTypeahead vendors={vendors} value={form.vendorName} lang={lang} inputRef={vendorRef}
              placeholder={bn ? "সাপ্লায়ারের নাম লিখুন" : "Type supplier name"}
              onEnterEmpty={() => nameRef.current?.focus()}
              onChange={(v) => { setField("vendorName", v); if (form.vendorId) setField("vendorId", ""); }}
              onSelect={(v) => { onPickVendor(v); setTimeout(() => nameRef.current?.focus(), 60); }} />
            <button type="button" onClick={() => setVendorPickerOpen(true)} title="Home" style={btn("#e7eef9", C.label, { height: 26, padding: "0 6px", fontSize: 11, whiteSpace: "nowrap" })}>▼ Home</button>
          </div>
          {vendorPickerOpen && (
            <VendorPickerWindow vendors={vendors} lang={lang}
              onClose={() => { setVendorPickerOpen(false); setTimeout(() => vendorRef.current?.focus(), 30); }}
              onPick={(v) => { setVendorPickerOpen(false); onPickVendor(v); setTimeout(() => nameRef.current?.focus(), 60); }} />
          )}
        </div>
        <div>
          <div style={lbl}>Mobile</div>
          <input style={inp()} inputMode="tel" value={form.vendorMobile} onChange={(e) => setField("vendorMobile", e.target.value)} />
        </div>
        <div />
      </div>

      {/* Entry row */}
      <div style={{ padding: "8px 12px", background: "#e9f0fa", borderBottom: `1px solid ${C.border}` }}>
        <div style={{ display: "grid", gridTemplateColumns: "minmax(220px,2fr) minmax(200px,2fr) 70px 92px 100px 64px 64px 100px auto", gap: 6, alignItems: "end" }}>
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
            <ProductNameLookup products={products} value={current.name} inputRef={nameRef}
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
            <input ref={qtyRef} style={inp({ textAlign: "right" })} inputMode="decimal" value={current.qty}
              onChange={(e) => setCurrent((p) => ({ ...p, qty: e.target.value }))}
              onFocus={(e) => e.target.select()}
              onKeyDown={(e) => enterTo(e, unitRef)} />
          </div>
          <div>
            <div style={lbl}>Unit</div>
            <select ref={unitRef} style={inp()} value={current.unit} onChange={(e) => onChangeCurrentUnit(e.target.value)}
              onKeyDown={(e) => enterTo(e, costRef)}>
              {unitOptions.map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>
          <div>
            <div style={lbl}>Unit Cost</div>
            <input ref={costRef} style={inp({ textAlign: "right" })} inputMode="decimal" value={current.unitCost}
              onChange={(e) => setCurrent((p) => ({ ...p, unitCost: e.target.value }))}
              onFocus={(e) => e.target.select()}
              onKeyDown={(e) => enterTo(e, discRef)} />
          </div>
          <div>
            <div style={lbl}>Dis %</div>
            <input ref={discRef} style={inp({ textAlign: "right" })} inputMode="decimal" value={current.discountPerc}
              onChange={(e) => setCurrent((p) => ({ ...p, discountPerc: e.target.value }))}
              onFocus={(e) => e.target.select()}
              onKeyDown={(e) => enterTo(e, vatRef)} />
          </div>
          <div>
            <div style={lbl}>VAT %</div>
            <input ref={vatRef} style={inp({ textAlign: "right" })} inputMode="decimal" value={current.taxPerc}
              onChange={(e) => setCurrent((p) => ({ ...p, taxPerc: e.target.value }))}
              onFocus={(e) => e.target.select()}
              onKeyDown={(e) => enterTo(e, saleRef)} />
          </div>
          <div>
            <div style={lbl}>Sale Price</div>
            <input ref={saleRef} style={inp({ textAlign: "right", color: C.green, fontWeight: 700 })} inputMode="decimal" value={current.salePrice}
              onChange={(e) => setCurrent((p) => ({ ...p, salePrice: e.target.value }))}
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
              <span>Lnd. Cost: <span style={{ color: "#1e3a8a" }}>{piFmt2(currentProduct.landingCost)}</span></span>
              <span>Avg. Cost: <span style={{ color: "#1e3a8a" }}>{piFmt2(currentProduct.averageCost || currentProduct.landingCost)}</span></span>
              <span>Last Cost: <span style={{ color: ACCENT }}>{lastPurchase ? `${piFmt2(lastPurchase.it.unitCost)} (${fmtDate(lastPurchase.inv.invoiceDate)})` : "—"}</span></span>
              <span>MRP: <span style={{ color: "#1e3a8a" }}>{piFmt2(currentProduct.mrp)}</span></span>
              <span>Rack: {rack.rack || "—"}</span>
              {currentProduct.brand && <span>Brand: {currentProduct.brand}</span>}
            </>
          ) : (
            <span style={{ color: "#4b5f86", fontWeight: 600 }}>
              {bn ? "পণ্য বাছাই করলে Stock, Cost আর শেষ কেনা দাম এখানে দেখাবে" : "Select a product to see Stock, Cost and the last purchase cost"}
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
              <th style={{ ...th, textAlign: "left" }}>Brand</th>
              <th style={th}>Qty</th>
              <th style={{ ...th, textAlign: "left" }}>Unit</th>
              <th style={th}>Cost</th>
              <th style={th}>Amount</th>
              <th style={th}>Dis Amt</th>
              <th style={th}>VAT%</th>
              <th style={th}>VAT AMT</th>
              <th style={th}>Net Amount</th>
              <th style={th}>Sale Price</th>
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
              const c = piCalcLine(it);
              const selected = it.id === editingLineId;
              return (
                <tr key={it.id} onClick={() => editLine(it)} title={bn ? "এডিট করতে ক্লিক করুন" : "Click to edit"}
                  style={{ cursor: "pointer", background: selected ? C.sel : i % 2 ? C.rowAlt : "#fff" }}>
                  <td style={{ ...td, textAlign: "center" }}>{i + 1}</td>
                  <td style={{ ...td, textAlign: "left", whiteSpace: "normal", fontWeight: 600 }}>{it.name}</td>
                  <td style={{ ...td, textAlign: "left" }}>{it.code}</td>
                  <td style={{ ...td, textAlign: "left" }}>{it.brand}</td>
                  <td style={td}>{it.qty}</td>
                  <td style={{ ...td, textAlign: "left" }}>{it.unit}</td>
                  <td style={td}>{piFmt2(it.unitCost)}</td>
                  <td style={td}>{piFmt2(c.gross)}</td>
                  <td style={{ ...td, color: c.disc > 0 ? C.red : td.color }}>{piFmt2(c.disc)}</td>
                  <td style={td}>{piN2(it.taxPerc)}</td>
                  <td style={td}>{piFmt2(c.tax)}</td>
                  <td style={{ ...td, fontWeight: 800 }}>{piFmt2(c.total)}</td>
                  <td style={{ ...td, color: C.green }}>{piN2(it.salePrice) > 0 ? piFmt2(it.salePrice) : ""}</td>
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
                <td style={{ ...td, textAlign: "left", fontWeight: 900, position: "sticky", bottom: 0, background: "#dbe6f5" }} colSpan={4}>TOTAL ({lineRows.length})</td>
                <td style={{ ...td, fontWeight: 900, position: "sticky", bottom: 0, background: "#dbe6f5" }}>{parseFloat(lineSum.qty.toFixed(3))}</td>
                <td style={{ ...td, position: "sticky", bottom: 0, background: "#dbe6f5" }} colSpan={2} />
                <td style={{ ...td, fontWeight: 900, position: "sticky", bottom: 0, background: "#dbe6f5" }}>{piFmt2(lineSum.gross)}</td>
                <td style={{ ...td, fontWeight: 900, position: "sticky", bottom: 0, background: "#dbe6f5" }}>{piFmt2(lineSum.disc)}</td>
                <td style={{ ...td, position: "sticky", bottom: 0, background: "#dbe6f5" }} />
                <td style={{ ...td, fontWeight: 900, position: "sticky", bottom: 0, background: "#dbe6f5" }}>{piFmt2(lineSum.tax)}</td>
                <td style={{ ...td, fontWeight: 900, position: "sticky", bottom: 0, background: "#dbe6f5" }}>{piFmt2(lineSum.total)}</td>
                <td style={{ ...td, position: "sticky", bottom: 0, background: "#dbe6f5" }} colSpan={2} />
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {/* Bottom: payment + totals */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 340px", gap: 14, padding: "6px 12px", background: C.panel, flexShrink: 0 }}>
        <div style={{ display: "grid", gap: 6, alignContent: "start" }}>
          {field("Pay Mode", (
            <select style={inp()} value={form.paymentMethod} onChange={(e) => { setField("paymentMethod", e.target.value); setField("amountPaid", ""); }}>
              {Object.entries(PI_PAY_METHODS).map(([k, v]) => <option key={k} value={k}>{v[lang] || v.en}</option>)}
            </select>
          ))}
          {field("Amount Paid", (
            form.paymentMethod === "cash" ? (
              <input style={inp({ textAlign: "right", fontWeight: 700, background: "#eef3fb" })} readOnly value={piFmt2(paid)}
                title={bn ? "ক্যাশে পুরো টাকা পরিশোধ ধরা হয়" : "Cash bills are fully paid"} />
            ) : (
              <div style={{ display: "flex", gap: 4 }}>
                <input style={inp({ textAlign: "right", fontWeight: 700 })} inputMode="decimal" placeholder="0.00" value={form.amountPaid}
                  onChange={(e) => setField("amountPaid", e.target.value)} />
                <button type="button" disabled={totals.grand <= 0} onClick={() => setField("amountPaid", piFmt2(totals.grand))}
                  title={bn ? "পুরো টাকা পরিশোধ" : "Pay full amount"}
                  style={btn("#e7eef9", C.green, { height: 26, padding: "0 8px", fontSize: 11 })}>{bn ? "পুরো" : "Full"}</button>
              </div>
            )
          ))}
        </div>
        <div>
          <div style={lbl}>Narration</div>
          <textarea style={inp({ height: 62, resize: "none", padding: 6 })} value={form.note} onChange={(e) => setField("note", e.target.value)} />
        </div>
        <div style={{ display: "grid", gap: 3, alignContent: "start", background: "#eef3fb", border: `1px solid ${C.border}`, padding: "5px 8px", borderRadius: 3 }}>
          {[
            ["Gross Amount", piFmt2(totals.sub)],
            ["Discount", piFmt2(totals.disc)],
            ["VAT", piFmt2(totals.tax)],
          ].map(([l, v]) => (
            <div key={l} style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, fontWeight: 700 }}><span>{l}</span><span>{v}</span></div>
          ))}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: C.bar, color: "#fff", padding: "3px 8px", borderRadius: 2 }}>
            <span style={{ fontWeight: 800 }}>TOTAL</span>
            <span style={{ fontSize: 18, fontWeight: 900 }}>{t.cur || "AED"} {piFmt2(totals.grand)}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, fontWeight: 900 }}>
            <span style={{ color: C.green }}>Paid {piFmt2(paid)}</span>
            <span style={{ color: balance > 0.01 ? C.red : C.green }}>Bal. {piFmt2(balance)}</span>
          </div>
        </div>
      </div>

      {/* Action bar */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, padding: "8px 12px", background: "#b9cde9", borderTop: `1px solid ${C.border}` }}>
        <div style={{ display: "flex", gap: 6 }}>
          <button type="button" onClick={onNew} disabled={saving} style={btn()}>{bn ? "নতুন" : "New"}</button>
          <button type="button" onClick={() => setShowSearch(true)} style={btn()}>🔍 {bn ? "খুঁজুন" : "Search"}</button>
          {onCancelInvoice && savedInvoice && ["draft", "confirmed", "partial", "paid"].includes(savedInvoice.status) && (
            <button type="button" onClick={() => onCancelInvoice(savedInvoice)} disabled={saving}
              style={btn("#fee2e2", C.red)}>⛔ {bn ? "বিল বাতিল" : "Cancel Bill"}</button>
          )}
          {onDeleteInvoice && savedInvoice && ["draft", "cancelled"].includes(savedInvoice.status) && (
            <button type="button" onClick={() => onDeleteInvoice(savedInvoice)} disabled={saving}
              style={btn("#7f1d1d", "#fff")}>🗑️ {bn ? "মুছুন" : "Delete"}</button>
          )}
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <button type="button" onClick={onClose} disabled={saving} style={btn()}>{bn ? "বাতিল" : "Cancel"}</button>
          {(!savedInvoice || savedInvoice.status === "draft") && (
            <button type="button" onClick={() => { focusMissingHeader(); onSaveDraft(); }} disabled={saving} style={btn("#fef3c7", "#92400e")}>{bn ? "ড্রাফট সেভ" : "Save Draft"}</button>
          )}
          <button type="button" onClick={() => { focusMissingHeader(); onConfirm(); }} disabled={saving} style={btn("#15803d", "#fff", { padding: "0 22px" })}>
            {saving ? "…" : (bn ? "সেভ" : "Save")}
          </button>
          <button type="button" title={bn ? "আগের বিল" : "Previous bill"} disabled={!olderInvoice} onClick={() => olderInvoice && onOpenInvoice(olderInvoice)}
            style={btn("#e7eef9", C.label, { padding: "0 12px", marginLeft: 10, opacity: olderInvoice ? 1 : 0.4 })}>&lt;</button>
          <button type="button" title={bn ? "পরের বিল" : "Next bill"} disabled={!newerInvoice} onClick={() => newerInvoice && onOpenInvoice(newerInvoice)}
            style={btn("#e7eef9", C.label, { padding: "0 12px", opacity: newerInvoice ? 1 : 0.4 })}>&gt;</button>
        </div>
      </div>

      {/* Status line */}
      <div style={{ padding: "4px 12px", background: "#fff", borderTop: `1px solid ${C.border}`, minHeight: 24, textAlign: "center", color: C.red, fontWeight: 800, fontSize: 13, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
        {currentProduct ? `${codeLine(currentProduct)} (Cost:${piFmt2(current.unitCost)} ,Sale:${piFmt2(current.salePrice)})` : ""}
      </div>

      {showHistory && (
        <div data-si-modal-open="">
          <PurchaseHistoryModal lang={lang} invoices={invoices} excludeId={editInvoiceId} product={currentProduct} productName={current.name}
            vendorId={form.vendorId} vendorName={form.vendorName} piCalcLine={piCalcLine} piFmt2={piFmt2} piN2={piN2}
            onClose={() => setShowHistory(false)}
            onOpen={(inv) => { setShowHistory(false); onOpenInvoice(inv); }} />
        </div>
      )}

      {productSearchName !== null && (
        <div data-si-modal-open="">
          <style>{PM_CSS}</style>
          <GlobalSearchModal
            products={products}
            showCost
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
          <PurchaseSearchModal invoices={invoices} piFmt2={piFmt2} PI_PAY_METHODS={PI_PAY_METHODS} lang={lang}
            onClose={() => setShowSearch(false)}
            onPick={(inv) => { setShowSearch(false); onOpenInvoice(inv); }} />
        </div>
      )}
    </div>
  );
}

function PurchaseHistoryModal({ lang, invoices, excludeId, product, productName, vendorId, vendorName, piCalcLine, piFmt2, piN2, onClose, onOpen }) {
  const bn = lang === "bn";
  const wantName = String(product?.name || productName || "").trim().toLowerCase();
  const byProduct = !!(product || wantName);
  const wantVendor = String(vendorName || "").trim().toLowerCase();
  const noVendor = !vendorId && !wantVendor;
  const [allSuppliersTick, setAllSuppliers] = useState(false);
  const allSuppliers = noVendor || allSuppliersTick;

  const rows = useMemo(() => {
    const out = [];
    const fromVendor = (inv) => (vendorId && inv.vendorId === vendorId) || (!!wantVendor && String(inv.vendorName || "").trim().toLowerCase() === wantVendor);
    invoices.forEach((inv) => {
      if (inv.status === "cancelled" || inv.id === excludeId) return;
      if (byProduct) {
        if (!allSuppliers && !fromVendor(inv)) return;
        (inv.items || []).forEach((it, idx) => {
          if (!sameProductLine(it, product, wantName)) return;
          const c = piCalcLine(it);
          out.push({ key: `${inv.id}-${idx}`, inv, qty: piN2(it.qty), unit: it.unit || "", cost: piN2(it.unitCost), disc: c.disc, total: c.total });
        });
      } else {
        if (fromVendor(inv)) out.push({ key: inv.id, inv, qty: (inv.items || []).length, unit: "", cost: 0, disc: piN2(inv.totalDiscount), total: piN2(inv.grandTotal) });
      }
    });
    return out.sort((a, b) => String(b.inv.invoiceDate || "").localeCompare(String(a.inv.invoiceDate || "")) || String(b.inv.invoiceNo).localeCompare(String(a.inv.invoiceNo)));
  }, [invoices, excludeId, byProduct, allSuppliers, product, wantName, vendorId, wantVendor, piCalcLine, piN2]);

  const title = byProduct
    ? `PURCHASE HISTORY OF ${(product?.name || productName || "").toUpperCase()}${allSuppliers ? " (ALL SUPPLIERS)" : ` FROM ${String(vendorName || "").toUpperCase()}`}`
    : `PURCHASES FROM ${String(vendorName || "").toUpperCase()}`;

  const columns = byProduct ? [
    { key: "no", label: "PI No", width: 80, bold: true, render: (r) => r.inv.invoiceNo },
    { key: "date", label: "Date", width: 90, render: (r) => fmtDate(r.inv.invoiceDate) },
    { key: "sup", label: "Supplier", width: 200, render: (r) => r.inv.vendorName || "—" },
    { key: "sinv", label: "Sup. Inv No", width: 100, render: (r) => r.inv.supplierInvoiceNo || "" },
    { key: "qty", label: "Qty", width: 80, align: "right", render: (r) => `${r.qty} ${r.unit}` },
    { key: "cost", label: "Cost", width: 80, align: "right", bold: true, render: (r) => piFmt2(r.cost) },
    { key: "disc", label: "Discount", width: 75, align: "right", render: (r) => piFmt2(r.disc) },
    { key: "net", label: "Net Amt", width: 90, align: "right", render: (r) => piFmt2(r.total) },
  ] : [
    { key: "no", label: "PI No", width: 80, bold: true, render: (r) => r.inv.invoiceNo },
    { key: "date", label: "Date", width: 90, render: (r) => fmtDate(r.inv.invoiceDate) },
    { key: "sinv", label: "Sup. Inv No", width: 110, render: (r) => r.inv.supplierInvoiceNo || "" },
    { key: "items", label: "Items", width: 60, align: "right", render: (r) => r.qty },
    { key: "net", label: "Net Amount", width: 100, align: "right", bold: true, render: (r) => piFmt2(r.total) },
    { key: "paid", label: "Paid", width: 90, align: "right", render: (r) => piFmt2(r.inv.amountPaid) },
    { key: "bal", label: "Balance", width: 90, align: "right", render: (r) => piFmt2(r.inv.balanceDue), color: (r) => (piN2(r.inv.balanceDue) > 0.01 ? C.red : undefined) },
  ];

  return (
    <Modal title={title} onClose={onClose} width={900}>
      <div style={{ border: `1px solid ${C.border}`, maxHeight: "50vh", overflow: "auto" }}>
        <GridTable columns={columns} rows={rows} rowKey={(r) => r.key} onRowDoubleClick={(r) => onOpen(r.inv)}
          emptyText={byProduct
            ? (allSuppliers ? (bn ? "এই পণ্য আগে কেনা হয়নি" : "This product was never purchased") : (bn ? "এই সাপ্লায়ারের থেকে এই পণ্য আগে কেনা হয়নি" : "This product was never bought from this supplier"))
            : (bn ? "এই সাপ্লায়ারের আগের কোনো বিল নেই" : "No previous bills from this supplier")} />
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 8 }}>
        {byProduct && !noVendor && (
          <label style={{ ...lbl, fontWeight: 600, display: "flex", alignItems: "center", gap: 4, cursor: "pointer" }}>
            <input type="checkbox" checked={allSuppliersTick} onChange={(e) => setAllSuppliers(e.target.checked)} /> All Suppliers
          </label>
        )}
        <span style={{ fontSize: 11.5, color: "#4b5f86" }}>{bn ? "বিল খুলতে row-তে double click করুন" : "Double click a row to open the bill"}</span>
        <button type="button" onClick={onClose} style={btn("#e7eef9", C.label, { marginLeft: "auto" })}>CLOSE</button>
      </div>
    </Modal>
  );
}

function PurchaseSearchModal({ invoices, piFmt2, PI_PAY_METHODS, lang, onClose, onPick }) {
  const bn = lang === "bn";
  const [from, setFrom] = useState(todayIso);
  const [to, setTo] = useState(todayIso);
  const [crit, setCrit] = useState({ billNo: "", supplier: "", supInv: "", net: "" });
  const [extended, setExtended] = useState(false);
  const setC = (k, v) => setCrit((p) => ({ ...p, [k]: v }));
  const payLabel = (inv) => PI_PAY_METHODS[inv.paymentMethod]?.en || inv.paymentMethod || "";

  const rows = useMemo(() => invoices.filter((inv) => {
    const d = String(inv.invoiceDate || "").slice(0, 10);
    if (from && d < from) return false;
    if (to && d > to) return false;
    return textMatch(inv.invoiceNo, crit.billNo, extended)
      && textMatch(inv.vendorName, crit.supplier, extended)
      && textMatch(inv.supplierInvoiceNo, crit.supInv, extended)
      && textMatch(piFmt2(inv.grandTotal), crit.net, extended);
  }).slice(0, 500), [invoices, from, to, crit, extended, piFmt2]);

  const box = (label, key) => (
    <label style={{ display: "grid", gap: 2 }}>
      <span style={lbl}>{label}</span>
      <input style={inp({ height: 26 })} value={crit[key]} onChange={(e) => setC(key, e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter" && rows[0]) { e.preventDefault(); onPick(rows[0]); } }} />
    </label>
  );

  const columns = [
    { key: "no", label: "PI No", width: 80, render: (r) => r.invoiceNo },
    { key: "date", label: "Date", width: 100, render: (r) => fmtDateLong(r.invoiceDate) },
    { key: "sup", label: "Supplier", width: 260, render: (r) => r.vendorName || "—" },
    { key: "sinv", label: "Sup. Inv No", width: 100, render: (r) => r.supplierInvoiceNo || "" },
    { key: "pay", label: "Paymode", width: 90, render: payLabel },
    { key: "net", label: "Net Amount", width: 110, align: "right", render: (r) => piFmt2(r.grandTotal),
      color: (r) => (r.status === "cancelled" ? "#9ca3af" : undefined) },
  ];

  return (
    <Modal title="Search" onClose={onClose} width={800}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <span style={lbl}><u>F</u>rom</span>
        <input type="date" style={inp({ width: 140 })} value={from} onChange={(e) => setFrom(e.target.value)} />
        <span style={{ ...lbl, marginLeft: 8 }}><u>T</u>o</span>
        <input type="date" style={inp({ width: 140 })} value={to} onChange={(e) => setTo(e.target.value)} />
        <button type="button" onClick={onClose} style={btn("#e7eef9", C.label, { width: 80, marginLeft: "auto" })}>Close</button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "6px 4px" }}>
        {box("PI No", "billNo")}
        {box("Supplier", "supplier")}
        {box("Supplier Inv No", "supInv")}
        {box("Net Amount", "net")}
      </div>
      <label style={{ ...lbl, display: "flex", alignItems: "center", gap: 6, marginTop: 8, marginBottom: 6, cursor: "pointer" }}>
        <input type="checkbox" checked={extended} onChange={(e) => setExtended(e.target.checked)} /> Extended Search
        <span style={{ color: "#8b1a1a", marginLeft: 20, fontWeight: 700 }}>(Will display all details containing the search text in any part of the field)</span>
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
