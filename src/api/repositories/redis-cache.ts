import { Redis } from "ioredis";
import type { VideoAnalysis } from "../../shared/types";
import type { SegmentRepository } from "./segment-repository";

/** The few ioredis calls the cache needs (lets tests pass a fake). */
export interface RedisLike {
  get(key: string): Promise<string | null>;
  set(
    key: string,
    value: string,
    mode: "EX",
    seconds: number,
  ): Promise<unknown>;
  del(key: string): Promise<number>;
}

/**
 * The cache adapter (portfolio platform standard): the only module that
 * imports the Redis client. Locally the compose Redis; in production the
 * managed Redis on DevSpeak Labs Cloud (the box).
 */
export type RedisClient = Redis;

export function createRedisClient(redisUrl: string): RedisClient {
  const url = new URL(redisUrl);
  return new Redis(redisUrl, {
    // Fail fast and fall through to Postgres instead of queueing.
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    connectTimeout: 3_000,
    // Shared TLS endpoints route on SNI; ioredis sends none from a bare URL.
    ...(url.protocol === "rediss:" && {
      tls: { servername: url.hostname },
    }),
  });
}

/** Hot-cache lifetime; Postgres stays the source of truth. */
export const REDIS_HOT_TTL_SECONDS = 24 * 3600;

const key = (videoId: string): string => `seg:${videoId}`;

/**
 * Read-through / write-through Redis cache in front of another repository.
 * Redis is optional and never authoritative: any Redis error falls through
 * to the inner repository, so a Redis outage costs latency, not LLM calls.
 * Entries never outlive the analysis' retention window.
 */
export class CachedSegmentRepository implements SegmentRepository {
  constructor(
    private readonly inner: SegmentRepository,
    private readonly redis: RedisLike,
    private readonly retentionSeconds: number,
    private readonly onError: (err: unknown) => void = () => undefined,
  ) {}

  async get(videoId: string): Promise<VideoAnalysis | null> {
    try {
      const hit = await this.redis.get(key(videoId));
      if (hit) return JSON.parse(hit) as VideoAnalysis;
    } catch (err) {
      this.onError(err);
    }
    const value = await this.inner.get(videoId);
    if (value) await this.remember(value);
    return value;
  }

  async put(analysis: VideoAnalysis): Promise<void> {
    await this.inner.put(analysis);
    await this.remember(analysis, true);
  }

  logTelemetry(
    videoId: string,
    eventType: string,
    latencyMs?: number,
  ): Promise<void> {
    return this.inner.logTelemetry(videoId, eventType, latencyMs);
  }

  private async remember(a: VideoAnalysis, fresh = false): Promise<void> {
    // A fresh put restarts the retention window; a value read back from the
    // inner store may be close to expiry, so cap by its remaining lifetime.
    const age = fresh ? 0 : (Date.now() - Date.parse(a.analyzedAt)) / 1000;
    const ttl = Math.floor(
      Math.min(REDIS_HOT_TTL_SECONDS, this.retentionSeconds - age),
    );
    try {
      if (ttl > 0)
        await this.redis.set(key(a.videoId), JSON.stringify(a), "EX", ttl);
      else await this.redis.del(key(a.videoId));
    } catch (err) {
      this.onError(err);
    }
  }
}
