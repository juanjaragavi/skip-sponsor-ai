import { describe, it, expect } from "vitest";
import type { Pool } from "pg";
import {
  PostgresSegmentRepository,
  purgeExpired,
} from "../../api/repositories/postgres-segment-repository";
import { memoryPersistence } from "../../api/persistence";
import type { VideoAnalysis } from "../../shared/types";

/** Records every query; answers from a scripted responder. */
function fakePool(
  respond: (
    sql: string,
    params: unknown[],
  ) => { rows: unknown[]; rowCount?: number },
) {
  const calls: { sql: string; params: unknown[] }[] = [];
  const pool = {
    query: async (sql: string, params: unknown[] = []) => {
      calls.push({ sql, params });
      return respond(sql, params);
    },
  };
  return { pool: pool as unknown as Pool, calls };
}

const seg = {
  id: "8d3f2c1e-6b7a-4c5d-9e8f-0a1b2c3d4e5f",
  videoId: "aaaaaaaaaaa",
  channelId: "@creator",
  startTime: 30,
  endTime: 70,
  confidence: 0.9,
  category: "sponsor" as const,
  source: "claude-haiku" as const,
  createdAt: "2026-10-01T00:00:00.000Z",
};

describe("PostgresSegmentRepository (SQL mapping)", () => {
  it("maps a row to a VideoAnalysis", async () => {
    const { pool, calls } = fakePool(() => ({
      rows: [
        {
          video_id: "aaaaaaaaaaa",
          duration_sec: "612.5",
          language: "en",
          status: "ready",
          transcript_hash: "abc",
          segments: [seg],
          analyzed_at: new Date("2026-10-01T00:00:00Z"),
        },
      ],
    }));
    const repo = new PostgresSegmentRepository(pool, 2_592_000);
    const a = await repo.get("aaaaaaaaaaa");
    expect(a).toEqual({
      videoId: "aaaaaaaaaaa",
      duration: 612.5,
      language: "en",
      status: "ready",
      segments: [seg],
      transcriptVersion: "abc",
      analyzedAt: "2026-10-01T00:00:00.000Z",
    });
    expect(calls[0]!.sql).toMatch(/expires_at > now\(\)/);
    expect(calls[0]!.params).toEqual(["aaaaaaaaaaa"]);
  });

  it("returns null when no live row exists", async () => {
    const { pool } = fakePool(() => ({ rows: [] }));
    expect(
      await new PostgresSegmentRepository(pool, 60).get("bbbbbbbbbbb"),
    ).toBeNull();
  });

  it("upserts the whole analysis with parameters, never caption text", async () => {
    const { pool, calls } = fakePool(() => ({ rows: [] }));
    const analysis: VideoAnalysis = {
      videoId: "aaaaaaaaaaa",
      duration: 0,
      language: "en",
      status: "unanalyzable",
      segments: [seg],
      transcriptVersion: "nocaptions",
      analyzedAt: "2026-10-01T00:00:00.000Z",
    };
    await new PostgresSegmentRepository(pool, 2_592_000).put(analysis);
    const { sql, params } = calls[0]!;
    expect(sql).toMatch(/ON CONFLICT \(video_id\) DO UPDATE/);
    expect(params).toEqual([
      "aaaaaaaaaaa",
      "@creator",
      0,
      "en",
      "unanalyzable",
      "nocaptions",
      JSON.stringify([seg]),
      "2026-10-01T00:00:00.000Z",
      2_592_000,
    ]);
  });

  it("inserts telemetry with a null latency when absent", async () => {
    const { pool, calls } = fakePool(() => ({ rows: [] }));
    await new PostgresSegmentRepository(pool, 60).logTelemetry(
      "aaaaaaaaaaa",
      "skip_bounced",
    );
    expect(calls[0]!.params).toEqual(["aaaaaaaaaaa", "skip_bounced", null]);
  });
});

describe("purgeExpired", () => {
  it("deletes from existing tables and skips missing ones", async () => {
    const { pool, calls } = fakePool((sql, params) => {
      if (sql.startsWith("SELECT to_regclass"))
        return { rows: [{ t: params[0] === "telemetry_events" ? null : "x" }] };
      return { rows: [], rowCount: 3 };
    });
    const out = await purgeExpired(pool);
    expect(out).toEqual({
      video_analyses: 3,
      install_usage_daily: 3,
      usage_pings: 3,
    });
    expect(
      calls.some((c) => c.sql.includes("DELETE FROM telemetry_events")),
    ).toBe(false);
  });
});

describe("memoryPersistence", () => {
  it("is always ready and has nothing to purge", async () => {
    const p = memoryPersistence();
    expect(p.mode).toBe("memory");
    expect(await p.ping()).toBe(true);
    expect(await p.purge()).toEqual({});
    await p.close();
  });
});
