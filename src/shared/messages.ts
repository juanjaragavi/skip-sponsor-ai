import type { SponsorSegment } from "./types";

/** Lifecycle of the analysis for the video in a tab. */
export type AnalysisPhase = "idle" | "analyzing" | "ready" | "unavailable";

/** Why the API refused a fresh analysis (RFC7807 `reason`), and when it resets. */
export interface AnalysisLimit {
  reason:
    "install_quota" | "global_budget" | "llm_disabled" | "unauthenticated";
  /** ISO time new analyses are accepted again (next 00:00 UTC). */
  resetAt: string;
}

/** Service worker -> content script reply to SEGMENTS_ANALYZE. */
export interface AnalyzeReply {
  analysis: unknown;
  /** Set when the API refused the analysis (daily quota, budget, paused). */
  limit?: AnalysisLimit;
  /** True the first time this limit is reported (show the notice once). */
  announce?: boolean;
}

/** Snapshot the content script returns for the popup's "This video" monitor. */
export interface PageState {
  videoId: string | null;
  channelId: string | null;
  channelName: string | null;
  currentTime: number;
  duration: number;
  phase: AnalysisPhase;
  /** True when segments come from the SponsorBlock fallback (no Claude analysis). */
  fallback: boolean;
  segments: SponsorSegment[];
  /** Segment ids skipped in this playback. */
  skipped: string[];
  /** Segment ids the user chose to keep (Undo or seeking back into them). */
  overridden: string[];
  /** Segment ids the player refused to skip (it kept snapping back). */
  blocked: string[];
  /** Auto-skip stopped for this video after too many seeks in a short time. */
  skippingPaused: boolean;
  adPlaying: boolean;
  /** The API refused a fresh analysis for this video; cached/community data only. */
  limit: AnalysisLimit | null;
}

/** popup -> content script */
export interface PageStateRequest {
  type: "PAGE_STATE_GET";
}
