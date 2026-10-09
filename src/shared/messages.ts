import type { SponsorSegment } from "./types";

/** Lifecycle of the analysis for the video in a tab. */
export type AnalysisPhase = "idle" | "analyzing" | "ready" | "unavailable";

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
  adPlaying: boolean;
}

/** popup -> content script */
export interface PageStateRequest {
  type: "PAGE_STATE_GET";
}
