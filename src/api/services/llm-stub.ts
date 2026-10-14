import type { LlmChunk, LlmSegmentCandidate } from "../../shared/types";

/**
 * Deterministic stand-in for Claude on the local stack (`npm run local`,
 * LLM_STUB=1 on a loopback-bound API; see config.llmStubActive). It marks
 * cues that read like a sponsor message, so the whole analyze -> validate ->
 * store -> skip flow runs offline with no key and no spend. Its output goes
 * through the same validateCandidates() as a real answer.
 *
 * It is a fixture tool, not a detector: precision claims never come from it.
 */

const SPONSOR_CUE =
  /\b(sponsor(?:ed)?|brought to you by|thanks to|use (?:my )?code|promo code|discount code|link in the description|patrocinad[oa]|patrocinador)\b/i;
const ADVERTISER =
  /\b(?:sponsored by|brought to you by|thanks to|sponsor(?: of (?:this|today's) video)? is|patrocinado por)\s+([A-Z][\w&.-]*(?:\s+[A-Z][\w&.-]*)?)/;
/** Two promo cues closer than this belong to one read. */
const MAX_GAP_SECONDS = 20;

export const LLM_STUB_RATIONALE = "local stub: keyword match (no model call)";

export function stubClassify(cues: readonly LlmChunk[]): LlmSegmentCandidate[] {
  const sorted = [...cues].sort((a, b) => a.t0 - b.t0);
  const hits = sorted.filter((c) => SPONSOR_CUE.test(c.text));
  const runs: LlmChunk[][] = [];
  for (const cue of hits) {
    const run = runs[runs.length - 1];
    const last = run?.[run.length - 1];
    if (run && last && cue.t0 - last.t1 <= MAX_GAP_SECONDS) run.push(cue);
    else runs.push([cue]);
  }
  return runs.map((run) => {
    const first = run[0]!;
    const last = run[run.length - 1]!;
    const named = run.map((c) => ADVERTISER.exec(c.text)?.[1]).find(Boolean);
    return {
      start: first.t0,
      end: last.t1,
      category: "sponsor",
      confidence: 0.9,
      advertiser: named ?? "Unnamed sponsor",
      relationship: "third_party_sponsor",
      breaksFromContent: true,
      evidence: first.text,
      rationale: LLM_STUB_RATIONALE,
    };
  });
}
