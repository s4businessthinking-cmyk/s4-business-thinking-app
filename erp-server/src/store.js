import { EventEmitter } from "node:events";
import { allowed, isOwnerOfShop, makeRuleContext, RULES, UNSCOPED_LIST_COLLECTIONS } from "./rules.js";
import { matchesQuery, sortDocs, shopFilterValue, validateQuery } from "./query.js";
import { fail } from "./errors.js";
import { createMutex, deepEqual, isPlainObject } from "./util.js";

const BACKUP_FORMAT = "s4-shop-backup";
const SINGLE_DOC_PER_SHOP = new Set(["shops", "productMaintenance"]);

// Write-value sentinels sent by the client shim, e.g. { __s4op: "serverTimestamp" }.
const OP_KEY = "__s4op";
const isSentinel = (v) => isPlainObject(v) && typeof v[OP_KEY] === "string";
const DELETE = Symbol("delete");

function resolveValue(value, previous, now) {
  if (isSentinel(value)) {
    switch (value[OP_KEY]) {
      case "serverTimestamp": return now;
      case "delete": return DELETE;
      case "increment": {
        const base = typeof previous === "number" ? previous : 0;
        return base + Number(value.n || 0);
      }
      case "arrayUnion": {
        const base = Array.isArray(previous) ? [...previous] : [];
        for (const item of value.items || []) if (!base.some((x) => JSON.stringify(x) === JSON.stringify(item))) base.push(item);
        return base;
      }
      case "arrayRemove": {
        const drop = (value.items || []).map((x) => JSON.stringify(x));
        return Array.isArray(previous) ? previous.filter((x) => !drop.includes(JSON.stringify(x))) : [];
      }
      default: fail("invalid-argument", `unknown field op ${value[OP_KEY]}`);
    }
  }
  if (Array.isArray(value)) return value.map((v) => resolveValue(v, undefined, now));
  if (isPlainObject(value)) {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      const r = resolveValue(v, undefined, now);
      if (r !== DELETE) out[k] = r;
    }
    return out;
  }
  return value;
}

function deepMerge(base, patch, now) {
  const out = { ...(base || {}) };
  for (const [k, v] of Object.entries(patch || {})) {
    if (isPlainObject(v) && !isSentinel(v) && isPlainObject(out[k])) {
      out[k] = deepMerge(out[k], v, now);
      continue;
    }
    const r = resolveValue(v, out[k], now);
    if (r === DELETE) delete out[k];
    else out[k] = r;
  }
  return out;
}

function applyUpdate(base, patch, now) {
  const out = structuredClone(base || {});
  for (const [path, v] of Object.entries(patch || {})) {
    const parts = path.split(".");
    let cur = out;
    for (let i = 0; i < parts.length - 1; i += 1) {
      if (!isPlainObject(cur[parts[i]])) cur[parts[i]] = {};
      cur = cur[parts[i]];
    }
    const last = parts[parts.length - 1];
    const r = resolveValue(v, cur[last], now);
    if (r === DELETE) delete cur[last];
    else cur[last] = r;
  }
  return out;
}

const ID_RE = /^[^/]{1,180}$/;
const COLLECTION_RE = /^[A-Za-z0-9_]{1,64}$/;

function checkPath(collection, id) {
  if (!COLLECTION_RE.test(String(collection || ""))) fail("invalid-argument", "bad collection name");
  if (!ID_RE.test(String(id || ""))) fail("invalid-argument", "bad document id");
}

const shopIdForRow = (collection, id, data) => {
  if (collection === "shops" || collection === "productMaintenance") return id;
  return typeof data?.shopId === "string" ? data.shopId : null;
};

const toWire = (row) => ({ id: row.id, data: row.data, version: row.version, updateTime: row.updatedAt });

