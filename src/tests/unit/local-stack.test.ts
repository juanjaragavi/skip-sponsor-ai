import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  checkProductionConfig,
  config,
  isLoopbackHost,
  llmStubActive,
} from "../../api/config";
import { LLM_STUB_RATIONALE, stubClassify } from "../../api/services/llm-stub";
import {
  classifyChunks,
  liveCall,
  stubCall,
} from "../../api/services/llm-client";
import { validateCandidates } from "../../api/services/candidate-validation";
import type { LlmChunk } from "../../shared/types";

/**
 * Local-first standard (LF-2): `npm run local` analyzes with a deterministic stub
 * instead of Claude. It must be impossible to activate on a public address, and
 * its output must pass the same validation as a real model answer.
 */
const fixture = JSON.parse(
  readFileSync(
    join(__dirname, "../local-smoke/fixtures/sponsor-transcript.json"),
    "utf8",
  ),
) as {
  transcript: LlmChunk[];
  expected: { sponsorStart: number; sponsorEnd: number };
};

describe("loopback guard", () => {
  it.each([
    ["127.0.0.1", true],
    ["127.1.2.3", true],
    ["localhost", true],
    ["::1", true],
    ["0.0.0.0", false],
    ["10.0.0.5", false],
    ["api.example.com", false],
    ["", false],
  ])("%s -> %s", (host, want) => {
    expect(isLoopbackHost(host)).toBe(want);
  });

  it("activates the stub only when asked AND bound to loopback", () => {
    expect(llmStubActive({ llmStub: true, host: "127.0.0.1" })).toBe(true);
    expect(llmStubActive({ llmStub: true, host: "0.0.0.0" })).toBe(false);
    expect(llmStubActive({ llmStub: false, host: "127.0.0.1" })).toBe(false);
  });

  it("a production server on a public address refuses LLM_STUB", () => {
    const base = {
      ...config,
      isProduction: true,
      installTokenSecret: "x".repeat(40),
      persistence: "postgres" as const,
      databaseUrl: "postgres://db/app",
    };
    expect(
      checkProductionConfig({
        ...base,
        llmStub: true,
        host: "0.0.0.0",
      }).errors.join(" "),
    ).toMatch(/LLM_STUB is for the local stack only/);
    expect(
      checkProductionConfig({
        ...base,
        llmStub: true,
        host: "127.0.0.1",
      }).errors.join(" "),
    ).not.toMatch(/LLM_STUB/);
    expect(
      checkProductionConfig({
        ...base,
        llmStub: false,
        host: "0.0.0.0",
      }).errors.join(" "),
    ).not.toMatch(/LLM_STUB/);
  });

  it("the default config (tests, no env) uses the live call", () => {
    expect(config.llmStub).toBe(false);
    expect(liveCall).not.toBe(stubCall);
  });
});

describe("LLM stub", () => {
  it("finds the one sponsor read of the fixture and it survives validation", () => {
    const raw = stubClassify(fixture.transcript);
    expect(raw).toHaveLength(1);
    expect(raw[0]!.advertiser).toBe("Acme Tools");
    expect(raw[0]!.rationale).toBe(LLM_STUB_RATIONALE);
    const valid = validateCandidates(raw, fixture.transcript);
    expect(valid).toHaveLength(1);
    expect(valid[0]!.category).toBe("sponsor");
    expect(
      Math.abs(valid[0]!.start - fixture.expected.sponsorStart),
    ).toBeLessThanOrEqual(2);
    expect(
      Math.abs(valid[0]!.end - fixture.expected.sponsorEnd),
    ).toBeLessThanOrEqual(3);
  });

  it("returns nothing for a transcript without a promo", () => {
    expect(
      stubClassify([
        { t0: 0, t1: 5, text: "Today we plant tomatoes in the garden." },
        { t0: 5, t1: 10, text: "Water them twice a week." },
      ]),
    ).toEqual([]);
  });

  it("splits promo cues far apart into separate reads and names an unnamed sponsor", () => {
    const out = stubClassify([
      { t0: 0, t1: 5, text: "This part is sponsored, more below." },
      { t0: 100, t1: 105, text: "Use code SAVE for a discount today." },
    ]);
    expect(out).toHaveLength(2);
    expect(out.every((c) => c.advertiser === "Unnamed sponsor")).toBe(true);
  });

  it("runs through classifyChunks like a model answer", async () => {
    const result = await classifyChunks([fixture.transcript], stubCall);
    expect(result.model).toBe("claude-haiku");
    expect(result.candidates).toHaveLength(1);
  });
});
