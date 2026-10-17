import type { LlmChunk, LlmSegmentCandidate } from "../../shared/types";
import {
  DISCLOSURE_TAIL_SECONDS,
  MAX_SPONSOR_SEGMENT_SECONDS,
  MIN_CONTENT_AFTER_FIRST_PARTY_SECONDS,
  MIN_FIRST_PARTY_SECONDS,
  MAX_SPONSOR_VIDEO_FRACTION,
  MIN_VIDEO_FOR_FRACTION_CAP,
  TOPIC_SPONSOR_MIN_MINUTES,
  TOPIC_SPONSOR_PAD_SECONDS,
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

/** Words that join two sponsors in one name ("NBC and YouTube", "X y Z"). */
const ALIAS_SPLIT = /\s*(?:&|\+|\/|,|\band\b|\by\b|\be\b|\bet\b|\bund\b)\s*/giu;
const MIN_ALIAS_CHARS = 3;

/**
 * Normalized names a cue may use for the advertiser: the name without its
 * parenthesised part, the parenthesised short name, and each sponsor of a
 * joint name. Matched as whole phrases, so a common word inside a longer name
 * ("Festival des X") does not count on its own.
 */
export function advertiserAliases(advertiser: string | undefined): string[] {
  const raw = advertiser ?? "";
  const inner = [...raw.matchAll(/\(([^)]*)\)/g)].map((m) => m[1] ?? "");
  const outer = raw.replace(/\([^)]*\)/g, " ");
  const out: string[] = [];
  for (const part of [outer, ...inner].flatMap((p) => p.split(ALIAS_SPLIT))) {
    const n = normalizeText(part);
    if (n.replace(/ /g, "").length >= MIN_ALIAS_CHARS && !out.includes(n))
      out.push(n);
  }
  return out;
}

function mentionsAny(text: string, aliases: readonly string[]): boolean {
  const hay = ` ${normalizeText(text)} `;
  return aliases.some((a) => hay.includes(` ${a} `));
}

/** URLs, discounts and percentages, checked on the raw text. */
const RAW_CTA =
  /%|www\.|https?:|\b[a-z0-9-]+\.(?:com|tv|io|co|net|org|app|gg|ly|dev|me|ai|news)\b/i;
/**
 * Calls to action in the languages seen in the tests, on normalized text
 * (lowercase, no diacritics). Erring towards a match only keeps a segment
 * as the model returned it.
 */
const WORD_CTA = new RegExp(
  "\\b(?:" +
    [
      // en
      "links?",
      "description",
      "codes?",
      "coupons?",
      "discounts?",
      "percent",
      "free trial",
      "for free",
      "sign up",
      "signup",
      "dot com",
      "slash",
      "check (?:it|them|out)",
      "go to",
      "head (?:to|over)",
      "visit",
      "offers?",
      "below",
      "download",
      "promo",
      // es
      "enlace",
      "descripcion",
      "codigo",
      "cupon",
      "descuentos?",
      "por ciento",
      "gratis",
      "prueba gratuita",
      "registrate",
      "punto com",
      "visita",
      "entra a",
      "ofertas?",
      "abajo",
      "descarga",
      // pt
      "descricao",
      "cupom",
      "desconto",
      "por cento",
      "gratuito",
      "cadastre",
      "ponto com",
      "acesse",
      "abaixo",
      "baixe",
      // fr
      "lien",
      "reduction",
      "remise",
      "pour cent",
      "gratuit",
      "gratuitement",
      "inscrivez",
      "point com",
      "rendez vous",
      "offre",
      "dessous",
      "telecharge",
      // de
      "beschreibung",
      "gutschein",
      "rabatt",
      "prozent",
      "kostenlos",
      "anmelden",
      "angebot",
      "unten",
      // it
      "descrizione",
      "codice",
      "sconto",
      "iscriviti",
      "offerta",
    ].join("|") +
    ")\\b",
);

