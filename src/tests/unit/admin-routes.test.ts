import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../api/services/transcript-fetcher", () => ({
  fetchTimedText: vi.fn(async () => {
    throw new Error("no timedtext in tests");
  }),
  assertFetchAllowed: vi.fn(),
}));
vi.mock("../../api/services/sponsorblock", () => ({
  fetchSponsorBlock: vi.fn(async () => [
    {
      id: "sb-1",
      videoId: "x",
      channelId: null,
      startTime: 30,
      endTime: 90,
      confidence: 0.9,
      category: "sponsor",
      source: "sponsorblock",
      createdAt: "2026-10-01T00:00:00.000Z",
    },
  ]),
}));
vi.mock("../../api/services/llm-client", () => ({
  classifyChunks: vi.fn(async () => ({
    candidates: [],
    model: "claude-haiku",
  })),
  setLlmUsageListener: vi.fn(),
}));

import { memoryPersistence } from "../../api/persistence";
import { buildServer } from "../../api/server";
import { ADMIN_TOKEN_HEADER } from "../../api/services/admin-token";

/**
 * Security audit 2026-10-12 (SS-1, SS-2, SS-3): the shared segment cache is
 * served to every install, so only an operator holding ADMIN_API_TOKEN may
 * wipe it (DELETE), inject segments into it (corrections) or force a
 * re-analysis over a ready result. Anonymous callers must not change it.
 */
const ADMIN = "a".repeat(48);
let VIDEO = "";
let VIDEO_ID = "";
let n = 0;

/** A fresh video per test: the in-memory store is shared across servers. */
async function seeded(adminToken?: string) {
  n += 1;
  VIDEO_ID = `adm${String(n).padStart(8, "0")}`;
  VIDEO = `/v1/segments/${VIDEO_ID}`;
  // The seed segment comes from the SponsorBlock fallback (switch on here).
  const app = buildServer(
    adminToken === undefined
      ? { sponsorBlockEnabled: true }
      : { adminToken, sponsorBlockEnabled: true },
  );
  const first = await app.inject({ method: "GET", url: VIDEO });
  expect(first.json().segments).toHaveLength(1);
  return app;
}

describe("shared-cache mutations need the admin token", () => {
  beforeEach(() => vi.clearAllMocks());

  it("refuses an anonymous DELETE and keeps the segments", async () => {
    const app = await seeded(ADMIN);
    const res = await app.inject({ method: "DELETE", url: VIDEO });
    expect(res.statusCode).toBe(401);
    const after = (await app.inject({ method: "GET", url: VIDEO })).json();
    expect(after.segments).toHaveLength(1);
    await app.close();
  });

  it("refuses a DELETE with a wrong admin token", async () => {
    const app = await seeded(ADMIN);
    const res = await app.inject({
      method: "DELETE",
      url: VIDEO,
      headers: { [ADMIN_TOKEN_HEADER]: "b".repeat(48) },
    });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it("hides the admin routes (404) when no admin token is configured", async () => {
    const app = await seeded();
    const del = await app.inject({ method: "DELETE", url: VIDEO });
    expect(del.statusCode).toBe(404);
    const fix = await app.inject({
      method: "POST",
      url: `${VIDEO}/corrections`,
      payload: {
        startTime: 0,
        endTime: 600,
        category: "sponsor",
        action: "confirm",
      },
    });
    expect(fix.statusCode).toBe(404);
    expect(
      (await app.inject({ method: "GET", url: VIDEO })).json().segments,
    ).toHaveLength(1);
    await app.close();
  });

  it("allows the operator DELETE with the right token", async () => {
    const app = await seeded(ADMIN);
    const res = await app.inject({
      method: "DELETE",
      url: VIDEO,
      headers: { [ADMIN_TOKEN_HEADER]: ADMIN },
    });
    expect(res.statusCode).toBe(204);
    const after = (await app.inject({ method: "GET", url: VIDEO })).json();
    expect(after.segments).toEqual([]);
    await app.close();
  });

  it("refuses an anonymous correction and does not inject a segment", async () => {
    const app = await seeded(ADMIN);
    const res = await app.inject({
      method: "POST",
      url: `${VIDEO}/corrections`,
      payload: {
        startTime: 0,
        endTime: 100000,
        category: "sponsor",
        action: "confirm",
      },
    });
    expect(res.statusCode).toBe(401);
    const after = (await app.inject({ method: "GET", url: VIDEO })).json();
    expect(after.segments).toHaveLength(1);
    await app.close();
  });

  it("accepts an operator correction with the right token", async () => {
    const app = await seeded(ADMIN);
    const res = await app.inject({
      method: "POST",
      url: `${VIDEO}/corrections`,
      headers: { [ADMIN_TOKEN_HEADER]: ADMIN },
      payload: {
        startTime: 120,
        endTime: 150,
        category: "sponsor",
        action: "confirm",
      },
    });
    expect(res.statusCode).toBe(201);
    expect(
      (await app.inject({ method: "GET", url: VIDEO })).json().segments,
    ).toHaveLength(2);
    await app.close();
  });

  it("rejects a correction whose end is not after its start", async () => {
    const app = await seeded(ADMIN);
    const res = await app.inject({
      method: "POST",
      url: `${VIDEO}/corrections`,
      headers: { [ADMIN_TOKEN_HEADER]: ADMIN },
      payload: {
        startTime: 150,
        endTime: 120,
        category: "sponsor",
        action: "confirm",
      },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it("refuses an anonymous force re-analysis", async () => {
    const app = await seeded(ADMIN);
    const res = await app.inject({
      method: "POST",
      url: "/v1/segments:analyze",
      payload: { videoId: VIDEO_ID, force: true },
    });
    expect(res.statusCode).toBe(403);
    await app.close();
  });
});

describe("error bodies", () => {
  it("keeps 5xx bodies generic (no internal error text)", async () => {
    const persistence = memoryPersistence();
    persistence.repo.get = async () => {
      throw new Error("connect ECONNREFUSED 10.0.0.5:5432 user=skipsponsor");
    };
    const app = buildServer({ persistence });
    const res = await app.inject({
      method: "GET",
      url: "/v1/segments/err00000001",
    });
    expect(res.statusCode).toBe(500);
    expect(res.body).not.toContain("ECONNREFUSED");
    expect(res.json().title).toBe("Internal Server Error");
    await app.close();
  });
});
