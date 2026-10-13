import type {
  SponsorSegment,
  VideoAnalysis,
  UserPolicy,
} from "../shared/types";
import type {
  AnalysisLimit,
  AnalysisPhase,
  AnalyzeReply,
  PageState,
} from "../shared/messages";
import { DomVideoAdapter, getVideoIdFromUrl } from "./video-adapter";
import { isInSegment } from "./segments";
import { decideSkip, DEFAULT_POLICY } from "./policy";
import {
  showNoticeToast,
  showNotifyBanner,
  showSkipToast,
  type NotifyHandle,
} from "./toast";
import { limitCopy } from "./view-model";
import { markTranscriptStale, readTranscriptFromPage } from "./transcript";
import { readTranscriptViaPanelApi } from "./innertube-transcript";
import { SKIP_FORWARD_OFFSET, UNDO_REWIND_OFFSET } from "../shared/constants";
import { SkipGuard } from "./skip-guard";

const adapter = new DomVideoAdapter();
let segments: SponsorSegment[] = [];
let policy: UserPolicy = { ...DEFAULT_POLICY };
let overridden = new Set<string>();
/** Segments skipped during this playback (shown as "Skipped" in the popup). */
let skipped = new Set<string>();
/** Segments already announced in notify mode (once per entry). */
let notified = new Set<string>();
let banner: { segmentId: string; handle: NotifyHandle } | null = null;
let lastVideoId: string | null = null;
let phase: AnalysisPhase = "idle";
let fallback = false;
/** The API refused a fresh analysis for this video (quota, budget, paused). */
let limit: AnalysisLimit | null = null;
let detachTimeUpdate: (() => void) | null = null;
let detachSeeking: (() => void) | null = null;
let debounceTimer = 0;
/** Loop protection for automatic seeks (see skip-guard.ts). */
let guard = new SkipGuard();

/**
 * A seek counts as the user's choice only right after real input (click on
 * the progress bar, arrow keys, chapter links). YouTube also seeks on its own
 * (resume position, after an ad); those must not cancel a skip.
 */
const USER_SEEK_WINDOW_MS = 1500;
let lastUserInputAt = Number.NEGATIVE_INFINITY;
for (const type of ["pointerdown", "keydown"])
  document.addEventListener(type, () => (lastUserInputAt = performance.now()), {
    capture: true,
    passive: true,
  });

/**
 * A partial stored policy (older version, partial write) must not drop
 * required fields: a missing `globalEnabled` would disable every skip.
 */
function applyPolicy(stored: unknown): void {
  policy = {
    ...DEFAULT_POLICY,
    ...((stored as Partial<UserPolicy> | undefined) ?? {}),
  };
}

async function loadPolicy(): Promise<void> {
  const stored = await chrome.storage.sync.get(["policy"]);
  applyPolicy(stored["policy"]);
}

/** Settings saved in the popup apply to the playing video immediately. */
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "sync" || !changes["policy"]) return;
  applyPolicy(changes["policy"].newValue);
  if (policy.mode !== "notify" || !policy.globalEnabled) closeBanner();
});

/** The popup's "This video" monitor reads the tab's state from here. */
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type !== "PAGE_STATE_GET") return false;
  const videoId = getVideoIdFromUrl(location.href);
  const current = videoId !== null && videoId === lastVideoId;
  const state: PageState = {
    videoId,
    channelId: adapter.getChannelId(),
    channelName: adapter.getChannelName(),
    currentTime: adapter.isAdPlaying() ? 0 : adapter.getCurrentTime(),
    duration: contentDuration(),
    phase: current ? phase : "idle",
    fallback: current && fallback,
    segments: current ? segments : [],
    skipped: [...skipped],
    overridden: [...overridden],
    blocked: current ? guard.blocked() : [],
    skippingPaused: current && guard.isTripped(),
    adPlaying: adapter.isAdPlaying(),
    limit: current ? limit : null,
  };
  sendResponse(state);
  return false;
});

async function fetchSegments(videoId: string): Promise<VideoAnalysis | null> {
  try {
    const res = await chrome.runtime.sendMessage({
      type: "SEGMENTS_GET",
      videoId,
    });
    return (res?.analysis ?? null) as VideoAnalysis | null;
  } catch {
    return null;
  }
}

/** Duration of the video itself; unknown (0) while a YouTube ad occupies the player. */
function contentDuration(): number {
  return adapter.isAdPlaying() ? 0 : adapter.getVideo()?.duration || 0;
}

/**
 * Cached "ready" results are used as-is. Otherwise upload the transcript read
 * from the page (innertube-transcript.ts, else transcript.ts) for Claude analysis, keeping the degraded (SponsorBlock)
 * result when no transcript is available or the upload fails.
 */
