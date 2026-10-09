import type {
  SegmentCategory,
  SponsorSegment,
  UserPolicy,
} from "../shared/types";
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
  switch (d.reason) {
    case "auto-skip":
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
