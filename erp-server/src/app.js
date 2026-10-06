import { openDb } from "./db/index.js";
import { createAuthService } from "./auth.js";
import { createStore } from "./store.js";
import { createHttpServer } from "./http.js";
import { attachRealtime } from "./realtime.js";
import { createMailer } from "./mailer.js";
import { createPinResetService } from "./pinReset.js";

export async function startServer(cfg) {
  const db = await openDb(cfg);
  const sendMail = createMailer(cfg);
  const auth = createAuthService({ db, cfg, sendMail });
  const store = createStore({ db });
  const pinReset = createPinResetService({ db, store, sendMail });
  const server = createHttpServer({ cfg, auth, store, pinReset });
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
