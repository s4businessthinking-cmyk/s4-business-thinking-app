import { createSqliteDb } from "./sqlite.js";

export async function openDb(cfg) {
  if (cfg.dbDriver === "mysql") {
    const { createMysqlDb } = await import("./mysql.js");
    return createMysqlDb(cfg.mysql);
  }
  if (cfg.dbDriver === "sqlite") return createSqliteDb(cfg.sqlitePath);
  throw new Error(`Unknown DB_DRIVER "${cfg.dbDriver}" (use "mysql" or "sqlite").`);
}
