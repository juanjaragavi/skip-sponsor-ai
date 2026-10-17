export type SkipMode = "auto" | "notify" | "off";

export type SegmentSource =
  "claude-haiku" | "claude-sonnet" | "sponsorblock" | "manual";

export type SegmentCategory =
  "sponsor" | "intro" | "outro" | "selfpromo" | "interaction_reminder";

export interface SponsorSegment {
  id: string;
  videoId: string;
  channelId: string | null;
  startTime: number;
  endTime: number;
  confidence: number;
  category: SegmentCategory;
  source: SegmentSource;
  createdAt: string;
}

export type AnalysisStatus = "ready" | "pending" | "unanalyzable" | "degraded";

export interface VideoAnalysis {
  videoId: string;
  duration: number;
  language: string;
  status: AnalysisStatus;
  segments: SponsorSegment[];
  transcriptVersion: string;
  analyzedAt: string;
}

export interface UserPolicy {
  globalEnabled: boolean;
  mode: SkipMode;
  confidenceThreshold: number;
  blockedChannels: string[];
  allowlistedChannels: string[];
}

export interface LlmChunk {
  t0: number;
  t1: number;
  text: string;
}

export interface LlmSegmentCandidate {
  start: number;
  end: number;
  /** Runtime value is untrusted model output; only "sponsor" is accepted. */
  category: SegmentCategory;
  confidence: number;
  /** Company paying for the promotion, as named by the model. */
  advertiser?: string | undefined;
  /** "third_party_sponsor" | "first_party" | "integrated" | "network_promo" | "other" */
  relationship?: string | undefined;
  /** True when the speaker interrupts the video's topic for the promo and later returns. */
  breaksFromContent?: boolean | undefined;
  /** Verbatim quote from a cue inside the segment proving it is an ad. */
  evidence?: string | undefined;
  rationale?: string | undefined;
}

export type TelemetryEventType =
  | "skip_executed"
  | "skip_undone"
  | "fallback_used"
  | "llm_error"
  | "no_captions";
