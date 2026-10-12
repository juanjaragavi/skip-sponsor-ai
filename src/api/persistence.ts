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
import {
  CachedSegmentRepository,
  createRedisClient,
  type RedisClient,
} from "./repositories/redis-cache";
import { createPool, type DbPool } from "./db/connection";
import {
  MemoryUsageStore,
  PostgresUsageStore,
  type UsageStore,
} from "./repositories/usage-store";

export type RedisStatus = "disabled" | "ok" | "down";

export interface Persistence {
  mode: "memory" | "postgres";
  repo: SegmentRepository;
  /** Quota and spend counters for the cost guard. */
  usage: UsageStore;
  pool: DbPool | null;
  /** Readiness: can the store answer queries? */
  ping(): Promise<boolean>;
  /** Optional Redis cache: "disabled" when REDIS_URL is unset. Never gates readiness. */
  redisStatus(): Promise<RedisStatus>;
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
    redisStatus: async () => "disabled",
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

  const pool = createPool(c.databaseUrl, {
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
  let redis: RedisClient | null = null;
  if (c.redisUrl) {
    redis = createRedisClient(c.redisUrl);
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
    redisStatus: async () => {
      if (!redis) return "disabled";
      try {
        // Offline queue is off: a disconnected client rejects at once.
        return (await redis.ping()) === "PONG" ? "ok" : "down";
      } catch {
        return "down";
      }
    },
    purge: () => purgeExpired(pool),
    close: async () => {
      redis?.disconnect();
      await pool.end();
    },
  };
}
