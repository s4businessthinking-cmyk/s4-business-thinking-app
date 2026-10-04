const env = process.env;

const production = env.NODE_ENV === "production";

export const config = {
  production,
  host: env.HOST || "127.0.0.1",
  port: Number(env.PORT || 8710),
  dbDriver: env.DB_DRIVER || (production ? "mysql" : "sqlite"),
  sqlitePath: env.SQLITE_PATH || "./data/s4erp.sqlite",
  mysql: {
    host: env.MYSQL_HOST || "127.0.0.1",
    port: Number(env.MYSQL_PORT || 3306),
    user: env.MYSQL_USER || "s4erp",
    password: env.MYSQL_PASSWORD || "",
    database: env.MYSQL_DATABASE || "s4erp",
  },
  jwtSecret: env.JWT_SECRET || "",
  idTokenTtlSec: Number(env.ID_TOKEN_TTL_SEC || 60 * 60),
  refreshTokenTtlSec: Number(env.REFRESH_TOKEN_TTL_SEC || 90 * 24 * 60 * 60),
  maxBodyBytes: Number(env.MAX_BODY_BYTES || 15 * 1024 * 1024),
  trustProxy: env.TRUST_PROXY !== "0",
};

export function assertConfig(cfg = config) {
  if (cfg.production && cfg.jwtSecret.length < 32) {
    throw new Error("JWT_SECRET must be set to at least 32 random characters in production.");
  }
  if (!cfg.jwtSecret) {
    cfg.jwtSecret = "dev-only-insecure-secret-change-me-0123456789";
  }
}
