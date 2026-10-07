import Anthropic from "@anthropic-ai/sdk";
import CircuitBreaker from "opossum";
import type { LlmChunk, LlmSegmentCandidate } from "../../shared/types";
import { SYSTEM_PROMPT, MODEL_POLICY } from "../../shared/constants";

const client = new Anthropic({
  apiKey: process.env["ANTHROPIC_API_KEY"] ?? "missing",
});

async function callClaude(
  model: string,
  chunks: LlmChunk[]
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
        messages: [
          { role: "user", content: JSON.stringify(chunks.slice(0, 400)) },
        ],
      },
      { signal: controller.signal as unknown as AbortSignal }
    );
    const text = msg.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { text: string }).text)
      .join("");
    const parsed = JSON.parse(text) as {
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
});

export interface ClassifyResult {
  candidates: LlmSegmentCandidate[];
  model: string;
}

/** Haiku primary, Sonnet fallback for ambiguous band (spec §2/§5.4). */
export async function classifyChunks(
  chunks: LlmChunk[][],
  call = (m: string, c: LlmChunk[]) => breaker.fire(m, c) as Promise<LlmSegmentCandidate[]>
): Promise<ClassifyResult> {
  const flat = chunks.flat();
  let candidates = await call(MODEL_POLICY.primary, flat);
  const ambiguous = candidates.some(
    (c) =>
      c.confidence >= MODEL_POLICY.reviewBand[0]! &&
      c.confidence < MODEL_POLICY.reviewBand[1]!
  );
  if (ambiguous) {
    try {
      const second = await call(MODEL_POLICY.fallback, flat);
      if (second.length > 0) {
        return { candidates: second, model: "claude-sonnet" };
      }
    } catch {
      // keep primary candidates on fallback failure
    }
  }
  return { candidates, model: "claude-haiku" };
}

export { breaker as llmBreaker };
