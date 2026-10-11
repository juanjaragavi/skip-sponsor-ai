import type { UsageStore } from "../repositories/usage-store";

/**
 * List prices in USD per million tokens, read from
 * https://platform.claude.com/docs/en/about-claude/pricing on 2026-10-11.
 * Matched by model-id prefix. Used only to estimate spend for the budget
 * kill switch; the Anthropic console stays the billing source of truth.
 */
export const LLM_PRICES_PER_MTOK: Record<
  string,
  { input: number; output: number }
> = {
  "claude-haiku-4-5": { input: 1, output: 5 },
  "claude-haiku-5-5": { input: 0.1, output: 0.5 },
  "claude-sonnet-5-5": { input: 2, output: 10 },
};
/** Unknown models are priced high so the budget errs on the safe side. */
const UNKNOWN_MODEL_PRICE = { input: 5, output: 25 };

export function estimateCostUsd(
  model: string,
  inputTokens: number,
  outputTokens: number,
): number {
  const key = Object.keys(LLM_PRICES_PER_MTOK).find((k) => model.startsWith(k));
  const p = key ? LLM_PRICES_PER_MTOK[key]! : UNKNOWN_MODEL_PRICE;
  return (inputTokens * p.input + outputTokens * p.output) / 1_000_000;
}

export type LimitReason =
  /** No AI provider key on this server (ANTHROPIC_API_KEY unset). */
  | "llm_not_configured"
  /** This install used its fresh analyses for today. */
  | "install_quota"
  /** Global LLM spend for today reached LLM_DAILY_BUDGET_USD. */
  | "global_budget"
  /** LLM_DAILY_BUDGET_USD=0: LLM analysis switched off. */
  | "llm_disabled"
  /** Missing or forged install token. */
  | "unauthenticated";

export type Allowance =
  { ok: true } | { ok: false; reason: LimitReason; resetAt: string };

export interface CostGuardOptions {
  /** False when the server has no AI provider key: every fresh analysis is refused. Default true. */
  llmConfigured?: boolean;
  dailyAnalysesPerInstall: number;
  dailyBudgetUsd: number;
  now?: () => Date;
  onBudgetReached?: (spentUsd: number) => void;
}

export const utcDay = (d: Date): string => d.toISOString().slice(0, 10);

/** Next 00:00 UTC, when quotas and the budget reset. */
export function nextUtcMidnight(d: Date): Date {
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1),
  );
}

/**
 * Decides whether a fresh (uncached) LLM analysis may run. Cached results are
 * never metered. The budget is a soft cap: analyses already running when it
 * is reached still finish, so spend can overshoot by the work in flight.
 */
export class CostGuard {
  private readonly now: () => Date;
  private budgetLoggedFor = "";

  constructor(
    private readonly usage: UsageStore,
    private readonly opts: CostGuardOptions,
  ) {
    this.now = opts.now ?? (() => new Date());
  }

  async reserve(installKey: string | null): Promise<Allowance> {
    const now = this.now();
    const resetAt = nextUtcMidnight(now).toISOString();
    // Checked first: without a key no Claude call is attempted (and nothing
    // is metered), instead of failing against Anthropic with a bogus key.
    if (this.opts.llmConfigured === false)
      return { ok: false, reason: "llm_not_configured", resetAt };
    if (this.opts.dailyBudgetUsd <= 0)
      return { ok: false, reason: "llm_disabled", resetAt };
    if (!installKey) return { ok: false, reason: "unauthenticated", resetAt };
    const day = utcDay(now);
    const spent = await this.usage.getSpend(day);
    if (spent >= this.opts.dailyBudgetUsd) {
      if (this.budgetLoggedFor !== day) {
        this.budgetLoggedFor = day;
        this.opts.onBudgetReached?.(spent);
      }
      return { ok: false, reason: "global_budget", resetAt };
    }
    const ok = await this.usage.consumeInstall(
      day,
      installKey,
      this.opts.dailyAnalysesPerInstall,
    );
    return ok ? { ok: true } : { ok: false, reason: "install_quota", resetAt };
  }

  async recordUsage(
    model: string,
    inputTokens: number,
    outputTokens: number,
  ): Promise<void> {
    await this.usage.addSpend(
      utcDay(this.now()),
      estimateCostUsd(model, inputTokens, outputTokens),
      inputTokens,
      outputTokens,
    );
  }
}
