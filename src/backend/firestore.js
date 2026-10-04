// Firestore-compatible client for the S4 ERP server (erp-server/).
// Same function names and snapshot shapes as the "firebase/firestore"
// subset the app uses; reads/writes go over HTTPS and listeners over one
// shared WebSocket that receives only per-document deltas.
import { API_BASE, REALTIME_URL } from "./config.js";
import { defaultAuth } from "./auth.js";

export class FirestoreError extends Error {
  constructor(code, message) {
    super(message || code);
    this.name = "FirebaseError";
    this.code = code;
  }
}

const db = { type: "firestore", app: { name: "[DEFAULT]" } };
export function getFirestore() {
  return db;
}
export function initializeFirestore() {
  return db;
}

// ---------------------------------------------------------------- references

const AUTO_ID_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
function autoId() {
  const bytes = new Uint8Array(20);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => AUTO_ID_CHARS[b % AUTO_ID_CHARS.length]).join("");
}

class Query {
  constructor(q) {
    this.type = "query";
    this.firestore = db;
    this._q = q;
  }
}

class CollectionReference extends Query {
  constructor(name) {
    super({ collection: name, filters: [], orderBy: [], limit: null });
    this.type = "collection";
    this.id = name;
    this.path = name;
  }
}

class DocumentReference {
  constructor(collectionName, id) {
    this.type = "document";
    this.firestore = db;
    this.id = String(id);
    this.path = `${collectionName}/${this.id}`;
    this._collection = collectionName;
  }
  get parent() {
    return new CollectionReference(this._collection);
  }
}

function splitPath(segments) {
  return segments.flatMap((s) => String(s).split("/")).filter(Boolean);
}

export function collection(base, ...segments) {
  const parts = splitPath(segments);
  if (parts.length !== 1) throw new FirestoreError("invalid-argument", `Unsupported collection path: ${parts.join("/")}`);
  return new CollectionReference(parts[0]);
}

export function doc(base, ...segments) {
  if (base instanceof CollectionReference) {
    return new DocumentReference(base.id, segments.length ? segments[0] : autoId());
  }
  const parts = splitPath(segments);
  if (parts.length !== 2) throw new FirestoreError("invalid-argument", `Unsupported document path: ${parts.join("/")}`);
  return new DocumentReference(parts[0], parts[1]);
}

export function where(field, op, value) {
  return { _kind: "where", field: String(field), op, value };
}
export function orderBy(field, dir = "asc") {
  return { _kind: "orderBy", field: String(field), dir };
}
export function limit(n) {
  return { _kind: "limit", n: Number(n) };
}
export function documentId() {
  return "__name__";
}

export function query(base, ...constraints) {
  const q = { ...base._q, filters: [...base._q.filters], orderBy: [...base._q.orderBy] };
  for (const c of constraints.flat()) {
    if (!c) continue;
    if (c._kind === "where") q.filters.push([c.field, c.op, encodeValue(c.value)]);
    else if (c._kind === "orderBy") q.orderBy.push([c.field, c.dir]);
    else if (c._kind === "limit") q.limit = c.n;
  }
  return new Query(q);
}

// ---------------------------------------------------------------- values

class FieldValue {
  constructor(wire) {
    this._wire = wire;
  }
}
export const serverTimestamp = () => new FieldValue({ __s4op: "serverTimestamp" });
export const deleteField = () => new FieldValue({ __s4op: "delete" });
export const increment = (n) => new FieldValue({ __s4op: "increment", n: Number(n) });
export const arrayUnion = (...items) => new FieldValue({ __s4op: "arrayUnion", items: items.map(encodeValue) });
export const arrayRemove = (...items) => new FieldValue({ __s4op: "arrayRemove", items: items.map(encodeValue) });

function encodeValue(value) {
  if (value instanceof FieldValue) return value._wire;
  if (value instanceof Date) return value.toISOString();
  if (value && typeof value.toDate === "function") return value.toDate().toISOString();
  if (Array.isArray(value)) return value.map(encodeValue);
  if (value && typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) if (v !== undefined) out[k] = encodeValue(v);
    return out;
  }
  return value;
}

// ---------------------------------------------------------------- transport

// `init.rawBody`/`init.headers` let callers send a pre-encoded (e.g. gzip) body.
export const callServer = (path, body, init) => call(path, body, false, init);

