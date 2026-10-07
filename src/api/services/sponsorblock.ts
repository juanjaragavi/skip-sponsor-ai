import type { SponsorSegment } from "../../shared/types";
import { assertFetchAllowed } from "./transcript-fetcher";
import { MODEL_POLICY } from "../../shared/constants";

interface SBEntry {
  segment: [number, number];
  category: string;
}

/** Read-only SponsorBlock fallback (spec FR-07). No writes in v1. */
export async function fetchSponsorBlock(
  videoId: string,
): Promise<SponsorSegment[]> {
  const url =
    `https://sponsor.ajay.app/api/skipSegments?videoID=${videoId}` +
    `&categories=["sponsor","intro","outro","selfpromo","interaction_reminder"]`;
  assertFetchAllowed(url);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`sponsorblock ${res.status}`);
  const data = (await res.json()) as SBEntry[];
  const now = new Date().toISOString();
  return data.map((d, i) => ({
    id: `00000000-0000-4000-8000-${String(i).padStart(4, "0")}00000000`,
    videoId,
    channelId: null,
    startTime: d.segment[0],
    endTime: d.segment[1],
    confidence: 0.7,
    category: mapCategory(d.category),
    source: "sponsorblock" as const,
    createdAt: now,
  }));
}

function mapCategory(c: string): SponsorSegment["category"] {
  if (c === "interaction_reminder") return "interaction_reminder";
  if (c === "selfpromo") return "selfpromo";
  if (c === "intro") return "intro";
  if (c === "outro") return "outro";
  return "sponsor";
}

export function acceptThresholdFilter<T extends { confidence: number }>(
  items: T[],
): T[] {
  return items.filter((i) => i.confidence >= MODEL_POLICY.acceptThreshold);
}
