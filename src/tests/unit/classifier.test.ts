import { describe, it, expect } from "vitest";
import { decideSkip, DEFAULT_POLICY } from "../../extension/policy";
import {
  candidatesToSegments,
  dedupeOverlapping,
  mergeCandidates,
} from "../../api/services/segment-classifier";
import type { SponsorSegment } from "../../shared/types";

const sb = (
  startTime: number,
  endTime: number,
  category: SponsorSegment["category"],
  confidence = 0.85,
): SponsorSegment => ({
  id: `${category}-${startTime}`,
  videoId: "ujkD4SxPKOI",
  channelId: null,
  startTime,
  endTime,
  confidence,
  category,
  source: "sponsorblock",
  createdAt: "2026-10-09T00:00:00.000Z",
});

describe("dedupeOverlapping", () => {
  it("collapses the same stretch labeled twice, keeping the sponsor label (live: ujkD4SxPKOI)", () => {
    const out = dedupeOverlapping([
      sb(227, 235, "sponsor"),
      sb(1246, 1289, "selfpromo"),
      sb(1248, 1289, "sponsor"),
      sb(1288, 1304, "outro"),
    ]);
    expect(out.map((s) => [s.startTime, s.endTime, s.category])).toEqual([
      [227, 235, "sponsor"],
      [1248, 1289, "sponsor"],
      [1288, 1304, "outro"], // only 1s of overlap: a different segment
    ]);
  });

  it("same category: the more confident one wins", () => {
    const out = dedupeOverlapping([
      sb(100, 160, "sponsor", 0.8),
      sb(102, 160, "sponsor", 0.95),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]!.confidence).toBe(0.95);
  });
});

describe("candidatesToSegments", () => {
  it("filters by threshold and duration", () => {
    const segs = candidatesToSegments("dQw4w9WgXcQ", null, "claude-haiku", [
      {
        start: 10,
        end: 70,
        category: "sponsor",
        confidence: 0.94,
        rationale: "vpn read",
      },
      {
        start: 80,
        end: 82,
        category: "sponsor",
        confidence: 0.99,
        rationale: "x",
      },
      {
        start: 90,
        end: 150,
        category: "sponsor",
        confidence: 0.5,
        rationale: "y",
      },
    ]);
    expect(segs).toHaveLength(1);
    expect(segs[0]!.startTime).toBe(10);
  });

  it("keeps validated self-promo (shown, never auto-skipped) and drops other categories", () => {
    const segs = candidatesToSegments("dQw4w9WgXcQ", null, "claude-haiku", [
      { start: 10, end: 70, category: "selfpromo", confidence: 0.9 },
      { start: 100, end: 160, category: "intro", confidence: 0.9 },
    ]);
    expect(segs.map((s) => [s.category, s.startTime])).toEqual([
      ["selfpromo", 10],
    ]);
    expect(
      decideSkip(DEFAULT_POLICY, segs[0]!, null, {
        globalKill: false,
        userOverridden: false,
      }),
    ).toEqual({ shouldSkip: false, reason: "category-not-skippable" });
  });
});

describe("mergeCandidates", () => {
  it("merges <4s gaps", () => {
    const base = candidatesToSegments("dQw4w9WgXcQ", null, "claude-haiku", [
      {
        start: 10,
        end: 70,
        category: "sponsor",
        confidence: 0.9,
        rationale: "a",
      },
      {
        start: 72,
        end: 130,
        category: "sponsor",
        confidence: 0.9,
        rationale: "b",
      },
    ]);
    expect(mergeCandidates(base)).toHaveLength(1);
  });
});
