import { describe, it, expect } from "vitest";
import type { SponsorSegment, UserPolicy } from "../../shared/types";
import { DEFAULT_POLICY, sameChannel } from "../../extension/policy";
import {
  activeRowId,
  describeSegment,
  displayChannelId,
  formatRange,
  formatTimecode,
  gatePosition,
  parseChannelInput,
  segmentRows,
  thresholdSummary,
  type RowContext,
} from "../../extension/view-model";

const seg = (over: Partial<SponsorSegment> = {}): SponsorSegment => ({
  id: "0191a2b3-4c5d-7e8f-90ab-cdef12345678",
  videoId: "dQw4w9WgXcQ",
  channelId: null,
  startTime: 222,
  endTime: 262,
  confidence: 0.91,
  category: "sponsor",
  source: "claude-haiku",
  createdAt: new Date().toISOString(),
  ...over,
});

const ctx = (over: Partial<RowContext> = {}): RowContext => ({
  channelId: "@chan",
  currentTime: 0,
  skipped: new Set(),
  overridden: new Set(),
  ...over,
});

const policy = (over: Partial<UserPolicy> = {}): UserPolicy => ({
  ...DEFAULT_POLICY,
  ...over,
});

describe("formatTimecode", () => {
  it("pads minutes like an editor timecode", () => {
    expect(formatTimecode(222)).toBe("03:42");
    expect(formatTimecode(0)).toBe("00:00");
    expect(formatTimecode(59.9)).toBe("00:59");
  });
  it("adds hours when needed", () => {
    expect(formatTimecode(3723)).toBe("1:02:03");
  });
  it("treats invalid input as zero", () => {
    expect(formatTimecode(Number.NaN)).toBe("00:00");
    expect(formatTimecode(-5)).toBe("00:00");
  });
  it("formats ranges with an arrow", () => {
    expect(formatRange(222, 262)).toBe("03:42 → 04:22");
  });
});

describe("describeSegment", () => {
  it("CUT: upcoming vs already skipped", () => {
    expect(describeSegment(seg(), policy(), ctx())).toEqual({
      tag: "CUT",
      status: "Will skip · 40s",
    });
    expect(
      describeSegment(seg(), policy(), ctx({ skipped: new Set([seg().id]) })),
    ).toEqual({
      tag: "CUT",
      status: "Skipped · 40s",
    });
  });
  it("ASK in notify mode: upcoming vs shown", () => {
    const p = policy({ mode: "notify" });
    expect(describeSegment(seg(), p, ctx())).toEqual({
      tag: "ASK",
      status: "Skip button at 03:42",
    });
    expect(describeSegment(seg(), p, ctx({ currentTime: 230 }))).toEqual({
      tag: "ASK",
      status: "Skip button shown",
    });
  });
  it("KEEP with the reason it is kept", () => {
    expect(
      describeSegment(seg({ confidence: 0.6 }), policy(), ctx()).status,
    ).toBe("Below threshold");
    expect(
      describeSegment(seg({ category: "intro" }), policy(), ctx()).status,
    ).toBe("Intro · not skipped");
    expect(
      describeSegment(seg(), policy({ blockedChannels: ["@chan"] }), ctx())
        .status,
    ).toBe("Channel allowed");
    expect(
      describeSegment(seg(), policy(), ctx({ overridden: new Set([seg().id]) }))
        .status,
    ).toBe("Kept by you");
    expect(describeSegment(seg(), policy({ mode: "off" }), ctx())).toEqual({
      tag: "KEEP",
      status: "Skipping is off",
    });
    expect(
      describeSegment(seg(), policy({ globalEnabled: false }), ctx()).tag,
    ).toBe("KEEP");
  });
});

describe("segmentRows", () => {
  it("sorts by start time, numbers rows and formats confidence", () => {
    const rows = segmentRows(
      [
        seg({ id: "b", startTime: 550, endTime: 565, confidence: 0.64 }),
        seg({ id: "a" }),
      ],
      policy(),
      ctx(),
    );
    expect(
      rows.map((r) => [r.index, r.id, r.tag, r.range, r.confidence]),
    ).toEqual([
      ["01", "a", "CUT", "03:42 → 04:22", "91%"],
      ["02", "b", "KEEP", "09:10 → 09:25", "64%"],
    ]);
  });
});

