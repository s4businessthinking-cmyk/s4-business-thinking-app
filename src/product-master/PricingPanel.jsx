import React from "react";

const VAT_OPTIONS = ["0", "5", "15"];

function vatChoices(current) {
  const value = String(current ?? "0");
  return VAT_OPTIONS.includes(value) ? VAT_OPTIONS : [...VAT_OPTIONS, value];
}

export default function PricingPanel({ form, upd }) {
  return (
    <div className="pm-pricing-stack">
      <div className="pm-tax-row">
        <fieldset className="pm-panel pm-tax-panel">
          <legend className="pm-panel-legend">Tax Settings</legend>
          <div className="pm-tax-controls">
            <div className="pm-field">
              <label className="pm-label">Sales VAT %</label>
              <select
                className="pm-input pm-nav-control"
                value={String(form.salesVat ?? "0")}
                onChange={(e) => {
                  const value = e.target.value;
                  upd("salesVat", value);
                  upd("purchaseVat", value);
                }}
              >
                {vatChoices(form.salesVat).map((v) => <option key={v} value={v}>{v}%</option>)}
              </select>
            </div>
            <div className="pm-field">
              <label className="pm-label">Purchase VAT %</label>
              <select className="pm-input pm-nav-control" value={String(form.purchaseVat ?? "0")} onChange={(e) => upd("purchaseVat", e.target.value)}>
                {vatChoices(form.purchaseVat).map((v) => <option key={v} value={v}>{v}%</option>)}
              </select>
            </div>
          </div>
        </fieldset>
        <div className="pm-average-cost">
          <span>Average Cost :</span>
          <strong>{form.averageCost || form.landingCost || ""}</strong>
        </div>
      </div>

      <fieldset className="pm-panel pm-price-panel">
        <div className="pm-panel-body">
          <div className="pm-grid-3">
            <div className="pm-field">
              <label className="pm-label">Landing Cost</label>
              <input className="pm-input pm-nav-control" enterKeyHint="next" inputMode="decimal" value={form.landingCost || ""} onChange={(e) => upd("landingCost", e.target.value)} />
            </div>
            <div className="pm-field">
              <label className="pm-label">Margin %</label>
              <input className="pm-input pm-nav-control" enterKeyHint="next" inputMode="decimal" value={form.marginPerc || ""} onChange={(e) => upd("marginPerc", e.target.value)} />
            </div>
            <div className="pm-field">
              <label className="pm-label">Margin Amount</label>
              <input
                className="pm-input pm-nav-control"
                enterKeyHint="next"
                inputMode="decimal"
                style={{ color: "#15803d", fontWeight: 700 }}
                value={form.marginAmount || ""}
                onChange={(e) => upd("marginAmount", e.target.value)}
              />
            </div>
            <div className="pm-field">
              <label className="pm-label">VAT Exclusive Rate</label>
              <input
                className="pm-input pm-nav-control"
                enterKeyHint="next"
                inputMode="decimal"
                style={{ color: "#15803d", fontWeight: 700 }}
                value={form.vatExclusive || ""}
                onChange={(e) => upd("vatExclusive", e.target.value)}
              />
            </div>
            <div className="pm-field">
              <label className="pm-label">VAT Inclusive Rate</label>
              <input
                className="pm-input pm-nav-control"
                enterKeyHint="next"
                inputMode="decimal"
                style={{ color: "#0369a1", fontWeight: 700 }}
                value={form.vatInclusive || ""}
                onChange={(e) => upd("vatInclusive", e.target.value)}
              />
            </div>
            <div className="pm-field">
              <label className="pm-label">M.R.P</label>
              <div className="pm-mrp-line">
                <input className="pm-input pm-nav-control" enterKeyHint="next" inputMode="decimal" value={form.mrp || ""}
                  onChange={(e) => upd("mrp", e.target.value)} />
                <label className="pm-check">
                  <input type="checkbox" checked={!!form.vatOnMrp} onChange={(e) => upd("vatOnMrp", e.target.checked)} />
                  VAT on MRP
                </label>
              </div>
            </div>
          </div>
        </div>
      </fieldset>
    </div>
  );
}
