import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../api/services/transcript-fetcher", () => ({
  fetchTimedText: vi.fn(async () => {
    throw new Error("timedtext must not be used when a transcript is supplied");
  }),
  assertFetchAllowed: vi.fn(),
}));
vi.mock("../../api/services/sponsorblock", () => ({
  fetchSponsorBlock: vi.fn(async () => {
    throw new Error("no sponsorblock data");
  }),
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
import { classifyChunks } from "../../api/services/llm-client";
import { fetchSponsorBlock } from "../../api/services/sponsorblock";
import { analyzeRequestSchema } from "../../shared/validators";

const cues = Array.from({ length: 8 }, (_, i) => ({
  t0: i * 15,
  t1: i * 15 + 15,
  text: `line ${i}`,
}));

describe("analyzeRequestSchema transcript", () => {
  it("accepts well-formed cues", () => {
    expect(
      analyzeRequestSchema.safeParse({
        videoId: "dQw4w9WgXcQ",
        transcript: cues,
      }).success,
    ).toBe(true);
  });
  it.each([
    ["empty transcript", []],
    ["t1 <= t0", [{ t0: 5, t1: 5, text: "a" }]],
    ["negative t0", [{ t0: -1, t1: 5, text: "a" }]],
    ["empty text", [{ t0: 0, t1: 5, text: "" }]],
    ["oversized text", [{ t0: 0, t1: 5, text: "x".repeat(601) }]],
  ])("rejects %s", (_n, transcript) => {
    expect(
      analyzeRequestSchema.safeParse({ videoId: "dQw4w9WgXcQ", transcript })
        .success,
    ).toBe(false);
  });
});

describe("POST /v1/segments:analyze with client transcript", () => {
  beforeEach(() => vi.mocked(classifyChunks).mockClear());

  it("classifies the supplied transcript without fetching timedtext", async () => {
    const app = buildServer();
    const res = await app.inject({
      method: "POST",
      url: "/v1/segments:analyze",
      payload: { videoId: "aaaaaaaaaaa", transcript: cues },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.status).toBe("ready");
    expect(body.segments).toHaveLength(1);
    expect(body.duration).toBe(120);
    await app.close();
  });

  it("replaces a cached non-ready analysis but not a ready one", async () => {
    const app = buildServer();
    // GET on a miss with failing timedtext + sponsorblock caches "unanalyzable"
    const miss = await app.inject({
      method: "GET",
      url: "/v1/segments/bbbbbbbbbbb",
    });
    expect(miss.json().status).toBe("unanalyzable");

    const first = await app.inject({
      method: "POST",
      url: "/v1/segments:analyze",
      payload: { videoId: "bbbbbbbbbbb", transcript: cues },
    });
    expect(first.json().status).toBe("ready");
    expect(classifyChunks).toHaveBeenCalledTimes(1);

    const second = await app.inject({
      method: "POST",
      url: "/v1/segments:analyze",
      payload: { videoId: "bbbbbbbbbbb", transcript: cues },
    });
    expect(second.json().status).toBe("ready");
    expect(classifyChunks).toHaveBeenCalledTimes(1);
    await app.close();
  });

  it("rejects an invalid transcript with 400", async () => {
    const app = buildServer();
    const res = await app.inject({
      method: "POST",
      url: "/v1/segments:analyze",
      payload: {
        videoId: "ccccccccccc",
        transcript: [{ t0: 1, t1: 1, text: "a" }],
      },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });
});

const sbSegment = (s: number, e: number) => ({
  id: crypto.randomUUID(),
  videoId: "ddddddddddd",
  channelId: null,
  startTime: s,
  endTime: e,
  confidence: 0.7,
  category: "sponsor" as const,
  source: "sponsorblock" as const,
  createdAt: new Date().toISOString(),
});
// Cues every 15s except a caption gap from 255s to 330s.
const gappedCues = Array.from({ length: 24 }, (_, i) => i * 15)
  .filter((t) => t < 255 || t >= 330)
  .map((t) => ({ t0: t, t1: t + 15, text: `line ${t}` }));

describe("caption-gap corroboration of SponsorBlock", () => {
  beforeEach(() => {
    vi.mocked(fetchSponsorBlock).mockReset();
    vi.mocked(fetchSponsorBlock).mockRejectedValue(new Error("no data"));
    vi.mocked(classifyChunks).mockReset();
  });

  it("adds a SponsorBlock segment inside a gap when Claude finds nothing", async () => {
    vi.mocked(classifyChunks).mockResolvedValue({
      candidates: [],
      model: "claude-haiku",
    });
    vi.mocked(fetchSponsorBlock).mockResolvedValue([sbSegment(259, 321.4)]);
    const app = buildServer();
    const res = await app.inject({
      method: "POST",
      url: "/v1/segments:analyze",
      payload: { videoId: "ddddddddddd", transcript: gappedCues },
    });
    const body = res.json();
    expect(body.status).toBe("ready");
    expect(body.segments).toHaveLength(1);
    expect(body.segments[0].source).toBe("sponsorblock");
    expect(body.segments[0].confidence).toBe(0.85);
    await app.close();
  });

  it("ignores SponsorBlock segments outside gaps and skips the lookup when no gap exists", async () => {
    vi.mocked(classifyChunks).mockResolvedValue({
      candidates: [],
      model: "claude-haiku",
    });
    const app = buildServer();
    const res = await app.inject({
      method: "POST",
      url: "/v1/segments:analyze",
      payload: { videoId: "eeeeeeeeeee", transcript: cues },
    });
    expect(res.json().segments).toHaveLength(0);
    expect(fetchSponsorBlock).not.toHaveBeenCalled();
    await app.close();
  });

  it("does not duplicate a region Claude already flagged", async () => {
    vi.mocked(classifyChunks).mockResolvedValue({
      candidates: [
        {
          start: 262,
          end: 318,
          category: "sponsor",
          confidence: 0.95,
          rationale: "x",
        },
      ],
      model: "claude-haiku",
    });
    vi.mocked(fetchSponsorBlock).mockResolvedValue([sbSegment(259, 321.4)]);
    const app = buildServer();
    const res = await app.inject({
      method: "POST",
      url: "/v1/segments:analyze",
      payload: { videoId: "fffffffffff", transcript: gappedCues },
    });
    const segs = res.json().segments;
    expect(segs).toHaveLength(1);
    expect(segs[0].source).toBe("claude-haiku");
    await app.close();
  });

  it("boosts the degraded fallback when the LLM call fails but a gap exists", async () => {
    vi.mocked(classifyChunks).mockRejectedValue(new Error("llm down"));
    vi.mocked(fetchSponsorBlock).mockResolvedValue([
      sbSegment(259, 321.4),
      sbSegment(30, 90),
    ]);
    const app = buildServer();
    const res = await app.inject({
      method: "POST",
      url: "/v1/segments:analyze",
      payload: { videoId: "ggggggggggg", transcript: gappedCues },
    });
    const body = res.json();
    expect(body.status).toBe("degraded");
    const byStart = Object.fromEntries(
      body.segments.map((s: { startTime: number; confidence: number }) => [
        s.startTime,
        s.confidence,
      ]),
    );
    expect(byStart[259]).toBe(0.85);
    expect(byStart[30]).toBe(0.7);
    await app.close();
  });
});

describe("no-captions fallback (GET without any transcript)", () => {
  beforeEach(() => {
    vi.mocked(fetchSponsorBlock).mockReset();
    vi.useRealTimers();
  });

  it("trusts SponsorBlock sponsors enough to skip when captions are absent", async () => {
    vi.mocked(fetchSponsorBlock).mockResolvedValue([
      sbSegment(30, 90),
      { ...sbSegment(0, 10), category: "intro" },
    ]);
    const app = buildServer();
    const body = (
      await app.inject({ method: "GET", url: "/v1/segments/hhhhhhhhhhh" })
    ).json();
    expect(body.status).toBe("degraded");
    const sponsor = body.segments.find(
      (s: { category: string }) => s.category === "sponsor",
    );
    expect(sponsor.confidence).toBe(0.85); // above the 0.78 default threshold
    const intro = body.segments.find(
      (s: { category: string }) => s.category === "intro",
    );
    expect(intro.confidence).toBe(0.7); // only sponsors are boosted
    await app.close();
  });

  it("reports 'no sponsors' (degraded, empty) when SponsorBlock has no entry", async () => {
    vi.mocked(fetchSponsorBlock).mockResolvedValue([]);
    const app = buildServer();
    const body = (
      await app.inject({ method: "GET", url: "/v1/segments/iiiiiiiiiii" })
    ).json();
    expect(body.status).toBe("degraded");
    expect(body.segments).toEqual([]);
    await app.close();
  });

  it("refreshes a fallback result once it is old enough", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-01T00:00:00Z"));
    vi.mocked(fetchSponsorBlock).mockResolvedValue([]);
    const app = buildServer();
    const url = "/v1/segments/jjjjjjjjjjj";
    await app.inject({ method: "GET", url });

    vi.setSystemTime(new Date("2026-10-01T01:00:00Z"));
    vi.mocked(fetchSponsorBlock).mockResolvedValue([sbSegment(30, 90)]);
    expect((await app.inject({ method: "GET", url })).json().segments).toEqual(
      [],
    );

    vi.setSystemTime(new Date("2026-10-01T13:00:00Z"));
    const fresh = (await app.inject({ method: "GET", url })).json();
    expect(fresh.segments).toHaveLength(1);
    expect(fetchSponsorBlock).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
    await app.close();
  });

  it("does not resurrect a deleted analysis", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-01T00:00:00Z"));
    vi.mocked(fetchSponsorBlock).mockResolvedValue([sbSegment(30, 90)]);
    const adminToken = "t".repeat(48);
    const app = buildServer({ adminToken });
    const url = "/v1/segments/kkkkkkkkkkk";
    await app.inject({ method: "GET", url });
    const deleted = await app.inject({
      method: "DELETE",
      url,
      headers: { "x-admin-token": adminToken },
    });
    expect(deleted.statusCode).toBe(204);

    vi.setSystemTime(new Date("2026-10-03T00:00:00Z"));
    const after = (await app.inject({ method: "GET", url })).json();
    expect(after.status).toBe("unanalyzable");
    expect(after.segments).toEqual([]);
    expect(fetchSponsorBlock).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
    await app.close();
  });
});
