import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The real SponsorBlock client is kept (not mocked) so the guard below sees
// any request it would make. Timedtext is dead in production (YouTube answers
// 200 with an empty body without a PO token); here it always fails.
vi.mock("../../api/services/transcript-fetcher", async (orig) => ({
  ...(await orig<typeof import("../../api/services/transcript-fetcher")>()),
  fetchTimedText: vi.fn(async () => {
    throw new Error("no timedtext in tests");
  }),
}));
vi.mock("../../api/services/llm-client", () => ({
  classifyChunks: vi.fn(async () => ({
    candidates: [],
    model: "claude-haiku",
  })),
  setLlmUsageListener: vi.fn(),
}));

import { checkProductionConfig, config } from "../../api/config";
import { memoryPersistence } from "../../api/persistence";
import { buildServer } from "../../api/server";
import { classifyChunks } from "../../api/services/llm-client";
import type { SponsorSegment, VideoAnalysis } from "../../shared/types";

/**
 * SponsorBlock data is CC BY-NC-SA and SkipSponsor may become a paid product
 * (precision spike, 2026-10-13): no SponsorBlock request leaves the API and no
 * SponsorBlock segment reaches a client unless SPONSORBLOCK_ENABLED is on.
 */
const fetchSpy = vi.spyOn(globalThis, "fetch");
const sponsorBlockCalls = () =>
  fetchSpy.mock.calls.filter(([input]) =>
    String(input instanceof Request ? input.url : input).includes(
      "sponsor.ajay.app",
    ),
  );

// Cues every 15 s except a caption gap from 255 s to 330 s.
const gappedCues = Array.from({ length: 24 }, (_, i) => i * 15)
  .filter((t) => t < 255 || t >= 330)
  .map((t) => ({ t0: t, t1: t + 15, text: `line ${t}` }));

const seg = (
  videoId: string,
  source: SponsorSegment["source"],
  startTime: number,
): SponsorSegment => ({
  id: crypto.randomUUID(),
  videoId,
  channelId: null,
  startTime,
  endTime: startTime + 30,
  confidence: 0.9,
  category: "sponsor",
  source,
  createdAt: new Date().toISOString(),
});

const analysis = (
  videoId: string,
  status: VideoAnalysis["status"],
  segments: SponsorSegment[],
): VideoAnalysis => ({
  videoId,
  duration: 600,
  language: "en",
  status,
  segments,
  transcriptVersion: "x",
  analyzedAt: new Date().toISOString(),
});

