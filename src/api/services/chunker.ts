import type { LlmChunk } from "../../shared/types";
import {
  CHUNK_WINDOW_SECONDS,
  CHUNK_OVERLAP_SECONDS,
} from "../../shared/constants";

export interface TimedTextEvent {
  tStartMs: number;
  dDurationMs?: number;
  segs?: { utf8: string }[];
}

/** Parse youtube timedtext json3 payload into word-level chunks. */
export function parseTimedText(json: {
  events?: TimedTextEvent[];
}): LlmChunk[] {
  const out: LlmChunk[] = [];
  for (const e of json.events ?? []) {
    const text = (e.segs ?? [])
      .map((s) => s.utf8)
      .join("")
      .trim();
    if (!text) continue;
    const t0 = e.tStartMs / 1000;
    const t1 = t0 + (e.dDurationMs ?? 0) / 1000;
    out.push({ t0, t1, text });
  }
  return out;
}

/** Chunk 60s windows with 10s overlap before LLM call (spec §5.4). */
export function chunkTranscript(
  chunks: LlmChunk[],
  windowSec = CHUNK_WINDOW_SECONDS,
  overlapSec = CHUNK_OVERLAP_SECONDS,
): LlmChunk[][] {
  if (chunks.length === 0) return [];
  const end = chunks[chunks.length - 1]!.t1;
  const windows: LlmChunk[][] = [];
  for (let w0 = 0; w0 < end; w0 += windowSec - overlapSec) {
    const w1 = w0 + windowSec;
    const slice = chunks.filter((c) => c.t1 > w0 && c.t0 < w1);
    if (slice.length > 0) windows.push(slice);
    if (w1 >= end) break;
  }
  return windows;
}

export function transcriptHash(text: string): string {
  let h = 5381;
  for (let i = 0; i < text.length; i++) {
    h = ((h << 5) + h + text.charCodeAt(i)) >>> 0;
  }
  return h.toString(16);
}
