/** Recalculate sell prices from landing cost (same rules as Product Master pmUpd). */
export function pricingPatchFromLanding(prod, netCost) {
  const lc = parseFloat(netCost);
  if (!(lc > 0)) return {};

  const n = (v) => parseFloat(v) || 0;
  const mp = n(prod.marginPerc);
  let ma = n(prod.marginAmount);
  if (mp > 0) ma = parseFloat((lc * mp / 100).toFixed(4));
  else if (!(ma > 0)) ma = 0;

  const ve = lc > 0
    ? (mp > 0 || ma > 0 ? parseFloat((lc + ma).toFixed(4)) : n(prod.vatExclusive) || lc)
    : n(prod.vatExclusive);

  const sv = n(prod.salesVat);
  const vatPct = Number.isFinite(sv) && sv >= 0 ? sv : 5;
  const vi = ve > 0 ? parseFloat((ve + ve * vatPct / 100).toFixed(4)) : 0;

  const vatOn = prod.vatOnMrp !== false && prod.vatOnMrp !== "false" && prod.vatOnMrp !== 0;
  const mrp = vatOn ? (vi || ve) : ve;

  const out = {};
  if (mp > 0 || ma > 0) {
    if (ma || ma === 0) out.marginAmount = ma ? String(ma) : "";
    if (ve) out.vatExclusive = String(ve);
    if (vi) out.vatInclusive = String(vi);
    if (mrp) out.mrp = String(parseFloat(Number(mrp).toFixed(4)));
  }
  return out;
}
