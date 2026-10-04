// Firestore-compatible filtering/sorting evaluated in memory over one
// collection (already narrowed to a single shop by the storage index).
import { deepEqual } from "./util.js";
import { fail } from "./errors.js";

const OPS = new Set(["==", "!=", "<", "<=", ">", ">=", "in", "not-in", "array-contains", "array-contains-any"]);

export function getField(data, path) {
  if (path === "__name__") return undefined;
  let cur = data;
  for (const part of String(path).split(".")) {
    if (cur === null || typeof cur !== "object") return undefined;
    cur = cur[part];
  }
  return cur;
}

const TYPE_ORDER = (v) => {
  if (v === null) return 0;
  if (typeof v === "boolean") return 1;
  if (typeof v === "number") return 2;
  if (typeof v === "string") return 4;
  if (Array.isArray(v)) return 7;
  return 8;
};

export function compareValues(a, b) {
  const ta = TYPE_ORDER(a);
  const tb = TYPE_ORDER(b);
  if (ta !== tb) return ta - tb;
  if (ta === 0) return 0;
  if (ta === 1 || ta === 2) return a === b ? 0 : a < b ? -1 : 1;
  if (ta === 4) return a === b ? 0 : a < b ? -1 : 1;
  if (ta === 7) {
    for (let i = 0; i < Math.min(a.length, b.length); i += 1) {
      const c = compareValues(a[i], b[i]);
      if (c) return c;
    }
    return a.length - b.length;
  }
  return 0;
}

export function validateQuery(q) {
  if (!q || typeof q.collection !== "string" || !q.collection) fail("invalid-argument", "collection is required");
  const filters = Array.isArray(q.filters) ? q.filters : [];
  for (const f of filters) {
    if (!Array.isArray(f) || f.length !== 3 || typeof f[0] !== "string" || !OPS.has(f[1])) fail("invalid-argument", "bad filter");
    if (["in", "not-in", "array-contains-any"].includes(f[1]) && !Array.isArray(f[2])) fail("invalid-argument", `${f[1]} needs an array`);
  }
  const orderBy = Array.isArray(q.orderBy) ? q.orderBy : [];
  for (const o of orderBy) {
    if (!Array.isArray(o) || typeof o[0] !== "string" || !["asc", "desc"].includes(o[1] || "asc")) fail("invalid-argument", "bad orderBy");
  }
  const limit = q.limit === undefined || q.limit === null ? null : Number(q.limit);
  if (limit !== null && !(Number.isInteger(limit) && limit > 0)) fail("invalid-argument", "bad limit");
  return { collection: q.collection, filters, orderBy, limit };
}

function matchFilter(id, data, [field, op, value]) {
  const v = field === "__name__" ? id : getField(data, field);
  switch (op) {
    case "==": return v !== undefined && deepEqual(v, value);
    case "!=": return v !== undefined && v !== null && !deepEqual(v, value);
    case "<": return v !== undefined && TYPE_ORDER(v) === TYPE_ORDER(value) && compareValues(v, value) < 0;
    case "<=": return v !== undefined && TYPE_ORDER(v) === TYPE_ORDER(value) && compareValues(v, value) <= 0;
    case ">": return v !== undefined && TYPE_ORDER(v) === TYPE_ORDER(value) && compareValues(v, value) > 0;
    case ">=": return v !== undefined && TYPE_ORDER(v) === TYPE_ORDER(value) && compareValues(v, value) >= 0;
    case "in": return v !== undefined && value.some((x) => deepEqual(v, x));
    case "not-in": return v !== undefined && v !== null && !value.some((x) => deepEqual(v, x));
    case "array-contains": return Array.isArray(v) && v.some((x) => deepEqual(x, value));
    case "array-contains-any": return Array.isArray(v) && v.some((x) => value.some((y) => deepEqual(x, y)));
    default: return false;
  }
}

// Firestore omits documents that lack any orderBy field; callers rely on it.
export function matchesQuery(q, id, data) {
  if (!data) return false;
  if (!q.filters.every((f) => matchFilter(id, data, f))) return false;
  return q.orderBy.every(([field]) => field === "__name__" || getField(data, field) !== undefined);
}

export function sortDocs(q, docs) {
  const orders = [...q.orderBy];
  return [...docs].sort((a, b) => {
    for (const [field, dir = "asc"] of orders) {
      const c = field === "__name__" ? compareValues(a.id, b.id) : compareValues(getField(a.data, field), getField(b.data, field));
      if (c) return dir === "desc" ? -c : c;
    }
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

export function shopFilterValue(q) {
  const f = q.filters.find(([field, op]) => field === "shopId" && op === "==");
  return f ? f[2] : undefined;
}
