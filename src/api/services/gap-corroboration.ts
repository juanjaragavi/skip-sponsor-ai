import type { LlmChunk, SponsorSegment } from "../../shared/types";
import {
  CORROBORATED_CONFIDENCE,
  GAP_OVERLAP_RATIO,
  MIN_CAPTION_GAP_SECONDS,
} from "../../shared/constants";

export interface CaptionGap {
  start: number;
  end: number;
}

/**
 * Spans with no captions. Cue starts are the only reliable signal (the page
 * transcript has no end times), so a gap is a jump between consecutive cue
 * starts, plus a long silence before the first cue.
 */
export function findCaptionGaps(chunks: readonly LlmChunk[]): CaptionGap[] {
  const starts = chunks.map((c) => c.t0).sort((a, b) => a - b);
  const first = starts[0];
  if (first === undefined) return [];
  const gaps: CaptionGap[] = [];
  if (first >= MIN_CAPTION_GAP_SECONDS) gaps.push({ start: 0, end: first });
  for (let i = 1; i < starts.length; i++) {
    const prev = starts[i - 1]!;
    const next = starts[i]!;
    if (next - prev >= MIN_CAPTION_GAP_SECONDS)
      gaps.push({ start: prev, end: next });
  }
  return gaps;
}

function overlapSeconds(
  aStart: number,
  aEnd: number,
  bStart: number,
  bEnd: number,
): number {
  return Math.max(0, Math.min(aEnd, bEnd) - Math.max(aStart, bStart));
}

export function segmentsOverlap(a: SponsorSegment, b: SponsorSegment): boolean {
  return overlapSeconds(a.startTime, a.endTime, b.startTime, b.endTime) > 0;
}

/**
 * Raise the confidence of community (SponsorBlock) sponsor segments that sit
 * mostly inside a caption gap: captions cannot confirm or deny them, so the
 * community label is the best evidence. Returns copies; input is untouched.
 */
export function corroborateSegments(
  segments: readonly SponsorSegment[],
  gaps: readonly CaptionGap[],
): SponsorSegment[] {
  return segments.map((seg) => {
    if (seg.category !== "sponsor") return { ...seg };
    const length = seg.endTime - seg.startTime;
    const inside = gaps.reduce(
      (sum, g) =>
        sum + overlapSeconds(seg.startTime, seg.endTime, g.start, g.end),
      0,
    );
    return length > 0 && inside / length >= GAP_OVERLAP_RATIO
      ? {
          ...seg,
          confidence: Math.max(seg.confidence, CORROBORATED_CONFIDENCE),
        }
      : { ...seg };
  });
}
