/**
 * `GET /api/health` (portfolio platform standard): one JSON shape across the
 * portfolio for the monitor. 200 when ok or degraded, 503 when down. No
 * secrets and no internal hostnames.
 *
 * - down: the store of record (Postgres, or memory) does not answer.
 * - degraded: the optional cache is down, or no AI provider key is set
 *   (fresh analyses are refused; cached and community results still serve).
 */
export type CheckState = "ok" | "down";
export type HealthStatus = "ok" | "degraded" | "down";

export interface HealthBody {
  status: HealthStatus;
  service: string;
  version: string;
  commit: string;
  checks: Record<string, CheckState>;
  time: string;
}

export interface HealthInputs {
  service: string;
  version: string;
  commit: string;
  database: boolean;
  /** "disabled" leaves the cache out of the checks. */
  redis: "ok" | "down" | "disabled";
  llmConfigured: boolean;
  now?: Date;
}

export function buildHealth(input: HealthInputs): {
  code: 200 | 503;
  body: HealthBody;
} {
  const checks: Record<string, CheckState> = {
    database: input.database ? "ok" : "down",
    llm: input.llmConfigured ? "ok" : "down",
  };
  if (input.redis !== "disabled") checks["cache"] = input.redis;
  const status: HealthStatus = !input.database
    ? "down"
    : Object.values(checks).every((c) => c === "ok")
      ? "ok"
      : "degraded";
  return {
    code: status === "down" ? 503 : 200,
    body: {
      status,
      service: input.service,
      version: input.version,
      commit: input.commit,
      checks,
      time: (input.now ?? new Date()).toISOString(),
    },
  };
}
