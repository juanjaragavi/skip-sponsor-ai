import { describe, it, expect, beforeEach } from "vitest";
import { GUARD, SkipGuard } from "../../extension/skip-guard";

describe("SkipGuard", () => {
  let now = 0;
  let g: SkipGuard;
  beforeEach(() => {
    now = 10_000;
    g = new SkipGuard(() => now);
  });

  it("allows the first skip and waits for it to land before another", () => {
    expect(g.canSkip("a")).toEqual({ ok: true });
    g.recordSeek("a", 30, 60);
    expect(g.canSkip("a")).toEqual({ ok: false, reason: "pending" });
    now += 200;
    expect(g.observe(60.25)).toBe("landed");
    expect(g.canSkip("a")).toEqual({ ok: true });
  });

  it("stale timeupdates right after the seek are not bounces", () => {
    g.recordSeek("a", 30, 60);
    now += 100;
    expect(g.observe(31)).toBeNull(); // old position still reported
    expect(g.canSkip("a").ok).toBe(false);
  });

  it("gives up on a segment the player keeps snapping back into (no endless loop)", () => {
    let seeks = 0;
    // Simulate a player that restores the old time after every seek, with
    // timeupdates every 250ms for 30s.
    for (let i = 0; i < 120; i++) {
      now += 250;
      g.observe(31);
      if (g.canSkip("a").ok) {
        g.recordSeek("a", 30, 60);
        seeks++;
      }
    }
    expect(seeks).toBe(GUARD.MAX_BOUNCES);
    expect(g.canSkip("a")).toEqual({ ok: false, reason: "gave-up" });
    expect(g.blocked()).toEqual(["a"]);
  });

  it("a landed skip resets bounces, so replaying the video skips again", () => {
    g.recordSeek("a", 30, 60);
    now += GUARD.LAND_TIMEOUT_MS + 1;
    expect(g.observe(31)).toBe("bounced");
    g.recordSeek("a", 30, 60);
    now += 100;
    expect(g.observe(60.25)).toBe("landed");
    // Later the user replays from the start and passes 30s again.
    now += 60_000;
    g.recordSeek("a", 30, 60);
    now += GUARD.LAND_TIMEOUT_MS + 1;
    expect(g.observe(31)).toBe("bounced"); // first bounce again, not give-up
    expect(g.canSkip("a").ok).toBe(true);
  });

  it("a seek that ends up outside the segment (user moved) is neither", () => {
    g.recordSeek("a", 30, 60);
    now += GUARD.LAND_TIMEOUT_MS + 1;
    expect(g.observe(10)).toBeNull();
    expect(g.canSkip("a").ok).toBe(true);
  });

  it("trips off for the video after too many seeks in a short window", () => {
    for (let i = 0; i < GUARD.MAX_SEEKS_PER_WINDOW; i++) {
      const id = `s${i}`;
      expect(g.canSkip(id).ok).toBe(true);
      g.recordSeek(id, i * 100, i * 100 + 20);
      now += 500;
      g.observe(i * 100 + 21);
    }
    expect(g.isTripped()).toBe(true);
    expect(g.canSkip("other")).toEqual({ ok: false, reason: "tripped" });
  });

  it("spaced-out skips never trip the rate limit", () => {
    for (let i = 0; i < 10; i++) {
      g.recordSeek(`s${i}`, 0, 20);
      now += 100;
      g.observe(21);
      now += GUARD.RATE_WINDOW_MS / 2;
    }
    expect(g.isTripped()).toBe(false);
  });

  it("waits for the content to settle after an ad", () => {
    g.noteAd();
    expect(g.canSkip("a")).toEqual({ ok: false, reason: "ad-settling" });
    now += GUARD.AD_SETTLE_MS + 1;
    expect(g.canSkip("a")).toEqual({ ok: true });
  });
});
