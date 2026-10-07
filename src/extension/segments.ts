import type { SponsorSegment } from "../shared/types";
import { MERGE_GAP_SECONDS } from "../shared/constants";

/** Return segment containing t, or undefined. Pure + unit-testable. */
export function isInSegment(
  t: number,
  segments: SponsorSegment[],
): SponsorSegment | undefined {
  return segments.find((s) => t >= s.startTime && t < s.endTime);
}

/** Merge segments with gaps < MERGE_GAP_SECONDS and same category. */
export function mergeSegments(segments: SponsorSegment[]): SponsorSegment[] {
  if (segments.length <= 1) return [...segments];
  const sorted = [...segments].sort((a, b) => a.startTime - b.startTime);
  const out: SponsorSegment[] = [];
  let cur = sorted[0]!;
  for (const nxt of sorted.slice(1)) {
    const gap = nxt.startTime - cur.endTime;
    if (nxt.category === cur.category && gap < MERGE_GAP_SECONDS) {
      cur = {
        ...cur,
        endTime: Math.max(cur.endTime, nxt.endTime),
        confidence: Math.min(cur.confidence, nxt.confidence),
      };
    } else {
      out.push(cur);
      cur = nxt;
    }
  }
  out.push(cur);
  return out;
}

/** Drop segments below confidence threshold or violating duration bounds. */
export function thresholdFilter(
  segments: SponsorSegment[],
  threshold: number,
  minDur = 5,
  maxDur = 600,
): SponsorSegment[] {
  return segments.filter(
    (s) =>
      s.confidence >= threshold &&
      s.endTime > s.startTime &&
      s.endTime - s.startTime >= minDur &&
      s.endTime - s.startTime <= maxDur,
  );
}

/** Round timestamps to 3 decimals for stable persistence. */
export function normalizeSegmentTimes(
  start: number,
  end: number,
): { startTime: number; endTime: number } {
  return {
    startTime: Math.max(0, Math.round(start * 1000) / 1000),
    endTime: Math.round(end * 1000) / 1000,
  };
}
