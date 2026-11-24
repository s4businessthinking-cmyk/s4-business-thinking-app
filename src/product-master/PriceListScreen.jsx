// Price List: selling rates per product, unit and customer type, and what one customer pays, with CSV / print.
// Read-only; every rate comes from siResolveRate, the same lookup a new sales invoice line uses.
import React, { useMemo, useRef, useState } from "react";
import { PM_CSS } from "./pmStyles";
import { SI_CSS, usePmFitHeight, usePmMobile } from "../sales-invoice/siSkin";
import { normCustomerType, normUnit, siResolveRate } from "../sales-invoice/siHelpers.js";
import { siProductRateRows } from "../sales-invoice/salesInvoiceShared.js";
import { printWithSettings } from "../print/printSettings.js";
import { generateStatementHTML } from "../print/printDesign.js";
import { saveTextFile } from "../utils/saveTextFile.js";
import { csvText, num } from "../reports/vatExport.js";
import { customerRates, priceListRows, typesWithRates } from "./priceList.js";

const RATES = { resolve: siResolveRate, rows: siProductRateRows, normType: normCustomerType, normUnit };
const money = (v) => (Math.round((Number(v) || 0) * 100) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const today = () => new Date().toISOString().slice(0, 10);
const slug = (v) => String(v || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
const PL_CSS = `
.pl-table { width: 100%; border-collapse: collapse; font-size: 11.5px; }
.pl-table th { text-align: left; background: #e8eef7; padding: 3px 5px; border-bottom: 1px solid #8797a9; white-space: nowrap; position: sticky; top: 0; z-index: 1; }
.pl-table td { padding: 3px 5px; border-bottom: 1px solid #e2e8f0; }
.pl-table .num { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
.pl-special { color: #1d4ed8; font-weight: 700; }
.pl-fallback { color: #94a3b8; }
.pl-badge { display: inline-block; padding: 0 5px; border-radius: 3px; font-size: 10.5px; font-weight: 700; white-space: nowrap; }
`;
const SOURCE_STYLE = { special: { background: "#dbeafe", color: "#1d4ed8" }, default: { background: "#f1f5f9", color: "#334155" }, base: { background: "#fef3c7", color: "#92400e" } };

export default function PriceListScreen({ lang = "en", products = [], customers = [], shopName = "", cur = "AED", toast, canPrint = false }) {
  const bn = lang === "bn";
  const L = (b, e) => (bn ? b : e);
  const [view, setView] = useState("list");
  const [search, setSearch] = useState("");
  const [brand, setBrand] = useState("");
  const [category, setCategory] = useState("");
  const [pricedOnly, setPricedOnly] = useState(true);
  const [custQ, setCustQ] = useState("");
  const [custId, setCustId] = useState("");
  const mobile = usePmMobile();
  const rootRef = useRef(null);
  const fitH = usePmFitHeight(rootRef, mobile, view);
  const canCustomers = customers.length > 0;

  const live = useMemo(() => products.filter((p) => p?.id && !p.isDeleted), [products]);
  const brands = useMemo(() => [...new Set(live.map((p) => String(p.brand || p.company || "").trim()).filter(Boolean))].sort(), [live]);
  const categories = useMemo(() => [...new Set(live.map((p) => String(p.category || "").trim()).filter(Boolean))].sort(), [live]);
  const types = useMemo(() => typesWithRates(live, RATES), [live]);
  const filters = { search, brand, category, pricedOnly };
  const list = useMemo(() => (view === "list" ? priceListRows(live, RATES, { types, ...filters }) : []), [view, live, types, search, brand, category, pricedOnly]); // eslint-disable-line react-hooks/exhaustive-deps

  const customerList = useMemo(() => {
    const q = custQ.trim().toLowerCase();
    return customers.filter((c) => c?.id && !c.isDeleted && (!q || [c.customerName, c.customerCode, c.mobileNumber, c.customerType].some((v) => String(v || "").toLowerCase().includes(q))))
      .sort((a, b) => String(a.customerName || "").localeCompare(String(b.customerName || ""))).slice(0, 200);
  }, [customers, custQ]);
  const customer = customers.find((c) => c.id === custId) || null;
  const custRows = useMemo(() => (view === "customer" && customer ? customerRates(live, customer, RATES, filters) : []), [view, customer, live, search, brand, category, pricedOnly]); // eslint-disable-line react-hooks/exhaustive-deps
  const custType = String(customer?.customerType || "").trim();
  const custHasSpecial = custType && types.some((t) => normCustomerType(t) === normCustomerType(custType));

  const sourceLabel = (s) => (s === "special" ? L(`${custType}-এর বিশেষ রেট`, `Special rate for ${custType}`) : s === "default" ? L("সাধারণ রেট", "Default rate") : L("প্রোডাক্টের মূল দাম", "Product base price"));
  const unitLabel = (r) => (r.factor > 1 ? `${r.unit} (${r.factor})` : r.unit);

  // ── export / print: fixed English headers, plain-number amounts ──
  const listSheet = () => ({
    cols: ["Code", "Name", "Brand", "Category", "Barcode", "Unit", "Base units per unit", "VAT %", "Price excl VAT", "Price incl VAT", "MRP", ...types.map((t) => `${t} price excl VAT`), "Special rate for"],
    rows: list.map((r) => [r.code, r.name, r.brand, r.category, r.barcode, r.unit, String(r.factor), num(r.vat), num(r.price), num(r.priceIncl), r.mrp ? num(r.mrp) : "",
      ...types.map((t) => num(r.byType[t].price)), types.filter((t) => r.byType[t].special).join(" / ")]),
  });
  const customerSheet = () => ({
    head: [["Customer", customer?.customerName || ""], ["Customer code", customer?.customerCode || ""], ["Customer type", custType || "-"], ["Customer discount %", num(customer?.discountPerc)], ["Date", today()], []],
    cols: ["Code", "Name", "Brand", "Unit", "Rate from", "List price excl VAT", "Discount %", "Net price excl VAT", "VAT %", "Net price incl VAT"],
    rows: custRows.map((r) => [r.code, r.name, r.brand, r.unit, r.source === "special" ? `Special (${custType})` : r.source === "default" ? "Default rate" : "Base price", num(r.list), num(r.discount), num(r.net), num(r.vat), num(r.netIncl)]),
  });
  const exportCsv = async () => {
    try {
      if (view === "list") {
        const s = listSheet();
        await saveTextFile(`price-list-${today()}.csv`, csvText([s.cols, ...s.rows]));
      } else if (customer) {
        const s = customerSheet();
        await saveTextFile(`price-list-${slug(customer.customerName) || "customer"}-${today()}.csv`, csvText([...s.head, s.cols, ...s.rows]));
      }
    } catch (e) { toast?.(e.message || String(e), "err"); }
  };
  const print = () => {
    const filterLine = [search, brand, category].filter(Boolean).join(" · ");
    if (view === "list") {
      const cols = [L("কোড", "Code"), L("প্রোডাক্ট", "Product"), L("ইউনিট", "Unit"), "VAT %", `${L("দাম", "Price")} (${cur})`, `${L("VAT সহ", "Incl. VAT")}`, ...types];
      printWithSettings(generateStatementHTML({
        shopName, title: L("মূল্য তালিকা", "PRICE LIST"), subtitle: today(), partyLine: filterLine,
        cols: cols.map((label, i) => ({ label, align: i >= 3 ? "right" : undefined })),
        rows: list.map((r) => [r.code, r.name, unitLabel(r), money(r.vat), money(r.price), money(r.priceIncl), ...types.map((t) => money(r.byType[t].price))]),
      }), { lang });
    } else if (customer) {
      const cols = [L("কোড", "Code"), L("প্রোডাক্ট", "Product"), L("ইউনিট", "Unit"), `${L("দাম", "Price")} (${cur})`, L("ছাড় %", "Disc %"), L("নিট", "Net"), L("VAT সহ", "Incl. VAT")];
      printWithSettings(generateStatementHTML({
        shopName, title: L("কাস্টমারের মূল্য তালিকা", "CUSTOMER PRICE LIST"), subtitle: today(),
        partyLine: [customer.customerName, custType && `${L("ধরন", "Type")}: ${custType}`, `${L("ছাড়", "Discount")}: ${money(customer.discountPerc)}%`, filterLine].filter(Boolean).join("   ·   "),
        cols: cols.map((label, i) => ({ label, align: i >= 3 ? "right" : undefined })),
        rows: custRows.map((r) => [r.code, r.name, unitLabel(r), money(r.list), money(r.discount), money(r.net), money(r.netIncl)]),
      }), { lang });
    }
  };

  const ready = view === "list" || !!customer;
  return (
    <div ref={rootRef} className="si-root" style={fitH ? { height: fitH } : undefined}>
      <style>{PM_CSS}</style>
      <style>{SI_CSS}</style>
      <style>{PL_CSS}</style>
      <div className="pm-reference-title">
        <strong> {L("মূল্য তালিকা", "Price List")}</strong>
        <span>{view === "customer" && customer ? customer.customerName : L("সব প্রোডাক্ট", "All products")}</span>
      </div>
      <div className="si-toolbar">
        <div className="si-pills">
          <button type="button" className={`pm-btn-secondary${view === "list" ? " is-active" : ""}`} onClick={() => setView("list")}>{L("মূল্য তালিকা", "Price list")}</button>
          {canCustomers && <button type="button" className={`pm-btn-secondary${view === "customer" ? " is-active" : ""}`} onClick={() => setView("customer")}>{L("কাস্টমারের রেট", "Customer rates")}</button>}
        </div>
        <span className="si-toolbar-gap" />
        {canPrint && <button type="button" className="pm-btn pm-btn--primary" onClick={print} disabled={!ready}> {L("প্রিন্ট", "Print")}</button>}
        {canPrint && <button type="button" className="pm-btn-secondary" onClick={exportCsv} disabled={!ready}> Excel</button>}
      </div>
      <div className="si-toolbar">
        <input className="pm-input" style={{ width: mobile ? "100%" : 220 }} value={search} onChange={(e) => setSearch(e.target.value)} placeholder={L("কোড, নাম, বারকোড বা ব্র্যান্ড", "Code, name, barcode or brand")} />
        {brands.length > 0 && (
          <select className="pm-input" style={{ width: mobile ? "48%" : 150 }} value={brand} onChange={(e) => setBrand(e.target.value)}>
            <option value="">{L("সব ব্র্যান্ড", "All brands")}</option>
            {brands.map((b) => <option key={b} value={b}>{b}</option>)}
          </select>
        )}
        {categories.length > 0 && (
          <select className="pm-input" style={{ width: mobile ? "48%" : 150 }} value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">{L("সব ক্যাটাগরি", "All categories")}</option>
            {categories.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        )}
        <label className="pm-btn-secondary" style={{ display: "inline-flex", alignItems: "center", gap: 4, cursor: "pointer" }}>
          <input type="checkbox" checked={pricedOnly} onChange={(e) => setPricedOnly(e.target.checked)} /> {L("শুধু দাম আছে এমন", "Priced only")}
        </label>
        {view === "customer" && (
          <>
            <input className="pm-input" style={{ width: mobile ? "100%" : 170 }} value={custQ} onChange={(e) => setCustQ(e.target.value)} placeholder={L("কাস্টমার খুঁজুন", "Find customer")} />
            <select className="pm-input" style={{ width: mobile ? "100%" : 230 }} value={custId} onChange={(e) => setCustId(e.target.value)}>
              <option value="">{L("কাস্টমার বাছুন", "Choose a customer")}</option>
              {customer && !customerList.includes(customer) && <option value={customer.id}>{customer.customerName}</option>}
              {customerList.map((c) => <option key={c.id} value={c.id}>{[c.customerName, c.customerType && `(${c.customerType})`].filter(Boolean).join(" ")}</option>)}
            </select>
          </>
        )}
      </div>

      <div className="si-body">
        {view === "list" && (
          <fieldset className="pm-panel" style={{ margin: 0 }}>
            <legend className="pm-panel-legend">{L("মূল্য তালিকা", "Price list")} ({list.length})</legend>
            <div className="si-panel-body" style={{ overflow: "auto", maxHeight: mobile ? undefined : 480 }}>
              <table className="pl-table">
                <thead><tr>
                  <th>{L("কোড", "Code")}</th><th>{L("প্রোডাক্ট", "Product")}</th>{!mobile && <th>{L("ব্র্যান্ড", "Brand")}</th>}<th>{L("ইউনিট", "Unit")}</th>
                  <th className="num">VAT %</th><th className="num">{L("সাধারণ দাম", "Default price")}</th>{!mobile && <th className="num">{L("VAT সহ", "Incl. VAT")}</th>}{!mobile && <th className="num">MRP</th>}
                  {types.map((t) => <th key={t} className="num">{t}</th>)}
                </tr></thead>
                <tbody>
                  {list.map((r) => (
                    <tr key={`${r.productId}|${r.unit}`}>
                      <td>{r.code}</td><td>{r.name}</td>{!mobile && <td>{r.brand}</td>}<td>{unitLabel(r)}</td>
                      <td className="num">{money(r.vat)}</td><td className="num" style={{ fontWeight: 700 }}>{money(r.price)}</td>
                      {!mobile && <td className="num">{money(r.priceIncl)}</td>}{!mobile && <td className="num">{r.mrp ? money(r.mrp) : ""}</td>}
                      {types.map((t) => (
                        <td key={t} className={`num ${r.byType[t].special ? "pl-special" : "pl-fallback"}`} title={r.byType[t].special ? L(`${t}-এর বিশেষ রেট`, `Special rate for ${t}`) : L("বিশেষ রেট নেই — সাধারণ দাম বসবে", "No special rate — the default price applies")}>
                          {money(r.byType[t].price)}
                        </td>
                      ))}
                    </tr>
                  ))}
                  {!list.length && <tr><td colSpan={8 + types.length} className="si-empty">{L("কোনো প্রোডাক্ট পাওয়া যায়নি", "No product found")}</td></tr>}
                </tbody>
              </table>
            </div>
          </fieldset>
        )}

        {view === "customer" && (
          <>
            {customer && (
              <fieldset className="pm-panel" style={{ margin: 0 }}>
                <legend className="pm-panel-legend">{customer.customerName}</legend>
                <div className="si-panel-body">
                  <div className="si-total-row"><span>{L("কাস্টমার ধরন", "Customer type")}</span><b>{custType || L("দেওয়া নেই", "Not set")}</b></div>
                  <div className="si-total-row"><span>{L("কাস্টমারের ছাড়", "Customer discount")}</span><b>{money(customer.discountPerc)}%</b></div>
                  <div className="si-note" style={{ marginTop: 4 }}>
                    {custHasSpecial
                      ? L(`বিলে রেট বসে এভাবে: প্রোডাক্টে "${custType}"-এর বিশেষ রেট থাকলে সেটা, না থাকলে সাধারণ রেট, তাও না থাকলে প্রোডাক্টের মূল দাম।`, `How the bill picks the rate: the product's special rate for "${custType}" if it has one, else the default rate, else the product's base price.`)
                      : custType
                        ? L(`কোনো প্রোডাক্টে "${custType}"-এর বিশেষ রেট নেই, তাই এই কাস্টমার সাধারণ রেট পাবে। বিশেষ রেট দিতে Product Master > Selling Rates-এ এই ধরন বেছে রেট লিখুন।`, `No product has a special rate for "${custType}", so this customer gets the default rate. To give one, add a row for this type in Product Master > Selling Rates.`)
                        : L("কাস্টমারের ধরন দেওয়া নেই, তাই সাধারণ রেট বসবে। Customer Master-এ ধরন দিলে সেই ধরনের বিশেষ রেট বসবে।", "The customer has no type, so the default rate applies. Set a type in Customer Master to use that type's special rates.")}
                    {" "}{L("লাইনের ছাড় = প্রোডাক্টের ডিফল্ট ছাড় আর কাস্টমারের ছাড়ের মধ্যে যেটা বেশি। বিলে হাতে দাম বা ছাড় বদলালে সেটাই থাকে।", "Line discount = the larger of the product's default discount and the customer's discount. A price or discount changed by hand on the bill stays as typed.")}
                  </div>
                </div>
              </fieldset>
            )}
            <fieldset className="pm-panel" style={{ margin: 0 }}>
              <legend className="pm-panel-legend">{L("এই কাস্টমারের দাম", "Prices for this customer")} ({custRows.length})</legend>
              <div className="si-panel-body" style={{ overflow: "auto", maxHeight: mobile ? undefined : 420 }}>
                {!customer ? (
                  <div className="si-empty">{L("উপর থেকে কাস্টমার বাছুন", "Choose a customer above")}</div>
                ) : (
                  <table className="pl-table">
                    <thead><tr>
                      <th>{L("কোড", "Code")}</th><th>{L("প্রোডাক্ট", "Product")}</th><th>{L("ইউনিট", "Unit")}</th><th>{L("রেট কোথা থেকে", "Rate from")}</th>
                      <th className="num">{L("দাম", "List")}</th><th className="num">{L("ছাড় %", "Disc %")}</th><th className="num">{L("নিট", "Net")}</th>{!mobile && <th className="num">{L("VAT সহ", "Incl. VAT")}</th>}
                    </tr></thead>
                    <tbody>
                      {custRows.map((r) => (
                        <tr key={`${r.productId}|${r.unit}`}>
                          <td>{r.code}</td><td>{r.name}</td><td>{unitLabel(r)}</td>
                          <td><span className="pl-badge" style={SOURCE_STYLE[r.source]}>{sourceLabel(r.source)}</span></td>
                          <td className="num">{money(r.list)}</td><td className="num">{r.discount ? money(r.discount) : ""}</td>
                          <td className="num" style={{ fontWeight: 700 }}>{money(r.net)}</td>{!mobile && <td className="num">{money(r.netIncl)}</td>}
                        </tr>
                      ))}
                      {!custRows.length && <tr><td colSpan={8} className="si-empty">{L("কোনো প্রোডাক্ট পাওয়া যায়নি", "No product found")}</td></tr>}
                    </tbody>
                  </table>
                )}
              </div>
            </fieldset>
          </>
        )}

        <div className="si-note">
          {L(
            "প্রতিটি দাম নতুন সেলস বিলের লাইনে যে রেট বসে সেটাই (Product Master > Selling Rates থেকে): ইউনিট + কাস্টমার ধরনের রেট, না থাকলে ইউনিটের সাধারণ রেট, না থাকলে প্রোডাক্টের মূল দাম (VAT ছাড়া)। নীল = বিশেষ রেট, ধূসর = বিশেষ রেট নেই তাই সাধারণ দাম। VAT সহ দাম = দাম + প্রোডাক্টের বিক্রির VAT %; সাধারণ (regular) বিলে VAT বসে না। ক্রয়মূল্য এখানে দেখানো হয় না। আগের বিলের দাম বদলায় না।",
            "Every price is the rate a new sales bill line gets (from Product Master > Selling Rates): the unit + customer type rate, else the unit's default rate, else the product's base price (excl. VAT). Blue = special rate, grey = no special rate so the default price applies. Price incl. VAT = price + the product's sales VAT %; regular (non-tax) bills carry no VAT. Purchase cost is not shown here. Saved bills keep their own prices."
          )}
        </div>
      </div>
      <div className="si-statusbar">
        <span>{L("প্রোডাক্ট", "Products")} <b>{live.length}</b></span>
        <span>{L("বিশেষ রেটের ধরন", "Customer types with special rates")} <b>{types.length ? types.join(", ") : "-"}</b></span>
      </div>
    </div>
  );
}
