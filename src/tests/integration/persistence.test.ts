/**
 * Integration tests against real Postgres (+ Redis) from infra/docker-compose.yml.
 *
 *   docker compose -f infra/docker-compose.yml up -d
 *   TEST_DATABASE_URL=postgres://skipsponsor:skipsponsor@localhost:5434/skipsponsor \
 *   TEST_REDIS_URL=redis://localhost:6380 npm run test:integration
 *
 * Skipped when TEST_DATABASE_URL is unset (plain `npm test`, CI). Uses its own
 * database (`<db>_test`, created on demand) so dev data is never touched.
 */
import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import pg from "pg";
import { Redis } from "ioredis";

vi.mock("../../api/services/transcript-fetcher", () => ({
  fetchTimedText: vi.fn(async () => {
    throw new Error("no timedtext in tests");
  }),
  assertFetchAllowed: vi.fn(),
}));
vi.mock("../../api/services/sponsorblock", () => ({
  fetchSponsorBlock: vi.fn(async () => []),
}));
vi.mock("../../api/services/llm-client", () => ({
  classifyChunks: vi.fn(async () => ({
    candidates: [
      {
        start: 30,
        end: 60,
        category: "sponsor",
        confidence: 0.95,
        rationale: "x",
      },
    ],
    model: "claude-haiku",
  })),
  setLlmUsageListener: vi.fn(),
}));

import { buildServer } from "../../api/server";
import { createPersistence } from "../../api/persistence";
import { runMigrations } from "../../api/db/migrate";
import { PostgresSegmentRepository } from "../../api/repositories/postgres-segment-repository";
import { classifyChunks } from "../../api/services/llm-client";
import type { VideoAnalysis } from "../../shared/types";

const baseUrl = process.env["TEST_DATABASE_URL"];
const redisUrl = process.env["TEST_REDIS_URL"] ?? "";
const log = { warn: () => undefined, debug: () => undefined } as never;

function testDbUrl(url: string): { admin: string; test: string; name: string } {
  const u = new URL(url);
  const name = `${u.pathname.slice(1) || "postgres"}_test`;
  const test = new URL(url);
  test.pathname = `/${name}`;
  return { admin: url, test: test.toString(), name };
}

const cues = Array.from({ length: 8 }, (_, i) => ({
  t0: i * 15,
  t1: i * 15 + 15,
  text: `line ${i}`,
}));

describe.skipIf(!baseUrl)("Postgres persistence (integration)", () => {
  let url = "";
  let pool: pg.Pool;

  beforeAll(async () => {
    const { admin, test, name } = testDbUrl(baseUrl!);
    const a = new pg.Client({ connectionString: admin });
    await a.connect();
    await a.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
    await a.query(`CREATE DATABASE ${name}`);
    await a.end();
    url = test;
    pool = new pg.Pool({ connectionString: url, max: 2 });
  });
  afterAll(async () => {
    await pool?.end();
  });

  it("applies every migration once and is idempotent", async () => {
    const first = await runMigrations(pool);
    expect(first).toEqual(
      expect.arrayContaining(["001_init.sql", "002_launch_persistence.sql"]),
    );
    expect(await runMigrations(pool)).toEqual([]);
  });

  it("round-trips an analysis, hides it after expiry, and purges it", async () => {
    const repo = new PostgresSegmentRepository(pool, 3600);
    const a: VideoAnalysis = {
      videoId: "aaaaaaaaaaa",
      duration: 0,
      language: "en",
      status: "unanalyzable",
      segments: [],
      transcriptVersion: "nocaptions",
      analyzedAt: new Date().toISOString(),
    };
    await repo.put(a);
    expect(await repo.get("aaaaaaaaaaa")).toEqual(a);
    await repo.put({ ...a, status: "degraded" }); // upsert
    expect((await repo.get("aaaaaaaaaaa"))?.status).toBe("degraded");

    await pool.query(
      "UPDATE video_analyses SET expires_at = now() - interval '1 second' WHERE video_id = $1",
      ["aaaaaaaaaaa"],
    );
    expect(await repo.get("aaaaaaaaaaa")).toBeNull();
    const p = createPersistence(
      {
        persistence: "postgres",
        databaseUrl: url,
        redisUrl: "",
        pgPoolMax: 1,
        cacheTtlSeconds: 3600,
      },
      log,
    );
    expect(await p.ping()).toBe(true);
    expect((await p.purge())["video_analyses"]).toBe(1);
    await p.close();
  });

  it("stores every telemetry event the API accepts", async () => {
    const repo = new PostgresSegmentRepository(pool, 3600);
    for (const e of ["skip_executed", "skip_undone", "skip_bounced"])
      await repo.logTelemetry("bbbbbbbbbbb", e, 5);
    const { rows } = await pool.query(
      "SELECT count(*)::int AS n FROM telemetry_events WHERE video_id = 'bbbbbbbbbbb'",
    );
    expect(rows[0].n).toBe(3);
  });

  async function sharedAcrossInstances(redis: string, videoId: string) {
    vi.mocked(classifyChunks).mockClear();
    const mk = () =>
      buildServer({
        persistence: createPersistence(
          {
            persistence: "postgres",
            databaseUrl: url,
            redisUrl: redis,
            pgPoolMax: 2,
            cacheTtlSeconds: 3600,
          },
          log,
        ),
      });
    const one = mk();
    const two = mk();
    const first = await one.inject({
      method: "POST",
      url: "/v1/segments:analyze",
      payload: { videoId, transcript: cues },
    });
    expect(first.json().status).toBe("ready");
    const second = await two.inject({
      method: "GET",
      url: `/v1/segments/${videoId}`,
    });
    expect(second.json().status).toBe("ready");
    expect(second.json().segments).toHaveLength(1);
    expect(classifyChunks).toHaveBeenCalledTimes(1);
    expect(
      (await two.inject({ method: "GET", url: "/readyz" })).json(),
    ).toEqual({ ok: true, persistence: "postgres" });
    await one.close();
    await two.close();
  }

  it("shares one analysis across API instances: the second pays no LLM call", async () => {
    await sharedAcrossInstances("", "ddddddddddd");
  });

  it.skipIf(!redisUrl)("does the same through the Redis cache", async () => {
    await sharedAcrossInstances(redisUrl, "ccccccccccc");
    const r = new Redis(redisUrl);
    expect(await r.exists("seg:ccccccccccc")).toBe(1);
    await r.del("seg:ccccccccccc");
    r.disconnect();
  });
});
