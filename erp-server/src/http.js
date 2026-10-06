import http from "node:http";
import zlib from "node:zlib";
import { promisify } from "node:util";
import { ApiError, fail } from "./errors.js";

const RESTORE_MAX_BYTES = 300 * 1024 * 1024;
const GZIP_RESPONSE_MIN_BYTES = 64 * 1024;

// `limit` applies to the decoded body, so a gzip upload cannot expand past it.
function readJson(req, limit) {
  return new Promise((resolve, reject) => {
    const gzip = String(req.headers["content-encoding"] || "").toLowerCase() === "gzip";
    const source = gzip ? req.pipe(zlib.createGunzip()) : req;
    let size = 0;
    let done = false;
    const chunks = [];
    const stop = (error) => {
      if (done) return;
      done = true;
      reject(error);
      req.destroy();
    };
    source.on("data", (chunk) => {
      size += chunk.length;
      if (size > limit) return stop(new ApiError("invalid-argument", "request body too large"));
      chunks.push(chunk);
    });
    source.on("end", () => {
      if (done) return;
      done = true;
      if (!chunks.length) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch {
        reject(new ApiError("invalid-argument", "invalid JSON"));
      }
    });
    source.on("error", () => stop(new ApiError("invalid-argument", "could not decode request body")));
    req.on("error", (error) => stop(error));
  });
}

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Content-Encoding, Authorization",
  "Access-Control-Max-Age": "86400",
};

const gzipAsync = promisify(zlib.gzip);

async function send(req, res, status, body) {
  let payload = Buffer.from(JSON.stringify(body), "utf8");
  const headers = { ...CORS, "Content-Type": "application/json; charset=utf-8", Vary: "Accept-Encoding" };
  if (payload.length >= GZIP_RESPONSE_MIN_BYTES && /\bgzip\b/.test(String(req.headers["accept-encoding"] || ""))) {
    payload = await gzipAsync(payload);
    headers["Content-Encoding"] = "gzip";
  }
  headers["Content-Length"] = payload.length;
  res.writeHead(status, headers);
  res.end(payload);
}

export function createHttpServer({ cfg, auth, store, pinReset }) {
  const clientIp = (req) => {
    const fwd = cfg.trustProxy ? String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() : "";
    return fwd || req.socket.remoteAddress || "";
  };

  const requireUid = (req) => {
    const header = String(req.headers.authorization || "");
    const claims = header.startsWith("Bearer ") ? auth.verifyIdToken(header.slice(7)) : null;
    if (!claims) fail("unauthenticated", "Sign in again.");
    return claims.sub;
  };

  const optionalUid = (req) => {
    const header = String(req.headers.authorization || "");
    if (!header.startsWith("Bearer ")) return null;
    const claims = auth.verifyIdToken(header.slice(7));
    if (!claims) fail("unauthenticated", "Sign in again.");
    return claims.sub;
  };

  const isShopOwner = async (uid) => {
    if (!uid) return false;
    const profile = await store.getDocument(uid, "users", uid);
    return profile?.data?.role === "owner";
  };

  const routes = {
    "GET /": async () => ({ ok: true, service: "S4 Business Thinking ERP server", message: "Server is running. Use the S4 Business Thinking app to connect." }),
    "GET /health": async () => ({ ok: true, time: new Date().toISOString() }),
    "POST /v1/auth/signup-code": async (req, body) => auth.requestSignupCode(body, clientIp(req)),
    "POST /v1/auth/signup": async (req, body) => auth.signUp(body, clientIp(req), { byShopOwner: await isShopOwner(optionalUid(req)) }),
    "POST /v1/auth/login": async (req, body) => auth.signIn(body, clientIp(req)),
    "POST /v1/auth/refresh": async (req, body) => auth.refresh(body),
    "POST /v1/auth/logout": async (req, body) => auth.signOut(body),
    "POST /v1/auth/change-password": async (req, body) => auth.changePassword(requireUid(req), body),
    "POST /v1/db/get": async (req, body) => ({ doc: await store.getDocument(optionalUid(req), body.collection, body.id) }),
    "POST /v1/db/query": async (req, body) => ({ docs: await store.runQuery(optionalUid(req), body) }),
    "POST /v1/db/commit": async (req, body) => store.commit(requireUid(req), body.writes, body.preconditions),
    "POST /v1/backup/export": async (req, body) => store.exportShop(requireUid(req), body.shopId),
    "POST /v1/backup/restore": async (req, body) => store.restoreShop(requireUid(req), body.backup),
    "POST /v1/pin/request-code": async (req) => pinReset.requestCode(requireUid(req)),
    "POST /v1/pin/verify-code": async (req, body) => pinReset.verifyCode(requireUid(req), body),
  };
  const bodyLimit = (path) => (path === "/v1/backup/restore" ? RESTORE_MAX_BYTES : cfg.maxBodyBytes);

  return http.createServer(async (req, res) => {
    if (req.method === "OPTIONS") {
      res.writeHead(204, CORS);
      res.end();
      return;
    }
    const url = new URL(req.url, "http://x");
    const handler = routes[`${req.method} ${url.pathname}`];
    if (!handler) {
      await send(req, res, 404, { error: { code: "not-found", message: "no such endpoint" } });
      return;
    }
    try {
      const body = req.method === "POST" ? await readJson(req, bodyLimit(url.pathname)) : {};
      await send(req, res, 200, await handler(req, body));
    } catch (error) {
      if (res.headersSent) {
        console.error("[S4 ERP] response failed", req.method, url.pathname, error);
        res.destroy();
        return;
      }
      if (error instanceof ApiError) {
        await send(req, res, error.status, { error: { code: error.code, message: error.message } });
        return;
      }
      console.error("[S4 ERP] request failed", req.method, url.pathname, error);
      await send(req, res, 500, { error: { code: "internal", message: "internal error" } });
    }
  });
}