async function call(path, body, retried = false, init = {}) {
  const user = defaultAuth.currentUser;
  let token = null;
  if (user) {
    try {
      token = await user.getIdToken(retried);
    } catch (error) {
      if (error?.code === "auth/network-request-failed") throw new FirestoreError("unavailable", "Could not reach the S4 server.");
    }
  }
  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...init.headers, ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: init.rawBody ?? JSON.stringify(body),
    });
  } catch {
    throw new FirestoreError("unavailable", "Could not reach the S4 server.");
  }
  const json = await res.json().catch(() => ({}));
  if (res.status === 401 && user && !retried) return call(path, body, true, init);
  if (!res.ok) throw new FirestoreError(json?.error?.code || "internal", json?.error?.message || `HTTP ${res.status}`);
  return json;
}

// ---------------------------------------------------------------- snapshots

const METADATA = Object.freeze({ fromCache: false, hasPendingWrites: false, isEqual: (o) => !!o && !o.fromCache && !o.hasPendingWrites });

function getField(data, path) {
  let cur = data;
  for (const part of String(path).split(".")) {
    if (cur === null || typeof cur !== "object") return undefined;
    cur = cur[part];
  }
  return cur;
}

class DocumentSnapshot {
  constructor(ref, wire) {
    this.ref = ref;
    this.id = ref.id;
    this.metadata = METADATA;
    this._data = wire ? wire.data : undefined;
    this._version = wire ? wire.version : 0;
  }
  exists() {
    return this._data !== undefined && this._data !== null;
  }
  data() {
    return this.exists() ? structuredClone(this._data) : undefined;
  }
  get(field) {
    return this.exists() ? structuredClone(getField(this._data, field)) : undefined;
  }
}

class QuerySnapshot {
  constructor(queryRef, docs, changes) {
    this.query = queryRef;
    this.docs = docs;
    this.size = docs.length;
    this.empty = docs.length === 0;
    this.metadata = METADATA;
    this._changes = changes;
  }
  forEach(cb, thisArg) {
    this.docs.forEach((d) => cb.call(thisArg, d));
  }
  docChanges() {
    return this._changes;
  }
}

