import Anthropic from "@anthropic-ai/sdk";
import CircuitBreaker from "opossum";
import { config } from "../config";
import type { LlmChunk, LlmSegmentCandidate } from "../../shared/types";
import {
  SYSTEM_PROMPT,
  MODEL_POLICY,
  LLM_BATCH_CUES,
  LLM_BATCH_OVERLAP_CUES,
} from "../../shared/constants";
import {
  batchCues,
  dedupeCues,
  validateCandidates,
} from "./candidate-validation";

const client = new Anthropic({
  // Same default as before: no key → "missing" (requests then fail with 401;
  // the server refuses fresh analyses without a key anyway).
  apiKey: config.anthropicKey || "missing",
});

/**
 * Haiku 4.5 wraps JSON in a ```json fence and may append commentary. Prefer
 * the fenced block, else the outermost object.
 */
export function stripJsonFence(text: string): string {
  const fenced = /```(?:json)?\s*([\s\S]*?)\s*```/i.exec(text)?.[1];
  const body = fenced ?? text;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  return start >= 0 && end > start ? body.slice(start, end + 1) : body;
}

/** Token usage of one Claude call; feeds the daily budget (cost-guard.ts). */
export type LlmUsageListener = (
  model: string,
  inputTokens: number,
  outputTokens: number,
) => void;
let usageListener: LlmUsageListener | null = null;

/** Register the single listener told about every billed Claude call. */
export function setLlmUsageListener(fn: LlmUsageListener | null): void {
  usageListener = fn;
}

function formatCues(cues: readonly LlmChunk[]): string {
  return cues
    .map((c) => `${Number.isInteger(c.t0) ? c.t0 : c.t0.toFixed(1)}|${c.text}`)
    .join("\n");
}

async function callClaude(
  model: string,
  chunks: LlmChunk[],
): Promise<LlmSegmentCandidate[]> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), MODEL_POLICY.timeoutMs);
  try {
    const msg = await client.messages.create(
      {
        model,
        max_tokens: MODEL_POLICY.maxTokens,
        temperature: 0,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: formatCues(chunks) }],
      },
      { signal: controller.signal as unknown as AbortSignal },
    );
    // Billed even when the reply below fails to parse.
    usageListener?.(
      model,
      msg.usage?.input_tokens ?? 0,
      msg.usage?.output_tokens ?? 0,
    );
    const text = msg.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { text: string }).text)
      .join("");
    const parsed = JSON.parse(stripJsonFence(text)) as {
      segments?: LlmSegmentCandidate[];
    };
    return Array.isArray(parsed.segments) ? parsed.segments : [];
  } finally {
    clearTimeout(t);
  }
}

const breaker = new CircuitBreaker(callClaude, {
  timeout: MODEL_POLICY.timeoutMs + 1000,
  errorThresholdPercentage: 50,
  resetTimeout: 30_000,
  // Don't trip on a handful of failures from one long video: require enough
  // calls in the rolling window before judging the error rate.
  volumeThreshold: 10,
});

/**
 * Max Claude calls in flight across all requests. Firing every batch at once
 * hit rate limits on long videos, which tripped the breaker for everyone.
 */
const MAX_CONCURRENT_CALLS = 3;
let active = 0;
const waiting: (() => void)[] = [];
async function limited<T>(fn: () => Promise<T>): Promise<T> {
  if (active >= MAX_CONCURRENT_CALLS)
    await new Promise<void>((resolve) => waiting.push(resolve));
  active++;
  try {
    return await fn();
  } finally {
    active--;
    waiting.shift()?.();
  }
}

export interface ClassifyResult {
  candidates: LlmSegmentCandidate[];
  model: string;
}

type CallFn = (
  model: string,
  cues: LlmChunk[],
) => Promise<LlmSegmentCandidate[]>;

/** Run every batch; tolerate partial failure, throw only if all batches fail. */
async function runBatches(
  call: CallFn,
  model: string,
  batches: LlmChunk[][],
): Promise<LlmSegmentCandidate[]> {
  const settled = await Promise.allSettled(batches.map((b) => call(model, b)));
  const ok = settled.filter(
    (r): r is PromiseFulfilledResult<LlmSegmentCandidate[]> =>
      r.status === "fulfilled",
  );
  if (ok.length === 0 && settled.length > 0) {
    throw (settled[0] as PromiseRejectedResult).reason;
  }
  return ok.flatMap((r) => r.value);
}

/**
 * Haiku primary, Sonnet fallback for ambiguous band (spec §2/§5.4). Every
 * cue is sent (batched, no truncation) and results are validated against the
 * transcript before they can become skippable segments.
 */
export async function classifyChunks(
  chunks: LlmChunk[][],
  call: CallFn = (m, c) =>
    limited(() => breaker.fire(m, c) as Promise<LlmSegmentCandidate[]>),
): Promise<ClassifyResult> {
  const cues = dedupeCues(chunks);
  const batches = batchCues(cues, LLM_BATCH_CUES, LLM_BATCH_OVERLAP_CUES);
  let candidates = await runBatches(call, MODEL_POLICY.primary, batches);
  let model = "claude-haiku";
  const ambiguous = candidates.some(
    (c) =>
      c.confidence >= MODEL_POLICY.reviewBand[0]! &&
      c.confidence < MODEL_POLICY.reviewBand[1]!,
  );
  if (ambiguous) {
    try {
      const second = await runBatches(call, MODEL_POLICY.fallback, batches);
      if (second.length > 0) {
        candidates = second;
        model = "claude-sonnet";
      }
    } catch {
      // keep primary candidates on fallback failure
    }
  }
  return { candidates: validateCandidates(candidates, cues), model };
}

export { breaker as llmBreaker };
