/**
 * SkipGuard — the skip loop's safety net. Pure (clock injected) so every rule
 * is unit-tested. It answers one question per timeupdate: may the extension
 * seek past this segment right now?
 *
 * Rules:
 * 1. After a seek, wait for it to land before seeking again (`pending`).
 * 2. A seek that lands back inside the same segment is a "bounce" (YouTube's
 *    player restored the old time). After MAX_BOUNCES the segment is given up
 *    for this playback: no endless fight with the player.
 * 3. A landed seek resets the segment's bounce count, so watching the video
 *    again later still skips.
 * 4. At most MAX_SEEKS_PER_WINDOW automatic seeks per RATE_WINDOW_MS; beyond
 *    that, auto-skip trips off for the rest of this video.
 * 5. No automatic seek within AD_SETTLE_MS after an ad was showing: YouTube
 *    re-positions the content right after an ad.
 */
export const GUARD = {
  LAND_TIMEOUT_MS: 1500,
  MAX_BOUNCES: 2,
  MAX_SEEKS_PER_WINDOW: 4,
  RATE_WINDOW_MS: 30_000,
  AD_SETTLE_MS: 1500,
  /** Landing tolerance: the target is end + offset; accept slightly before. */
  LAND_SLACK_S: 0.5,
} as const;

export type GuardVerdict =
  | { ok: true }
  | {
      ok: false;
      reason: "pending" | "gave-up" | "tripped" | "ad-settling";
    };

export type GuardEvent = "landed" | "bounced" | "gave-up" | null;

interface Pending {
  segmentId: string;
  start: number;
  end: number;
  at: number;
}

export class SkipGuard {
  private pending: Pending | null = null;
  private bounces = new Map<string, number>();
  private givenUp = new Set<string>();
  private seekTimes: number[] = [];
  private tripped = false;
  private lastAdAt = Number.NEGATIVE_INFINITY;

  constructor(private readonly now: () => number = () => performance.now()) {}

  /** Call while a YouTube ad occupies the player. */
  noteAd(): void {
    this.lastAdAt = this.now();
  }

  canSkip(segmentId: string): GuardVerdict {
    if (this.tripped) return { ok: false, reason: "tripped" };
    if (this.givenUp.has(segmentId)) return { ok: false, reason: "gave-up" };
    if (this.now() - this.lastAdAt < GUARD.AD_SETTLE_MS)
      return { ok: false, reason: "ad-settling" };
    if (this.pending) return { ok: false, reason: "pending" };
    return { ok: true };
  }

  /** Record an automatic seek past [start, end). */
  recordSeek(segmentId: string, start: number, end: number): void {
    const t = this.now();
    this.pending = { segmentId, start, end, at: t };
    this.seekTimes = this.seekTimes.filter((s) => t - s < GUARD.RATE_WINDOW_MS);
    this.seekTimes.push(t);
    if (this.seekTimes.length >= GUARD.MAX_SEEKS_PER_WINDOW)
      this.tripped = true;
  }

  /** Feed every playback time; reports whether the pending seek landed. */
  observe(currentTime: number): GuardEvent {
    const p = this.pending;
    if (!p) return null;
    if (currentTime >= p.end - GUARD.LAND_SLACK_S) {
      this.pending = null;
      this.bounces.delete(p.segmentId);
      return "landed";
    }
    if (this.now() - p.at < GUARD.LAND_TIMEOUT_MS) return null;
    this.pending = null;
    if (currentTime < p.start || currentTime >= p.end) return null; // moved elsewhere
    const n = (this.bounces.get(p.segmentId) ?? 0) + 1;
    this.bounces.set(p.segmentId, n);
    if (n >= GUARD.MAX_BOUNCES) {
      this.givenUp.add(p.segmentId);
      return "gave-up";
    }
    return "bounced";
  }

  /** Segments given up on (shown in the popup), plus everything when tripped. */
  blocked(): string[] {
    return [...this.givenUp];
  }

  isTripped(): boolean {
    return this.tripped;
  }
}
