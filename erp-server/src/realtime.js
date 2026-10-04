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
  const wss = new WebSocketServer({ noServer: true, maxPayload: 256 * 1024 });
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
          if (msg.doc) {
            const sub = { kind: "doc", collection: msg.doc.collection, docId: String(msg.doc.id), ids: new Set() };
            conn.subs.set(msg.id, sub);
            const doc = await store.snapshotDoc(conn.uid, sub.collection, sub.docId);
            if (doc) sub.ids.add(doc.id);
            sub.ready = true;
            if (conn.subs.get(msg.id) === sub) send({ t: "snap", id: msg.id, docs: doc ? [doc] : [] });
            return;
          }
          const q = store.validateQuery(msg.q);
          const sub = { kind: "query", q, collection: q.collection, ids: new Set() };
          conn.subs.set(msg.id, sub);
          const docs = await store.snapshotQuery(conn.uid, q);
          docs.forEach((d) => sub.ids.add(d.id));
          sub.ready = true;
          if (conn.subs.get(msg.id) === sub) send({ t: "snap", id: msg.id, docs });
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

  const inOrder = createMutex();
  store.bus.on("change", (evt) => inOrder(() => deliver(evt)));

  async function deliver(evt) {
    for (const conn of conns) {
      if (!conn.uid) continue;
      if (evt.collection === "users" && evt.id === conn.uid) conn.ctx = null;
      if (evt.collection === "shops" || evt.collection === "productMaintenance") conn.ctx = null;
      // A listener still waiting for its snapshot gets this write inside that snapshot.
      const relevant = [...conn.subs.entries()].filter(([, s]) => s.ready && s.collection === evt.collection && (s.kind === "query" || s.docId === evt.id));
      if (!relevant.length) continue;
      let ctx;
      try {
        ctx = await contextFor(conn);
      } catch {
        continue;
      }
      const readable = evt.after ? await store.canRead(ctx, evt.collection, evt.id, evt.after) : false;
      for (const [subId, sub] of relevant) {
        if (conn.subs.get(subId) !== sub) continue;
        const was = sub.ids.has(evt.id);
        const now = readable && (sub.kind === "doc" || matchesQuery(sub.q, evt.id, evt.after));
        let change = null;
        if (now) {
          change = { type: was ? "modified" : "added", id: evt.id, data: evt.after, version: evt.version, updateTime: evt.updateTime };
          sub.ids.add(evt.id);
        } else if (was) {
          change = { type: "removed", id: evt.id };
          sub.ids.delete(evt.id);
        }
        if (!change) continue;
        if (!conn.pending.has(subId)) conn.pending.set(subId, []);
        conn.pending.get(subId).push(change);
      }
      if (conn.pending.size && !conn.flushScheduled) {
        conn.flushScheduled = true;
        setImmediate(() => flush(conn));
      }
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
