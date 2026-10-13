import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LlmChunk, LlmSegmentCandidate } from "../../shared/types";

// The Anthropic SDK is replaced by a recording fake: these tests exercise the
// real call path (limiter → circuit breaker → retry policy → reply parsing →
// validation) without a network or a key.
const create = vi.hoisted(() => vi.fn());
vi.mock("@anthropic-ai/sdk", () => {
  class APIUserAbortError extends Error {}
  class APIConnectionError extends Error {}
  class Anthropic {
    static APIUserAbortError = APIUserAbortError;
    static APIConnectionError = APIConnectionError;
    messages = { create };
  }
  return { default: Anthropic };
});

import {
  classifyChunks,
  llmBreaker,
  setLlmUsageListener,
} from "../../api/services/llm-client";
import { runWithCorrelationId } from "../../api/observability/correlation";
import { MODEL_POLICY, SYSTEM_PROMPT } from "../../shared/constants";

const cues: LlmChunk[] = [
  { t0: 0, t1: 5, text: "Welcome back to the channel." },
  {
    t0: 5.25,
    t1: 10,
    text: "But before we continue, a word from our sponsor.",
  },
  {
    t0: 10,
    t1: 20,
    text: "This video is sponsored by AcmeVPN. Use code SAVE at acmevpn.com/save.",
  },
  { t0: 20, t1: 30, text: "Anyway, back to the build." },
  { t0: 30, t1: 40, text: "Now we solder the switches." },
];

const sponsor = (
  o: Partial<LlmSegmentCandidate> = {},
): LlmSegmentCandidate => ({
  start: 10,
  end: 20,
  category: "sponsor",
  confidence: 0.95,
  evidence: "This video is sponsored by AcmeVPN",
  advertiser: "AcmeVPN",
  relationship: "third_party_sponsor",
  ...o,
});

/** An Anthropic Messages API reply carrying `text`. */
const reply = (
  text: string,
  usage = { input_tokens: 120, output_tokens: 30 },
) => ({
  content: [
    { type: "thinking", thinking: "ignored" },
    { type: "text", text },
  ],
  usage,
});
const segmentsReply = (segments: LlmSegmentCandidate[]) =>
  reply("```json\n" + JSON.stringify({ segments }) + "\n```\nDone.");

/** An SDK APIError look-alike: status plus response headers. */
const apiError = (status: number, headers?: Record<string, string> | Headers) =>
  Object.assign(new Error(`HTTP ${status}`), { status, headers });

