// Loyalty points of the customer on a sales bill (read-only): member number, points from the saved bills so far and
// what this bill would earn. null when loyalty is off or the customer is not a member.
import { useEffect, useMemo, useState } from "react";
import { offlineList } from "../offline/offlineRepository";
import { rowsOf } from "../inventory/stockFromInvoices";
import { isMember, loyaltyBalances, normalizeLoyalty, rateOn } from "./loyalty.js";

const localDay = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export function useLoyaltyInfo({ shopId, shop, customer, billNet = 0, billDay = "", excludeId = "", refreshKey = 0 }) {
  const settings = useMemo(() => normalizeLoyalty(shop?.loyaltySettings), [shop?.loyaltySettings]);
  const member = settings.enabled && isMember(customer) ? customer : null;
  const [points, setPoints] = useState(null);
  useEffect(() => {
    if (!member) { setPoints(null); return undefined; }
    let cancelled = false;
    Promise.all([offlineList("salesInvoices"), offlineList("salesReturns").catch(() => [])]).then(([si, sr]) => {
      if (cancelled) return;
      // the bill being edited is left out, so "this bill" is not counted twice
      const bills = rowsOf(si).filter((inv) => inv.id !== excludeId);
      setPoints(loyaltyBalances({ customers: [member], salesInvoices: bills, salesReturns: rowsOf(sr), settings, shopId }).get(member.id)?.points ?? 0);
    }).catch((err) => { console.warn("[S4 Loyalty] points load failed", err); if (!cancelled) setPoints(null); });
    return () => { cancelled = true; };
  }, [member?.id, member?.loyaltySince, settings, shopId, excludeId, refreshKey]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!member) return null;
  const day = billDay || localDay();
  const per = member.loyaltySince && day < String(member.loyaltySince).slice(0, 10) ? 0 : rateOn(settings, day);
  return { no: member.loyaltyNo || "", points, earn: per ? Math.floor((Math.max(0, Number(billNet) || 0) + 1e-9) / per) : 0 };
}
