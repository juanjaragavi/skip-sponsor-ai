import type { LlmChunk } from "../shared/types";

/** One row as rendered in YouTube's transcript panel. */
export interface TranscriptRow {
  timestamp: string;
  text: string;
}

const MAX_CUE_TEXT = 600;

/** YouTube serves the transcript in one of two panel implementations. */
interface PanelVariant {
  panel: string;
  segment: string;
  timestamp: string;
  text: string;
}

const PANEL_TAG = "ytd-engagement-panel-section-list-renderer";
const VARIANTS: readonly PanelVariant[] = [
  {
    panel: `${PANEL_TAG}[target-id="engagement-panel-searchable-transcript"]`,
    segment: "ytd-transcript-segment-renderer",
    timestamp: ".segment-timestamp",
    text: ".segment-text",
  },
  {
    panel: `${PANEL_TAG}[target-id="PAmodern_transcript_view"]`,
    segment: "transcript-segment-view-model",
    timestamp: ".ytwTranscriptSegmentViewModelTimestamp",
    text: '[role="text"]',
  },
];
const PANEL_EXPANDED = "ENGAGEMENT_PANEL_VISIBILITY_EXPANDED";
const OPEN_BUTTON_SELECTOR =
  "ytd-video-description-transcript-section-renderer button";
const CLOSE_BUTTON_SELECTOR = "#visibility-button button";
const HIDE_STYLE_ID = "skipsponsor-hide-transcript";

/** "0:03" | "1:02:03" -> seconds; null when malformed. */
export function parseTimestamp(value: string): number | null {
  const parts = value.trim().split(":");
  if (parts.length < 2 || parts.length > 3) return null;
  const nums = parts.map((p) => (/^\d{1,2}$/.test(p) ? Number(p) : NaN));
  if (nums.some(Number.isNaN)) return null;
  const [h, m, s] = nums.length === 3 ? nums : [0, nums[0]!, nums[1]!];
  if (m! > 59 || s! > 59) return null;
  return h! * 3600 + m! * 60 + s!;
}

/**
 * Convert panel rows into cues. The panel only exposes start times, so each
 * cue ends where the next begins and the last ends at the video duration.
 */
export function buildCues(
  rows: readonly TranscriptRow[],
  durationSec: number,
): LlmChunk[] {
  const starts = rows
    .map((r) => ({
      t0: parseTimestamp(r.timestamp),
      text: r.text.replace(/\s+/g, " ").trim().slice(0, MAX_CUE_TEXT),
    }))
    .filter(
      (r): r is { t0: number; text: string } => r.t0 !== null && r.text !== "",
    )
    .sort((a, b) => a.t0 - b.t0);

  return starts.map((r, i) => {
    const next = starts[i + 1]?.t0 ?? durationSec;
    return { t0: r.t0, t1: Math.max(next, r.t0 + 1), text: r.text };
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function waitFor<T>(
  probe: () => T | null | undefined,
  timeoutMs: number,
  stillCurrent: () => boolean,
): Promise<T | null> {
  const deadline = performance.now() + timeoutMs;
  while (performance.now() < deadline && stillCurrent()) {
    const hit = probe();
    if (hit) return hit;
    await sleep(250);
  }
  return null;
}

function hidePanel(): () => void {
  const style = document.createElement("style");
  style.id = HIDE_STYLE_ID;
  style.textContent = `${VARIANTS.map((v) => v.panel).join(",")}{opacity:0!important;pointer-events:none!important}`;
  document.head.appendChild(style);
  return () => style.remove();
}

function isExpanded(v: PanelVariant): boolean {
  return (
    document.querySelector(v.panel)?.getAttribute("visibility") ===
    PANEL_EXPANDED
  );
}

/** The variant whose panel is open and has rendered at least one row. */
function loadedVariant(): PanelVariant | null {
  return (
    VARIANTS.find(
      (v) => isExpanded(v) && document.querySelector(`${v.panel} ${v.segment}`),
    ) ?? null
  );
}

function readRows(v: PanelVariant): TranscriptRow[] {
  return Array.from(document.querySelectorAll(`${v.panel} ${v.segment}`)).map(
    (el) => ({
      timestamp: el.querySelector(v.timestamp)?.textContent ?? "",
      text: el.querySelector(v.text)?.textContent ?? "",
    }),
  );
}

function closePanel(v: PanelVariant): void {
  document
    .querySelector<HTMLButtonElement>(`${v.panel} ${CLOSE_BUTTON_SELECTOR}`)
    ?.click();
}

let extracting = false;

/**
 * Read cues from YouTube's own transcript panel. The caption endpoints reject
 * requests without a proof-of-origin token, but the panel loads with the
 * page's credentials, so scraping it avoids token handling entirely.
 * The panel is hidden while open and closed again afterwards.
 * Returns null when the video has no transcript or the page changed.
 */
export async function readTranscriptFromPage(
  durationSec: number,
  stillCurrent: () => boolean,
): Promise<LlmChunk[] | null> {
  if (extracting) return null;
  extracting = true;
  let restore: (() => void) | null = null;
  let openedByUs = false;
  try {
    if (!VARIANTS.some(isExpanded)) {
      const open = await waitFor(
        () => document.querySelector<HTMLButtonElement>(OPEN_BUTTON_SELECTOR),
        6000,
        stillCurrent,
      );
      if (!open) return null;
      restore = hidePanel();
      open.click();
      openedByUs = true;
    }
    const variant = await waitFor(loadedVariant, 8000, stillCurrent);
    if (!variant || !stillCurrent()) return null;
    await sleep(300); // let the remaining rows render
    const cues = buildCues(readRows(variant), durationSec);
    return cues.length > 0 && stillCurrent() ? cues : null;
  } finally {
    if (openedByUs) VARIANTS.filter(isExpanded).forEach(closePanel);
    restore?.();
    extracting = false;
  }
}