describe("activeRowId", () => {
  const rows = segmentRows(
    [
      seg({ id: "a", startTime: 30, endTime: 60 }),
      seg({ id: "b", startTime: 90, endTime: 100 }),
    ],
    policy(),
    ctx(),
  );
  it("prefers the range being played", () =>
    expect(activeRowId(rows, 95)).toBe("b"));
  it("then the range just passed (the design brackets the last cut)", () =>
    expect(activeRowId(rows, 61)).toBe("a"));
  it("then the first upcoming range", () =>
    expect(activeRowId(rows, 5)).toBe("a"));
  it("is null without rows", () => expect(activeRowId([], 5)).toBeNull());
});

describe("thresholdSummary", () => {
  const segs = [
    seg({ id: "a" }),
    seg({ id: "b", confidence: 0.64 }),
    seg({ id: "c", category: "intro" }),
  ];
  it("counts sponsor segments over the line by mode", () => {
    expect(thresholdSummary(segs, policy())).toMatch(
      /gets cut — 1 of 2 here\.$/,
    );
    expect(thresholdSummary(segs, policy({ mode: "notify" }))).toMatch(
      /gets a Skip button — 1 of 2 here\.$/,
    );
    expect(thresholdSummary(segs, policy({ mode: "off" }))).toMatch(
      /would be cut — 1 of 2 here\.$/,
    );
    expect(
      thresholdSummary(segs, policy({ confidenceThreshold: 0.6 })),
    ).toMatch(/2 of 2 here\.$/);
  });
  it("handles videos with no sponsor segments", () => {
    expect(thresholdSummary([], policy())).toBe(
      "Dots show this video’s detected segments — none so far.",
    );
  });
});

describe("parseChannelInput", () => {
  it("accepts handles and normalizes them like a page link", () => {
    expect(parseChannelInput("@JayzTwoCents")).toBe("@JayzTwoCents");
    expect(parseChannelInput("  @alpha-channel ")).toBe("@alpha-channel");
    expect(parseChannelInput("@ハンドル名")).toBe(
      `@${encodeURIComponent("ハンドル名")}`,
    );
  });
  it("accepts channel links with or without a scheme", () => {
    expect(parseChannelInput("https://www.youtube.com/@creator/videos")).toBe(
      "@creator",
    );
    expect(parseChannelInput("youtube.com/@creator")).toBe("@creator");
    expect(parseChannelInput("https://m.youtube.com/@creator")).toBe(
      "@creator",
    );
    const uc = "UC_x5XG1OV2P6uZZ5FSM9Ttw";
    expect(parseChannelInput(`https://www.youtube.com/channel/${uc}`)).toBe(
      `channel/${uc}`,
    );
    expect(parseChannelInput(uc)).toBe(`channel/${uc}`);
  });
  it("rejects anything that is not a YouTube channel", () => {
    for (const bad of [
      "",
      "creator",
      "@ab",
      "https://evil.example.com/@creator",
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      "https://www.youtube.com/channel/notAnId",
      "javascript:alert(1)",
    ])
      expect(parseChannelInput(bad), bad).toBeNull();
  });
  it("displays ids readably", () => {
    expect(displayChannelId(`@${encodeURIComponent("ハンドル名")}`)).toBe(
      "@ハンドル名",
    );
    expect(displayChannelId("channel/UC_x5XG1OV2P6uZZ5FSM9Ttw")).toBe(
      "UC_x5XG1OV2P6uZZ5FSM9Ttw",
    );
  });
});

describe("sameChannel", () => {
  it("compares handles case-insensitively and UC ids exactly", () => {
    expect(sameChannel("@JayzTwoCents", "@jayztwocents")).toBe(true);
    expect(sameChannel("channel/UCabc", "channel/ucabc")).toBe(false);
    expect(sameChannel("@abc", "channel/abc")).toBe(false);
  });
  it("a handle typed in lower case still blocks the channel", () => {
    expect(
      describeSegment(
        seg(),
        policy({ blockedChannels: ["@chan"] }),
        ctx({ channelId: "@CHAN" }),
      ).status,
    ).toBe("Channel allowed");
  });
});

describe("gatePosition", () => {
  it("maps 50–95% onto 0–1 and clamps", () => {
    expect(gatePosition(0.5)).toBe(0);
    expect(gatePosition(0.95)).toBe(1);
    expect(gatePosition(0.725)).toBeCloseTo(0.5, 5);
    expect(gatePosition(0.2)).toBe(0);
    expect(gatePosition(1)).toBe(1);
  });
});
