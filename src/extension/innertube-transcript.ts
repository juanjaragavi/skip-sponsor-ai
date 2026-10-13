import type { LlmChunk } from "../shared/types";
import { toTranscriptCues, type TranscriptRow } from "./transcript";

/**
 * Transcript reader that asks YouTube for the same "modern transcript view"
 * panel its own web client loads when a user presses "Show transcript"
 * (`/youtubei/v1/get_panel`, panel `PAmodern_transcript_view`).
 *
 * Why: YouTube's description button opens one of two transcript panels per
 * video. The legacy one (`engagement-panel-searchable-transcript`, backed by
 * `get_transcript`) now answers 400 "Precondition check failed" for many
 * videos, so the page itself shows an endless spinner. The modern panel loads
 * fine for the same videos. Measured 2026-10-13: see
 * notes/cto/research/2026-10-13/skipsponsor-precision-spike.md.
 *
 * The request is made by the MAIN-world script (main-world.ts) with the page's
 * own client context and credentials: no tokens are generated or replayed,
 * nothing is fetched server-side, and the data is what the page would show.
 */

/** Panel the YouTube web client requests for its modern transcript view. */
export const MODERN_TRANSCRIPT_PANEL_ID = "PAmodern_transcript_view";
export const GET_PANEL_REQUEST_EVENT = "skipsponsor:get-panel";
export const GET_PANEL_RESULT_EVENT = "skipsponsor:get-panel-result";
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const REQUEST_TIMEOUT_MS = 10_000;

/**
 * Panel params for a video, in the layout the web client sends
 * (protobuf: field 145 { 1: videoId, 3: 1 }, base64). Null for ids that are
 * not 11-character YouTube ids.
 */
export function modernTranscriptParams(videoId: string): string | null {
  if (!VIDEO_ID.test(videoId)) return null;
  const id = Array.from(videoId, (c) => c.charCodeAt(0));
  const inner = [0x0a, id.length, ...id, 0x18, 0x01];
  const outer = [0xaa, 0x09, inner.length, ...inner];
  return btoa(String.fromCharCode(...outer));
}

interface SegmentViewModel {
  timestamp?: unknown;
  simpleText?: unknown;
}

/**
 * Rows of a get_panel transcript response, in document order. Returns [] when
 * the video has no transcript (YouTube answers with an empty panel) or the
 * response has an unknown shape.
 */
export function parsePanelTranscript(response: unknown): TranscriptRow[] {
  const rows: TranscriptRow[] = [];
  const stack: unknown[] = [response];
  // Iterative depth-first walk, children pushed in reverse to keep order.
  while (stack.length > 0) {
    const node = stack.pop();
    if (Array.isArray(node)) {
      for (let i = node.length - 1; i >= 0; i--) stack.push(node[i]);
      continue;
    }
    if (node === null || typeof node !== "object") continue;
    const vm = (node as Record<string, unknown>)["transcriptSegmentViewModel"];
    if (vm && typeof vm === "object") {
      const { timestamp, simpleText } = vm as SegmentViewModel;
      if (typeof timestamp === "string" && typeof simpleText === "string")
        rows.push({ timestamp, text: simpleText });
      continue;
    }
    const values = Object.values(node as Record<string, unknown>);
    for (let i = values.length - 1; i >= 0; i--) stack.push(values[i]);
  }
  return rows;
}

interface PanelResult {
  id: string;
  ok: boolean;
  status: number;
  text: string;
}

function isPanelResult(value: unknown): value is PanelResult {
  const v = value as Partial<PanelResult> | null;
  return (
    typeof v?.id === "string" &&
    typeof v.ok === "boolean" &&
    typeof v.status === "number" &&
    typeof v.text === "string"
  );
}

let sequence = 0;

/**
 * Ask the MAIN-world script for the transcript panel of `videoId`. Resolves
 * with the parsed JSON response, or null on timeout, HTTP error or bad JSON.
 * Event details cross the isolated/MAIN world boundary as JSON strings.
 */
export function requestPanelFromPage(
  videoId: string,
  timeoutMs = REQUEST_TIMEOUT_MS,
): Promise<unknown> {
  const params = modernTranscriptParams(videoId);
  // main-world.ts marks the page once it runs; without it nobody answers.
  const mainWorld =
    document.documentElement.getAttribute("data-skipsponsor-main") === "1";
  if (!params || !mainWorld) return Promise.resolve(null);
  const id = `${Date.now()}-${++sequence}`;
  return new Promise((resolve) => {
    const finish = (value: unknown) => {
      document.removeEventListener(GET_PANEL_RESULT_EVENT, onResult);
      window.clearTimeout(timer);
      resolve(value);
    };
    const onResult = (e: Event) => {
      let result: unknown;
      try {
        result = JSON.parse(String((e as CustomEvent<unknown>).detail));
      } catch {
        return;
      }
      if (!isPanelResult(result) || result.id !== id) return;
      if (!result.ok) return finish(null);
      try {
        finish(JSON.parse(result.text));
      } catch {
        finish(null);
      }
    };
    const timer = window.setTimeout(() => finish(null), timeoutMs);
    document.addEventListener(GET_PANEL_RESULT_EVENT, onResult);
    document.dispatchEvent(
      new CustomEvent(GET_PANEL_REQUEST_EVENT, {
        detail: JSON.stringify({
          id,
          panelId: MODERN_TRANSCRIPT_PANEL_ID,
          params,
        }),
      }),
    );
  });
}

/**
 * Transcript cues for `videoId` from the modern transcript panel, or null when
 * the video has no transcript, the request failed, or the page moved on.
 */
export async function readTranscriptViaPanelApi(
  videoId: string,
  durationSec: () => number,
  stillCurrent: () => boolean,
  request: (videoId: string) => Promise<unknown> = requestPanelFromPage,
): Promise<LlmChunk[] | null> {
  let response = await request(videoId);
  // One retry: a request that fails outright (timeout, 5xx) was seen to
  // succeed seconds later. An empty panel is an answer, not a failure.
  if (response === null && stillCurrent()) response = await request(videoId);
  if (!stillCurrent() || response === null) return null;
  const rows = parsePanelTranscript(response);
  if (rows.length === 0) return null;
  const cues = toTranscriptCues(rows, durationSec());
  return cues.length > 0 ? cues : null;
}