describe("SPONSORBLOCK_ENABLED (default off)", () => {
  beforeEach(() => {
    fetchSpy.mockReset();
    fetchSpy.mockRejectedValue(new Error("network disabled in tests"));
    vi.mocked(classifyChunks).mockReset();
    vi.mocked(classifyChunks).mockResolvedValue({
      candidates: [],
      model: "claude-haiku",
    });
  });
  afterEach(() => {
    expect(sponsorBlockCalls()).toEqual([]);
  });

  it("is off unless the variable is set", () => {
    expect(config.sponsorBlockEnabled).toBe(false);
  });

  it("answers a lookup without a transcript as not analyzed, with no SponsorBlock request", async () => {
    const app = buildServer();
    const res = await app.inject({
      method: "GET",
      url: "/v1/segments/sbo00000001",
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      status: "unanalyzable",
      segments: [],
    });
    expect(classifyChunks).not.toHaveBeenCalled();
    await app.close();
  });

  it("reports a failed AI analysis as not analyzed instead of filling it from SponsorBlock", async () => {
    vi.mocked(classifyChunks).mockRejectedValue(new Error("llm down"));
    const app = buildServer();
    const res = await app.inject({
      method: "POST",
      url: "/v1/segments:analyze",
      payload: { videoId: "sbo00000002", transcript: gappedCues },
    });
    expect(res.json()).toMatchObject({
      status: "unanalyzable",
      segments: [],
    });
    await app.close();
  });

  it("does not fill caption gaps of a ready result", async () => {
    const app = buildServer();
    const res = await app.inject({
      method: "POST",
      url: "/v1/segments:analyze",
      payload: { videoId: "sbo00000003", transcript: gappedCues },
    });
    expect(res.json()).toMatchObject({ status: "ready", segments: [] });
    await app.close();
  });

  it("re-answers a cached SponsorBlock fallback (degraded) as not analyzed", async () => {
    const persistence = memoryPersistence();
    await persistence.repo.put(
      analysis("sbo00000004", "degraded", [
        seg("sbo00000004", "sponsorblock", 30),
      ]),
    );
    const app = buildServer({ persistence });
    const get = await app.inject({
      method: "GET",
      url: "/v1/segments/sbo00000004",
    });
    expect(get.json()).toMatchObject({ status: "unanalyzable", segments: [] });
    // The SponsorBlock-derived row is replaced in the store too.
    expect((await persistence.repo.get("sbo00000004"))?.segments).toEqual([]);
    await app.close();
  });

  it("does not serve a cached SponsorBlock fallback to POST without a transcript", async () => {
    const persistence = memoryPersistence();
    await persistence.repo.put(
      analysis("sbo00000005", "degraded", [
        seg("sbo00000005", "sponsorblock", 30),
      ]),
    );
    const app = buildServer({ persistence });
    const res = await app.inject({
      method: "POST",
      url: "/v1/segments:analyze",
      payload: { videoId: "sbo00000005" },
    });
    expect(res.json()).toMatchObject({ status: "unanalyzable", segments: [] });
    await app.close();
  });

  it("strips gap-corroborated SponsorBlock segments from a cached ready result", async () => {
    const persistence = memoryPersistence();
    await persistence.repo.put(
      analysis("sbo00000006", "ready", [
        seg("sbo00000006", "claude-haiku", 30),
        seg("sbo00000006", "sponsorblock", 260),
      ]),
    );
    const app = buildServer({ persistence });
    for (const res of [
      await app.inject({ method: "GET", url: "/v1/segments/sbo00000006" }),
      await app.inject({
        method: "POST",
        url: "/v1/segments:analyze",
        payload: { videoId: "sbo00000006", transcript: gappedCues },
      }),
    ]) {
      const body = res.json();
      expect(body.status).toBe("ready");
      expect(body.segments.map((s: SponsorSegment) => s.source)).toEqual([
        "claude-haiku",
      ]);
    }
    expect(classifyChunks).not.toHaveBeenCalled();
    await app.close();
  });

  it("publishes the switch state on /readyz", async () => {
    const off = buildServer();
    expect(
      (await off.inject({ method: "GET", url: "/readyz" })).json(),
    ).toMatchObject({ sponsorblock: "off" });
    await off.close();
    const on = buildServer({ sponsorBlockEnabled: true });
    expect(
      (await on.inject({ method: "GET", url: "/readyz" })).json(),
    ).toMatchObject({ sponsorblock: "on" });
    await on.close();
  });

  it("names no SponsorBlock fallback in the no-AI-key refusal", async () => {
    const app = buildServer({ llmConfigured: false });
    const res = await app.inject({
      method: "POST",
      url: "/v1/segments:analyze",
      payload: { videoId: "sbo00000007", transcript: gappedCues },
    });
    expect(res.statusCode).toBe(503);
    expect(res.json().detail).not.toMatch(/sponsorblock|community/i);
    await app.close();
  });
});

describe("SPONSORBLOCK_ENABLED on", () => {
  beforeEach(() => {
    fetchSpy.mockReset();
  });

  it("still uses the SponsorBlock fallback when explicitly enabled", async () => {
    fetchSpy.mockResolvedValue(
      new Response(
        JSON.stringify([{ segment: [30, 90], category: "sponsor" }]),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      ),
    );
    const app = buildServer({ sponsorBlockEnabled: true });
    const body = (
      await app.inject({ method: "GET", url: "/v1/segments/sbo00000008" })
    ).json();
    expect(body.status).toBe("degraded");
    expect(body.segments[0].source).toBe("sponsorblock");
    expect(sponsorBlockCalls()).toHaveLength(1);
    await app.close();
  });

  it("warns in production that SponsorBlock data needs permission for commercial use", () => {
    const base = {
      ...config,
      isProduction: true,
      installTokenSecret: "s".repeat(48),
      persistence: "postgres" as const,
    };
    expect(
      checkProductionConfig({ ...base, sponsorBlockEnabled: false }).warnings,
    ).not.toContainEqual(expect.stringMatching(/SPONSORBLOCK_ENABLED/));
    expect(
      checkProductionConfig({ ...base, sponsorBlockEnabled: true }).warnings,
    ).toContainEqual(
      expect.stringMatching(/SPONSORBLOCK_ENABLED.*CC BY-NC-SA/),
    );
  });
});
