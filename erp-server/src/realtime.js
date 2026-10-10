// onSnapshot replacement. Protocol (JSON messages):
//   client: { t:"auth", token } | { t:"sub", id, q } | { t:"sub", id, doc:{collection,id} } | { t:"unsub", id }
//   server: { t:"ready", uid } | { t:"snap", id, docs } | { t:"chg", id, changes:[{type,id,data?,version}] } | { t:"err", id?, code, message }
// After the initial snapshot only deltas are sent, so a 5,000-product
// listener costs one small message per changed product.
import { WebSocketServer } from "ws";
import { matchesQuery } from "./query.js";
import { createMutex } from "./util.js";

const CTX_TTL_MS = 5000;

export function attachRealtime({ server, store, auth, path = "/v1/realtime" }) {
  const wss = new WebSocketServer({
    noServer: true,
    maxPayload: 256 * 1024,
    perMessageDeflate: { threshold: 1024, zlibDeflateOptions: { level: 6 }, serverNoContextTakeover: true, clientNoContextTakeover: true },
  });
  const conns = new Set();

  server.on("upgrade", (req, socket, head) => {
    const url = new URL(req.url, "http://x");
    if (url.pathname !== path) {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws));
  });

  wss.on("connection", (ws) => {
    const conn = { ws, uid: null, subs: new Map(), ctx: null, ctxAt: 0, pending: new Map(), alive: true };
    conns.add(conn);

    const send = (msg) => {
      if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
    };
    conn.send = send;

    const authTimer = setTimeout(() => {
      if (!conn.uid) ws.close(4401, "auth timeout");
    }, 10000);

    ws.on("pong", () => { conn.alive = true; });
    ws.on("error", (err) => {
      console.warn("[S4 Realtime] websocket error", err?.message || err);
      try { ws.close(1011, "server error"); } catch { /* already closed */ }
    });
    ws.on("close", () => {
      clearTimeout(authTimer);
      conns.delete(conn);
    });

    ws.on("message", async (raw) => {
      let msg;
      try {
        msg = JSON.parse(String(raw));
      } catch {
        return;
      }
      try {
        if (msg.t === "auth") {
          const claims = auth.verifyIdToken(msg.token);
          if (!claims) {
            send({ t: "err", code: "unauthenticated", message: "invalid or expired token" });
            ws.close(4401, "unauthenticated");
            return;
          }
          conn.uid = claims.sub;
          conn.ctx = null;
          clearTimeout(authTimer);
          send({ t: "ready", uid: conn.uid });
          return;
        }
        if (!conn.uid) {
          send({ t: "err", id: msg.id, code: "unauthenticated", message: "send auth first" });
          return;
        }
        if (msg.t === "unsub") {
          conn.subs.delete(msg.id);
          return;
        }
        if (msg.t === "sub") {
          if (conn.subs.size >= 200) throw Object.assign(new Error("too many listeners"), { code: "resource-exhausted" });
          let sub;
          let docs;
          if (msg.doc) {
            sub = { kind: "doc", collection: msg.doc.collection, docId: String(msg.doc.id), ids: new Set(), buffered: [] };
            conn.subs.set(msg.id, sub);
            const doc = await store.snapshotDoc(conn.uid, sub.collection, sub.docId);
            docs = doc ? [doc] : [];
          } else {
            const q = store.validateQuery(msg.q);
            sub = { kind: "query", q, collection: q.collection, ids: new Set(), buffered: [] };
            conn.subs.set(msg.id, sub);
            docs = await store.snapshotQuery(conn.uid, q);
          }
          // The snapshot is read without blocking writes; writes delivered meanwhile were
          // buffered and are replayed here when they are newer than what the snapshot saw.
          await inOrder(async () => {
            if (conn.subs.get(msg.id) !== sub) return;
            const seen = new Map(docs.map((d) => [d.id, d]));
            docs.forEach((d) => sub.ids.add(d.id));
            sub.ready = true;
            send({ t: "snap", id: msg.id, docs });
            const buffered = sub.buffered;
            sub.buffered = null;
            if (!buffered.length) return;
            const ctx = await contextFor(conn);
            for (const evt of buffered) {
              const snapDoc = seen.get(evt.id);
              if (snapDoc && !isNewer(evt, snapDoc)) continue;
              await applyEvent(conn, msg.id, sub, evt, makeReadCheck(ctx, evt));
            }
            scheduleFlush(conn);
          });
        }
      } catch (error) {
        conn.subs.delete(msg.id);
        send({ t: "err", id: msg.id, code: error.code || "internal", message: error.message });
      }
    });
  });

  const contextFor = async (conn) => {
    if (!conn.ctx || Date.now() - conn.ctxAt > CTX_TTL_MS) {
      conn.ctx = await store.ctxFor(conn.uid);
      conn.ctxAt = Date.now();
    }
    return conn.ctx;
  };

  const flush = (conn) => {
    for (const [subId, changes] of conn.pending) conn.send({ t: "chg", id: subId, changes });
    conn.pending.clear();
    conn.flushScheduled = false;
  };

  const scheduleFlush = (conn) => {
    if (conn.pending.size && !conn.flushScheduled) {
      conn.flushScheduled = true;
      setImmediate(() => flush(conn));
    }
  };

  const isNewer = (evt, snapDoc) => {
    const evtTime = String(evt.updateTime || "");
    const snapTime = String(snapDoc.updateTime || "");
    if (evtTime !== snapTime) return evtTime > snapTime;
    return Number(evt.version || 0) > Number(snapDoc.version || 0);
  };

  const makeReadCheck = (ctx, evt) => {
    const readable = {};
    const check = async (data, list, cacheKey) => {
      if (!data) return false;
      if (!(cacheKey in readable)) readable[cacheKey] = await store.canRead(ctx, evt.collection, evt.id, data, list);
      return readable[cacheKey];
    };
    const canReadAs = (list) => check(evt.after, list, `after:${list}`);
    canReadAs.before = (list) => check(evt.before, list, `before:${list}`);
    return canReadAs;
  };

  async function applyEvent(conn, subId, sub, evt, canReadAs) {
    const was = sub.ids.has(evt.id);
    const now = sub.kind === "doc"
      ? await canReadAs(false)
      : matchesQuery(sub.q, evt.id, evt.after) && (await canReadAs(true));
    let change = null;
    if (now) {
      change = { type: was ? "modified" : "added", id: evt.id, data: evt.after, version: evt.version, updateTime: evt.updateTime };
      sub.ids.add(evt.id);
    } else if (was && (await sameDocAsListed(sub, evt, canReadAs))) {
      change = { type: "removed", id: evt.id };
      sub.ids.delete(evt.id);
    }
    if (!change) return;
    if (!conn.pending.has(subId)) conn.pending.set(subId, []);
    conn.pending.get(subId).push(change);
  }

  // Another shop's document can share this id; only drop the listed doc when the change was to it.
  async function sameDocAsListed(sub, evt, canReadAs) {
    if (!evt.before) return false;
    if (sub.kind === "doc") return canReadAs.before(false);
    return matchesQuery(sub.q, evt.id, evt.before) && (await canReadAs.before(true));
  }

  const inOrder = createMutex();
  store.bus.on("change", (evt) => inOrder(() => deliver(evt)));

  async function deliver(evt) {
    for (const conn of conns) {
      if (!conn.uid) continue;
      if (evt.collection === "users" && evt.id === conn.uid) conn.ctx = null;
      if (evt.collection === "shops" || evt.collection === "productMaintenance") conn.ctx = null;
      const relevant = [];
      for (const entry of conn.subs.entries()) {
        const s = entry[1];
        if (s.collection !== evt.collection || (s.kind === "doc" && s.docId !== evt.id)) continue;
        if (s.ready) relevant.push(entry);
        else s.buffered?.push(evt);
      }
      if (!relevant.length) continue;
      let ctx;
      try {
        ctx = await contextFor(conn);
      } catch {
        continue;
      }
      const canReadAs = makeReadCheck(ctx, evt);
      for (const [subId, sub] of relevant) {
        if (conn.subs.get(subId) !== sub) continue;
        await applyEvent(conn, subId, sub, evt, canReadAs);
      }
      scheduleFlush(conn);
    }
  }

  const heartbeat = setInterval(() => {
    for (const conn of conns) {
      if (!conn.alive) {
        conn.ws.terminate();
        continue;
      }
      conn.alive = false;
      conn.ws.ping();
    }
  }, 30000);
  heartbeat.unref();

  return {
    close() {
      clearInterval(heartbeat);
      for (const conn of conns) conn.ws.terminate();
      wss.close();
    },
    connectionCount: () => conns.size,
  };
}
