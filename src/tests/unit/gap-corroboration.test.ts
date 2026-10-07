import { describe, it, expect } from "vitest";
import {
  corroborateSegments,
  findCaptionGaps,
} from "../../api/services/gap-corroboration";
import {
  CORROBORATED_CONFIDENCE,
  MIN_CAPTION_GAP_SECONDS,
} from "../../shared/constants";
import type { LlmChunk, SponsorSegment } from "../../shared/types";

const cue = (t0: number): LlmChunk => ({ t0, t1: t0 + 3, text: "x" });
const sb = (
  s: number,
  e: number,
  category: SponsorSegment["category"] = "sponsor",
): SponsorSegment => ({
  id: crypto.randomUUID(),
  videoId: "dQw4w9WgXcQ",
  channelId: null,
  startTime: s,
  endTime: e,
  confidence: 0.7,
  category,
  source: "sponsorblock",
  createdAt: "2026-01-01T00:00:00.000Z",
});

describe("findCaptionGaps", () => {
  it("returns spans between cue starts at or above the minimum", () => {
    const dense = Array.from({ length: 52 }, (_, i) => cue(i * 5)); // 0..255
    const gaps = findCaptionGaps([...dense, cue(325), cue(330)]);
    expect(gaps).toEqual([{ start: 255, end: 325 }]);
  });
  it("treats exactly the minimum as a gap and just under as none", () => {
    expect(
      findCaptionGaps([cue(0), cue(MIN_CAPTION_GAP_SECONDS)]),
    ).toHaveLength(1);
    expect(
      findCaptionGaps([cue(0), cue(MIN_CAPTION_GAP_SECONDS - 1)]),
    ).toHaveLength(0);
  });
  it("includes a long leading gap before the first cue", () => {
    expect(findCaptionGaps([cue(45), cue(50)])).toEqual([
      { start: 0, end: 45 },
    ]);
  });
  it("sorts unsorted input and handles empty input", () => {
    expect(findCaptionGaps([cue(325), cue(258)])).toEqual([
      { start: 0, end: 258 },
      { start: 258, end: 325 },
    ]);
    expect(findCaptionGaps([])).toEqual([]);
  });
});

describe("corroborateSegments", () => {
  const gaps = [{ start: 255, end: 325 }];

  it("raises confidence of sponsor segments mostly inside a gap", () => {
    const [out] = corroborateSegments([sb(259, 321.4)], gaps);
    expect(out!.confidence).toBe(CORROBORATED_CONFIDENCE);
    expect(out!.source).toBe("sponsorblock");
  });
  it("leaves segments outside any gap untouched", () => {
    const [out] = corroborateSegments([sb(100, 160)], gaps);
    expect(out!.confidence).toBe(0.7);
  });
  it("requires most of the segment to overlap the gap", () => {
    expect(corroborateSegments([sb(300, 420)], gaps)[0]!.confidence).toBe(0.7);
  });
  it("sums overlap across adjacent gaps", () => {
    const two = [
      { start: 100, end: 140 },
      { start: 140, end: 200 },
    ];
    expect(corroborateSegments([sb(110, 190)], two)[0]!.confidence).toBe(
      CORROBORATED_CONFIDENCE,
    );
  });
  it("only boosts the sponsor category", () => {
    expect(
      corroborateSegments([sb(259, 321, "intro")], gaps)[0]!.confidence,
    ).toBe(0.7);
  });
  it("does not mutate its input", () => {
    const input = [sb(259, 321.4)];
    corroborateSegments(input, gaps);
    expect(input[0]!.confidence).toBe(0.7);
  });
});
