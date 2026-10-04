import { config, assertConfig } from "./config.js";
import { startServer } from "./app.js";

assertConfig(config);
const app = await startServer(config);
console.log(`[S4 ERP] listening on http://${config.host}:${app.port} (db: ${app.db.driver})`);

const shutdown = async (signal) => {
  console.log(`[S4 ERP] ${signal} received, shutting down`);
  await app.close().catch((error) => console.error(error));
  process.exit(0);
};
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
