import type {
  SegmentCategory,
  SponsorSegment,
  UserPolicy,
} from "../shared/types";
import type { AnalysisLimit } from "../shared/messages";
import { decideSkip } from "./policy";
import { t, type MessageKey } from "./i18n";
import { USER_MESSAGES } from "./user-messages";

export type Tag = "CUT" | "ASK" | "KEEP";

const TAG_KEY: Record<Tag, MessageKey> = {
  CUT: "tagCut",
  ASK: "tagAsk",
  KEEP: "tagKeep",
};

/** Display text of a row tag ("CUT" stays the data value; Spanish shows "CORTE"). */
export const tagLabel = (tag: Tag): string => t(TAG_KEY[tag]);

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

const CATEGORY_KEY: Record<SegmentCategory, MessageKey> = {
  sponsor: "categorySponsor",
  intro: "categoryIntro",
  outro: "categoryOutro",
  selfpromo: "categorySelfpromo",
  interaction_reminder: "categoryInteractionReminder",
};

export const categoryLabel = (c: SegmentCategory): string => t(CATEGORY_KEY[c]);

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
    return { tag: "KEEP", status: t("statusPlayerBlocked") };
  switch (d.reason) {
    case "auto-skip":
      if (ctx.paused && !ctx.skipped.has(seg.id))
        return { tag: "KEEP", status: t("statusAutoSkipPaused") };
      return {
        tag: "CUT",
        status: ctx.skipped.has(seg.id)
          ? t("statusSkipped", seconds(seg))
          : t("statusWillSkip", seconds(seg)),
      };
    case "notify-only":
      return {
        tag: "ASK",
        status: ctx.skipped.has(seg.id)
          ? t("statusSkipped", seconds(seg))
          : upcoming
            ? t("statusSkipButtonAt", formatTimecode(seg.startTime))
            : t("statusSkipButtonShown"),
      };
    case "low-confidence":
      return { tag: "KEEP", status: t("statusBelowThreshold") };
    case "category-not-skippable":
      return {
        tag: "KEEP",
        status: t("statusCategoryNotSkipped", categoryLabel(seg.category)),
      };
    case "channel-blocked":
      return { tag: "KEEP", status: t("statusChannelAllowed") };
    case "user-override":
      return { tag: "KEEP", status: t("statusKeptByYou") };
    default:
      return { tag: "KEEP", status: t("statusSkippingOff") };
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
  if (sponsors.length === 0) return t("thresholdNone");
  const over = sponsors.filter(
    (s) => s.confidence >= policy.confidenceThreshold,
  ).length;
  // One whole sentence per outcome: word order differs between languages.
  const key: MessageKey =
    !policy.globalEnabled || policy.mode === "off"
      ? "thresholdWould"
      : policy.mode === "notify"
        ? "thresholdAsk"
        : "thresholdCut";
  return t(key, over, sponsors.length);
}

/** Local wall-clock time of a reset, e.g. "7:00 PM". */
const resetTime = (iso: string): string =>
  new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

/**
 * Empty list wording. `fallback`: no AI result for this video. With
 * SponsorBlock off that means nothing was analyzed, and the popup says so
 * instead of implying the video has no sponsors.
 */
export function emptyStateCopy(
  fallback: boolean,
  sponsorBlock: boolean,
): string {
  if (!fallback) return USER_MESSAGES.popup.noSponsorReads;
  return sponsorBlock
    ? USER_MESSAGES.popup.nothingToSkip
    : USER_MESSAGES.popup.notAnalyzed;
}

/**
 * Wording for an analysis the API refused (daily allowance, global budget,
 * paused). Already-analyzed videos keep skipping.
 */
export function limitCopy(limit: AnalysisLimit): {
  title: string;
  sub: string;
  popup: string;
} {
  const at = resetTime(limit.resetAt);
  switch (limit.reason) {
    case "install_quota":
      return { ...USER_MESSAGES.limits.installQuota(at) };
    case "global_budget":
      return { ...USER_MESSAGES.limits.globalBudget(at) };
    case "llm_not_configured":
      return { ...USER_MESSAGES.limits.llmNotConfigured };
    case "llm_disabled":
      return { ...USER_MESSAGES.limits.llmDisabled };
    case "setting_up":
      return { ...USER_MESSAGES.limits.settingUp };
    default:
      return { ...USER_MESSAGES.limits.unreachable };
  }
}

const MODE_HELP_KEY: Record<UserPolicy["mode"], MessageKey> = {
  auto: "modeHelpAuto",
  notify: "modeHelpNotify",
  off: "modeHelpOff",
};

/** One-line help under the mode picker, in the user's language. */
export const modeHelp = (mode: UserPolicy["mode"]): string =>
  t(MODE_HELP_KEY[mode]);

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
