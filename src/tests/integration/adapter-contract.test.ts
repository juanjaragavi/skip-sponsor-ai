/**
 * Adapter contract (portfolio platform standard): the local implementation
 * (in-process memory store) and the production one (Postgres, plus Redis
 * when given) must behave the same for what the API relies on.
 *
 *   npm run test -- src/tests/integration/adapter-contract.test.ts
 *   CONTRACT_DATABASE_URL=<postgres url> [CONTRACT_REDIS_URL=<redis url>] npm run test -- …
 *
 * Locally CONTRACT_DATABASE_URL points at the compose Postgres (5434); for
 * the box it points at a throwaway database on the project's managed
 * Postgres. Migrations are applied first (idempotent). Ids are random, so
 * a run never collides with real rows.
 */
import { randomBytes } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import {
  createPersistence,
  memoryPersistence,
  type Persistence,
} from "../../api/persistence";
import { runMigrations } from "../../api/db/migrate";
import type { VideoAnalysis } from "../../shared/types";

const dbUrl =
  process.env["CONTRACT_DATABASE_URL"] ?? process.env["TEST_DATABASE_URL"];
const redisUrl = process.env["CONTRACT_REDIS_URL"] ?? "";
const log = {
  warn: () => undefined,
  debug: () => undefined,
  info: () => undefined,
} as never;

const videoId = (): string =>
  randomBytes(8)
    .toString("base64url")
    .replace(/[^A-Za-z0-9]/g, "a")
    .slice(0, 11);

function analysis(id: string): VideoAnalysis {
  return {
    videoId: id,
    duration: 600,
    language: "en",
    status: "ready",
    transcriptVersion: "contract",
    analyzedAt: new Date().toISOString(),
    segments: [
      {
        id: "8d3f2c1e-6b7a-4c5d-9e8f-0a1b2c3d4e5f",
        videoId: id,
        channelId: null,
        startTime: 30,
        endTime: 70,
        confidence: 0.9,
        category: "sponsor",
        source: "claude-haiku",
        createdAt: new Date().toISOString(),
      },
    ],
  };
}

function contract(name: string, make: () => Promise<Persistence>): void {
  describe(`persistence contract: ${name}`, () => {
    let p: Persistence;
    afterAll(async () => p?.close());

    it("answers ping", async () => {
      p = await make();
      expect(await p.ping()).toBe(true);
    });

    it("returns null for an unknown video and round-trips an analysis", async () => {
      const id = videoId();
      expect(await p.repo.get(id)).toBeNull();
      await p.repo.put(analysis(id));
      const got = await p.repo.get(id);
      expect(got?.videoId).toBe(id);
      expect(
        got?.segments.map((s) => [s.startTime, s.endTime, s.category]),
      ).toEqual([[30, 70, "sponsor"]]);
    });

    it("accepts telemetry", async () => {
      await expect(
        p.repo.logTelemetry(videoId(), "skip_executed", 12),
      ).resolves.toBeUndefined();
    });

    it("meters an install up to its limit and accumulates spend", async () => {
      const day = "1999-01-01";
      const key = `contract-${videoId()}`;
      expect(await p.usage.consumeInstall(day, key, 2)).toBe(true);
      expect(await p.usage.consumeInstall(day, key, 2)).toBe(true);
      expect(await p.usage.consumeInstall(day, key, 2)).toBe(false);
      const spendDay = `1999-02-${String(1 + Math.floor(Math.random() * 27)).padStart(2, "0")}`;
      const before = await p.usage.getSpend(spendDay);
      await p.usage.addSpend(spendDay, 0.25, 10, 5);
      expect(await p.usage.getSpend(spendDay)).toBeCloseTo(before + 0.25, 6);
    });
  });
}

contract("local (memory)", async () => memoryPersistence());

describe.skipIf(!dbUrl)("production adapters", () => {
  contract(redisUrl ? "postgres + redis" : "postgres", async () => {
    const p = createPersistence(
      {
        persistence: "postgres",
        databaseUrl: dbUrl!,
        redisUrl,
        pgPoolMax: 2,
        cacheTtlSeconds: 3600,
      },
      log,
    );
    await runMigrations(p.pool!);
    return p;
  });
});
