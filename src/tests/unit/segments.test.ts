import { describe, it, expect } from "vitest";
import {
  isInSegment,
  mergeSegments,
  thresholdFilter,
} from "../../extension/segments";
import type { SponsorSegment } from "../../shared/types";

const seg = (
  s: number,
  e: number,
  conf = 0.9,
  cat: SponsorSegment["category"] = "sponsor",
): SponsorSegment => ({
  id: crypto.randomUUID(),
  videoId: "dQw4w9WgXcQ",
  channelId: null,
  startTime: s,
  endTime: e,
  confidence: conf,
  category: cat,
  source: "claude-haiku",
  createdAt: new Date().toISOString(),
});

describe("isInSegment", () => {
  it("finds containing segment, start-inclusive end-exclusive", () => {
    const segs = [seg(10, 20)];
    expect(isInSegment(10, segs)?.startTime).toBe(10);
    expect(isInSegment(19.9, segs)?.startTime).toBe(10);
    expect(isInSegment(20, segs)).toBeUndefined();
    expect(isInSegment(5, segs)).toBeUndefined();
  });
});

describe("mergeSegments", () => {
  it("merges gaps <4s same category", () => {
    const out = mergeSegments([seg(10, 20), seg(22, 30)]);
    expect(out).toHaveLength(1);
    expect(out[0]!.endTime).toBe(30);
  });
  it("keeps gaps >=4s separate and different categories separate", () => {
    expect(mergeSegments([seg(10, 20), seg(24, 30)])).toHaveLength(2);
    expect(
      mergeSegments([seg(10, 20, 0.9, "sponsor"), seg(22, 30, 0.9, "intro")]),
    ).toHaveLength(2);
  });
});

describe("thresholdFilter", () => {
  it("drops low confidence and out-of-bounds durations", () => {
    const segs = [
      seg(0, 60, 0.5),
      seg(0, 60, 0.9),
      seg(0, 3, 0.99),
      seg(0, 700, 0.99),
    ];
    const out = thresholdFilter(segs, 0.78);
    expect(out).toHaveLength(1);
    expect(out[0]!.confidence).toBe(0.9);
  });
});
