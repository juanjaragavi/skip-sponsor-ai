export const DEFAULT_CONFIDENCE_THRESHOLD = 0.78;
export const MIN_SEGMENT_DURATION = 5;
export const MAX_SEGMENT_DURATION = 600;
export const MERGE_GAP_SECONDS = 4;
export const SKIP_FORWARD_OFFSET = 0.25;
export const UNDO_REWIND_OFFSET = 1.0;
export const UNDO_TOAST_MS = 4000;
export const TRANSCRIPT_DEBOUNCE_MS = 800;
export const LLM_TIMEOUT_MS = 8000;
export const CACHE_TTL_SECONDS = 30 * 24 * 3600;
export const INFLIGHT_TTL_SECONDS = 15;
export const CHUNK_WINDOW_SECONDS = 60;
export const CHUNK_OVERLAP_SECONDS = 10;

export const SYSTEM_PROMPT = `You are a sponsor-segment classifier. Input: transcript chunks [{t0,t1,text}]. Output ONLY JSON: {segments:[{start,end,category,confidence,rationale}]}. Rules: sponsor=self-paid promotion distinct from video topic (VPN, meal kit, etc.); exclude editorial product review. Merge gaps <4s. Confidence 0-1. temperature=0.`;

export const MODEL_POLICY = {
  primary: "claude-3-5-haiku-latest",
  fallback: "claude-3-5-sonnet-latest",
  timeoutMs: 8000,
  maxTokens: 1024,
  acceptThreshold: 0.78,
  reviewBand: [0.55, 0.78],
} as const;

export const DEFAULT_POLICY = {
  globalEnabled: true,
  mode: "auto",
  confidenceThreshold: 0.78,
  blockedChannels: [],
  allowlistedChannels: [],
} as const;
