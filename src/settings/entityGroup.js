// A51-01: read-only legal-entity group for print/PDF headers. One shop = one set of books; no cross-shop posting.

const clean = (v) => String(v ?? "").trim();

export function normalizeEntityGroup(raw, { companyName = "" } = {}) {
  const name = clean(raw?.name);
  const list = (Array.isArray(raw?.entities) ? raw.entities : [])
    .map((e) => ({
      name: clean(e?.name),
      trn: clean(e?.trn),
      isThisShop: e?.isThisShop === true,
    }))
    .filter((e) => e.name);
  let marked = list.some((e) => e.isThisShop);
  if (companyName && list.length) {
    list.forEach((e) => {
      if (!marked && clean(e.name).toLowerCase() === clean(companyName).toLowerCase()) e.isThisShop = true;
    });
  }
  if (!name && !list.length) return null;
  return { name, entities: list };
}

export function entityGroupOf(shop) {
  return normalizeEntityGroup(shop?.entityGroup, { companyName: shop?.companyName });
}

/** One line per entity: "Name (TRN …)" with * on this shop */
export function entityGroupPrintLines(shop, bn = false) {
  const g = entityGroupOf(shop);
  if (!g) return [];
  const out = [];
  const groupLabel = bn ? "গ্রুপ" : "Group";
  if (g.name) out.push(`${groupLabel}: ${g.name}`);
  const entLabel = bn ? "আইনি সত্তা" : "Legal entities";
  const thisTag = bn ? " (এই দোকান)" : " (this shop)";
  const ents = g.entities.map((e) => {
    let s = e.name;
    if (e.trn) s += ` (${bn ? "TRN" : "TRN"} ${e.trn})`;
    if (e.isThisShop) s += thisTag;
    return s;
  });
  if (ents.length) out.push(`${entLabel}: ${ents.join("; ")}`);
  return out;
}

/** HTML shop-sub block for invoice / statement headers (escaped text injected by caller). */
export function entityGroupPrintHtml(shop, esc, bn = false) {
  const lines = entityGroupPrintLines(shop, bn);
  if (!lines.length || typeof esc !== "function") return "";
  return lines.map((line) => `<div class="shop-sub entity-group" style="font-size:10px;opacity:0.9;margin-top:4px">${esc(line)}</div>`).join("");
}

/** Inject after first shop-name when HTML was built without shop context. */
export function injectEntityGroupHeader(html, shop, esc, bn = false) {
  const block = entityGroupPrintHtml(shop, esc, bn);
  if (!block || !html || html.includes("entity-group")) return html;
  return html.replace(/(<div class="shop-name">[\s\S]*?<\/div>)/, `$1${block}`);
}

/** Settings textarea: one entity per line — "Name" or "Name | TRN" — suffix * marks this shop. */
export function entitiesTextOf(group) {
  const g = normalizeEntityGroup(group);
  if (!g?.entities?.length) return "";
  return g.entities.map((e) => {
    const line = e.trn ? `${e.name} | ${e.trn}` : e.name;
    return e.isThisShop ? `${line} *` : line;
  }).join("\n");
}

export function parseEntitiesText(text, { companyName = "" } = {}) {
  const entities = String(text || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
  .map((line) => {
    const star = /\s*\*$/.test(line);
    const body = line.replace(/\s*\*$/, "");
    const [name, trn] = body.split("|").map((x) => x.trim());
    return { name: name || "", trn: trn || "", isThisShop: star };
  })
    .filter((e) => e.name);
  return normalizeEntityGroup({ entities }, { companyName })?.entities || [];
}