const TYPE_ORDER = (v) => (v === null ? 0 : typeof v === "boolean" ? 1 : typeof v === "number" ? 2 : typeof v === "string" ? 4 : Array.isArray(v) ? 7 : 8);
function compareValues(a, b) {
  const ta = TYPE_ORDER(a);
  const tb = TYPE_ORDER(b);
  if (ta !== tb) return ta - tb;
  if (ta === 7) {
    for (let i = 0; i < Math.min(a.length, b.length); i += 1) {
      const c = compareValues(a[i], b[i]);
      if (c) return c;
    }
    return a.length - b.length;
  }
  if (ta === 0 || ta === 8) return 0;
  return a === b ? 0 : a < b ? -1 : 1;
}
function sortWire(q, rows) {
  return [...rows].sort((a, b) => {
    for (const [field, dir = "asc"] of q.orderBy) {
      const c = field === "__name__" ? compareValues(a.id, b.id) : compareValues(getField(a.data, field), getField(b.data, field));
      if (c) return dir === "desc" ? -c : c;
    }
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

function buildQuerySnapshot(queryRef, rows, previous) {
  const docs = rows.map((w) => new DocumentSnapshot(new DocumentReference(queryRef._q.collection, w.id), w));
  const changes = [];
  const prevIndex = new Map((previous || []).map((d, i) => [d.id, { d, i }]));
  docs.forEach((d, newIndex) => {
    const prev = prevIndex.get(d.id);
    if (!prev) changes.push({ type: "added", doc: d, oldIndex: -1, newIndex });
    else {
      if (prev.d._version !== d._version) changes.push({ type: "modified", doc: d, oldIndex: prev.i, newIndex });
      prevIndex.delete(d.id);
    }
  });
  for (const { d, i } of prevIndex.values()) changes.push({ type: "removed", doc: d, oldIndex: i, newIndex: -1 });
  return new QuerySnapshot(queryRef, docs, changes);
}

// ---------------------------------------------------------------- reads

export async function getDoc(ref) {
  const res = await call("/v1/db/get", { collection: ref._collection, id: ref.id });
  return new DocumentSnapshot(ref, res.doc);
}

export async function getDocs(queryRef) {
  const res = await call("/v1/db/query", queryRef._q);
  return buildQuerySnapshot(queryRef, res.docs || [], null);
}

export const getDocFromServer = getDoc;
export const getDocsFromServer = getDocs;

// ---------------------------------------------------------------- writes

function setWrite(ref, data, options) {
  return { op: "set", collection: ref._collection, id: ref.id, data: encodeValue(data), merge: !!(options?.merge || options?.mergeFields) };
}

function updateWrite(ref, fieldOrData, rest) {
  let data = fieldOrData;
  if (typeof fieldOrData === "string") {
    data = { [fieldOrData]: rest[0] };
    for (let i = 1; i + 1 < rest.length; i += 2) data[rest[i]] = rest[i + 1];
  }
  return { op: "update", collection: ref._collection, id: ref.id, data: encodeValue(data) };
}

const deleteWrite = (ref) => ({ op: "delete", collection: ref._collection, id: ref.id });

const commit = (writes, preconditions) => call("/v1/db/commit", { writes, preconditions });

export async function setDoc(ref, data, options) {
  await commit([setWrite(ref, data, options)]);
}

export async function updateDoc(ref, fieldOrData, ...rest) {
  await commit([updateWrite(ref, fieldOrData, rest)]);
}

export async function deleteDoc(ref) {
  await commit([deleteWrite(ref)]);
}

export async function addDoc(collectionRef, data) {
  const ref = doc(collectionRef);
  await setDoc(ref, data);
  return ref;
}

export function writeBatch() {
  const writes = [];
  let committed = false;
  const batch = {
    set(ref, data, options) {
      writes.push(setWrite(ref, data, options));
      return batch;
    },
    update(ref, fieldOrData, ...rest) {
      writes.push(updateWrite(ref, fieldOrData, rest));
      return batch;
    },
    delete(ref) {
      writes.push(deleteWrite(ref));
      return batch;
    },
    async commit() {
      if (committed) throw new FirestoreError("failed-precondition", "A write batch can only be committed once.");
      committed = true;
      if (writes.length) await commit(writes);
    },
  };
  return batch;
}

export async function runTransaction(_db, updateFunction, options = {}) {
  const maxAttempts = Number(options.maxAttempts || 5);
  let lastError = null;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const reads = new Map();
    const writes = [];
    const tx = {
      async get(ref) {
        const snap = await getDoc(ref);
        if (!reads.has(ref.path)) reads.set(ref.path, { collection: ref._collection, id: ref.id, version: snap._version });
        return snap;
      },
      set(ref, data, opts) {
        writes.push(setWrite(ref, data, opts));
        return tx;
      },
      update(ref, fieldOrData, ...rest) {
        writes.push(updateWrite(ref, fieldOrData, rest));
        return tx;
      },
      delete(ref) {
        writes.push(deleteWrite(ref));
        return tx;
      },
    };
    const result = await updateFunction(tx);
    if (!writes.length) return result;
    try {
      await commit(writes, [...reads.values()]);
      return result;
    } catch (error) {
      if (error?.code !== "aborted") throw error;
      lastError = error;
      await new Promise((r) => setTimeout(r, 50 * (attempt + 1) + Math.random() * 100));
    }
  }
  throw lastError || new FirestoreError("aborted", "Transaction failed after retries.");
}

// ---------------------------------------------------------------- realtime

const RECONNECT_DELAYS_MS = [500, 1000, 2000, 5000, 10000, 20000, 30000];

const realtime = (() => {
  const subs = new Map();
  let ws = null;
  let ready = false;
  let attempt = 0;
  let reconnectTimer = null;
  let nextId = 1;
  let forceRefresh = false;

  const sendSub = (id, sub) => {
    if (!ready || !ws) return;
    ws.send(JSON.stringify(sub.kind === "doc" ? { t: "sub", id, doc: { collection: sub.ref._collection, id: sub.ref.id } } : { t: "sub", id, q: sub.queryRef._q }));
  };

  function scheduleReconnect(delay) {
    if (reconnectTimer || !subs.size) return;
    const wait = delay ?? RECONNECT_DELAYS_MS[Math.min(attempt, RECONNECT_DELAYS_MS.length - 1)];
    attempt += 1;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      connect();
    }, wait);
  }

  function drop() {
    ready = false;
    if (ws) {
      const old = ws;
      ws = null;
      old.onclose = old.onmessage = old.onerror = old.onopen = null;
      try {
        old.close();
      } catch {}
    }
  }

  async function connect() {
    if (ws || !subs.size) return;
    const user = defaultAuth.currentUser;
    if (!user) return;
    let token;
    try {
      token = await user.getIdToken(forceRefresh);
      forceRefresh = false;
    } catch {
      scheduleReconnect();
      return;
    }
    if (ws || !subs.size || defaultAuth.currentUser !== user) return;
    const socket = new WebSocket(REALTIME_URL);
    ws = socket;
    socket.onopen = () => socket.send(JSON.stringify({ t: "auth", token }));
    socket.onmessage = (event) => {
      let msg;
      try {
        msg = JSON.parse(event.data);
      } catch {
        return;
      }
      if (msg.t === "ready") {
        ready = true;
        attempt = 0;
        for (const [id, sub] of subs) sendSub(id, sub);
        return;
      }
      if (msg.t === "err" && !msg.id) {
        if (msg.code === "unauthenticated") forceRefresh = true;
        return;
      }
      const sub = subs.get(msg.id);
      if (!sub) return;
      if (msg.t === "snap") sub.onSnap(msg.docs || []);
      else if (msg.t === "chg") sub.onChanges(msg.changes || []);
      else if (msg.t === "err") {
        subs.delete(msg.id);
        sub.onError(new FirestoreError(msg.code || "internal", msg.message));
      }
    };
    socket.onclose = (event) => {
      if (ws !== socket) return;
      ws = null;
      ready = false;
      if (event.code === 4401) forceRefresh = true;
      scheduleReconnect();
    };
    socket.onerror = () => {};
  }

  defaultAuth.onAuthStateChanged(() => {
    drop();
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
    attempt = 0;
    connect();
  });

  if (typeof window !== "undefined") {
    window.addEventListener("online", () => {
      if (ws && ready) return;
      drop();
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
      attempt = 0;
      connect();
    });
  }

  return {
    add(sub) {
      const id = `s${nextId++}`;
      subs.set(id, sub);
      if (ws && ready) sendSub(id, sub);
      else connect();
      return id;
    },
    remove(id) {
      if (!subs.delete(id)) return;
      if (ws && ready) ws.send(JSON.stringify({ t: "unsub", id }));
      if (!subs.size) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
    },
    resend(id) {
      const sub = subs.get(id);
      if (sub) sendSub(id, sub);
    },
  };
})();

