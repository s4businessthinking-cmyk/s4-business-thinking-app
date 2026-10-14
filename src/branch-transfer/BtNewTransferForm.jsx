import { bt, fq, BT_ACCENT, f2 } from "./btShared.jsx";
import { useId, useState, useEffect, useMemo } from "react";
import { filterProducts, findExactProductMatch } from "../utils/productSearch.js";
import { unitFactorFor, rescaleForUnit } from "../inventory/unitConversion.js";
import { numberValue, BRANCH_TRANSFER_STATUSES } from "./branchTransferDomain.js";

export const localDay = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export function productUnits(product) {
  const base = product?.unit || "Pcs";
  const extra = (Array.isArray(product?.unitPrices) ? product.unitPrices : [])
    .filter((row) => row?.unit && Number(row.factor) > 0)
    .map((row) => row.unit);
  return [...new Set([base, ...extra])];
}

export function productCost(product) {
  return numberValue(product?.landingCost || product?.vatExclusive || product?.purchasePrice);
}

export function NewTransferForm({ lang, mobile, branches, team, products, vendors, mainStock, busy, dirtyRef, onSave, onBack, toast }) {
  const t = bt(lang);
  const bn = lang === "bn";
  const L = (b, e) => (bn ? b : e);
  const vendorListId = useId().replaceAll(":", "-");
  const [branchId, setBranchId] = useState("");
  const [salesmanKey, setSalesmanKey] = useState("");
  const [vendor, setVendor] = useState({ vendorId: null, vendorName: "", vendorMobile: "", supplierInvoiceNo: "" });
  const [expectedDate, setExpectedDate] = useState("");
  const [note, setNote] = useState("");
  const [prodQ, setProdQ] = useState("");
  const [lines, setLines] = useState([]);

  useEffect(() => {
    dirtyRef.current = lines.length > 0;
  });

  const activeBranches = branches.filter((branch) => branch.active !== false);
  const activeSalesmen = team.filter((member) => member?.role !== "owner" && member?.status !== "disabled" && member?.isDeleted !== true);
  const activeProducts = useMemo(() => products.filter((p) => p && p.isDeleted !== true && p.deleted !== true && p.name), [products]);
  const productById = useMemo(() => new Map(activeProducts.map((p) => [p.id, p])), [activeProducts]);
  const activeVendors = vendors.filter((row) => row?.isDeleted !== true && row?.status !== "disabled");
  const memberKey = (member) => String(member?.uid || member?.firebaseUid || member?.id || member?.localUserId || member?.username || "");

  const selectBranch = (id) => {
    setBranchId(id);
    const branch = activeBranches.find((row) => row.id === id);
    const fallback = branch && activeSalesmen.find((member) => {
      const ids = [member?.uid, member?.firebaseUid, member?.id, member?.localUserId].filter(Boolean).map(String);
      return ids.includes(String(branch.receiverUserId || "")) || ids.includes(String(branch.receiverLocalUserId || ""));
    });
    setSalesmanKey(fallback ? memberKey(fallback) : "");
  };

  const updateVendorName = (value) => {
    const clean = String(value || "");
    const exact = activeVendors.find((row) => String(row.vendorName || "").trim().toLocaleLowerCase() === clean.trim().toLocaleLowerCase());
    setVendor((prev) => ({
      ...prev,
      vendorName: clean,
      vendorId: exact?.id || null,
      vendorMobile: exact?.mobileNumber || exact?.whatsappNumber || exact?.phone || "",
    }));
  };

  const prodMatches = useMemo(() => (prodQ.trim() ? filterProducts(activeProducts, prodQ, { limit: 20 }) : []), [prodQ, activeProducts]);
  const availOf = (id) => (mainStock?.has(id) ? mainStock.get(id) : null);
  const factorOf = (line) => unitFactorFor(productById.get(line.productId), line.unit) || 1;
  const baseQtyOf = (line) => numberValue(line.qty) * factorOf(line);
  const isShort = (line) => {
    const avail = availOf(line.productId);
    return avail != null && baseQtyOf(line) > avail + 1e-9;
  };

  const addProduct = (product) => {
    setProdQ("");
    if (lines.some((line) => line.productId === product.id)) {
      toast(L("এই পণ্য আগেই তালিকায় আছে", "This product is already in the list"), "err");
      return;
    }
    setLines((prev) => [...prev, {
      lineId: `line-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      productId: product.id,
      name: product.name || "",
      code: product.code || product.barcode || product.ean || "",
      brand: product.brand || "",
      baseUnit: product.unit || "Pcs",
      unit: product.unit || "Pcs",
      qty: "1",
      cost: productCost(product) ? String(productCost(product)) : "",
    }]);
  };
  const onProdKey = (event) => {
    if (event.key !== "Enter") return;
      event.preventDefault();
    const exact = findExactProductMatch(activeProducts, { code: prodQ });
    const pick = exact || (prodMatches.length === 1 ? prodMatches[0] : null);
    if (pick) addProduct(pick);
  };
  const updLine = (lineId, patch) => setLines((prev) => prev.map((line) => (line.lineId === lineId ? { ...line, ...patch } : line)));
  const changeUnit = (line, unit) => updLine(line.lineId, {
    unit,
    cost: line.cost === "" ? "" : rescaleForUnit(line.cost, productById.get(line.productId), line.unit, unit),
  });
  const removeLine = (lineId) => setLines((prev) => prev.filter((line) => line.lineId !== lineId));
  const total = lines.reduce((sum, line) => sum + numberValue(line.qty) * numberValue(line.cost), 0);

  const save = (initialStatus) => {
    if (busy) return;
    const branch = activeBranches.find((row) => row.id === branchId);
    if (!branch) return toast(t.branchRequired, "err");
    const salesman = activeSalesmen.find((member) => memberKey(member) === salesmanKey);
    if (!salesman) return toast(t.salesmanRequired, "err");
    if (!lines.length) return toast(t.itemsRequired, "err");
    const badQty = lines.find((line) => numberValue(line.qty) <= 0);
    if (badQty) return toast(L(`❌ "${badQty.name}": সঠিক পরিমাণ দিন`, `❌ "${badQty.name}": enter a valid quantity`), "err");
    const badCost = lines.find((line) => numberValue(line.cost) < 0);
    if (badCost) return toast(L(`❌ "${badCost.name}": দাম মাইনাস হতে পারে না`, `❌ "${badCost.name}": cost can't be negative`), "err");
    const short = lines.filter(isShort);
    if (initialStatus === BRANCH_TRANSFER_STATUSES.DISPATCHED && short.length && !window.confirm(L(
      `মেইন দোকানে স্টক কম: ${short.map((line) => line.name).join(", ")}। তবুও পাঠাবেন?`,
      `Main shop stock is short for: ${short.map((line) => line.name).join(", ")}. Send anyway?`
    ))) return;

    onSave({
      branch,
      receiver: {
      receiverUserId: String(salesman.firebaseUid || salesman.uid || salesman.id || ""),
      receiverFirebaseUid: String(salesman.firebaseUid || salesman.uid || ""),
      receiverMemberId: String(salesman.id || ""),
      receiverLocalUserId: String(salesman.localUserId || ""),
      receiverUsername: String(salesman.username || ""),
      receiverEmail: String(salesman.email || salesman.authEmail || ""),
      receiverName: salesman.personName || salesman.username || "",
      },
      vendor: {
        vendorId: vendor.vendorId || null,
        vendorName: vendor.vendorName.trim(),
        vendorMobile: vendor.vendorMobile || "",
        supplierInvoiceNo: vendor.supplierInvoiceNo.trim(),
      },
      // Transfer lines are kept in the product's base unit.
      items: lines.map((line) => {
        const factor = factorOf(line);
        return {
          lineId: line.lineId,
          productId: line.productId,
          name: line.name,
          code: line.code,
          brand: line.brand,
          unit: line.baseUnit,
          quantity: parseFloat((numberValue(line.qty) * factor).toFixed(4)),
          unitCost: numberValue(line.cost) / factor,
        };
      }),
      purchaseInvoicePaymentMethod: "cash",
      note,
      expectedDeliveryDate: expectedDate,
      initialStatus,
    });
  };

  const field = (label, control) => <div className="si-field"><span className="pm-label">{label}</span>{control}</div>;
  const availText = (id) => (mainStock == null ? "…" : availOf(id) == null ? "—" : fq(availOf(id)));
  const unitSelect = (line) => (
    <select className="pm-input" value={line.unit} onChange={(e) => changeUnit(line, e.target.value)}>
      {productUnits(productById.get(line.productId) || { unit: line.baseUnit }).map((unit) => <option key={unit} value={unit}>{unit}</option>)}
    </select>
  );
  const qtyInput = (line) => <input type="number" min="0" step="any" inputMode="decimal" className="pm-input" value={line.qty} onChange={(e) => updLine(line.lineId, { qty: e.target.value })} style={{ textAlign: "right" }} />;
  const costInput = (line) => <input type="number" min="0" step="any" inputMode="decimal" className="pm-input" value={line.cost} onChange={(e) => updLine(line.lineId, { cost: e.target.value })} style={{ textAlign: "right" }} />;

  return (
    <>
      <div className="si-body">
        <fieldset className="pm-panel" style={{ margin: 0 }}>
          <legend className="pm-panel-legend">{L("কোথায় পাঠাবেন", "Send to")}</legend>
          <div className={mobile ? "si-panel-body" : "si-grid2"} style={mobile ? undefined : { gridTemplateColumns: "repeat(4,minmax(0,1fr))", paddingTop: 3 }}>
            {field(`${t.branch} *`, (
              <select className="pm-input" value={branchId} onChange={(e) => selectBranch(e.target.value)}>
          <option value="">{t.chooseBranch}</option>
                {activeBranches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}{branch.code ? ` · ${branch.code}` : ""}</option>)}
        </select>
            ))}
            {field(`${t.salesman} *`, (
              <select className="pm-input" value={salesmanKey} onChange={(e) => setSalesmanKey(e.target.value)}>
          <option value="">{t.chooseSalesman}</option>
          {activeSalesmen.map((member) => {
                  const key = memberKey(member);
                  return <option key={key} value={key}>{member.personName || member.username || key}{member.position ? ` · ${member.position}` : ""}</option>;
          })}
        </select>
            ))}
            {field(t.expectedDate, <input type="date" className="pm-input" value={expectedDate} min={localDay()} onChange={(e) => setExpectedDate(e.target.value)} />)}
            {field(t.note, <input className="pm-input" value={note} onChange={(e) => setNote(e.target.value)} />)}
      </div>
          {!activeBranches.length && <div className="si-hint" style={{ marginLeft: 0 }}>⚠️ {L("আগে Settings → Branch Transfer থেকে Branch তৈরি করুন", "Create a branch first in Settings → Branch Transfer")}</div>}
        </fieldset>

        <fieldset className="pm-panel" style={{ margin: 0 }}>
          <legend className="pm-panel-legend">{L("ভেন্ডর (ঐচ্ছিক)", "Vendor (optional)")}</legend>
          <div className={mobile ? "si-panel-body" : "si-grid2"} style={mobile ? undefined : { gridTemplateColumns: "minmax(0,2fr) minmax(0,1fr)", paddingTop: 3 }}>
            {field(t.vendorName, (
              <>
                <input list={vendorListId} className="pm-input" value={vendor.vendorName} onChange={(e) => updateVendorName(e.target.value)} />
                <datalist id={vendorListId}>{activeVendors.map((row) => <option key={row.id || row.vendorName} value={row.vendorName || ""} />)}</datalist>
              </>
            ))}
            {field(t.vendorInvoiceNo, <input className="pm-input" value={vendor.supplierInvoiceNo} onChange={(e) => setVendor((prev) => ({ ...prev, supplierInvoiceNo: e.target.value }))} />)}
        </div>
        </fieldset>

        <fieldset className="pm-panel" style={{ margin: 0 }}>
          <legend className="pm-panel-legend">{L("পণ্য যোগ করুন", "Add product")}</legend>
          <div className="si-panel-body">
            <div className="si-search">
              <input className="pm-input" value={prodQ} onChange={(e) => setProdQ(e.target.value)} onKeyDown={onProdKey} autoFocus={!mobile}
                placeholder={L("নাম, কোড বা বারকোড লিখুন / স্ক্যান করুন…", "Type or scan name, code or barcode…")} />
              {prodQ && <button type="button" onClick={() => setProdQ("")}>✕</button>}
        </div>
            {prodMatches.length > 0 && (
              <div className="si-box" style={{ maxHeight: mobile ? 260 : 170 }}>
                {prodMatches.map((p) => (
                  <button key={p.id} type="button" className="si-mrow" style={{ display: "flex", justifyContent: "space-between", gap: 8, width: "100%", padding: mobile ? undefined : "3px 6px", border: 0, borderBottom: "1px solid #e2e8f0", background: "#fff", cursor: "pointer", font: "inherit", textAlign: "left" }} onClick={() => addProduct(p)}>
                    <span><b>{p.name}</b>{p.code ? <span className="si-muted"> · {p.code}</span> : null}{p.brand ? <span className="si-muted"> · {p.brand}</span> : null}</span>
                    <span style={{ color: BT_ACCENT, fontWeight: 700, whiteSpace: "nowrap" }} title={L("মেইন দোকানে আছে", "In main shop")}>{availText(p.id)} {p.unit || ""}</span>
                  </button>
                ))}
        </div>
            )}
            {prodQ.trim() && !prodMatches.length && <div className="si-muted">{L("কোনো পণ্য পাওয়া যায়নি", "No product found")}</div>}
        </div>
        </fieldset>

        <div className="si-box" style={{ flex: mobile ? undefined : 1, minHeight: 120 }}>
          {!lines.length && <div className="si-empty">{L("উপরে পণ্য খুঁজে যোগ করুন", "Search above and add products")}</div>}
          {lines.length > 0 && (mobile ? lines.map((line) => (
            <div key={line.lineId} className="si-mrow" style={{ cursor: "default" }}>
              <div className="si-mrow-top">
                <span>{line.name}</span>
                <button type="button" className="pm-btn-secondary pm-btn--danger" onClick={() => removeLine(line.lineId)}>✕</button>
                </div>
              <div className="si-mrow-sub">
                <span>{line.code || ""}</span>
                <span style={isShort(line) ? { color: "#b91c1c", fontWeight: 700 } : undefined}>{L("মেইনে", "Main")} <b>{availText(line.productId)}</b> {line.baseUnit}</span>
              </div>
              <div className="si-grid2" style={{ marginTop: 4, gridTemplateColumns: "1fr 1fr 1fr", alignItems: "center" }}>
                {qtyInput(line)}
                {unitSelect(line)}
                {costInput(line)}
            </div>
              <div className="si-mrow-sub"><span /><b>{f2(numberValue(line.qty) * numberValue(line.cost))}</b></div>
            </div>
          )) : (
            <table className="pm-table">
              <thead><tr>
                <th style={{ width: 28 }} className="si-center">#</th>
                <th>{L("পণ্য", "Item")}</th>
                <th style={{ width: 120 }}>{L("কোড", "Code")}</th>
                <th style={{ width: 100 }} className="si-num">{L("মেইনে আছে", "Main stock")}</th>
                <th style={{ width: 90 }} className="si-num">{t.quantity}</th>
                <th style={{ width: 90 }}>{t.unit}</th>
                <th style={{ width: 100 }} className="si-num">{t.unitCost}</th>
                <th style={{ width: 100 }} className="si-num">{L("মোট", "Total")}</th>
                <th style={{ width: 30 }} />
              </tr></thead>
              <tbody>
                {lines.map((line, index) => (
                  <tr key={line.lineId} className={isShort(line) ? undefined : "is-editing"} title={isShort(line) ? L("মেইন দোকানে এতো স্টক নেই", "Main shop doesn't have this much") : undefined}>
                    <td className="si-center">{index + 1}</td>
                    <td className="si-strong" title={line.name}>{line.name}{line.brand ? <span className="si-muted"> · {line.brand}</span> : null}</td>
                    <td>{line.code || ""}</td>
                    <td className="si-num" style={isShort(line) ? { color: "#b91c1c", fontWeight: 700 } : undefined}>{availText(line.productId)} {line.baseUnit}</td>
                    <td style={{ padding: "1px 2px" }}>{qtyInput(line)}</td>
                    <td style={{ padding: "1px 2px" }}>{unitSelect(line)}</td>
                    <td style={{ padding: "1px 2px" }}>{costInput(line)}</td>
                    <td className="si-num si-strong">{f2(numberValue(line.qty) * numberValue(line.cost))}</td>
                    <td className="si-center"><button type="button" className="pm-btn-secondary pm-btn--danger" style={{ minHeight: 17, padding: "0 5px" }} onClick={() => removeLine(line.lineId)}>✕</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          ))}
        </div>
      </div>
      <div className={`si-actions${mobile ? " si-sticky-actions" : ""}`}>
        <button type="button" className="pm-btn-secondary" disabled={busy} onClick={onBack}>← {L("তালিকা", "List")}</button>
        {lines.length > 0 && <span className="si-hint">{lines.length} {t.itemsCount} · {t.totalValue}: <b>{f2(total)}</b></span>}
        {mainStock == null && <span className="si-hint">⏳ {L("স্টক লোড হচ্ছে…", "Loading stock…")}</span>}
        <span className="si-toolbar-gap" />
        <button type="button" className="pm-btn-secondary" disabled={busy || !lines.length} onClick={() => save(BRANCH_TRANSFER_STATUSES.DRAFT)}>📝 {t.saveDraft}</button>
        <button type="button" className="pm-btn pm-btn--primary" disabled={busy || !lines.length} onClick={() => save(BRANCH_TRANSFER_STATUSES.DISPATCHED)}>
          {busy ? L("সেভ হচ্ছে…", "Saving…") : `🚚 ${t.dispatchNow}`}
        </button>
      </div>
    </>
  );
}