export function createStore({ db }) {
  const bus = new EventEmitter();
  bus.setMaxListeners(0);
  const lock = createMutex();

  const loadDoc = async (collection, id) => (await db.getDoc(collection, id))?.data ?? null;
  const ctxFor = (uid) => makeRuleContext(uid, loadDoc);

  async function canRead(ctx, collection, id, data, list = false) {
    return allowed(ctx, "read", collection, { id, res: data, list });
  }

  async function getDocument(uid, collection, id) {
    checkPath(collection, id);
    const row = await db.getDoc(collection, id);
    const ctx = await ctxFor(uid);
    if (!(await canRead(ctx, collection, id, row?.data ?? null))) fail("permission-denied", "Missing or insufficient permissions.");
    return row ? toWire(row) : null;
  }

  async function candidateRows(q) {
    const shopId = shopFilterValue(q);
    if (shopId !== undefined) return db.listDocs(q.collection, shopId === null ? null : String(shopId));
    if (UNSCOPED_LIST_COLLECTIONS.has(q.collection)) return db.listDocs(q.collection);
    fail("invalid-argument", `queries on ${q.collection} must filter by shopId`);
  }

  async function runQuery(uid, rawQuery, ctx) {
    const q = validateQuery(rawQuery);
    const context = ctx || (await ctxFor(uid));
    const rows = await candidateRows(q);
    const visible = [];
    for (const row of rows) {
      if (matchesQuery(q, row.id, row.data) && (await canRead(context, q.collection, row.id, row.data, true))) visible.push(toWire(row));
    }
    const sorted = sortDocs(q, visible);
    return q.limit ? sorted.slice(0, q.limit) : sorted;
  }

  // writes: [{ op: "set"|"update"|"delete", collection, id, data, merge }]
  // preconditions: [{ collection, id, version }] (version 0 = must not exist)
  function commit(uid, writes, preconditions = []) {
    if (!Array.isArray(writes) || writes.length === 0) fail("invalid-argument", "writes required");
    if (writes.length > 500) fail("invalid-argument", "max 500 writes per commit");

    return lock(async () => {
      const ctx = await ctxFor(uid);
      const now = new Date().toISOString();

      for (const p of preconditions || []) {
        checkPath(p.collection, p.id);
        const row = await db.getDoc(p.collection, p.id);
        if ((row ? row.version : 0) !== Number(p.version || 0)) fail("aborted", "Document changed during transaction; retry.");
      }

      const staged = new Map();
      for (const w of writes) {
        checkPath(w.collection, w.id);
        const key = `${w.collection}/${w.id}`;
        let entry = staged.get(key);
        if (!entry) {
          const row = await db.getDoc(w.collection, w.id);
          entry = { collection: w.collection, id: String(w.id), row, after: row ? row.data : null };
          staged.set(key, entry);
        }
        if (w.op === "delete") {
          entry.after = null;
        } else if (w.op === "set") {
          if (!isPlainObject(w.data)) fail("invalid-argument", "set needs an object");
          entry.after = w.merge ? deepMerge(entry.after, w.data, now) : resolveValue(w.data, undefined, now);
        } else if (w.op === "update") {
          if (!entry.after) fail("not-found", `No document to update: ${key}`);
          if (!isPlainObject(w.data)) fail("invalid-argument", "update needs an object");
          entry.after = applyUpdate(entry.after, w.data, now);
        } else {
          fail("invalid-argument", `unknown op ${w.op}`);
        }
      }

      const changes = [];
      for (const e of staged.values()) {
        const before = e.row ? e.row.data : null;
        if (!before && !e.after) continue;
        const op = !before ? "create" : e.after ? "update" : "delete";
        const ok = await allowed(ctx, op, e.collection, { id: e.id, res: before, req: e.after });
        if (!ok) fail("permission-denied", `Missing or insufficient permissions (${op} ${e.collection}/${e.id}).`);
        changes.push({ ...e, before, op });
      }

      const results = await db.tx(async (t) => {
        const out = [];
        for (const c of changes) {
          if (c.op === "delete") {
            await t.deleteDoc(c.collection, c.id);
            out.push({ collection: c.collection, id: c.id, version: 0 });
            continue;
          }
          const version = (c.row ? c.row.version : 0) + 1;
          await t.putDoc({
            collection: c.collection,
            id: c.id,
            shopId: shopIdForRow(c.collection, c.id, c.after),
            data: c.after,
            version,
            createdAt: c.row ? c.row.createdAt : now,
            updatedAt: now,
          });
          out.push({ collection: c.collection, id: c.id, version });
        }
        return out;
      });

      const versions = new Map(results.map((r) => [`${r.collection}/${r.id}`, r.version]));
      for (const c of changes) {
        bus.emit("change", {
          collection: c.collection,
          id: c.id,
          before: c.before,
          after: c.after,
          version: versions.get(`${c.collection}/${c.id}`) || 0,
          updateTime: now,
        });
      }
      return { commitTime: now, results };
    });
  }

  // Listener snapshots run under the commit lock so no write lands between
  // the snapshot read and the listener starting to receive change events.
  const snapshotQuery = (uid, q) => lock(() => runQuery(uid, q));
  const snapshotDoc = (uid, collection, id) => lock(() => getDocument(uid, collection, id));

  async function assertShopOwner(uid, shopId) {
    const ctx = await ctxFor(uid);
    if (!shopId || !(await isOwnerOfShop(ctx, shopId))) fail("permission-denied", "Only the shop owner can back up or restore this shop.");
  }

  // Full copy of one shop: every collection, every document, as stored.
  async function exportShop(uid, shopId) {
    shopId = String(shopId || "");
    await assertShopOwner(uid, shopId);
    const collections = {};
    let documentCount = 0;
    for (const name of Object.keys(RULES)) {
      const rows = SINGLE_DOC_PER_SHOP.has(name) ? [await db.getDoc(name, shopId)].filter(Boolean) : await db.listDocs(name, shopId);
      if (!rows.length) continue;
      collections[name] = rows.map((r) => ({ id: r.id, data: r.data }));
      documentCount += rows.length;
    }
    return { format: BACKUP_FORMAT, version: 1, shopId, createdAt: new Date().toISOString(), documentCount, collections };
  }

  // Writes the backup's documents back (overwriting current versions).
  // Documents created after the backup are kept; anything that does not
  // belong to this shop, or now belongs to another shop, is skipped.
  function restoreShop(uid, backup) {
    if (backup?.format !== BACKUP_FORMAT || backup.version !== 1 || !isPlainObject(backup.collections)) {
      fail("invalid-argument", "This is not an S4 shop backup file.");
    }
    const shopId = String(backup.shopId || "");
    return lock(async () => {
      await assertShopOwner(uid, shopId);
      const now = new Date().toISOString();
      const plan = [];
      let unchanged = 0;
      let skipped = 0;
      for (const [collection, docs] of Object.entries(backup.collections)) {
        if (!RULES[collection] || !Array.isArray(docs)) {
          skipped += Array.isArray(docs) ? docs.length : 0;
          continue;
        }
        for (const d of docs) {
          const id = String(d?.id ?? "");
          if (!isPlainObject(d?.data) || !ID_RE.test(id) || shopIdForRow(collection, id, d.data) !== shopId) {
            skipped += 1;
            continue;
          }
          const row = await db.getDoc(collection, id);
          if (row && row.shopId !== shopId) {
            skipped += 1;
            continue;
          }
          if (row && deepEqual(row.data, d.data)) {
            unchanged += 1;
            continue;
          }
          plan.push({ collection, id, row, data: d.data });
        }
      }

      const versions = await db.tx(async (t) => {
        const out = [];
        for (const p of plan) {
          const version = (p.row ? p.row.version : 0) + 1;
          await t.putDoc({ collection: p.collection, id: p.id, shopId, data: p.data, version, createdAt: p.row ? p.row.createdAt : now, updatedAt: now });
          out.push(version);
        }
        return out;
      });

      plan.forEach((p, i) => {
        bus.emit("change", { collection: p.collection, id: p.id, before: p.row ? p.row.data : null, after: p.data, version: versions[i], updateTime: now });
      });
      return { restored: plan.length, unchanged, skipped, restoredAt: now };
    });
  }

  return { bus, ctxFor, canRead, getDocument, runQuery, commit, validateQuery, snapshotQuery, snapshotDoc, exportShop, restoreShop };
}
