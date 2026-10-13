import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Postgres and Redis clients are replaced by in-memory fakes so the wiring in
// createPersistence() (error logging, readiness, cache fall-through, purge,
// shutdown) can be checked without servers.
const fakes = vi.hoisted(() => ({
  pool: null as unknown as FakePool,
  redis: null as unknown as FakeRedis,
}));

class FakePool extends EventEmitter {
  query = vi.fn(async (_sql: string, _params?: unknown[]) => ({
    rows: [] as unknown[],
    rowCount: 0,
  }));
  end = vi.fn(async () => undefined);
}
class FakeRedis extends EventEmitter {
  get = vi.fn(async (_k: string): Promise<string | null> => null);
  set = vi.fn(async () => "OK");
  del = vi.fn(async () => 1);
  ping = vi.fn(async (): Promise<string> => "PONG");
  disconnect = vi.fn();
}

vi.mock("../../api/db/connection", () => ({
  createPool: () => fakes.pool,
}));
vi.mock("../../api/repositories/redis-cache", async (importActual) => ({
  ...(await importActual<object>()),
  createRedisClient: () => fakes.redis,
}));

import { createPersistence } from "../../api/persistence";

const config = {
  persistence: "postgres" as const,
  databaseUrl: "postgres://app@db.internal:5432/app",
  redisUrl: "redis://cache.internal:6379",
  pgPoolMax: 2,
  cacheTtlSeconds: 3600,
};

describe("createPersistence (Postgres + Redis wiring)", () => {
  const log = { warn: vi.fn(), debug: vi.fn() };

  beforeEach(() => {
    fakes.pool = new FakePool();
    fakes.redis = new FakeRedis();
    log.warn.mockReset();
    log.debug.mockReset();
  });
  afterEach(() => vi.useRealTimers());

  const build = (c: Partial<typeof config> = {}) =>
    createPersistence({ ...config, ...c }, log as never);

  it("is ready when Postgres answers SELECT 1 and reports Redis as ok", async () => {
    const p = build();
    expect(p.mode).toBe("postgres");
    expect(p.pool).toBe(fakes.pool);
    expect(await p.ping()).toBe(true);
    expect(fakes.pool.query).toHaveBeenCalledWith("SELECT 1");
    expect(await p.redisStatus()).toBe("ok");
  });

  it("reports Redis down on an unexpected reply or a rejected ping", async () => {
    const p = build();
    fakes.redis.ping.mockResolvedValueOnce("LOADING");
    expect(await p.redisStatus()).toBe("down");
    fakes.redis.ping.mockRejectedValueOnce(new Error("Connection is closed."));
    expect(await p.redisStatus()).toBe("down");
  });

  it("logs Postgres pool errors instead of crashing", () => {
    build();
    const err = new Error(
      "terminating connection due to administrator command",
    );
    fakes.pool.emit("error", err);
    expect(log.warn).toHaveBeenCalledWith({ err }, "postgres pool error");
  });

  it("logs Redis outages at most once a minute", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-12T12:00:00Z"));
    build();
    const err = new Error("ECONNREFUSED");

    fakes.redis.emit("error", err);
    vi.setSystemTime(new Date("2026-10-12T12:00:30Z"));
    fakes.redis.emit("error", err);
    expect(log.warn).toHaveBeenCalledTimes(1);
    expect(log.warn).toHaveBeenCalledWith(
      { err },
      "redis unavailable; serving from postgres",
    );

    vi.setSystemTime(new Date("2026-10-12T12:01:01Z"));
    fakes.redis.emit("error", err);
    expect(log.warn).toHaveBeenCalledTimes(2);
  });

  it("serves reads from Postgres when the Redis cache fails, logging at debug", async () => {
    const p = build();
    const err = new Error("redis timeout");
    fakes.redis.get.mockRejectedValueOnce(err);

    await expect(p.repo.get("dQw4w9WgXcQ")).resolves.toBeNull();

    expect(log.debug).toHaveBeenCalledWith({ err }, "redis cache op failed");
    const sql = fakes.pool.query.mock.calls.map((c) => c[0]);
    expect(sql.some((s) => s.includes("FROM video_analyses"))).toBe(true);
  });

  it("reads straight from Postgres when no Redis URL is configured", async () => {
    const p = build({ redisUrl: "" });
    expect(await p.redisStatus()).toBe("disabled");
    await p.repo.get("dQw4w9WgXcQ");
    expect(fakes.redis.get).not.toHaveBeenCalled();
    expect(fakes.pool.query).toHaveBeenCalled();
  });

  it("purges expired rows through the pool", async () => {
    fakes.pool.query.mockImplementation(async (sql: string) =>
      sql.startsWith("SELECT to_regclass")
        ? { rows: [{ t: "exists" }], rowCount: 1 }
        : { rows: [], rowCount: 3 },
    );
    const p = build();
    await expect(p.purge()).resolves.toEqual({
      video_analyses: 3,
      telemetry_events: 3,
      install_usage_daily: 3,
    });
  });

  it("closes Redis and the Postgres pool on shutdown", async () => {
    const p = build();
    await p.close();
    expect(fakes.redis.disconnect).toHaveBeenCalledTimes(1);
    expect(fakes.pool.end).toHaveBeenCalledTimes(1);
  });
});
