import { describe, it, expect } from "vitest";
import { maxSpeechSeconds } from "../../shared/speech";
import { SLOWEST_SPEECH_CHARS_PER_SECOND } from "../../shared/constants";

describe("maxSpeechSeconds", () => {
  it("bounds Latin text by the slowest plausible speaking rate", () => {
    const text = "x".repeat(SLOWEST_SPEECH_CHARS_PER_SECOND * 5);
    expect(maxSpeechSeconds(text)).toBe(5);
  });
  it("collapses whitespace before measuring", () => {
    expect(maxSpeechSeconds("  a   b \n c ")).toBe(maxSpeechSeconds("a b c"));
  });
  it("weights CJK and Hangul characters as denser speech", () => {
    expect(maxSpeechSeconds("本期视频由某公司赞助")).toBeGreaterThan(
      maxSpeechSeconds("abcdefghij"),
    );
    expect(maxSpeechSeconds("이 영상은 협찬")).toBeGreaterThan(
      maxSpeechSeconds("abcdefgh"),
    );
  });
});
