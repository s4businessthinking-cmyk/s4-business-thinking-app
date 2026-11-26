import React, { useMemo, useState } from "react";
import ProductPicker from "../components/ProductPicker.jsx";
import { normalizeManufacturingBom } from "../inventory/manufacturingBom.js";

const n2 = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

export default function ManufacturingBomPanel({
  form,
  upd,
  products = [],
  finishedProductId = "",
  lang = "en",
  disabled = false,
}) {
  const bn = lang === "bn";
  const L = (b, e) => (bn ? b : e);
  const [openPicker, setOpenPicker] = useState(false);
  const lines = useMemo(
    () => normalizeManufacturingBom(form?.manufacturingBom, { productId: finishedProductId }),
    [form?.manufacturingBom, finishedProductId],
  );
  const live = useMemo(() => (products || []).filter((p) => p?.id && !p.isDeleted), [products]);
  const used = useMemo(() => new Set(lines.map((l) => l.productId)), [lines]);

  const setLines = (next) => upd("manufacturingBom", normalizeManufacturingBom(next, { productId: finishedProductId }));

  const addPart = (p) => {
    if (!p?.id || p.id === finishedProductId || used.has(p.id)) return;
    setLines([...lines, { productId: p.id, qtyPer: 1, name: p.name || "", code: p.code || "", unit: p.unit || "Pcs" }]);
    setOpenPicker(false);
  };

  const patchQty = (productId, qtyPer) => {
    setLines(lines.map((l) => (l.productId === productId ? { ...l, qtyPer } : l)));
  };

  const remove = (productId) => setLines(lines.filter((l) => l.productId !== productId));

  return (
    <fieldset className="pm-panel" style={{ marginTop: 8 }}>
      <legend className="pm-panel-legend">{L("ম্যানুফ্যাকচারিং BOM", "Manufacturing BOM")}</legend>
      <div className="si-panel-body">
        <div className="si-hint" style={{ marginLeft: 0, marginBottom: 8 }}>
          {L(
            "শেষ পণ্য তৈরির জন্য প্রতিটি ১ ইউনিটে কতটা কাঁচামাল লাগে। স্টক → Product Bundling খুললে এই লিস্ট অটো লোড হবে; সেভ করলে স্টক মুভ হয়।",
            "Raw materials per 1 finished unit. Stock → Product Bundling loads this list; saving moves stock for real.",
          )}
        </div>
        {lines.length > 0 && (
          <table className="pm-table" style={{ marginBottom: 8 }}>
            <thead>
              <tr>
                <th>{L("কোড", "Code")}</th>
                <th>{L("পণ্য", "Product")}</th>
                <th className="si-num">{L("প্রতি ১টিতে", "Per 1 unit")}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => (
                <tr key={l.productId}>
                  <td>{l.code || live.find((p) => p.id === l.productId)?.code || ""}</td>
                  <td>{l.name || live.find((p) => p.id === l.productId)?.name || l.productId}</td>
                  <td>
                    <input
                      className="pm-input"
                      style={{ width: 88, textAlign: "right" }}
                      inputMode="decimal"
                      disabled={disabled}
                      value={String(l.qtyPer)}
                      onChange={(e) => patchQty(l.productId, n2(e.target.value))}
                    />
                  </td>
                  <td>
                    <button type="button" className="pm-btn-secondary" disabled={disabled} onClick={() => remove(l.productId)}>
                      {L("সরান", "Remove")}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <button type="button" className="pm-btn-secondary" disabled={disabled} onClick={() => setOpenPicker(true)}>
          {L("কাঁচামাল যোগ", "Add part")}
        </button>
        {openPicker && (
          <div style={{ marginTop: 8 }}>
            <ProductPicker
              products={live.filter((p) => p.id !== finishedProductId && !used.has(p.id))}
              onPick={addPart}
              lang={lang}
            />
            <button type="button" className="pm-btn-secondary" style={{ marginTop: 8 }} onClick={() => setOpenPicker(false)}>
              {L("বাতিল", "Cancel")}
            </button>
          </div>
        )}
      </div>
    </fieldset>
  );
}