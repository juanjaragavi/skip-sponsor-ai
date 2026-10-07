import { describe, it, expect } from "vitest";
import {
  parseTimedText,
  chunkTranscript,
  transcriptHash,
} from "../../api/services/chunker";

describe("parseTimedText", () => {
  it("extracts text with timestamps", () => {
    const chunks = parseTimedText({
      events: [
        {
          tStartMs: 1000,
          dDurationMs: 2000,
          segs: [{ utf8: "hello " }, { utf8: "sponsor" }],
        },
        { tStartMs: 4000, dDurationMs: 1000, segs: [{ utf8: "  " }] },
      ],
    });
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toMatchObject({ t0: 1, t1: 3, text: "hello sponsor" });
  });
});

describe("chunkTranscript", () => {
  it("windows 60s with 10s overlap", () => {
    const chunks = Array.from({ length: 130 }, (_, i) => ({
      t0: i,
      t1: i + 1,
      text: `w${i}`,
    }));
    const wins = chunkTranscript(chunks, 60, 10);
    expect(wins.length).toBeGreaterThanOrEqual(3);
    expect(wins[0]!.length).toBeGreaterThan(0);
  });
  it("empty input -> empty", () => {
    expect(chunkTranscript([])).toEqual([]);
  });
});

describe("transcriptHash", () => {
  it("stable", () => {
    expect(transcriptHash("abc")).toBe(transcriptHash("abc"));
  });
});
