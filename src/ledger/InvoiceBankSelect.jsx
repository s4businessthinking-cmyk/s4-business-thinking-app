import React, { useMemo } from "react";
import { UAE_BANKS } from "../cheque/chequeConfig.js";
import { bankChoicesForShop, shopBankAccountName } from "./ledgerShopOpts.js";
import { isInvoiceBankPayMethod } from "./invoiceBankPay.js";

/** Bank account picker when SI/PI pay mode is bank, card, cheque, or transfer. */
export default function InvoiceBankSelect({
  lang = "en",
  method,
  value = "",
  onChange,
  shop = null,
  disabled = false,
  inpStyle = {},
  lblStyle = {},
  showLabel = true,
  className = "",
}) {
  const bn = lang === "bn";
  const choices = useMemo(() => bankChoicesForShop(UAE_BANKS.map((b) => b.name), shop), [shop]);
  if (!isInvoiceBankPayMethod(method)) return null;
  const resolved = String(value || "").trim() || shopBankAccountName(shop);
  const label = bn ? "ব্যাংক অ্যাকাউন্ট" : "Bank account";
  return (
    <>
      {showLabel && <div style={lblStyle}>{label}</div>}
      <select
        className={className || undefined}
        style={inpStyle}
        disabled={disabled}
        value={choices.includes(resolved) ? resolved : resolved}
        onChange={(e) => onChange?.(e.target.value)}
      >
        {!choices.includes(resolved) && resolved ? <option value={resolved}>{resolved}</option> : null}
        {choices.map((name) => (
          <option key={name} value={name}>
            {name}
          </option>
        ))}
      </select>
    </>
  );
}