import type {
  SegmentCategory,
  SponsorSegment,
  UserPolicy,
} from "../shared/types";
import type { AnalysisLimit } from "../shared/messages";
import { decideSkip } from "./policy";

export type Tag = "CUT" | "ASK" | "KEEP";

/** One row of the popup's edit decision list. */
export interface SegmentRow {
  id: string;
  index: string;
  tag: Tag;
  range: string;
  status: string;
  confidence: string;
  startTime: number;
  endTime: number;
  category: SegmentCategory;
}

export interface RowContext {
  channelId: string | null;
  currentTime: number;
  skipped: ReadonlySet<string>;
  overridden: ReadonlySet<string>;
  /** The player kept snapping back: the skip was abandoned (no loop). */
  blocked?: ReadonlySet<string>;
  /** Auto-skip stopped for this video after too many seeks. */
  paused?: boolean;
}

/** 222 -> "03:42", 3723 -> "1:02:03" (editor timecode, no frames). */
export function formatTimecode(totalSeconds: number): string {
  const t = Math.max(
    0,
    Math.floor(Number.isFinite(totalSeconds) ? totalSeconds : 0),
  );
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = t % 60;
  const ss = String(s).padStart(2, "0");
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${ss}`
    : `${String(m).padStart(2, "0")}:${ss}`;
}

export const formatRange = (start: number, end: number): string =>
  `${formatTimecode(start)} → ${formatTimecode(end)}`;

const seconds = (s: SponsorSegment): number =>
  Math.round(s.endTime - s.startTime);

const CATEGORY_LABEL: Record<SegmentCategory, string> = {
  sponsor: "Sponsor",
  intro: "Intro",
  outro: "Outro",
  selfpromo: "Self-promo",
  interaction_reminder: "Subscribe reminder",
};

export const categoryLabel = (c: SegmentCategory): string => CATEGORY_LABEL[c];

/** Decision + wording for one segment, mirroring the skip loop's policy. */
export function describeSegment(
  seg: SponsorSegment,
  policy: UserPolicy,
  ctx: RowContext,
): { tag: Tag; status: string } {
  const d = decideSkip(policy, seg, ctx.channelId, {
    globalKill: false,
    userOverridden: ctx.overridden.has(seg.id),
  });
  const upcoming = seg.startTime > ctx.currentTime;
  if (ctx.blocked?.has(seg.id))
    return { tag: "KEEP", status: "YouTube’s player blocked the skip" };
  switch (d.reason) {
    case "auto-skip":
      if (ctx.paused && !ctx.skipped.has(seg.id))
        return { tag: "KEEP", status: "Auto-skip paused for this video" };
      return {
        tag: "CUT",
        status: ctx.skipped.has(seg.id)
          ? `Skipped · ${seconds(seg)}s`
          : `Will skip · ${seconds(seg)}s`,
      };
    case "notify-only":
      return {
        tag: "ASK",
        status: ctx.skipped.has(seg.id)
          ? `Skipped · ${seconds(seg)}s`
          : upcoming
            ? `Skip button at ${formatTimecode(seg.startTime)}`
            : "Skip button shown",
      };
    case "low-confidence":
      return { tag: "KEEP", status: "Below threshold" };
    case "category-not-skippable":
      return {
        tag: "KEEP",
        status: `${categoryLabel(seg.category)} · not skipped`,
      };
    case "channel-blocked":
      return { tag: "KEEP", status: "Channel allowed" };
    case "user-override":
      return { tag: "KEEP", status: "Kept by you" };
    default:
      return { tag: "KEEP", status: "Skipping is off" };
  }
}

export function segmentRows(
  segments: readonly SponsorSegment[],
  policy: UserPolicy,
  ctx: RowContext,
): SegmentRow[] {
  return [...segments]
    .sort((a, b) => a.startTime - b.startTime)
    .map((seg, i) => ({
      id: seg.id,
      index: String(i + 1).padStart(2, "0"),
      ...describeSegment(seg, policy, ctx),
      range: formatRange(seg.startTime, seg.endTime),
      confidence: `${Math.round(seg.confidence * 100)}%`,
      startTime: seg.startTime,
      endTime: seg.endTime,
      category: seg.category,
    }));
}

/**
 * Row to highlight and bracket: the range being played, else the one the
 * playhead most recently passed (e.g. just cut), else the next one.
 */
export function activeRowId(
  rows: readonly SegmentRow[],
  currentTime: number,
): string | null {
  const inside = rows.find(
    (r) => currentTime >= r.startTime && currentTime < r.endTime,
  );
  const passed = rows.filter((r) => r.endTime <= currentTime).at(-1);
  return (inside ?? passed ?? rows[0])?.id ?? null;
}

/** Threshold helper sentence under the gate ("… — 1 of 2 here."). */
export function thresholdSummary(
  segments: readonly SponsorSegment[],
  policy: UserPolicy,
): string {
  const sponsors = segments.filter((s) => s.category === "sponsor");
  if (sponsors.length === 0)
    return "Dots show this video’s detected segments — none so far.";
  const over = sponsors.filter(
    (s) => s.confidence >= policy.confidenceThreshold,
  ).length;
  const outcome =
    !policy.globalEnabled || policy.mode === "off"
      ? "would be cut"
      : policy.mode === "notify"
        ? "gets a Skip button"
        : "gets cut";
  return `Dots are this video’s detected segments. Anything right of the line ${outcome} — ${over} of ${sponsors.length} here.`;
}

/** Local wall-clock time of a reset, e.g. "7:00 PM". */
const resetTime = (iso: string): string =>
  new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

/**
 * Wording for an analysis the API refused (daily allowance, global budget,
 * paused). Already-analyzed videos and community segments keep skipping.
 */
export function limitCopy(limit: AnalysisLimit): {
  title: string;
  sub: string;
  popup: string;
} {
  const at = resetTime(limit.resetAt);
  switch (limit.reason) {
    case "install_quota":
      return {
        title: "Daily AI analysis limit reached",
        sub: `Analyzed videos still skip · more at ${at}`,
        popup: `You’ve used today’s free AI analyses. Videos already analyzed and community-labelled sponsors still skip. More analyses at ${at}.`,
      };
    case "global_budget":
      return {
        title: "AI analysis is busy today",
        sub: `Analyzed videos still skip · resumes ${at}`,
        popup: `SkipSponsor AI reached today’s free analysis capacity. Videos already analyzed and community-labelled sponsors still skip. New analyses resume at ${at}.`,
      };
    case "llm_not_configured":
      return {
        title: "AI analysis is unavailable",
        sub: "Community segments still skip",
        popup:
          "The SkipSponsor AI server isn’t set up for AI analysis yet. Videos already analyzed and community-labelled sponsors still skip.",
      };
    case "llm_disabled":
      return {
        title: "AI analysis is paused",
        sub: "Analyzed videos still skip",
        popup:
          "AI analysis is paused for now. Videos already analyzed and community-labelled sponsors still skip.",
      };
    default:
      return {
        title: "Couldn’t reach SkipSponsor AI",
        sub: "Using community segments for now",
        popup:
          "This browser couldn’t be verified with the SkipSponsor AI server. Community-labelled sponsors still skip.",
      };
  }
}

export const MODE_HELP: Record<UserPolicy["mode"], string> = {
  auto: "Auto-skip — cuts marked ranges as they start",
  notify: "Notify — marks the range and shows a Skip button",
  off: "Off — sponsor reads play normally",
};

export const THRESHOLD_MIN = 0.5;
export const THRESHOLD_MAX = 0.95;

/** Confidence -> 0..1 position on the 50–95% gate. */
export const gatePosition = (confidence: number): number =>
  Math.min(
    1,
    Math.max(0, (confidence - THRESHOLD_MIN) / (THRESHOLD_MAX - THRESHOLD_MIN)),
  );

const HANDLE = /^@[\p{L}\p{N}._-]{3,30}$/u;
const CHANNEL_ID = /^UC[\w-]{22}$/;

/**
 * Options › Channels › "Add a channel": accepts "@creator", a channel link
 * (youtube.com/@creator, youtube.com/channel/UC…) or a bare UC… id. Returns
 * the id in the same form the content script reads from the page link
 * ("@handle" percent-encoded like an href, or "channel/UC…"), or null.
 */
export function parseChannelInput(input: string): string | null {
  const raw = input.trim();
  if (HANDLE.test(raw)) return "@" + encodeURIComponent(raw.slice(1));
  if (CHANNEL_ID.test(raw)) return `channel/${raw}`;
  let url: URL;
  try {
    url = new URL(/^[a-z]+:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return null;
  }
  if (!/(^|\.)youtube\.com$/i.test(url.hostname)) return null;
  const [first, second] = url.pathname.split("/").filter(Boolean);
  if (first?.startsWith("@")) {
    const handle = safeDecode(first);
    return HANDLE.test(handle)
      ? "@" + encodeURIComponent(handle.slice(1))
      : null;
  }
  if (first === "channel" && second && CHANNEL_ID.test(second))
    return `channel/${second}`;
  return null;
}

function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

/** "@%E3%83%8F…" -> "@ハ…", "channel/UC…" -> "UC…" for display. */
export const displayChannelId = (id: string): string =>
  safeDecode(id.replace(/^channel\//, ""));
