import pg from "pg";
import { Redis } from "ioredis";
import type { FastifyBaseLogger } from "fastify";
import type { AppConfig } from "./config";
import {
  MemorySegmentRepository,
  type SegmentRepository,
} from "./repositories/segment-repository";
import {
  PostgresSegmentRepository,
  purgeExpired,
} from "./repositories/postgres-segment-repository";
import { CachedSegmentRepository } from "./repositories/redis-cache";
import {
  MemoryUsageStore,
  PostgresUsageStore,
  type UsageStore,
} from "./repositories/usage-store";

export interface Persistence {
  mode: "memory" | "postgres";
  repo: SegmentRepository;
  /** Quota and spend counters for the cost guard. */
  usage: UsageStore;
  pool: pg.Pool | null;
  /** Readiness: can the store answer queries? */
  ping(): Promise<boolean>;
  /** Hard-delete rows past retention (no-op in memory mode). */
  purge(): Promise<Record<string, number>>;
  close(): Promise<void>;
}

export function memoryPersistence(): Persistence {
  return {
    mode: "memory",
    repo: new MemorySegmentRepository(),
    usage: new MemoryUsageStore(),
    pool: null,
    ping: async () => true,
    purge: async () => ({}),
    close: async () => undefined,
  };
}

/**
 * Wire the repositories from config: Postgres (+ optional Redis) when
 * DATABASE_URL is set, otherwise the in-memory store used in dev and tests.
 */
export function createPersistence(
  c: Pick<
    AppConfig,
    "persistence" | "databaseUrl" | "redisUrl" | "pgPoolMax" | "cacheTtlSeconds"
  >,
  log: FastifyBaseLogger,
): Persistence {
  if (c.persistence !== "postgres") return memoryPersistence();
  if (!c.databaseUrl)
    throw new Error("PERSISTENCE=postgres needs DATABASE_URL to be set.");

  const pool = new pg.Pool({
    connectionString: c.databaseUrl,
    max: c.pgPoolMax,
    // Below managed-Postgres idle/suspend windows (scale-to-zero databases).
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
  });
  pool.on("error", (err) => log.warn({ err }, "postgres pool error"));

  let repo: SegmentRepository = new PostgresSegmentRepository(
    pool,
    c.cacheTtlSeconds,
  );
  let redis: Redis | null = null;
  if (c.redisUrl) {
    const url = new URL(c.redisUrl);
    redis = new Redis(c.redisUrl, {
      // Fail fast and fall through to Postgres instead of queueing.
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      connectTimeout: 3_000,
      // Shared TLS endpoints route on SNI; ioredis sends none from a bare URL.
      ...(url.protocol === "rediss:" && {
        tls: { servername: url.hostname },
      }),
    });
    let lastLog = 0;
    redis.on("error", (err) => {
      if (Date.now() - lastLog < 60_000) return;
      lastLog = Date.now();
      log.warn({ err }, "redis unavailable; serving from postgres");
    });
    repo = new CachedSegmentRepository(repo, redis, c.cacheTtlSeconds, (err) =>
      log.debug({ err }, "redis cache op failed"),
    );
  }

  return {
    mode: "postgres",
    repo,
    usage: new PostgresUsageStore(pool),
    pool,
    ping: async () => {
      try {
        await pool.query("SELECT 1");
        return true;
      } catch {
        return false;
      }
    },
    purge: () => purgeExpired(pool),
    close: async () => {
      redis?.disconnect();
      await pool.end();
    },
  };
}
