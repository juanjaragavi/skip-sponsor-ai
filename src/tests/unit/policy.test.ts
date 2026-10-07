import { describe, it, expect } from "vitest";
import { decideSkip, DEFAULT_POLICY } from "../../extension/policy";

describe("decideSkip", () => {
  const base = {
    id: "0191a2b3-4c5d-7e8f-90ab-cdef12345678",
    videoId: "dQw4w9WgXcQ",
    channelId: "UC_x5XG1OV2P6uZZ5FSM9Ttw",
    startTime: 121.4,
    endTime: 183.9,
    confidence: 0.94,
    category: "sponsor" as const,
    source: "claude-haiku" as const,
    createdAt: new Date().toISOString(),
  };
  it("auto-skips when enabled and confident", () => {
    expect(
      decideSkip(DEFAULT_POLICY, base, "UC_x", {
        globalKill: false,
        userOverridden: false,
      }).shouldSkip,
    ).toBe(true);
  });
  it("blocks on kill-switch, global-off, blocked channel, low conf, override, notify", () => {
    expect(
      decideSkip(DEFAULT_POLICY, base, null, {
        globalKill: true,
        userOverridden: false,
      }).shouldSkip,
    ).toBe(false);
    expect(
      decideSkip({ ...DEFAULT_POLICY, globalEnabled: false }, base, null, {
        globalKill: false,
        userOverridden: false,
      }).shouldSkip,
    ).toBe(false);
    expect(
      decideSkip(
        { ...DEFAULT_POLICY, blockedChannels: ["UC_x"] },
        base,
        "UC_x",
        { globalKill: false, userOverridden: false },
      ).shouldSkip,
    ).toBe(false);
    expect(
      decideSkip(DEFAULT_POLICY, { ...base, confidence: 0.5 }, null, {
        globalKill: false,
        userOverridden: false,
      }).shouldSkip,
    ).toBe(false);
    expect(
      decideSkip(DEFAULT_POLICY, base, null, {
        globalKill: false,
        userOverridden: true,
      }).shouldSkip,
    ).toBe(false);
    expect(
      decideSkip({ ...DEFAULT_POLICY, mode: "notify" }, base, null, {
        globalKill: false,
        userOverridden: false,
      }),
    ).toEqual({ shouldSkip: false, reason: "notify-only" });
  });
  it.each(["intro", "outro", "selfpromo", "interaction_reminder"] as const)(
    "never auto-skips the %s category",
    (category) => {
      expect(
        decideSkip(DEFAULT_POLICY, { ...base, category }, null, {
          globalKill: false,
          userOverridden: false,
        }),
      ).toEqual({ shouldSkip: false, reason: "category-not-skippable" });
    },
  );
});
