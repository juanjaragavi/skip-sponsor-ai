// Listen port: PORT (shell or .env) wins. `npm run dev:api` falls back to the
// local-only default in package.json "config.port" (3040, so several DevSpeak
// projects can run side by side); the container (`node dist/...`, no npm)
// falls back to 3000, the port infra/Dockerfile.api exposes.
const env = process.env;
const port = Number(env["PORT"] ?? env["npm_package_config_port"] ?? 3000);

/** Numeric env var; blank or unset → default. Throws on garbage. */
function num(name: string, fallback: number): number {
  const raw = env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) throw new Error(`${name} must be a number`);
  return n;
}

const flag = (name: string): boolean =>
  ["1", "true", "yes"].includes((env[name] ?? "").toLowerCase());

const databaseUrl = env["DATABASE_URL"] ?? "";

export type PersistenceMode = "memory" | "postgres";

export const config = {
  port,
  apiBase: env["API_BASE"] ?? `http://localhost:${port}`,
  anthropicKey: env["ANTHROPIC_API_KEY"] ?? "",
  isProduction: env["NODE_ENV"] === "production",
  /** Postgres is the source of truth when DATABASE_URL is set. */
  databaseUrl,
  /** Optional read-through cache in front of Postgres. Empty = no Redis. */
  redisUrl: env["REDIS_URL"] ?? "",
  /** Explicit PERSISTENCE wins; otherwise Postgres when DATABASE_URL is set. */
  persistence: (env["PERSISTENCE"] ??
    (databaseUrl ? "postgres" : "memory")) as PersistenceMode,
  persistenceExplicit: env["PERSISTENCE"] !== undefined,
  pgPoolMax: num("PG_POOL_MAX", 5),
  cacheTtlSeconds: Math.round(num("CACHE_TTL_DAYS", 30) * 86400),
  globalKill: env["GLOBAL_KILL"] === "1",
  /**
   * Comma-separated allowed origins (e.g. "chrome-extension://<item id>").
   * "*" reflects any origin. Empty: any origin in development, any
   * chrome-extension:// origin in production.
   */
  corsOrigin: env["CORS_ORIGIN"] ?? "",
  /** Behind a reverse proxy (InstaCloud router, Caddy): use X-Forwarded-For for req.ip. */
  trustProxy: flag("TRUST_PROXY"),
  /** HMAC key for install tokens. Required in production (≥32 chars). */
  installTokenSecret: env["INSTALL_TOKEN_SECRET"] ?? "",
  /** Fresh (uncached) LLM analyses one install may trigger per UTC day. */
  dailyAnalysesPerInstall: num("DAILY_ANALYSES_PER_INSTALL", 25),
  /** Global LLM spend cap per UTC day in USD. 0 = LLM disabled (kill switch). */
  llmDailyBudgetUsd: num("LLM_DAILY_BUDGET_USD", 2),
  /** New install tokens one IP may mint per hour. */
  installsPerIpPerHour: num("INSTALLS_PER_IP_PER_HOUR", 20),
  version: "1.0.0",
};

export type AppConfig = typeof config;

/**
 * Settings a production instance must not run without. Returns fatal errors
 * and warnings; the server refuses to start on errors.
 */
export function checkProductionConfig(c: AppConfig): {
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!c.isProduction) return { errors, warnings };
  if (c.installTokenSecret.length < 32)
    errors.push(
      "INSTALL_TOKEN_SECRET must be set to at least 32 characters (e.g. `openssl rand -base64 48`).",
    );
  if (c.persistence === "memory" && !c.persistenceExplicit)
    errors.push(
      "DATABASE_URL is not set: results would live in memory only, so every restart or extra instance re-pays for LLM analyses. Set DATABASE_URL, or PERSISTENCE=memory to accept that.",
    );
  if (!c.anthropicKey)
    warnings.push(
      "ANTHROPIC_API_KEY is not set: every analysis falls back to SponsorBlock data.",
    );
  if (!c.corsOrigin)
    warnings.push(
      "CORS_ORIGIN is not set: any chrome-extension:// origin is allowed. Pin it to chrome-extension://<item id> after the first store upload.",
    );
  if (!c.trustProxy)
    warnings.push(
      "TRUST_PROXY is off: behind a reverse proxy every client shares the proxy's IP for rate limiting.",
    );
  return { errors, warnings };
}
