import { describe, it, expect } from "vitest";
import {
  buildCues,
  limitCues,
  parseTimestamp,
  splitLongCues,
  toTranscriptCues,
  transcriptFingerprint,
} from "../../extension/transcript";
import type { LlmChunk } from "../../shared/types";
import { MAX_CUE_TEXT, MAX_TRANSCRIPT_CUES } from "../../shared/constants";
import { analyzeRequestSchema } from "../../shared/validators";

describe("parseTimestamp", () => {
  it("parses m:ss and h:mm:ss", () => {
    expect(parseTimestamp("0:03")).toBe(3);
    expect(parseTimestamp("20:58")).toBe(1258);
    expect(parseTimestamp("1:02:03")).toBe(3723);
  });
  it("rejects malformed input", () => {
    expect(parseTimestamp("")).toBeNull();
    expect(parseTimestamp("abc")).toBeNull();
    expect(parseTimestamp("1:99")).toBeNull();
    expect(parseTimestamp("1:2:3:4")).toBeNull();
  });
});

describe("buildCues", () => {
  it("ends each cue where the next begins and the last at duration", () => {
    const cues = buildCues(
      [
        { timestamp: "0:03", text: "hola" },
        { timestamp: "0:06", text: "mundo" },
      ],
      30,
    );
    expect(cues).toEqual([
      { t0: 3, t1: 6, text: "hola" },
      { t0: 6, t1: 30, text: "mundo" },
    ]);
  });
  it("normalizes whitespace and drops empty or invalid rows", () => {
    const cues = buildCues(
      [
        { timestamp: "0:01", text: "  a \n b  " },
        { timestamp: "bad", text: "skip" },
        { timestamp: "0:02", text: "   " },
        { timestamp: "0:05", text: "c" },
      ],
      10,
    );
    expect(cues.map((c) => c.text)).toEqual(["a b", "c"]);
  });
  it("sorts rows and guarantees t1 > t0 for duplicate timestamps", () => {
    const cues = buildCues(
      [
        { timestamp: "0:05", text: "b" },
        { timestamp: "0:05", text: "a" },
      ],
      0,
    );
    expect(cues.every((c) => c.t1 > c.t0)).toBe(true);
  });
  it("caps cue text length", () => {
    const [cue] = buildCues(
      [{ timestamp: "0:00", text: "x".repeat(2000) }],
      10,
    );
    expect(cue!.text.length).toBe(600);
  });
  it("returns [] when nothing is usable", () => {
    expect(buildCues([], 10)).toEqual([]);
  });
});

describe("splitLongCues", () => {
  // Live example (modern panel): a 9s row where the sponsor starts mid-row.
  const row: LlmChunk = {
    t0: 16,
    t1: 25,
    text: "Don't forget to like and subscribe. This video is sponsored by Acme, use code ACME.",
  };

  it("splits a coarse row into sentences with interpolated starts", () => {
    const out = splitLongCues([row]);
    expect(out.map((c) => c.text)).toEqual([
      "Don't forget to like and subscribe.",
      "This video is sponsored by Acme, use code ACME.",
    ]);
    expect(out[0]!.t0).toBe(16);
    expect(out[1]!.t0).toBeGreaterThan(19);
    expect(out[1]!.t0).toBeLessThan(21);
    expect(out[0]!.t1).toBe(out[1]!.t0);
    expect(out[1]!.t1).toBe(25);
  });

  it("keeps short rows and single-sentence rows untouched", () => {
    const short = { t0: 0, t1: 3, text: "One. Two." };
    const single = { t0: 3, t1: 20, text: "no punctuation at all here" };
    expect(splitLongCues([short, single])).toEqual([short, single]);
  });

  it("never stretches text beyond a plausible speaking rate", () => {
    // 20 chars of speech followed by 60s of music: the second sentence
    // cannot start 30s in.
    const out = splitLongCues([{ t0: 0, t1: 60, text: "Hi there. Bye now." }]);
    expect(out[1]!.t0).toBeLessThan(3);
  });

  it("merges sub-second fragments and keeps every cue valid", () => {
    const out = splitLongCues([
      { t0: 10, t1: 16, text: "A. B. C. D. E. F. G. H. I. J. K. L." },
    ]);
    expect(out.length).toBeGreaterThan(0);
    for (let i = 1; i < out.length; i++)
      expect(out[i]!.t0 - out[i - 1]!.t0).toBeGreaterThanOrEqual(1);
    expect(out.every((c) => c.t1 > c.t0)).toBe(true);
    expect(out.map((c) => c.text).join(" ")).toBe(
      "A. B. C. D. E. F. G. H. I. J. K. L.",
    );
  });
});

describe("limitCues", () => {
  const many = (n: number): LlmChunk[] =>
    Array.from({ length: n }, (_, i) => ({ t0: i, t1: i + 1, text: `w${i}` }));

  it("returns the input unchanged when under the limit", () => {
    expect(limitCues(many(10), 20)).toEqual(many(10));
  });

  it("merges neighbours until the transcript fits, preserving text and order", () => {
    const out = limitCues(many(5600), MAX_TRANSCRIPT_CUES);
    expect(out.length).toBeLessThanOrEqual(MAX_TRANSCRIPT_CUES);
    expect(out.map((c) => c.text).join(" ")).toBe(
      many(5600)
        .map((c) => c.text)
        .join(" "),
    );
    expect(out.every((c) => c.t1 > c.t0)).toBe(true);
  });

  it("never exceeds the per-cue text limit", () => {
    const long = Array.from({ length: 12 }, (_, i) => ({
      t0: i,
      t1: i + 1,
      text: "x".repeat(400),
    }));
    const out = limitCues(long, 6);
    expect(out.every((c) => c.text.length <= MAX_CUE_TEXT)).toBe(true);
  });
});

describe("toTranscriptCues", () => {
  it("produces a payload the API accepts for a >1h legacy transcript", () => {
    const rows = Array.from({ length: 5600 }, (_, i) => ({
      timestamp: `${Math.floor((i * 0.7) / 60)}:${String(Math.floor(i * 0.7) % 60).padStart(2, "0")}`,
      text: `word ${i}`,
    }));
    const transcript = toTranscriptCues(rows, 3920);
    const parsed = analyzeRequestSchema.safeParse({
      videoId: "abcdefghijk",
      transcript,
    });
    expect(parsed.success).toBe(true);
  });
});

describe("transcriptFingerprint", () => {
  const rows = (prefix: string) =>
    Array.from({ length: 8 }, (_, i) => ({
      timestamp: `0:0${i}`,
      text: `${prefix} ${i}`,
    }));

  it("is stable for identical rows and ignores surrounding whitespace", () => {
    const a = rows("alpha");
    const b = a.map((r) => ({
      timestamp: `\n  ${r.timestamp}\n`,
      text: ` ${r.text} `,
    }));
    expect(transcriptFingerprint(a)).toBe(transcriptFingerprint(b));
  });

  it("differs between videos and between partial and complete renders", () => {
    expect(transcriptFingerprint(rows("alpha"))).not.toBe(
      transcriptFingerprint(rows("beta")),
    );
    expect(transcriptFingerprint(rows("alpha").slice(0, 4))).not.toBe(
      transcriptFingerprint(rows("alpha")),
    );
  });
});
