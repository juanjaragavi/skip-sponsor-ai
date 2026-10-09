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

const CATEGORY_PRIORITY: Record<SponsorSegment["category"], number> = {
  sponsor: 5,
  selfpromo: 4,
  interaction_reminder: 3,
  outro: 2,
  intro: 1,
};

/**
 * Collapse near-duplicates across categories: SponsorBlock often returns the
 * same stretch as e.g. both "sponsor" and "selfpromo" (seen live: 1246–1289
 * and 1248–1289), which showed as two rows. Two segments are duplicates when
 * their overlap covers >= 80% of the shorter one; the higher-priority
 * category (then higher confidence) wins and keeps its own bounds.
 */
export function dedupeOverlapping(
  segments: SponsorSegment[],
): SponsorSegment[] {
  const ranked = [...segments].sort(
    (a, b) =>
      CATEGORY_PRIORITY[b.category] - CATEGORY_PRIORITY[a.category] ||
      b.confidence - a.confidence,
  );
  const kept: SponsorSegment[] = [];
  for (const s of ranked) {
    const dup = kept.some((k) => {
      const overlap =
        Math.min(k.endTime, s.endTime) - Math.max(k.startTime, s.startTime);
      const shorter = Math.min(
        k.endTime - k.startTime,
        s.endTime - s.startTime,
      );
      return shorter > 0 && overlap >= 0.8 * shorter;
    });
    if (!dup) kept.push(s);
  }
  return kept.sort((a, b) => a.startTime - b.startTime);
}
