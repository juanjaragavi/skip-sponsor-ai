import { describe, expect, it } from "vitest";
import type { SponsorSegment, VideoAnalysis } from "../../shared/types";
import {
  SPONSORBLOCK_ENABLED,
  applySponsorBlockSwitch,
} from "../../extension/sponsorblock-gate";
import { emptyStateCopy, limitCopy } from "../../extension/view-model";
import { USER_MESSAGES } from "../../extension/user-messages";

const seg = (source: SponsorSegment["source"], start: number) => ({
  id: `${source}-${start}`,
  videoId: "dQw4w9WgXcQ",
  channelId: null,
  startTime: start,
  endTime: start + 30,
  confidence: 0.9,
  category: "sponsor" as const,
  source,
  createdAt: "2026-10-13T00:00:00.000Z",
});
const analysis = (
  status: VideoAnalysis["status"],
  segments: SponsorSegment[],
): VideoAnalysis => ({
  videoId: "dQw4w9WgXcQ",
  duration: 600,
  language: "en",
  status,
  segments,
  transcriptVersion: "x",
  analyzedAt: "2026-10-13T00:00:00.000Z",
});

describe("extension SponsorBlock switch (VITE_SPONSORBLOCK_ENABLED)", () => {
  it("is off unless the build sets it", () => {
    expect(SPONSORBLOCK_ENABLED).toBe(false);
  });

  it("drops SponsorBlock segments from a ready result when off", () => {
    const out = applySponsorBlockSwitch(
      analysis("ready", [seg("claude-haiku", 30), seg("sponsorblock", 260)]),
      false,
    );
    expect(out?.status).toBe("ready");
    expect(out?.segments.map((s) => s.source)).toEqual(["claude-haiku"]);
  });

  it("turns a SponsorBlock fallback into an honest 'not analyzed' when off", () => {
    expect(
      applySponsorBlockSwitch(
        analysis("degraded", [seg("sponsorblock", 30)]),
        false,
      ),
    ).toMatchObject({ status: "unanalyzable", segments: [] });
  });

  it("keeps everything when explicitly enabled", () => {
    const a = analysis("degraded", [seg("sponsorblock", 30)]);
    expect(applySponsorBlockSwitch(a, true)).toBe(a);
  });

  it("passes a missing analysis through", () => {
    expect(applySponsorBlockSwitch(null, false)).toBeNull();
  });
});

describe("copy without SponsorBlock", () => {
  it("says the video was not analyzed when there was nothing to read", () => {
    expect(emptyStateCopy(true, false)).toBe(USER_MESSAGES.popup.notAnalyzed);
    expect(USER_MESSAGES.popup.notAnalyzed).toMatch(/Couldn’t analyze/);
    expect(emptyStateCopy(true, true)).toBe(USER_MESSAGES.popup.nothingToSkip);
    expect(emptyStateCopy(false, false)).toBe(
      USER_MESSAGES.popup.noSponsorReads,
    );
  });

  it("does not promise community-labelled skips in limit notices", () => {
    const resetAt = "2026-10-13T12:00:00.000Z";
    for (const reason of [
      "install_quota",
      "global_budget",
      "llm_not_configured",
      "llm_disabled",
      "unauthenticated",
    ] as const) {
      const copy = limitCopy({ reason, resetAt });
      expect(`${copy.title} ${copy.sub} ${copy.popup}`).not.toMatch(
        /community|sponsorblock/i,
      );
    }
  });
});
