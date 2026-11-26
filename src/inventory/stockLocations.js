// Godowns / locations inside one shop (Stock Hub > Godowns). The shop's stock stays one figure worked out from the
// documents (stockFromInvoices / stockHub) - nothing in the stock engine changes. Locations only say WHERE that stock
// sits: the location tree is kept on the shop record (shop.stockLocations), goods are moved between locations with
// location transfers (locationMoves collection), and the main location holds whatever has not been moved out of it.
// Purchases, sales, returns and adjustments land on the main location unless the document names a godown
// (locationId on the bill, W01): then documentMoves() treats it as a move between the main location and that godown on
// the document's date, so the sum over locations is always the shop total. Moves change no money: total stock value
// stays the Balance Sheet's closing stock.

const num = (v) => parseFloat(String(v ?? "").replace(/,/g, "")) || 0;
const q4 = (v) => Math.round((Number(v) || 0) * 10000) / 10000;
const r2 = (v) => Math.round(((Number(v) || 0) + Number.EPSILON) * 100) / 100;
const clean = (v) => String(v ?? "").trim();
const lc = (v) => clean(v).toLowerCase();

export const MAIN_LOCATION_ID = "main";
export const MAX_LOCATION_DEPTH = 3;
export const LOCATION_KINDS = [
  { key: "store", bn: "দোকান", en: "Shop floor" },
  { key: "godown", bn: "গোডাউন", en: "Godown / warehouse" },
  { key: "rack", bn: "র‍্যাক / শেলফ", en: "Rack / shelf" },
  { key: "vehicle", bn: "গাড়ি", en: "Vehicle" },
  { key: "other", bn: "অন্যান্য", en: "Other" },
];

/** Saved locations, cleaned, with the main location always present (first). */
export function normalizeLocations(saved) {
  const list = (Array.isArray(saved) ? saved : []).filter((l) => l && clean(l.id) && clean(l.name))
    .map((l) => ({ id: clean(l.id), code: clean(l.code), name: clean(l.name), nameBn: clean(l.nameBn), kind: LOCATION_KINDS.some((k) => k.key === l.kind) ? l.kind : "other",
      parentId: clean(l.parentId), active: l.active !== false, note: clean(l.note), createdAt: l.createdAt || "", updatedAt: l.updatedAt || "" }));
  const ids = new Set(list.map((l) => l.id));
  list.forEach((l) => { if (l.parentId && (!ids.has(l.parentId) || l.parentId === l.id)) l.parentId = ""; });
  const main = list.find((l) => l.id === MAIN_LOCATION_ID) || { id: MAIN_LOCATION_ID, code: "", name: "Main store", nameBn: "মূল দোকান", kind: "store", parentId: "", note: "" };
  return [{ ...main, parentId: "", active: true, isMain: true }, ...list.filter((l) => l.id !== MAIN_LOCATION_ID).map((l) => ({ ...l, isMain: false }))];
}

export const locationName = (l, bn = false) => (bn ? l?.nameBn || l?.name : l?.name || l?.nameBn) || "";
const ancestors = (list, id) => {
  const byId = new Map(list.map((l) => [l.id, l]));
  const out = [];
  let cur = byId.get(id);
  const seen = new Set();
  while (cur && !seen.has(cur.id)) { seen.add(cur.id); out.unshift(cur); cur = byId.get(cur.parentId); }
  return out;
};
export const locationPath = (list, id, bn = false) => ancestors(list, id).map((l) => locationName(l, bn)).join(" > ");
export const depthOf = (list, id) => ancestors(list, id).length;
export const descendantIds = (list, id) => {
  const out = new Set();
  const walk = (pid) => list.filter((l) => l.parentId === pid).forEach((l) => { if (!out.has(l.id)) { out.add(l.id); walk(l.id); } });
  walk(id);
  return out;
};
/** Tree order: [{ loc, depth }] */
export function locationTree(list) {
  const out = [];
  const walk = (pid, depth) => list.filter((l) => (l.parentId || "") === pid && !(pid === "" && l.isMain && depth > 0))
    .sort((a, b) => Number(b.isMain) - Number(a.isMain) || (a.code || "~").localeCompare(b.code || "~", undefined, { numeric: true }) || a.name.localeCompare(b.name))
    .forEach((l) => { out.push({ loc: l, depth }); walk(l.id, depth + 1); });
  walk("", 0);
  return out;
}

