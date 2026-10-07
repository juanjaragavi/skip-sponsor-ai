import type { SponsorSegment, VideoAnalysis, UserPolicy } from "../shared/types";
import { DomVideoAdapter, getVideoIdFromUrl } from "./video-adapter";
import { isInSegment } from "./segments";
import { decideSkip, DEFAULT_POLICY } from "./policy";
import { showSkipToast } from "./toast";
import { SKIP_FORWARD_OFFSET, UNDO_REWIND_OFFSET } from "../shared/constants";

const adapter = new DomVideoAdapter();
let segments: SponsorSegment[] = [];
let policy: UserPolicy = { ...DEFAULT_POLICY };
let channelId: string | null = null;
let overridden = new Set<string>();
let lastVideoId: string | null = null;
let detachTimeUpdate: (() => void) | null = null;
let debounceTimer = 0;

async function loadPolicy(): Promise<void> {
  const stored = await chrome.storage.sync.get(["policy"]);
  if (stored["policy"]) policy = stored["policy"] as UserPolicy;
}

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

function armSkipLoop(): void {
  detachTimeUpdate?.();
  detachTimeUpdate = adapter.onTimeUpdate((t) => {
    const seg = isInSegment(t, segments);
    if (!seg || overridden.has(seg.id)) return;
    const d = decideSkip(policy, seg, channelId, {
      globalKill: false,
      userOverridden: false,
    });
    if (!d.shouldSkip) return;
    const t0 = performance.now();
    adapter.seekTo(seg.endTime + SKIP_FORWARD_OFFSET);
    const latency = Math.round(performance.now() - t0);
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
        void chrome.runtime.sendMessage({
          type: "TELEMETRY",
          eventType: "skip_undone",
          videoId: lastVideoId,
        });
      },
    });
  });
}

/** Suppress re-skip when user manually seeks back into a segment. */
function armSeekOverride(): void {
  const video = adapter.getVideo();
  if (!video) return;
  video.addEventListener("seeking", () => {
    const seg = isInSegment(video.currentTime, segments);
    if (seg) overridden.add(seg.id);
  });
}

async function initForVideo(videoId: string): Promise<void> {
  lastVideoId = videoId;
  overridden = new Set();
  segments = [];
  channelId = adapter.getChannelId();
  await loadPolicy();
  window.clearTimeout(debounceTimer);
  debounceTimer = window.setTimeout(async () => {
    const analysis = await fetchSegments(videoId);
    if (!analysis || lastVideoId !== videoId) return;
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
