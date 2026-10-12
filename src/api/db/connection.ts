/**
 * The database adapter (portfolio platform standard): the only module that
 * imports the Postgres driver. Everything else asks it for a pool
 * (`createPool`) and types against `DbPool`. Locally it talks to the compose
 * Postgres (`npm run dev:tunnel` / infra/docker-compose.yml); in production
 * to the managed Postgres on DevSpeak Labs Cloud (the box).
 */
import pg from "pg";

export type DbPool = pg.Pool;

export interface PoolOptions {
  max: number;
  idleTimeoutMillis?: number;
  connectionTimeoutMillis?: number;
}

/** A pool on `databaseUrl`, with verified TLS pinned (pinVerifiedTls). */
export function createPool(databaseUrl: string, options: PoolOptions): DbPool {
  return new pg.Pool({
    connectionString: pinVerifiedTls(databaseUrl),
    ...options,
  });
}

/**
 * Managed Postgres hosts hand out URLs with
 * `sslmode=require`. pg 8 already treats prefer/require/verify-ca as
 * verify-full (certificate and hostname checked) and prints a SECURITY
 * WARNING on every boot; pg 9 will switch them to libpq semantics, where
 * `require` no longer verifies the certificate. Pinning `verify-full` keeps
 * today's verified TLS across that upgrade and silences the warning.
 *
 * URLs that opt into libpq semantics (`uselibpqcompat`), use another mode
 * (disable, verify-full) or have no sslmode (local dev) are returned as-is.
 */
const PINNED = new Set(["prefer", "require", "verify-ca"]);

export function pinVerifiedTls(databaseUrl: string): string {
  let url: URL;
  try {
    url = new URL(databaseUrl);
  } catch {
    return databaseUrl;
  }
  const mode = url.searchParams.get("sslmode");
  if (!mode || !PINNED.has(mode) || url.searchParams.has("uselibpqcompat"))
    return databaseUrl;
  url.searchParams.set("sslmode", "verify-full");
  return url.toString();
}
