import { openDb } from "./db/index.js";
import { createAuthService } from "./auth.js";
import { createStore } from "./store.js";
import { createHttpServer } from "./http.js";
import { attachRealtime } from "./realtime.js";

export async function startServer(cfg) {
  const db = await openDb(cfg);
  const auth = createAuthService({ db, cfg });
  const store = createStore({ db });
  const server = createHttpServer({ cfg, auth, store });
  const realtime = attachRealtime({ server, store, auth });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(cfg.port, cfg.host, resolve);
  });

  return {
    server,
    db,
    store,
    port: server.address().port,
    async close() {
      realtime.close();
      await new Promise((resolve) => server.close(resolve));
      await db.close();
    },
  };
}
