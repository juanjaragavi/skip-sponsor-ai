import Anthropic from "@anthropic-ai/sdk";
import CircuitBreaker from "opossum";
import { randomUUID } from "node:crypto";
import { config } from "../config";
import {
  RETRYABLE_STATUS,
  parseRetryAfter,
  retryAsync,
  type FailureKind,
} from "../lib/retry";
import {
  CORRELATION_HEADER,
  currentCorrelationId,
} from "../observability/correlation";
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
  // Retries follow the platform policy (retryAsync below), not the SDK's.
  maxRetries: 0,
});

/** Statuses the platform retry policy retries; anything else is final. */
export function classifyLlmError(err: unknown): FailureKind {
  if (err instanceof Anthropic.APIUserAbortError) return "retry";
  if (err instanceof Anthropic.APIConnectionError) return "retry";
  const status = (err as { status?: unknown } | null)?.status;
  return typeof status === "number" && RETRYABLE_STATUS.has(status)
    ? "retry"
    : "fatal";
}

function llmRetryAfterMs(err: unknown): number | null {
  const headers = (err as { headers?: Record<string, string> | Headers })
    ?.headers;
  const value =
    headers instanceof Headers
      ? headers.get("retry-after")
      : headers?.["retry-after"];
  return parseRetryAfter(value, Date.now());
}

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

/**
 * Newer Claude models reject `temperature` (400 "`temperature` is deprecated
 * for this model"). Live probe 2026-10-13: Claude 5.x and Opus 4.7/4.8 reject
 * it; 4.6 and older accept it. Before this check the Sonnet re-ask always
 * failed and the Haiku answer was kept silently.
 *
 * Allowlist, not denylist: only ids known to be Claude 4.6 or older get
 * temperature 0. Unknown ids get no sampling params, because a missing
 * temperature only costs determinism while a rejected one fails the call.
 */
export function acceptsTemperature(model: string): boolean {
  // claude-3-5-sonnet-20241022, claude-3-haiku-20240307, claude-2.1, …
  if (/^claude-(?:[0-3](?:[-.]\d)?-[a-z]|[0-2](?:\.\d)?$|instant)/.test(model))
    return true;
  // claude-<family>-<major>[-<minor>][-<yyyymmdd>|@<date>|-latest]
  const m = /^claude-(?:haiku|sonnet|opus)-(\d+)(?:-(\d+))?(?=$|[-@])/.exec(
    model,
  );
  if (!m) return false;
  const major = Number(m[1]);
  // A long second number is a snapshot date (claude-sonnet-4-20250514), not a minor.
  const minor = m[2] && m[2].length <= 2 ? Number(m[2]) : 0;
  return major < 4 || (major === 4 && minor <= 6);
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

/**
 * One classification with the platform retry policy. The LLM call sets its
 * own deadline (MODEL_POLICY.timeoutMs for all attempts together, inside the
 * circuit breaker's timeout) and sends one Idempotency-Key for every attempt,
 * so a retried request is the same logical call. Usage is recorded from the
 * answer that succeeds, so the daily budget still applies.
 */
async function callClaude(
  model: string,
  chunks: LlmChunk[],
): Promise<LlmSegmentCandidate[]> {
  const idempotencyKey = randomUUID();
  const correlationId = currentCorrelationId();
  const headers: Record<string, string> = { "Idempotency-Key": idempotencyKey };
  if (correlationId) headers[CORRELATION_HEADER] = correlationId;
  const msg = await retryAsync(
    async (_attempt, remainingMs) => {
      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), remainingMs);
      try {
        return await client.messages.create(
          {
            model,
            max_tokens: MODEL_POLICY.maxTokens,
            ...(acceptsTemperature(model) ? { temperature: 0 } : {}),
            system: SYSTEM_PROMPT,
            messages: [{ role: "user", content: formatCues(chunks) }],
          },
          { signal: controller.signal as unknown as AbortSignal, headers },
        );
      } finally {
        clearTimeout(t);
      }
    },
    classifyLlmError,
    {
      policy: { deadlineMs: MODEL_POLICY.timeoutMs },
      retryAfterMs: llmRetryAfterMs,
    },
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

export type CallFn = (
  model: string,
  cues: LlmChunk[],
) => Promise<LlmSegmentCandidate[]>;

/** The production call: concurrency limit → circuit breaker → retried Claude request. */
export const liveCall: CallFn = (m, c) =>
  limited(() => breaker.fire(m, c) as Promise<LlmSegmentCandidate[]>);

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
  call: CallFn = liveCall,
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