describe("classifyChunks (Claude call path)", () => {
  const usage = vi.fn();

  beforeEach(() => {
    create.mockReset();
    usage.mockReset();
    setLlmUsageListener(usage);
    llmBreaker.close();
  });
  afterEach(() => setLlmUsageListener(null));

  it("sends every cue to the primary model and returns validated segments", async () => {
    create.mockResolvedValueOnce(segmentsReply([sponsor()]));

    const out = await classifyChunks([cues.slice(0, 3), cues.slice(2)]);

    expect(out.model).toBe("claude-haiku");
    expect(out.candidates).toHaveLength(1);
    expect(out.candidates[0]).toMatchObject({
      start: 10,
      advertiser: "AcmeVPN",
    });
    expect(create).toHaveBeenCalledTimes(1);
    const [body, opts] = create.mock.calls[0]!;
    expect(body).toMatchObject({
      model: MODEL_POLICY.primary,
      temperature: 0,
      max_tokens: MODEL_POLICY.maxTokens,
      system: SYSTEM_PROMPT,
    });
    // Overlapping windows are deduped; fractional starts keep one decimal.
    expect(body.messages[0].content.split("\n")).toEqual([
      "0|Welcome back to the channel.",
      "5.3|But before we continue, a word from our sponsor.",
      "10|This video is sponsored by AcmeVPN. Use code SAVE at acmevpn.com/save.",
      "20|Anyway, back to the build.",
      "30|Now we solder the switches.",
    ]);
    expect(opts.signal).toBeInstanceOf(AbortSignal);
    expect(opts.headers["Idempotency-Key"]).toMatch(/^[0-9a-f-]{36}$/);
    expect(opts.headers).not.toHaveProperty("x-correlation-id");
  });

  it("reports billed tokens to the usage listener", async () => {
    create.mockResolvedValueOnce(
      reply('{"segments":[]}', { input_tokens: 900, output_tokens: 42 }),
    );
    await classifyChunks([cues]);
    expect(usage).toHaveBeenCalledWith(MODEL_POLICY.primary, 900, 42);
  });

  it("drops model output that the transcript does not support", async () => {
    create.mockResolvedValueOnce(
      segmentsReply([
        sponsor({ evidence: "Brought to you by NordWidget today" }),
      ]),
    );
    const out = await classifyChunks([cues]);
    expect(out.candidates).toEqual([]);
  });

  it("treats a reply without a segments array as no detections", async () => {
    create.mockResolvedValueOnce(reply('{"result":"nothing here"}'));
    await expect(classifyChunks([cues])).resolves.toEqual({
      candidates: [],
      model: "claude-haiku",
    });
  });

  it("still bills a reply that fails to parse, then fails the analysis", async () => {
    create.mockResolvedValueOnce(
      reply("I could not find any sponsors.", {
        input_tokens: 10,
        output_tokens: 5,
      }),
    );
    await expect(classifyChunks([cues])).rejects.toThrow(SyntaxError);
    expect(usage).toHaveBeenCalledWith(MODEL_POLICY.primary, 10, 5);
  });

  it("forwards the request's correlation id to Claude", async () => {
    create.mockResolvedValueOnce(segmentsReply([]));
    await runWithCorrelationId("req-abc.123", () => classifyChunks([cues]));
    expect(create.mock.calls[0]![1].headers["x-correlation-id"]).toBe(
      "req-abc.123",
    );
  });

  it("retries a 429 honouring Retry-After, with the same Idempotency-Key", async () => {
    create
      .mockRejectedValueOnce(apiError(429, { "retry-after": "0" }))
      .mockRejectedValueOnce(apiError(503, new Headers({ "retry-after": "0" })))
      .mockResolvedValueOnce(segmentsReply([sponsor()]));

    const out = await classifyChunks([cues]);

    expect(out.candidates).toHaveLength(1);
    expect(create).toHaveBeenCalledTimes(3);
    const keys = create.mock.calls.map((c) => c[1].headers["Idempotency-Key"]);
    expect(new Set(keys).size).toBe(1);
    // Only the successful answer is billed.
    expect(usage).toHaveBeenCalledTimes(1);
  });

  it("does not retry a non-retryable 4xx", async () => {
    create.mockRejectedValueOnce(apiError(400));
    await expect(classifyChunks([cues])).rejects.toThrow("HTTP 400");
    expect(create).toHaveBeenCalledTimes(1);
    expect(usage).not.toHaveBeenCalled();
  });

  it("re-asks the fallback model when a detection is in the review band", async () => {
    create
      .mockResolvedValueOnce(segmentsReply([sponsor({ confidence: 0.6 })]))
      .mockResolvedValueOnce(segmentsReply([sponsor({ confidence: 0.92 })]));

    const out = await classifyChunks([cues]);

    expect(create.mock.calls.map((c) => c[0].model)).toEqual([
      MODEL_POLICY.primary,
      MODEL_POLICY.fallback,
    ]);
    expect(out.model).toBe("claude-sonnet");
    expect(out.candidates[0]!.confidence).toBe(0.92);
    expect(usage.mock.calls.map((c) => c[0])).toEqual([
      MODEL_POLICY.primary,
      MODEL_POLICY.fallback,
    ]);
  });

  it("never runs more than three Claude calls at once", async () => {
    // 1,700 distinct cues → 6 overlapping batches of 350.
    const long: LlmChunk[] = Array.from({ length: 1700 }, (_, i) => ({
      t0: i * 2,
      t1: i * 2 + 2,
      text: `line ${i}`,
    }));
    let inFlight = 0;
    let peak = 0;
    create.mockImplementation(async () => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight--;
      return segmentsReply([]);
    });

    await classifyChunks([long]);

    expect(create).toHaveBeenCalledTimes(6);
    expect(peak).toBe(3);
  });

  it("fails fast without calling Claude while the circuit breaker is open", async () => {
    llmBreaker.open();
    await expect(classifyChunks([cues])).rejects.toThrow(/open/i);
    expect(create).not.toHaveBeenCalled();
  });
});

describe("classifyChunks (batch policy, injected caller)", () => {
  const long: LlmChunk[] = Array.from({ length: 400 }, (_, i) => ({
    t0: i * 5,
    t1: i * 5 + 5,
    text:
      i === 10
        ? "This video is sponsored by AcmeVPN. Use code SAVE at acmevpn.com/save."
        : `content line ${i}`,
  }));
  const acme = sponsor({ start: 50, end: 55 });

  it("tolerates a failed batch when another one succeeds", async () => {
    const call = vi
      .fn()
      .mockResolvedValueOnce([acme])
      .mockRejectedValueOnce(new Error("rate limited"));
    const out = await classifyChunks([long], call);
    expect(call).toHaveBeenCalledTimes(2);
    expect(out.candidates).toHaveLength(1);
  });

  it("throws the first error when every batch fails", async () => {
    const call = vi
      .fn()
      .mockRejectedValueOnce(new Error("first"))
      .mockRejectedValueOnce(new Error("second"));
    await expect(classifyChunks([long], call)).rejects.toThrow("first");
  });

  it("keeps the primary answer when the fallback model fails", async () => {
    const call = vi.fn(async (model: string) => {
      if (model === MODEL_POLICY.fallback) throw new Error("sonnet down");
      return [{ ...acme, confidence: 0.6 }];
    });
    const out = await classifyChunks([long.slice(0, 50)], call);
    expect(out.model).toBe("claude-haiku");
    expect(out.candidates).toHaveLength(1);
    expect(out.candidates[0]!.confidence).toBe(0.6);
  });

  it("keeps the primary answer when the fallback model finds nothing", async () => {
    const call = vi.fn(async (model: string) =>
      model === MODEL_POLICY.fallback ? [] : [{ ...acme, confidence: 0.7 }],
    );
    const out = await classifyChunks([long.slice(0, 50)], call);
    expect(call).toHaveBeenCalledTimes(2);
    expect(out.model).toBe("claude-haiku");
    expect(out.candidates).toHaveLength(1);
  });

  it("returns nothing for an empty transcript without calling the model", async () => {
    const call = vi.fn();
    await expect(classifyChunks([], call)).resolves.toEqual({
      candidates: [],
      model: "claude-haiku",
    });
    expect(call).not.toHaveBeenCalled();
  });
});
