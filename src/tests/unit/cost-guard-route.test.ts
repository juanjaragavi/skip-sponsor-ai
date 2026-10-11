import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../api/services/transcript-fetcher", () => ({
  // Server-side captions are available, so a GET cache miss reaches the LLM.
  fetchTimedText: vi.fn(async () => ({
    events: Array.from({ length: 8 }, (_, i) => ({
      tStartMs: i * 15000,
      dDurationMs: 15000,
      segs: [{ utf8: `line ${i}` }],
    })),
  })),
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

import { buildServer, type ServerDeps } from "../../api/server";
import {
  classifyChunks,
  setLlmUsageListener,
} from "../../api/services/llm-client";
import { memoryPersistence } from "../../api/persistence";

const SECRET = "k".repeat(48);
const cues = Array.from({ length: 8 }, (_, i) => ({
  t0: i * 15,
  t1: i * 15 + 15,
  text: `line ${i}`,
}));

function server(deps: Partial<ServerDeps> = {}) {
  return buildServer({
    persistence: memoryPersistence(),
    installTokenSecret: SECRET,
    dailyAnalysesPerInstall: 1,
    llmDailyBudgetUsd: 1,
    ...deps,
  });
}

async function token(app: ReturnType<typeof buildServer>): Promise<string> {
  const res = await app.inject({ method: "POST", url: "/v1/installs" });
  expect(res.statusCode).toBe(201);
  return res.json().installToken as string;
}

const analyze = (
  app: ReturnType<typeof buildServer>,
  videoId: string,
  tok?: string,
) =>
  app.inject({
    method: "POST",
    url: "/v1/segments:analyze",
    payload: { videoId, transcript: cues },
    headers: tok ? { authorization: `Bearer ${tok}` } : {},
  });

describe("cost guard on the API", () => {
  beforeEach(() => vi.mocked(classifyChunks).mockClear());

  it("meters fresh analyses per install and never meters cache hits", async () => {
    const app = server();
    const tok = await token(app);
    expect((await analyze(app, "qa000000001", tok)).statusCode).toBe(200);

    const limited = await analyze(app, "qa000000002", tok);
    expect(limited.statusCode).toBe(429);
    expect(limited.headers["retry-after"]).toMatch(/^\d+$/);
    expect(limited.json()).toMatchObject({
      status: 429,
      reason: "install_quota",
      title: "Daily analysis limit reached",
    });
    expect(Date.parse(limited.json().resetAt)).toBeGreaterThan(Date.now());

    // The already-analyzed video is still served, for free.
    expect((await analyze(app, "qa000000001", tok)).json().status).toBe(
      "ready",
    );
    const get = await app.inject({
      method: "GET",
      url: "/v1/segments/qa000000001",
    });
    expect(get.json().status).toBe("ready");
    expect(classifyChunks).toHaveBeenCalledTimes(1);

    // Another install has its own allowance.
    expect(
      (await analyze(app, "qa000000002", await token(app))).statusCode,
    ).toBe(200);
    await app.close();
  });

  it("requires a valid signed token when a secret is configured", async () => {
    const app = server();
    const missing = await analyze(app, "qa000000003");
    expect(missing.statusCode).toBe(401);
    expect(missing.json().reason).toBe("unauthenticated");
    const forged = await analyze(
      app,
      "qa000000003",
      "v1.aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.bad",
    );
    expect(forged.statusCode).toBe(401);
    expect(classifyChunks).not.toHaveBeenCalled();
    await app.close();
  });

  it("falls back to SponsorBlock on a GET cache miss when over the limit", async () => {
    const app = server();
    const res = await app.inject({
      method: "GET",
      url: "/v1/segments/qa000000004",
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe("degraded");
    expect(classifyChunks).not.toHaveBeenCalled();

    const tok = await token(app);
    const ok = await app.inject({
      method: "GET",
      url: "/v1/segments/qa000000005",
      headers: { authorization: `Bearer ${tok}` },
    });
    expect(ok.json().status).toBe("ready");
    expect(classifyChunks).toHaveBeenCalledTimes(1);
    await app.close();
  });

  it("stops LLM analyses for everyone once the daily budget is spent", async () => {
    const app = server({ dailyAnalysesPerInstall: 100 });
    const listener = vi.mocked(setLlmUsageListener).mock.calls.at(-1)![0]!;
    const tok = await token(app);
    expect((await analyze(app, "qa000000006", tok)).statusCode).toBe(200);
    listener("claude-haiku-4-5-20251001", 2_000_000, 0); // $2 > $1 budget
    await new Promise((r) => setTimeout(r, 10));
    const res = await analyze(app, "qa000000007", tok);
    expect(res.statusCode).toBe(429);
    expect(res.json().reason).toBe("global_budget");
    await app.close();
  });

  it("returns 503 when the LLM is switched off (budget 0)", async () => {
    const app = server({ llmDailyBudgetUsd: 0 });
    const res = await analyze(app, "qa000000008", await token(app));
    expect(res.statusCode).toBe(503);
    expect(res.json().reason).toBe("llm_disabled");
    await app.close();
  });

  it("answers 503 llm_not_configured without calling Claude when no key is set", async () => {
    const app = server({ llmConfigured: false });
    const res = await analyze(app, "qa000000011", await token(app));
    expect(res.statusCode).toBe(503);
    expect(res.json()).toMatchObject({
      status: 503,
      reason: "llm_not_configured",
      title: "AI analysis is not configured",
    });
    expect(res.json().detail).toMatch(/no AI provider key/);
    // Lookups still answer, honestly labelled as the community fallback.
    const get = await app.inject({
      method: "GET",
      url: "/v1/segments/qa000000012",
    });
    expect(get.statusCode).toBe(200);
    expect(get.json().status).toBe("degraded");
    expect(classifyChunks).not.toHaveBeenCalled();
    expect(
      (await app.inject({ method: "GET", url: "/readyz" })).json(),
    ).toMatchObject({ ok: true, ai: "not_configured", redis: "disabled" });
    await app.close();
  });

  it("meters by IP in local development (no secret, no token)", async () => {
    const app = server({ installTokenSecret: "" });
    expect((await analyze(app, "qa000000009")).statusCode).toBe(200);
    expect((await analyze(app, "qa000000010")).statusCode).toBe(429);
    await app.close();
  });

  it("rate-limits token minting per IP and publishes the quota", async () => {
    const app = server({ installsPerIpPerHour: 2 });
    await token(app);
    await token(app);
    const third = await app.inject({ method: "POST", url: "/v1/installs" });
    expect(third.statusCode).toBe(429);
    const cfg = await app.inject({ method: "GET", url: "/v1/config" });
    expect(cfg.json()).toMatchObject({
      dailyAnalysesPerInstall: 1,
      globalKill: false,
    });
    await app.close();
  });
});
