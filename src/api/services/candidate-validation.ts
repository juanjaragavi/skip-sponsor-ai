import type { LlmChunk, LlmSegmentCandidate } from "../../shared/types";
import {
  MAX_SPONSOR_SEGMENT_SECONDS,
  MIN_CONTENT_AFTER_FIRST_PARTY_SECONDS,
  MIN_FIRST_PARTY_SECONDS,
  MAX_SPONSOR_VIDEO_FRACTION,
  MIN_VIDEO_FOR_FRACTION_CAP,
} from "../../shared/constants";
import { maxSpeechSeconds } from "../../shared/speech";

const SNAP_TOLERANCE_SEC = 1.5;
const EVIDENCE_WINDOW_SEC = 5;
const MIN_EVIDENCE_TOKENS = 3;
const MIN_TOKEN_MATCH = 0.75;
/** Slack after the last promo cue's estimated speech end. */
const END_SPEECH_PAD_SEC = 1;
/** Only trim when it gives back at least this much content. */
const MIN_END_TRIM_SEC = 2;

/** Lowercase, strip diacritics and punctuation; keeps letters/digits of any script. */
export function normalizeText(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/** Is the model's quote actually present in the (normalized) transcript text? */
export function evidenceSupported(
  evidence: string | undefined,
  normalizedHaystack: string,
): boolean {
  if (!evidence) return false;
  const needle = normalizeText(evidence);
  const tokens = needle.split(" ").filter(Boolean);
  if (tokens.length < MIN_EVIDENCE_TOKENS) return false;
  if (normalizedHaystack.includes(needle)) return true;
  const have = new Set(normalizedHaystack.split(" "));
  const hits = tokens.filter((t) => have.has(t)).length;
  return hits / tokens.length >= MIN_TOKEN_MATCH;
}

type Relationship = "third_party_sponsor" | "first_party";

/** Map the model's free-form label onto the two accepted relationships. */
function normalizeRelationship(value: string | undefined): Relationship | null {
  const v = (value ?? "").toLowerCase().replace(/[^a-z]+/g, "_");
  if (v.startsWith("third_party")) return "third_party_sponsor";
  if (v.startsWith("first_party")) return "first_party";
  return null;
}

/** Flatten overlapping windows into unique cues in time order. */
export function dedupeCues(
  windows: readonly (readonly LlmChunk[])[],
): LlmChunk[] {
  const seen = new Set<string>();
  const out: LlmChunk[] = [];
  for (const c of windows.flat()) {
    const key = `${c.t0}|${c.text}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(c);
  }
  return out.sort((a, b) => a.t0 - b.t0);
}

/** Split cues into overlapping batches so no part of a long video is dropped. */
export function batchCues(
  cues: readonly LlmChunk[],
  size: number,
  overlap: number,
): LlmChunk[][] {
  if (cues.length === 0) return [];
  const step = Math.max(1, size - overlap);
  const batches: LlmChunk[][] = [];
  for (let i = 0; i < cues.length; i += step) {
    batches.push(cues.slice(i, i + size));
    if (i + size >= cues.length) break;
  }
  return batches;
}

function snap(
  start: number,
  end: number,
  cues: readonly LlmChunk[],
): { start: number; end: number } | null {
  const first = cues[0];
  const last = cues[cues.length - 1];
  if (!first || !last) return null;
  const starts = cues.filter((c) => c.t0 <= start + SNAP_TOLERANCE_SEC);
  const s = starts.length > 0 ? starts[starts.length - 1]!.t0 : first.t0;
  const next = cues.find((c) => c.t0 >= end - SNAP_TOLERANCE_SEC);
  const e = next ? next.t0 : last.t1;
  return e > s ? { start: s, end: e } : null;
}

/**
 * The model ends a segment at the first cue AFTER the promotion. When the
 * last promo cue is a long, sparse row (a few words, then gameplay or B-roll
 * until the next row starts), that end lands a whole row into real content.
 * Pull it back to where the last promo cue's speech can at most stop.
 * Segments that run to the final cue are left alone.
 */
export function trimEndToSpeech(
  range: { start: number; end: number },
  cues: readonly LlmChunk[],
): number {
  if (!cues.some((c) => c.t0 === range.end)) return range.end;
  const last = cues
    .filter((c) => c.t0 >= range.start && c.t0 < range.end)
    .at(-1);
  if (!last) return range.end;
  const spoken =
    Math.round(
      (last.t0 + maxSpeechSeconds(last.text) + END_SPEECH_PAD_SEC) * 10,
    ) / 10;
  return range.end - spoken >= MIN_END_TRIM_SEC
    ? Math.max(spoken, last.t0 + 1)
    : range.end;
}

/**
 * Accept only well-formed, evidence-backed sponsor segments and align them to
 * real cue boundaries. Guards against invented or oversized detections.
 */
export function validateCandidates(
  candidates: readonly LlmSegmentCandidate[],
  cues: readonly LlmChunk[],
): LlmSegmentCandidate[] {
  const sorted = [...cues].sort((a, b) => a.t0 - b.t0);
  const videoLength = sorted.length > 0 ? sorted[sorted.length - 1]!.t1 : 0;
  const maxLength =
    videoLength >= MIN_VIDEO_FOR_FRACTION_CAP
      ? Math.min(
          MAX_SPONSOR_SEGMENT_SECONDS,
          videoLength * MAX_SPONSOR_VIDEO_FRACTION,
        )
      : MAX_SPONSOR_SEGMENT_SECONDS;

  const out: LlmSegmentCandidate[] = [];
  for (const c of candidates) {
    if (c.category !== "sponsor") continue;
    const relationship = normalizeRelationship(c.relationship);
    if (!relationship) continue;
    if (!c.advertiser || c.advertiser.trim() === "") continue;
    if (
      !Number.isFinite(c.start) ||
      !Number.isFinite(c.end) ||
      c.end <= c.start
    )
      continue;
    const snapped = snap(c.start, c.end, sorted);
    const range = snapped && {
      start: snapped.start,
      end: trimEndToSpeech(snapped, sorted),
    };
    if (!range || range.end - range.start > maxLength) continue;
    if (
      relationship === "first_party" &&
      (c.breaksFromContent !== true ||
        range.end - range.start < MIN_FIRST_PARTY_SECONDS ||
        videoLength - range.end < MIN_CONTENT_AFTER_FIRST_PARTY_SECONDS)
    )
      continue;
    const text = normalizeText(
      sorted
        .filter(
          (cue) =>
            cue.t0 >= range.start - EVIDENCE_WINDOW_SEC &&
            cue.t0 < range.end + EVIDENCE_WINDOW_SEC,
        )
        .map((cue) => cue.text)
        .join(" "),
    );
    if (!evidenceSupported(c.evidence, text)) continue;
    out.push({ ...c, start: range.start, end: range.end });
  }
  return out;
}
