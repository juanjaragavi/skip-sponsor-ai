import { describe, it, expect, vi } from "vitest";
import {
  CachedSegmentRepository,
  REDIS_HOT_TTL_SECONDS,
  type RedisLike,
} from "../../api/repositories/redis-cache";
import type { SegmentRepository } from "../../api/repositories/segment-repository";
import type { VideoAnalysis } from "../../shared/types";

const analysis = (videoId: string, analyzedAt = new Date()): VideoAnalysis => ({
  videoId,
  duration: 120,
  language: "en",
  status: "ready",
  segments: [],
  transcriptVersion: "h1",
  analyzedAt: analyzedAt.toISOString(),
});

class FakeRedis implements RedisLike {
  store = new Map<string, { value: string; ttl: number }>();
  failing = false;
  async get(key: string): Promise<string | null> {
    if (this.failing) throw new Error("redis down");
    return this.store.get(key)?.value ?? null;
  }
  async set(key: string, value: string, _m: "EX", ttl: number) {
    if (this.failing) throw new Error("redis down");
    this.store.set(key, { value, ttl });
    return "OK";
  }
  async del(key: string): Promise<number> {
    if (this.failing) throw new Error("redis down");
    return this.store.delete(key) ? 1 : 0;
  }
}

function innerRepo(): SegmentRepository & { data: Map<string, VideoAnalysis> } {
  const data = new Map<string, VideoAnalysis>();
  return {
    data,
    get: vi.fn(async (id: string) => data.get(id) ?? null),
    put: vi.fn(async (a: VideoAnalysis) => void data.set(a.videoId, a)),
    logTelemetry: vi.fn(async () => undefined),
  };
}

const MONTH = 30 * 86400;

describe("CachedSegmentRepository", () => {
  it("writes through to the inner store and serves later reads from Redis", async () => {
    const inner = innerRepo();
    const redis = new FakeRedis();
    const repo = new CachedSegmentRepository(inner, redis, MONTH);
    await repo.put(analysis("aaaaaaaaaaa"));
    expect(inner.data.has("aaaaaaaaaaa")).toBe(true);
    expect(redis.store.get("seg:aaaaaaaaaaa")?.ttl).toBe(REDIS_HOT_TTL_SECONDS);
    const got = await repo.get("aaaaaaaaaaa");
    expect(got?.videoId).toBe("aaaaaaaaaaa");
    expect(inner.get).not.toHaveBeenCalled();
  });

  it("reads through on a Redis miss and backfills the cache", async () => {
    const inner = innerRepo();
    inner.data.set("bbbbbbbbbbb", analysis("bbbbbbbbbbb"));
    const redis = new FakeRedis();
    const repo = new CachedSegmentRepository(inner, redis, MONTH);
    expect((await repo.get("bbbbbbbbbbb"))?.status).toBe("ready");
    expect(redis.store.has("seg:bbbbbbbbbbb")).toBe(true);
    expect(await repo.get("zzzzzzzzzzz")).toBeNull();
  });

  it("never caches past the retention window", async () => {
    const inner = innerRepo();
    const old = new Date(Date.now() - (MONTH - 600) * 1000); // 10 min left
    inner.data.set("ccccccccccc", analysis("ccccccccccc", old));
    const redis = new FakeRedis();
    const repo = new CachedSegmentRepository(inner, redis, MONTH);
    await repo.get("ccccccccccc");
    const ttl = redis.store.get("seg:ccccccccccc")?.ttl ?? 0;
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(600);

    // Analyzed longer ago than the window (e.g. a correction re-put it).
    const expired = new Date(Date.now() - (MONTH + 60) * 1000);
    inner.data.set("ddddddddddd", analysis("ddddddddddd", expired));
    await repo.get("ddddddddddd");
    expect(redis.store.has("seg:ddddddddddd")).toBe(false);
  });

  it("falls back to the inner store when Redis is down", async () => {
    const inner = innerRepo();
    const redis = new FakeRedis();
    redis.failing = true;
    const errors: unknown[] = [];
    const repo = new CachedSegmentRepository(inner, redis, MONTH, (e) =>
      errors.push(e),
    );
    await repo.put(analysis("eeeeeeeeeee"));
    expect((await repo.get("eeeeeeeeeee"))?.videoId).toBe("eeeeeeeeeee");
    expect(errors.length).toBeGreaterThan(0);
  });

  it("delegates telemetry to the inner store", async () => {
    const inner = innerRepo();
    const repo = new CachedSegmentRepository(inner, new FakeRedis(), MONTH);
    await repo.logTelemetry("fffffffffff", "skip_executed", 12);
    expect(inner.logTelemetry).toHaveBeenCalledWith(
      "fffffffffff",
      "skip_executed",
      12,
    );
  });
});
