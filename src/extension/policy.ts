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
  opts: { globalKill: boolean; userOverridden: boolean }
): PolicyDecision {
  if (opts.globalKill) return { shouldSkip: false, reason: "kill-switch" };
  if (!policy.globalEnabled) return { shouldSkip: false, reason: "global-off" };
  if (policy.mode === "off") return { shouldSkip: false, reason: "mode-off" };
  if (opts.userOverridden)
    return { shouldSkip: false, reason: "user-override" };
  if (channelId && policy.blockedChannels.includes(channelId))
    return { shouldSkip: false, reason: "channel-blocked" };
  if (segment.confidence < policy.confidenceThreshold)
    return { shouldSkip: false, reason: "low-confidence" };
  if (policy.mode === "notify")
    return { shouldSkip: false, reason: "notify-only" };
  return { shouldSkip: true, reason: "auto-skip" };
}

export const DEFAULT_POLICY: UserPolicy = {
  globalEnabled: true,
  mode: "auto",
  confidenceThreshold: 0.78,
  blockedChannels: [],
  allowlistedChannels: [],
};
