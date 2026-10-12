import type { DbPool as Pool } from "../db/connection";

/** Counters behind the cost guard. Days are UTC `YYYY-MM-DD`. */
export interface UsageStore {
  /** Count one analysis for an install if it is under `limit`; false when at the limit. */
  consumeInstall(
    day: string,
    installKey: string,
    limit: number,
  ): Promise<boolean>;
  getSpend(day: string): Promise<number>;
  addSpend(
    day: string,
    usd: number,
    inputTokens: number,
    outputTokens: number,
  ): Promise<void>;
}

export class MemoryUsageStore implements UsageStore {
  private installs = new Map<string, number>();
  private spend = new Map<string, number>();

  async consumeInstall(
    day: string,
    installKey: string,
    limit: number,
  ): Promise<boolean> {
    const k = `${day}|${installKey}`;
    const used = this.installs.get(k) ?? 0;
    if (used >= limit) return false;
    this.installs.set(k, used + 1);
    // Keep only today's counters.
    for (const key of this.installs.keys())
      if (!key.startsWith(`${day}|`)) this.installs.delete(key);
    return true;
  }

  async getSpend(day: string): Promise<number> {
    return this.spend.get(day) ?? 0;
  }

  async addSpend(day: string, usd: number): Promise<void> {
    this.spend.set(day, (this.spend.get(day) ?? 0) + usd);
  }
}

/** Atomic counters in Postgres (tables from migration 003), shared by every instance. */
export class PostgresUsageStore implements UsageStore {
  constructor(private readonly pool: Pool) {}

  async consumeInstall(
    day: string,
    installKey: string,
    limit: number,
  ): Promise<boolean> {
    if (limit <= 0) return false;
    const { rows } = await this.pool.query(
      `INSERT INTO install_usage_daily (day, install_key, analyses)
       VALUES ($1, $2, 1)
       ON CONFLICT (day, install_key) DO UPDATE
         SET analyses = install_usage_daily.analyses + 1
         WHERE install_usage_daily.analyses < $3
       RETURNING analyses`,
      [day, installKey, limit],
    );
    return rows.length > 0;
  }

  async getSpend(day: string): Promise<number> {
    const { rows } = await this.pool.query<{ usd: string }>(
      "SELECT usd FROM llm_spend_daily WHERE day = $1",
      [day],
    );
    return rows[0] ? Number(rows[0].usd) : 0;
  }

  async addSpend(
    day: string,
    usd: number,
    inputTokens: number,
    outputTokens: number,
  ): Promise<void> {
    await this.pool.query(
      `INSERT INTO llm_spend_daily (day, usd, calls, input_tokens, output_tokens)
       VALUES ($1, $2, 1, $3, $4)
       ON CONFLICT (day) DO UPDATE SET
         usd           = llm_spend_daily.usd + EXCLUDED.usd,
         calls         = llm_spend_daily.calls + 1,
         input_tokens  = llm_spend_daily.input_tokens + EXCLUDED.input_tokens,
         output_tokens = llm_spend_daily.output_tokens + EXCLUDED.output_tokens`,
      [day, usd, inputTokens, outputTokens],
    );
  }
}