async function resolveAnalysis(videoId: string): Promise<VideoAnalysis | null> {
  const initial = await fetchSegments(videoId);
  if (initial?.status === "ready") return initial;
  const stillCurrent = () => lastVideoId === videoId;
  // The transcript panel API first (no UI, works where YouTube's legacy
  // panel fails), then the rendered panel as a fallback.
  const transcript =
    (await readTranscriptViaPanelApi(videoId, contentDuration, stillCurrent)) ??
    (stillCurrent()
      ? await readTranscriptFromPage(videoId, contentDuration, stillCurrent)
      : null);
  if (!transcript || !stillCurrent()) return initial;
  try {
    const res = (await chrome.runtime.sendMessage({
      type: "SEGMENTS_ANALYZE",
      videoId,
      // Read after the transcript: by then the page shows the new video's channel.
      channelId: adapter.getChannelId(),
      transcript,
    })) as AnalyzeReply | undefined;
    if (res?.limit && stillCurrent()) {
      // Keep the cached / community (SponsorBlock) result; say why once a day.
      limit = res.limit;
      if (res.announce) {
        const copy = limitCopy(res.limit);
        showNoticeToast(copy.title, copy.sub);
      }
    }
    return (res?.analysis as VideoAnalysis | null) ?? initial;
  } catch {
    return initial;
  }
}

function skip(seg: SponsorSegment): void {
  const t0 = performance.now();
  guard.recordSeek(seg.id, seg.startTime, seg.endTime);
  adapter.seekTo(seg.endTime + SKIP_FORWARD_OFFSET);
  // seekTo usually applies synchronously: confirm the landing right away so a
  // later legitimate re-entry isn't held back as "pending".
  guard.observe(adapter.getCurrentTime());
  const latency = Math.round(performance.now() - t0);
  skipped.add(seg.id);
  void chrome.runtime.sendMessage({
    type: "TELEMETRY",
    eventType: "skip_executed",
    videoId: lastVideoId,
    latencyMs: latency,
  });
  showSkipToast(seg, {
    onUndo: () => {
      adapter.seekTo(Math.max(0, seg.startTime - UNDO_REWIND_OFFSET));
      overridden.add(seg.id);
      skipped.delete(seg.id);
      void chrome.runtime.sendMessage({
        type: "TELEMETRY",
        eventType: "skip_undone",
        videoId: lastVideoId,
      });
    },
  });
}

function closeBanner(): void {
  banner?.handle.dismiss();
  banner = null;
}

/** Notify mode: offer a one-click skip once per segment entry. */
function notify(seg: SponsorSegment, t: number): void {
  if (notified.has(seg.id)) return;
  notified.add(seg.id);
  const remainingMs = Math.max(1000, (seg.endTime - t) * 1000);
  const handle = showNotifyBanner(
    seg,
    () => {
      banner = null;
      skip(seg);
    },
    remainingMs,
  );
  handle.update(t);
  banner = { segmentId: seg.id, handle };
}

function armSkipLoop(): void {
  detachTimeUpdate?.();
  detachTimeUpdate = adapter.onTimeUpdate((t) => {
    // During a YouTube ad, currentTime is the ad's clock, not the video's.
    if (adapter.isAdPlaying()) {
      guard.noteAd();
      return;
    }
    if (guard.observe(t) === "gave-up")
      void chrome.runtime.sendMessage({
        type: "TELEMETRY",
        eventType: "skip_bounced",
        videoId: lastVideoId,
      });
    const seg = isInSegment(t, segments);
    if (banner && banner.segmentId !== seg?.id) closeBanner();
    if (!seg || overridden.has(seg.id)) return;
    // Channel is read at decision time: right after an SPA navigation the DOM
    // still shows the previous video's channel for a while.
    const d = decideSkip(policy, seg, adapter.getChannelId(), {
      globalKill: false,
      userOverridden: false,
    });
    if (d.reason === "notify-only") {
      notify(seg, t);
      banner?.handle.update(t);
    } else if (d.shouldSkip && guard.canSkip(seg.id).ok) skip(seg);
  });
}

/** Suppress re-skip when the user deliberately seeks into a segment. */
function armSeekOverride(): void {
  detachSeeking?.();
  detachSeeking = adapter.onSeeking((t) => {
    if (adapter.isAdPlaying()) return;
    if (performance.now() - lastUserInputAt > USER_SEEK_WINDOW_MS) return;
    const seg = isInSegment(t, segments);
    if (seg) overridden.add(seg.id);
  });
}

async function initForVideo(videoId: string): Promise<void> {
  lastVideoId = videoId;
  overridden = new Set();
  skipped = new Set();
  notified = new Set();
  guard = new SkipGuard();
  closeBanner();
  segments = [];
  phase = "analyzing";
  fallback = false;
  limit = null;
  detachTimeUpdate?.();
  detachSeeking?.();
  detachTimeUpdate = detachSeeking = null;
  await loadPolicy();
  window.clearTimeout(debounceTimer);
  debounceTimer = window.setTimeout(async () => {
    const analysis = await resolveAnalysis(videoId);
    if (lastVideoId !== videoId) return;
    if (!analysis) {
      phase = "unavailable";
      return;
    }
    phase = "ready";
    fallback = analysis.status !== "ready";
    segments = analysis.segments;
    armSkipLoop();
    armSeekOverride();
  }, 800);
}

function currentVideoId(): string | null {
  return getVideoIdFromUrl(location.href);
}

function observeNavigation(): void {
  let last = currentVideoId();
  const boot = () => {
    const v = currentVideoId();
    if (v && v !== last) {
      // Transcript rows still in the DOM belong to the video we just left.
      if (last) markTranscriptStale(last);
      last = v;
      void initForVideo(v);
    }
  };
  document.addEventListener("yt-navigate-finish", boot);
  new MutationObserver(boot).observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
  const v0 = currentVideoId();
  if (v0) void initForVideo(v0);
}

observeNavigation();
