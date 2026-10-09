import type { UserPolicy, SponsorSegment } from "../shared/types";

export interface PolicyDecision {
  shouldSkip: boolean;
  reason: string;
}

/** Centralized skip decision per spec §3.2 Policy Engine. Pure function. */
export function decideSkip(
  policy: UserPolicy,
  segment: SponsorSegment,
  channelId: string | null,
  opts: { globalKill: boolean; userOverridden: boolean },
): PolicyDecision {
  if (opts.globalKill) return { shouldSkip: false, reason: "kill-switch" };
  if (!policy.globalEnabled) return { shouldSkip: false, reason: "global-off" };
  if (policy.mode === "off") return { shouldSkip: false, reason: "mode-off" };
  if (opts.userOverridden)
    return { shouldSkip: false, reason: "user-override" };
  if (
    channelId &&
    policy.blockedChannels.some((c) => sameChannel(c, channelId))
  )
    return { shouldSkip: false, reason: "channel-blocked" };
  // Only paid sponsor reads are skipped; intros, outros and self-promo are not.
  if (segment.category !== "sponsor")
    return { shouldSkip: false, reason: "category-not-skippable" };
  if (segment.confidence < policy.confidenceThreshold)
    return { shouldSkip: false, reason: "low-confidence" };
  if (policy.mode === "notify")
    return { shouldSkip: false, reason: "notify-only" };
  return { shouldSkip: true, reason: "auto-skip" };
}

/**
 * Channel ids are "@handle" (case-insensitive on YouTube) or "channel/UC…"
 * (case-sensitive). A handle typed in Settings must match the page's link.
 */
export function sameChannel(a: string, b: string): boolean {
  return a.startsWith("@") && b.startsWith("@")
    ? a.toLowerCase() === b.toLowerCase()
    : a === b;
}

export const DEFAULT_POLICY: UserPolicy = {
  globalEnabled: true,
  mode: "auto",
  confidenceThreshold: 0.78,
  blockedChannels: [],
  allowlistedChannels: [],
};
