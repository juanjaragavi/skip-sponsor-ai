import type { DbPool as Pool } from "../db/connection";
import type { VideoAnalysis } from "../../shared/types";
import type { SegmentRepository } from "./segment-repository";

interface AnalysisRow {
  video_id: string;
  duration_sec: number;
  language: string;
  status: VideoAnalysis["status"];
  transcript_hash: string;
  segments: VideoAnalysis["segments"];
  analyzed_at: Date | string;
}

const toIso = (d: Date | string): string =>
  d instanceof Date ? d.toISOString() : new Date(d).toISOString();

/**
 * Postgres-backed SegmentRepository: the shared cache that makes one
 * analysis serve every install and instance for CACHE_TTL_DAYS. Expired rows
 * are invisible to reads and hard-deleted by purgeExpired().
 *
 * Caption text is never stored; only segment times, status and a hash of the
 * transcript.
 */
export class PostgresSegmentRepository implements SegmentRepository {
  constructor(
    private readonly pool: Pool,
    private readonly ttlSeconds: number,
  ) {}

  async get(videoId: string): Promise<VideoAnalysis | null> {
    const { rows } = await this.pool.query<AnalysisRow>(
      `SELECT video_id, duration_sec, language, status, transcript_hash,
              segments, analyzed_at
         FROM video_analyses
        WHERE video_id = $1 AND expires_at > now()`,
      [videoId],
    );
    const r = rows[0];
    if (!r) return null;
    return {
      videoId: r.video_id,
      duration: Number(r.duration_sec),
      language: r.language,
      status: r.status,
      segments: r.segments ?? [],
      transcriptVersion: r.transcript_hash,
      analyzedAt: toIso(r.analyzed_at),
    };
  }

  async put(a: VideoAnalysis): Promise<void> {
    await this.pool.query(
      `INSERT INTO video_analyses
         (video_id, channel_id, duration_sec, language, status,
          transcript_hash, segments, analyzed_at, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8,
               now() + make_interval(secs => $9))
       ON CONFLICT (video_id) DO UPDATE SET
         channel_id      = EXCLUDED.channel_id,
         duration_sec    = EXCLUDED.duration_sec,
         language        = EXCLUDED.language,
         status          = EXCLUDED.status,
         transcript_hash = EXCLUDED.transcript_hash,
         segments        = EXCLUDED.segments,
         analyzed_at     = EXCLUDED.analyzed_at,
         expires_at      = EXCLUDED.expires_at`,
      [
        a.videoId,
        a.segments.find((s) => s.channelId)?.channelId ?? null,
        Math.max(0, a.duration),
        a.language.slice(0, 12),
        a.status,
        a.transcriptVersion,
        JSON.stringify(a.segments),
        a.analyzedAt,
        this.ttlSeconds,
      ],
    );
  }

  async logTelemetry(
    videoId: string,
    eventType: string,
    latencyMs?: number,
  ): Promise<void> {
    await this.pool.query(
      `INSERT INTO telemetry_events (video_id, event_type, latency_ms)
       VALUES ($1, $2, $3)`,
      [videoId, eventType, latencyMs ?? null],
    );
  }
}

/** Retention windows enforced by purgeExpired() (see PRIVACY.md › Retention). */
export const RETENTION = {
  telemetryDays: 30,
  installUsageDays: 2,
  /** Anonymous usage pings (migration 004): 12 months for retention cohorts. */
  usagePingDays: 365,
} as const;

/**
 * Hard-delete everything past its retention window. Safe to run from several
 * instances at once. Tables that do not exist yet are skipped.
 */
export async function purgeExpired(
  pool: Pool,
): Promise<Record<string, number>> {
  const statements: Record<string, string> = {
    video_analyses: "DELETE FROM video_analyses WHERE expires_at <= now()",
    telemetry_events: `DELETE FROM telemetry_events
       WHERE created_at < now() - make_interval(days => ${RETENTION.telemetryDays})`,
    install_usage_daily: `DELETE FROM install_usage_daily
       WHERE day < (now() AT TIME ZONE 'UTC')::date - ${RETENTION.installUsageDays}`,
    usage_pings: `DELETE FROM usage_pings
       WHERE day < (now() AT TIME ZONE 'UTC')::date - ${RETENTION.usagePingDays}`,
  };
  const out: Record<string, number> = {};
  for (const [table, sql] of Object.entries(statements)) {
    const exists = await pool.query<{ t: string | null }>(
      "SELECT to_regclass($1) AS t",
      [table],
    );
    if (!exists.rows[0]?.t) continue;
    out[table] = (await pool.query(sql)).rowCount ?? 0;
  }
  return out;
}
