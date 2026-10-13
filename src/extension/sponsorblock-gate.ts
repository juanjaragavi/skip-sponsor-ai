import type { VideoAnalysis } from "../shared/types";

/**
 * Build-time switch (VITE_SPONSORBLOCK_ENABLED=1 in vite.config.ts), off by
 * default. SponsorBlock data is CC BY-NC-SA; the API keeps it off too
 * (SPONSORBLOCK_ENABLED). The extension also drops it so a cached result
 * from an older server, or a server with the switch on, never skips on it.
 */
export const SPONSORBLOCK_ENABLED: boolean =
  typeof __SPONSORBLOCK_ENABLED__ !== "undefined" &&
  __SPONSORBLOCK_ENABLED__ === true;

/**
 * With the switch off: SponsorBlock segments are removed, and a SponsorBlock
 * fallback result ("degraded") becomes an honest "unanalyzable" (nothing was
 * analyzed, nothing is skipped, the popup says so).
 */
export function applySponsorBlockSwitch(
  analysis: VideoAnalysis | null,
  enabled: boolean = SPONSORBLOCK_ENABLED,
): VideoAnalysis | null {
  if (enabled || !analysis) return analysis;
  if (analysis.status === "degraded")
    return { ...analysis, status: "unanalyzable", segments: [] };
  return {
    ...analysis,
    segments: analysis.segments.filter((s) => s.source !== "sponsorblock"),
  };
}
