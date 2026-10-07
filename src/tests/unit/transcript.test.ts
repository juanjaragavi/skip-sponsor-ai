import { describe, it, expect } from "vitest";
import { buildCues, parseTimestamp } from "../../extension/transcript";

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
