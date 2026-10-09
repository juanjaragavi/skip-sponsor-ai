import type { LlmChunk } from "../shared/types";
import { MAX_CUE_TEXT, MAX_TRANSCRIPT_CUES } from "../shared/constants";
import { maxSpeechSeconds } from "../shared/speech";

/** One row as rendered in YouTube's transcript panel. */
export interface TranscriptRow {
  timestamp: string;
  text: string;
}

/**
 * Row renderers YouTube ships (A/B tested, several coexist):
 * - legacy `ytd-transcript-segment-renderer` (one caption line per row);
 * - `transcript-segment-view-model`, used both by the modern transcript panel
 *   and by the "In this video" (chapters + transcript) panel.
 */
const ROW_VARIANTS = [
  {
    row: "ytd-transcript-segment-renderer",
    timestamp: ".segment-timestamp",
    text: ".segment-text",
  },
  {
    row: "transcript-segment-view-model",
    timestamp: ".ytwTranscriptSegmentViewModelTimestamp",
    text: '[role="text"]',
  },
] as const;
const ROW_SELECTOR = ROW_VARIANTS.map((v) => v.row).join(",");

const PANEL_TAG = "ytd-engagement-panel-section-list-renderer";
/**
 * Panels that can host the transcript. The "In this video" panel has no
 * target-id, so panels are recognised by their rows rather than by id.
 */
const TRANSCRIPT_PANELS = [
  `${PANEL_TAG}[target-id="engagement-panel-searchable-transcript"]`,
  `${PANEL_TAG}[target-id="PAmodern_transcript_view"]`,
  `${PANEL_TAG}:not([target-id])`,
  `${PANEL_TAG}:has(${ROW_SELECTOR})`,
];
const PANEL_EXPANDED = "ENGAGEMENT_PANEL_VISIBILITY_EXPANDED";
const OPEN_BUTTON_SELECTOR =
  "ytd-video-description-transcript-section-renderer button";
const CLOSE_BUTTON_SELECTOR = "#visibility-button button";
const HIDE_STYLE_ID = "skipsponsor-hide-transcript";

const POLL_MS = 250;
const BUTTON_TIMEOUT_MS = 6000;
const ROWS_TIMEOUT_MS = 12000;
const REOPEN_AFTER_MS = 1500;

