import { describe, it, expect } from "vitest";
import {
  candidatesToSegments,
  mergeCandidates,
} from "../../api/services/segment-classifier";

describe("candidatesToSegments", () => {
  it("filters by threshold and duration", () => {
    const segs = candidatesToSegments("dQw4w9WgXcQ", null, "claude-haiku", [
      { start: 10, end: 70, category: "sponsor", confidence: 0.94, rationale: "vpn read" },
      { start: 80, end: 82, category: "sponsor", confidence: 0.99, rationale: "x" },
      { start: 90, end: 150, category: "sponsor", confidence: 0.5, rationale: "y" },
    ]);
    expect(segs).toHaveLength(1);
    expect(segs[0]!.startTime).toBe(10);
  });
});

describe("mergeCandidates", () => {
  it("merges <4s gaps", () => {
    const base = candidatesToSegments("dQw4w9WgXcQ", null, "claude-haiku", [
      { start: 10, end: 70, category: "sponsor", confidence: 0.9, rationale: "a" },
      { start: 72, end: 130, category: "sponsor", confidence: 0.9, rationale: "b" },
    ]);
    expect(mergeCandidates(base)).toHaveLength(1);
  });
});
