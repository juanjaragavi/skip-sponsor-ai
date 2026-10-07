import { describe, expect, it } from "vitest";
import { stripJsonFence } from "../../api/services/llm-client";

describe("stripJsonFence", () => {
  it("unwraps a ```json fence", () => {
    expect(stripJsonFence('```json\n{"segments":[]}\n```')).toBe(
      '{"segments":[]}',
    );
  });
  it("unwraps a bare ``` fence", () => {
    expect(stripJsonFence('```\n{"a":1}\n```')).toBe('{"a":1}');
  });
  it("ignores prose after the fenced block", () => {
    const raw =
      '```json\n{"segments":[]}\n```\n\n**Rationale:** none {really}.';
    expect(JSON.parse(stripJsonFence(raw))).toEqual({ segments: [] });
  });
  it("ignores prose before the JSON object", () => {
    expect(
      JSON.parse(stripJsonFence('Here you go: {"segments":[{"a":1}]} done')),
    ).toEqual({
      segments: [{ a: 1 }],
    });
  });
  it("leaves plain JSON untouched", () => {
    expect(stripJsonFence('{"segments":[]}')).toBe('{"segments":[]}');
  });
});