/**
 * Add / change a location. draft: { id?, code, name, nameBn, kind, parentId, active, note }.
 * usedIds: locations that hold stock or have moves (cannot be switched off). -> { error } | { ok, location }
 */
export function validateLocation(draft, list, { usedIds = new Set(), now = new Date() } = {}) {
  const prev = list.find((l) => l.id === draft.id) || null;
  const name = clean(draft.name);
  if (!name) return { error: "name" };
  if (list.some((l) => l.id !== prev?.id && lc(l.name) === lc(name))) return { error: "duplicate" };
  const code = clean(draft.code);
  if (code && list.some((l) => l.id !== prev?.id && lc(l.code) === lc(code))) return { error: "duplicateCode" };
  const parentId = prev?.isMain ? "" : clean(draft.parentId);
  if (parentId) {
    if (!list.some((l) => l.id === parentId)) return { error: "parent" };
    if (prev && (parentId === prev.id || descendantIds(list, prev.id).has(parentId))) return { error: "cycle" };
    const below = prev ? Math.max(0, ...[...descendantIds(list, prev.id)].map((id) => depthOf(list, id) - depthOf(list, prev.id))) : 0;
    if (depthOf(list, parentId) + 1 + below > MAX_LOCATION_DEPTH) return { error: "depth" };
  }
  const active = prev?.isMain ? true : draft.active !== false;
  if (prev && !active && usedIds.has(prev.id)) return { error: "inUse" };
  const at = new Date(now).toISOString();
  return {
    ok: true,
    location: {
      id: prev?.id || clean(draft.id) || `loc${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
      code, name, nameBn: clean(draft.nameBn), kind: LOCATION_KINDS.some((k) => k.key === draft.kind) ? draft.kind : "other",
      parentId, active, note: clean(draft.note), createdAt: prev?.createdAt || at, updatedAt: at,
    },
  };
}

/** What the shop record keeps (no derived fields). */
export const toSavedLocations = (list) => list.map(({ id, code, name, nameBn, kind, parentId, active, note, createdAt, updatedAt }) => ({ id, code, name, nameBn, kind, parentId, active, note, createdAt, updatedAt }));

export const liveMoves = (moves, shopId = "") => (moves || []).filter((m) => m && !m.isDeleted && m.status !== "cancelled" && (!shopId || !m.shopId || m.shopId === shopId));

/**
 * Stock per location on a date: Map(locationId -> Map(productId -> qty)). total: shop on hand on that date
 * (onHandAt). The main location gets the total less what sits elsewhere.
 */
export function locationStock(total, moves, locations, { asOf = "", shopId = "", skipId = "" } = {}) {
  const placed = new Map((locations || []).filter((l) => !l.isMain).map((l) => [l.id, new Map()]));
  const bump = (locId, pid, d) => {
    if (locId === MAIN_LOCATION_ID) return;
    if (!placed.has(locId)) placed.set(locId, new Map());
    const m = placed.get(locId);
    m.set(pid, q4((m.get(pid) || 0) + d));
  };
  liveMoves(moves, shopId).filter((m) => m.id !== skipId && (!asOf || m.moveDate <= asOf)).forEach((m) => {
    (m.lines || []).forEach((l) => {
      const q = num(l.qty);
      if (!l.productId || !(q > 0)) return;
      bump(m.fromId, l.productId, -q);
      bump(m.toId, l.productId, q);
    });
  });
  const main = new Map();
  (total || new Map()).forEach((q, pid) => {
    let elsewhere = 0;
    placed.forEach((m) => { elsewhere += m.get(pid) || 0; });
    main.set(pid, q4(q - elsewhere));
  });
  return new Map([[MAIN_LOCATION_ID, main], ...placed]);
}

export const qtyIn = (stock, locId, pid) => q4(stock.get(locId)?.get(pid) || 0);

/**
 * The godown side of documents (Stock Hub stockMovements lines with a locationId other than main): stock that came in
 * goes main -> godown, stock that went out goes godown -> main, on the document's date. With the shop total from the
 * same movements, locationStock() then puts each document's stock where the document says.
 * -> moves in the locationMoves shape, marked fromDocument (never saved). skipDocId: leave one document out (editing it).
 */
export function documentMoves(movements, { skipDocId = "" } = {}) {
  const byDoc = new Map();
  (movements || []).forEach((m) => {
    const loc = clean(m?.locationId);
    if (!loc || loc === MAIN_LOCATION_ID || !m.productId || (skipDocId && m.docId === skipDocId)) return;
    ["in", "out"].forEach((dir) => {
      const q = num(dir === "in" ? m.qtyIn : m.qtyOut);
      if (!(q > 0)) return;
      const key = `${m.col}|${m.docId}|${dir}`;
      if (!byDoc.has(key)) byDoc.set(key, { id: `doc-${m.col}-${m.docId}-${dir}`, fromDocument: true, docNo: m.no || "", moveDate: m.date, status: "active",
        fromId: dir === "in" ? MAIN_LOCATION_ID : loc, toId: dir === "in" ? loc : MAIN_LOCATION_ID, lines: [] });
      byDoc.get(key).lines.push({ productId: m.productId, qty: q });
    });
  });
  return [...byDoc.values()];
}

/** Products below zero at a location: [{ locationId, productId, qty }] (main goes negative when it sold goods moved away). */
export function negativeAtLocations(stock) {
  const out = [];
  stock.forEach((m, locationId) => m.forEach((qty, productId) => { if (qty < -1e-9) out.push({ locationId, productId, qty }); }));
  return out;
}

/**
 * Check a move before saving. draft: { moveDate, fromId, toId, lines: [{ productId, qty }] }.
 * stockOn(day, skipId): locationStock() for a day; today: the last day checked (a back-dated move must not leave a
 * location short on any later day up to today, so it is checked on both days).
 * -> [{ id, en, bn, productId? }]
 */
export function moveBlockers(draft, { locations, products, stockOn, today = "", skipId = "" }) {
  const out = [];
  const byId = new Map((locations || []).map((l) => [l.id, l]));
  const from = byId.get(draft.fromId), to = byId.get(draft.toId);
  if (!draft.moveDate) out.push({ id: "date", en: "Pick the date", bn: "তারিখ দিন" });
  else if (today && draft.moveDate > today) out.push({ id: "future", en: "The date is in the future", bn: "তারিখ ভবিষ্যতে" });
  if (!from || !to) out.push({ id: "location", en: "Pick both locations", bn: "দুটো লোকেশন বাছুন" });
  else if (from.id === to.id) out.push({ id: "same", en: "From and to are the same location", bn: "যেখান থেকে আর যেখানে একই লোকেশন" });
  else if (!to.active) out.push({ id: "inactive", en: `${to.name} is switched off`, bn: `${locationName(to, true)} বন্ধ করা` });
  const lines = (draft.lines || []).filter((l) => l.productId || num(l.qty));
  if (!lines.length) out.push({ id: "lines", en: "Add at least one item", bn: "অন্তত একটা আইটেম দিন" });
  const productIds = new Set((products || []).map((p) => p.id));
  const want = new Map();
  lines.forEach((l) => {
    if (!productIds.has(l.productId)) { out.push({ id: "product", en: "Pick the item on every line", bn: "প্রতি লাইনে আইটেম বাছুন" }); return; }
    if (!(num(l.qty) > 0)) { out.push({ id: "qty", en: "Quantity must be above 0", bn: "পরিমাণ ০-এর বেশি হতে হবে", productId: l.productId }); return; }
    want.set(l.productId, q4((want.get(l.productId) || 0) + num(l.qty)));
  });
  if (out.length || !from) return dedupe(out);
  const days = [...new Set([draft.moveDate, today].filter(Boolean))];
  days.forEach((day) => {
    const stock = stockOn(day, skipId);
    want.forEach((q, pid) => {
      const have = qtyIn(stock, from.id, pid);
      if (have + 1e-9 < q) out.push({ id: "short", productId: pid, en: `Only ${have} at ${from.name} on ${day}`, bn: `${day}-এ ${locationName(from, true)}-এ আছে মাত্র ${have}` });
    });
  });
  return dedupe(out);
}

/** Can a saved move be cancelled? Taking the goods back must not leave the receiving location short. */
export function cancelBlockers(move, { stockOn, today = "", locations = [] }) {
  if (move.toId === MAIN_LOCATION_ID) return [];
  const loc = locations.find((x) => x.id === move.toId);
  const out = [];
  [...new Set([move.moveDate, today].filter(Boolean))].forEach((day) => {
    const stock = stockOn(day, move.id);
    (move.lines || []).forEach((l) => {
      if (qtyIn(stock, move.toId, l.productId) < -1e-9) out.push({ id: "used", productId: l.productId, en: `${loc?.name || move.toId} would go short on ${day} - move the goods back instead`, bn: `${day}-এ ${locationName(loc, true) || move.toId} কম পড়বে - বরং মাল ফেরত পাঠান` });
    });
  });
  return dedupe(out);
}

function dedupe(list) {
  const seen = new Set();
  // one message per problem and item (the first day that shows it)
  return list.filter((x) => { const k = `${x.id}|${x.productId || ""}`; if (seen.has(k)) return false; seen.add(k); return true; });
}

/** The move document (locationMoves). */
export function moveDoc(draft, { shopId, moveNo, products, uid = "", by = "", now = new Date() }) {
  const byId = new Map((products || []).map((p) => [p.id, p]));
  const at = new Date(now).toISOString();
  return {
    shopId, moveNo, moveDate: draft.moveDate, fromId: draft.fromId, toId: draft.toId, fromName: clean(draft.fromName), toName: clean(draft.toName),
    lines: (draft.lines || []).filter((l) => l.productId && num(l.qty) > 0).map((l) => ({ productId: l.productId, code: byId.get(l.productId)?.code || "", name: byId.get(l.productId)?.name || "", unit: byId.get(l.productId)?.unit || "", qty: q4(num(l.qty)) })),
    note: clean(draft.note), status: "active", createdBy: uid, createdByName: by, createdAt: at, updatedAt: at, updatedBy: uid,
  };
}

export const nextMoveNo = (moves) => `LT-${String((moves || []).reduce((m, x) => Math.max(m, Number(String(x?.moveNo || "").match(/(\d+)$/)?.[1] || 0)), 0) + 1).padStart(4, "0")}`;

/** Locations that hold stock or appear on a move (they cannot be switched off or removed). */
export function usedLocationIds(stock, moves) {
  const out = new Set([MAIN_LOCATION_ID]);
  stock.forEach((m, id) => { if (id !== MAIN_LOCATION_ID && [...m.values()].some((q) => Math.abs(q) > 1e-9)) out.add(id); });
  (moves || []).forEach((m) => { if (m) { out.add(m.fromId); out.add(m.toId); } });
  return out;
}

/**
 * Per-location summary: [{ id, name, path, depth, items, qty, value, ownQty, ownValue }], value at average cost of
 * positive quantities (as Stock Hub valuation). A parent's figures include its children.
 */
export function locationSummary(stock, locations, cost, { bn = false } = {}) {
  const own = new Map(locations.map((l) => {
    const m = stock.get(l.id) || new Map();
    let qty = 0, value = 0, items = 0;
    m.forEach((q, pid) => { if (q > 1e-9) { qty += q; value += q * (Number(cost?.get(pid)) || 0); items += 1; } });
    return [l.id, { qty: q4(qty), value: r2(value), items }];
  }));
  return locationTree(locations).map(({ loc, depth }) => {
    const ids = [loc.id, ...descendantIds(locations, loc.id)];
    const sum = (k) => ids.reduce((t, id) => t + (own.get(id)?.[k] || 0), 0);
    return { id: loc.id, loc, name: locationName(loc, bn), path: locationPath(locations, loc.id, bn), depth, items: own.get(loc.id).items, ownQty: own.get(loc.id).qty, ownValue: own.get(loc.id).value, qty: q4(sum("qty")), value: r2(sum("value")) };
  });
}

/** Item rows of one location (and optionally its children): [{ productId, qty, cost, value }] */
export function locationItems(stock, locations, locId, cost, { withChildren = false } = {}) {
  const ids = [locId, ...(withChildren ? descendantIds(locations, locId) : [])];
  const m = new Map();
  ids.forEach((id) => (stock.get(id) || new Map()).forEach((q, pid) => m.set(pid, q4((m.get(pid) || 0) + q))));
  return [...m.entries()].filter(([, q]) => Math.abs(q) > 1e-9).map(([productId, qty]) => {
    const c = Number(cost?.get(productId)) || 0;
    return { productId, qty, cost: r2(c), value: qty > 0 ? r2(qty * c) : 0 };
  });
}
