import type { VideoAnalysis } from "../../shared/types";

/** Repository abstraction — Postgres + Redis in prod, memory in dev/test. */
export interface SegmentRepository {
  get(videoId: string): Promise<VideoAnalysis | null>;
  put(analysis: VideoAnalysis): Promise<void>;
  logTelemetry(
    videoId: string,
    eventType: string,
    latencyMs?: number,
  ): Promise<void>;
}

const mem = new Map<string, { value: VideoAnalysis; exp: number }>();
const TTL_MS = 30 * 24 * 3600 * 1000;

export class MemorySegmentRepository implements SegmentRepository {
  async get(videoId: string): Promise<VideoAnalysis | null> {
    const e = mem.get(videoId);
    if (!e) return null;
    if (Date.now() > e.exp) {
      mem.delete(videoId);
      return null;
    }
    return e.value;
  }
  async put(analysis: VideoAnalysis): Promise<void> {
    mem.set(analysis.videoId, {
      value: analysis,
      exp: Date.now() + TTL_MS,
    });
  }
  async logTelemetry(): Promise<void> {
    // no-op in memory impl; Postgres impl inserts telemetry_events
  }
}

export function getRepository(): SegmentRepository {
  // Production wiring (pg + ioredis) would be selected via env here.
  // v1 ships memory + SQL migration; RDS/ElastiCache configured in infra/.
  return new MemorySegmentRepository();
}
