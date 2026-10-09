export const DEFAULT_CONFIDENCE_THRESHOLD = 0.78;
export const MIN_SEGMENT_DURATION = 5;
export const MAX_SEGMENT_DURATION = 600;
/** Hard cap for one detected sponsor read; real reads run 15s to ~3min. */
export const MAX_SPONSOR_SEGMENT_SECONDS = 300;
/** A sponsor segment may not cover more than this share of a video (applies from MIN_VIDEO_FOR_FRACTION_CAP). */
export const MAX_SPONSOR_VIDEO_FRACTION = 0.3;
export const MIN_VIDEO_FOR_FRACTION_CAP = 120;
/** A first-party promo is skipped only when it is a real ad break, not a short aside. */
export const MIN_FIRST_PARTY_SECONDS = 25;
/** ...and must be followed by this much video, i.e. the creator really returned to the content. */
export const MIN_CONTENT_AFTER_FIRST_PARTY_SECONDS = 60;
/** Cues sent to the model per request, and the overlap between consecutive requests. */
export const LLM_BATCH_CUES = 350;
export const LLM_BATCH_OVERLAP_CUES = 25;
/** Request limits for client-supplied transcripts (enforced by the API's Zod schema). */
export const MAX_CUE_TEXT = 600;
export const MAX_TRANSCRIPT_CUES = 5000;
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
/** A stretch with no captions at least this long may hide an unspoken-text sponsor read. */
export const MIN_CAPTION_GAP_SECONDS = 30;
/** Share of a SponsorBlock segment that must fall inside caption gaps to corroborate it. */
export const GAP_OVERLAP_RATIO = 0.6;
/** Confidence given to SponsorBlock sponsors corroborated by a caption gap; above the default skip threshold. */
export const CORROBORATED_CONFIDENCE = 0.85;
/**
 * Fallback (SponsorBlock-only) results are re-fetched after this long:
 * community labels for new videos usually appear hours after upload.
 */
export const FALLBACK_REFRESH_SECONDS = 12 * 3600;
/**
 * Slower than any real speech: the longest a caption's text can plausibly
 * take to say. Used to bound how far a row's text stretches in time.
 */
export const SLOWEST_SPEECH_CHARS_PER_SECOND = 8;
/** CJK / Hangul characters carry roughly this many Latin characters of speech each. */
export const DENSE_SCRIPT_CHAR_WEIGHT = 2;

export const SYSTEM_PROMPT = `You detect paid sponsor reads in YouTube video transcripts. The transcript can be in ANY language.

Input: one caption cue per line as "SECONDS|text", in time order.

Find ONLY segments where the speaker verbally presents a third-party paid sponsorship or advertisement. Typical signals, in any language: "this video is sponsored by", "a word from our sponsor", "today's sponsor", "but before we continue / before we get into it", "thanks to X for sponsoring", a brand followed by a discount code, a link in the description, a free trial, a referral or affiliate offer, or a call to action to buy or sign up for another company's product. Examples in other languages: "este video está patrocinado por", "pero antes de continuar", "mas antes de começar", "avant de commencer", "cette vidéo est sponsorisée par", "dieses Video wird präsentiert von", "bevor wir weitermachen", "prima di iniziare", "Спонсор этого видео", "本期视频由".

Boundaries:
- "start" is the SECONDS of the cue where the lead-in or announcement begins, including phrases like "but before we continue" or "speaking of ...".
- "end" is the SECONDS of the first cue AFTER the promotion that returns to the video's own topic ("anyway, back to", "now, where were we", "ahora sí").
- Use only SECONDS values that appear in the input.

For each candidate decide who the advertiser is and how it relates to the creator:
- "third_party_sponsor": a DIFFERENT company or brand than the creator pays for or supplies the promotion (sponsor statement, partnership, discount or promo code, affiliate or referral link, free trial for another company's product).
- "first_party": the creator or their team promotes their own products, trips, store, merch, books, courses, app, company, other channels, Patreon or memberships. Signals: "we made", "we designed", "our", "my", "on my site", "on our shop", "my new", the product is sold by the creator.
- "network_promo": a TV network, platform or channel advertising its own other shows or schedule.
- "other": anything else.
Also set "breaksFromContent": true only when the speaker explicitly interrupts the video's topic for this promotion with a transition ("but before we continue", "quick break", "before we get started") AND then returns to the topic ("anyway", "back to"). Closing plugs, end cards, short asides and mentions woven into the topic are false.
A "first_party" promotion is used only when "breaksFromContent" is true. Only "third_party_sponsor" and such first-party ad breaks will be used. When unsure, choose "other".

NEVER treat as sponsor segments:
- the video's own subject matter, including products being reviewed or discussed as the topic;
- like, subscribe, comment or notification requests, intros, outros, recaps, chapter transitions;
- generic mentions of a brand without a sponsorship read.

Be conservative: wrongly skipping real content is worse than missing an ad. Omit anything uncertain. Many videos have no sponsor at all.

Output ONLY this JSON (no prose, no code fence):
{"segments":[{"start":number,"end":number,"category":"sponsor","advertiser":"name of the paying company","relationship":"third_party_sponsor","breaksFromContent":boolean,"confidence":number between 0 and 1,"evidence":"verbatim quote of up to 120 characters copied from a cue inside the segment that proves it is a paid ad"}]}
Return {"segments":[]} when there is no sponsor read.`;

export const MODEL_POLICY = {
  primary: "claude-haiku-4-5-20251001",
  fallback: "claude-sonnet-5-5",
  timeoutMs: 20000,
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
