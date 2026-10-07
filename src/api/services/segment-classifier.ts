import type { LlmSegmentCandidate, SponsorSegment } from "../../shared/types";
import { MODEL_POLICY } from "../../shared/constants";

export function candidatesToSegments(
  videoId: string,
  channelId: string | null,
  source: SponsorSegment["source"],
  candidates: LlmSegmentCandidate[],
): SponsorSegment[] {
  const now = new Date().toISOString();
  return candidates
    .filter(
      (c) =>
        c.category === "sponsor" &&
        Number.isFinite(c.start) &&
        Number.isFinite(c.end) &&
        c.end > c.start &&
        c.end - c.start >= 5 &&
        c.end - c.start <= 600 &&
        c.confidence >= MODEL_POLICY.acceptThreshold,
    )
    .map((c, i) => ({
      id: crypto.randomUUID(),
      videoId,
      channelId,
      startTime: Math.round(c.start * 1000) / 1000,
      endTime: Math.round(c.end * 1000) / 1000,
      confidence: c.confidence,
      category: c.category,
      source,
      createdAt: now,
      _i: i,
    }))
    .sort((a, b) => a.startTime - b.startTime)
    .map(({ _i, ...rest }) => rest as SponsorSegment);
}

/** Merge gaps <4s same category (shared with client). */
export function mergeCandidates(segments: SponsorSegment[]): SponsorSegment[] {
  const sorted = [...segments].sort((a, b) => a.startTime - b.startTime);
  const out: SponsorSegment[] = [];
  for (const s of sorted) {
    const last = out[out.length - 1];
    if (
      last &&
      last.category === s.category &&
      s.startTime - last.endTime < 4
    ) {
      last.endTime = Math.max(last.endTime, s.endTime);
    } else {
      out.push({ ...s });
    }
  }
  return out;
}