/** Does this text ask the viewer to act on an offer (link, code, discount, sign-up)? */
export function hasCallToAction(text: string): boolean {
  return RAW_CTA.test(text) || WORD_CTA.test(normalizeText(text));
}

/**
 * Fully sponsored videos (release test 2026-10-16: dw6U6GROEpY, HmJYxPLgFds):
 * the advertiser is named all through the video, outside every candidate for
 * it, because its product or trip is the topic. Skipping the disclosure there
 * skips content and nothing else.
 */
function sponsorIsTopic(
  aliases: readonly string[],
  candidates: readonly LlmSegmentCandidate[],
  cues: readonly LlmChunk[],
): boolean {
  if (aliases.length === 0) return false;
  const own = candidates.filter((d) =>
    advertiserAliases(d.advertiser).some((a) => aliases.includes(a)),
  );
  const minutes = new Set<number>();
  for (const q of cues) {
    const nearOwn = own.some(
      (d) =>
        q.t0 >= d.start - TOPIC_SPONSOR_PAD_SECONDS &&
        q.t0 < d.end + TOPIC_SPONSOR_PAD_SECONDS,
    );
    if (!nearOwn && mentionsAny(q.text, aliases))
      minutes.add(Math.floor(q.t0 / 60));
  }
  return minutes.size >= TOPIC_SPONSOR_MIN_MINUTES;
}

/**
 * One-line disclosures followed by content (release test 2026-10-16:
 * gK-7TKC7kvY, "This video is sponsored by Nebula." then 66 s of topic):
 * when a segment runs on for DISCLOSURE_TAIL_SECONDS or more after its last
 * sponsor mention with no call to action, end it at the cue after that
 * mention. The next DISCLOSURE_TAIL_SECONDS after the segment are checked
 * too: a closing "link in the description" often shares a caption row with
 * the next topic, or the model split the read and the offer sits in the
 * second part (TnE7QoaH74U). Segments whose cues never name the sponsor are
 * left alone.
 */
export function trimDisclosureTail(
  range: { start: number; end: number },
  aliases: readonly string[],
  cues: readonly LlmChunk[],
): number {
  const inside = cues.filter((c) => c.t0 >= range.start && c.t0 < range.end);
  let last = -1;
  inside.forEach((c, i) => {
    if (mentionsAny(c.text, aliases)) last = i;
  });
  const after = inside.slice(last + 1);
  if (last < 0 || after.length === 0) return range.end;
  if (range.end - after[0]!.t0 < DISCLOSURE_TAIL_SECONDS) return range.end;
  const next = cues.filter(
    (c) => c.t0 >= range.end && c.t0 < range.end + DISCLOSURE_TAIL_SECONDS,
  );
  if (next.some((c) => mentionsAny(c.text, aliases))) return range.end;
  const tail = [...after, ...next].map((c) => c.text).join(" ");
  if (hasCallToAction(tail)) return range.end;
  return after[0]!.t0;
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
 * Third-party reads come back as "sponsor"; first-party ad breaks as
 * "selfpromo" (shown, not skipped).
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
    const aliases = advertiserAliases(c.advertiser);
    if (
      relationship === "third_party_sponsor" &&
      sponsorIsTopic(aliases, candidates, sorted)
    )
      continue;
    const snapped = snap(c.start, c.end, sorted);
    const cut = snapped && {
      start: snapped.start,
      end: trimDisclosureTail(snapped, aliases, sorted),
    };
    const range = cut && {
      start: cut.start,
      end: trimEndToSpeech(cut, sorted),
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
    // Creator self-promotion is reported but never auto-skipped: in the
    // 2026-10-13 precision eval the only long real-content false skip came
    // from a first-party candidate that stitched two separate plugs together.
    // The extension skips "sponsor" only (decideSkip).
    out.push({
      ...c,
      category: relationship === "first_party" ? "selfpromo" : "sponsor",
      start: range.start,
      end: range.end,
    });
  }
  return out;
}