/** Long rows are split into sentences when they span at least this long. */
const SPLIT_MIN_SECONDS = 4;
const MIN_SUBCUE_SECONDS = 1;
const SENTENCE = /[^.!?…。！？]+(?:[.!?…。！？]+["'”’)\]]*|$)\s*/gu;

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

const round1 = (n: number): number => Math.round(n * 10) / 10;

/**
 * Modern panels merge several caption lines into rows of 6-35s. Segment
 * boundaries snap to cue starts, so a coarse row lets a skip begin up to a
 * whole row early (cutting the end of an intro) or end late. Split such rows
 * into sentences and interpolate each start by its character offset.
 */
export function splitLongCues(cues: readonly LlmChunk[]): LlmChunk[] {
  const out: LlmChunk[] = [];
  for (const c of cues) {
    const parts = (c.text.match(SENTENCE) ?? [])
      .map((s) => s.trim())
      .filter(Boolean);
    if (c.t1 - c.t0 < SPLIT_MIN_SECONDS || parts.length < 2) {
      out.push(c);
      continue;
    }
    const span = Math.min(c.t1 - c.t0, maxSpeechSeconds(c.text));
    const total = parts.reduce((n, p) => n + p.length, 0);
    const subs: LlmChunk[] = [];
    let before = 0;
    for (const p of parts) {
      const t0 = round1(c.t0 + span * (before / total));
      before += p.length;
      const last = subs[subs.length - 1];
      if (last && t0 - last.t0 < MIN_SUBCUE_SECONDS) last.text += ` ${p}`;
      else subs.push({ t0, t1: c.t1, text: p });
    }
    subs.forEach((s, i) => (s.t1 = subs[i + 1]?.t0 ?? c.t1));
    out.push(...subs);
  }
  return out;
}

function mergeGroups(cues: readonly LlmChunk[], group: number): LlmChunk[] {
  const out: LlmChunk[] = [];
  let n = 0;
  for (const c of cues) {
    const cur = out[out.length - 1];
    if (
      cur &&
      n < group &&
      cur.text.length + 1 + c.text.length <= MAX_CUE_TEXT
    ) {
      cur.text += ` ${c.text}`;
      cur.t1 = Math.max(cur.t1, c.t1);
      n++;
    } else {
      out.push({ ...c });
      n = 1;
    }
  }
  return out;
}

/**
 * Legacy panels emit ~80 rows/min, so videos over ~1h exceed the API's
 * per-request cue limit and the whole upload is rejected (400). Merge
 * neighbouring cues until the transcript fits.
 */
export function limitCues(
  cues: readonly LlmChunk[],
  max = MAX_TRANSCRIPT_CUES,
): LlmChunk[] {
  let out = cues.map((c) => ({ ...c }));
  for (let group = 2; out.length > max && group <= 64; group++) {
    out = mergeGroups(cues, group);
  }
  return out;
}

/** Panel rows -> cues ready for upload. */
export function toTranscriptCues(
  rows: readonly TranscriptRow[],
  durationSec: number,
): LlmChunk[] {
  return limitCues(splitLongCues(buildCues(rows, durationSec)));
}

/** Identity of a rendered transcript, used to recognise stale panel content. */
export function transcriptFingerprint(rows: readonly TranscriptRow[]): string {
  const key = (r: TranscriptRow | undefined): string =>
    r ? `${r.timestamp.trim()}~${r.text.trim().slice(0, 80)}` : "";
  return [
    rows.length,
    ...rows.slice(0, 5).map(key),
    key(rows[rows.length - 1]),
  ].join("|");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function hidePanels(): () => void {
  const style = document.createElement("style");
  style.id = HIDE_STYLE_ID;
  style.textContent = `${TRANSCRIPT_PANELS.join(",")}{opacity:0!important;pointer-events:none!important}`;
  document.head.appendChild(style);
  return () => style.remove();
}

function isExpanded(panel: Element): boolean {
  return panel.getAttribute("visibility") === PANEL_EXPANDED;
}

function transcriptPanels(): Element[] {
  return Array.from(document.querySelectorAll(TRANSCRIPT_PANELS.join(",")));
}

function readRows(panel: Element): TranscriptRow[] {
  return Array.from(panel.querySelectorAll(ROW_SELECTOR)).map((el) => {
    const v = ROW_VARIANTS.find((x) => el.matches(x.row)) ?? ROW_VARIANTS[0];
    return {
      timestamp: el.querySelector(v.timestamp)?.textContent ?? "",
      text: el.querySelector(v.text)?.textContent ?? "",
    };
  });
}

/** fingerprint -> videoId whose transcript it is. */
const owners = new Map<string, string>();

function remember(fingerprint: string, videoId: string): void {
  if (owners.size > 50) owners.clear();
  owners.set(fingerprint, videoId);
}

/**
 * Call when the page navigates away from `previousVideoId`: whatever rows are
 * still in the DOM belong to that video. YouTube keeps them (even in an
 * expanded panel) for a while after the URL changes.
 */
export function markTranscriptStale(previousVideoId: string): void {
  for (const panel of transcriptPanels()) {
    const rows = readRows(panel);
    if (rows.length > 0) remember(transcriptFingerprint(rows), previousVideoId);
  }
}

let queue: Promise<unknown> = Promise.resolve();

/**
 * Read cues from YouTube's own transcript panel. The caption endpoints reject
 * requests without a proof-of-origin token, but the panel loads with the
 * page's credentials, so scraping it avoids token handling entirely.
 *
 * Rows already attributed to another video are ignored until YouTube replaces
 * them, and rows are read only once they stop changing. The panel is hidden
 * while open and closed again afterwards. Returns null when the video has no
 * transcript or the page changed.
 */
export function readTranscriptFromPage(
  videoId: string,
  durationSec: () => number,
  stillCurrent: () => boolean,
): Promise<LlmChunk[] | null> {
  const run = queue.then(() => extract(videoId, durationSec, stillCurrent));
  queue = run.catch(() => undefined);
  return run;
}

async function extract(
  videoId: string,
  durationSec: () => number,
  stillCurrent: () => boolean,
): Promise<LlmChunk[] | null> {
  let restore: (() => void) | null = null;
  let clicked = false;
  const start = performance.now();
  let lastClick = -Infinity;
  let previous = "";
  try {
    while (stillCurrent()) {
      const elapsed = performance.now() - start;
      const expanded = transcriptPanels().filter(isExpanded);
      const loaded = expanded.find((p) => p.querySelector(ROW_SELECTOR));
      if (loaded) {
        const rows = readRows(loaded);
        const fp = transcriptFingerprint(rows);
        const owner = owners.get(fp);
        if (owner === undefined || owner === videoId) {
          if (fp === previous) {
            remember(fp, videoId);
            const cues = toTranscriptCues(rows, durationSec());
            return cues.length > 0 ? cues : null;
          }
          previous = fp;
        } else {
          previous = "";
        }
      } else if (
        expanded.length === 0 &&
        performance.now() - lastClick > REOPEN_AFTER_MS
      ) {
        const open =
          document.querySelector<HTMLButtonElement>(OPEN_BUTTON_SELECTOR);
        if (!open && elapsed > BUTTON_TIMEOUT_MS) return null;
        if (open) {
          restore ??= hidePanels();
          open.click();
          clicked = true;
          lastClick = performance.now();
        }
      }
      if (elapsed > BUTTON_TIMEOUT_MS + ROWS_TIMEOUT_MS) return null;
      await sleep(POLL_MS);
    }
    return null;
  } finally {
    // Every expanded transcript panel was opened by us: we only click the
    // open button while none is expanded.
    if (clicked) {
      transcriptPanels()
        .filter(isExpanded)
        .forEach((p) =>
          p.querySelector<HTMLButtonElement>(CLOSE_BUTTON_SELECTOR)?.click(),
        );
    }
    restore?.();
  }
}
