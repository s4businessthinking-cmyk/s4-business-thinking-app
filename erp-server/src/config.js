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
  smtp: {
    host: env.SMTP_HOST || "",
    port: Number(env.SMTP_PORT || 587),
    user: env.SMTP_USER || "",
    pass: env.SMTP_PASS || "",
    from: env.SMTP_FROM || "",
  },
  autoRemindersEnabled: env.S4_AUTO_REMINDERS !== "0",
  autoRemindersIntervalMs: Number(env.S4_AUTO_REMINDERS_MS || 15 * 60 * 1000),
  autoRemindersTz: env.S4_REMINDER_TZ || "",
  corsAllowedOrigins: (() => {
    const raw = String(env.CORS_ALLOWED_ORIGINS || "").trim();
    if (raw) {
      return raw.split(",").map((s) => s.trim()).filter(Boolean);
    }
    if (production) {
      return [
        "https://erp.s4businessthinking.com",
        "https://app.s4businessthinking.com",
        "https://s4businessthinking.com",
      ];
    }
    return ["*"];
  })(),
  revokedLicenseIds: env.S4_REVOKED_LICENSE_IDS || "",
  trialDays: Number(env.S4_TRIAL_DAYS || 15),
};

const WEAK_JWT = /dev-only|change-me|test-secret/i;

export function assertConfig(cfg = config) {
  const secret = String(cfg.jwtSecret || "");
  if (cfg.production && (secret.length < 32 || WEAK_JWT.test(secret))) {
    throw new Error("JWT_SECRET must be set to at least 32 random characters in production.");
  }
  if (!secret) {
    cfg.jwtSecret = "dev-only-insecure-secret-change-me-0123456789";
  }
}