function safeCall(fn, arg) {
  if (typeof fn !== "function") return;
  try {
    fn(arg);
  } catch (error) {
    console.error("[S4 Realtime] snapshot callback failed", error);
  }
}

export function onSnapshot(target, ...args) {
  if (args[0] && typeof args[0] === "object" && typeof args[0] !== "function" && !("next" in args[0]) && !("error" in args[0])) args.shift();
  let onNext;
  let onError;
  if (args[0] && typeof args[0] === "object") {
    onNext = args[0].next?.bind(args[0]);
    onError = args[0].error?.bind(args[0]);
  } else {
    [onNext, onError] = args;
  }

  let active = true;
  let id = null;
  const rows = new Map();

  if (target instanceof DocumentReference) {
    const sub = {
      kind: "doc",
      ref: target,
      onSnap(docs) {
        rows.clear();
        if (docs[0]) rows.set(target.id, docs[0]);
        if (active) safeCall(onNext, new DocumentSnapshot(target, rows.get(target.id) || null));
      },
      onChanges(changes) {
        for (const c of changes) {
          if (c.type === "removed") rows.delete(target.id);
          else rows.set(target.id, { id: c.id, data: c.data, version: c.version });
        }
        if (active) safeCall(onNext, new DocumentSnapshot(target, rows.get(target.id) || null));
      },
      onError(error) {
        if (active) safeCall(onError || ((e) => console.error("[S4 Realtime]", e)), error);
      },
    };
    id = realtime.add(sub);
  } else {
    const q = target._q;
    let lastDocs = null;
    const emit = () => {
      if (!active) return;
      let sorted = sortWire(q, [...rows.values()]);
      if (q.limit) sorted = sorted.slice(0, q.limit);
      const snap = buildQuerySnapshot(target, sorted, lastDocs);
      lastDocs = snap.docs;
      safeCall(onNext, snap);
    };
    const sub = {
      kind: "query",
      queryRef: target,
      onSnap(docs) {
        rows.clear();
        for (const d of docs) rows.set(d.id, d);
        emit();
      },
      onChanges(changes) {
        let needsResync = false;
        for (const c of changes) {
          if (c.type === "removed") {
            rows.delete(c.id);
            if (q.limit && rows.size < q.limit) needsResync = true;
          } else rows.set(c.id, { id: c.id, data: c.data, version: c.version });
        }
        if (needsResync) realtime.resend(id);
        else emit();
      },
      onError(error) {
        if (active) safeCall(onError || ((e) => console.error("[S4 Realtime]", e)), error);
      },
    };
    id = realtime.add(sub);
  }

  return () => {
    if (!active) return;
    active = false;
    realtime.remove(id);
  };
}
