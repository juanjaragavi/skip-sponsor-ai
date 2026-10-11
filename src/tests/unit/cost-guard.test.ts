import { describe, it, expect } from "vitest";
import {
  CostGuard,
  estimateCostUsd,
  nextUtcMidnight,
  utcDay,
} from "../../api/services/cost-guard";
import {
  InstallTokens,
  bearerToken,
  ipQuotaKey,
} from "../../api/services/install-token";
import {
  MemoryUsageStore,
  PostgresUsageStore,
} from "../../api/repositories/usage-store";
import type { Pool } from "pg";

const SECRET = "s".repeat(48);

describe("InstallTokens", () => {
  it("issues signed tokens that verify to a stable, non-reversible key", () => {
    const t = new InstallTokens(SECRET);
    const token = t.issue();
    expect(token).toMatch(/^v1\.[A-Za-z0-9_-]{32}\.[A-Za-z0-9_-]+$/);
    const key = t.quotaKey(token);
    expect(key).toMatch(/^i:[A-Za-z0-9_-]{32}$/);
    expect(t.quotaKey(token)).toBe(key);
    expect(key).not.toContain(token.split(".")[1]);
  });

  it("rejects forged, malformed, and foreign-secret tokens", () => {
    const t = new InstallTokens(SECRET);
    const token = t.issue();
    const [v, id] = token.split(".");
    expect(t.quotaKey(`${v}.${id}.forged`)).toBeNull();
    expect(t.quotaKey(`v2.${id}.${token.split(".")[2]}`)).toBeNull();
    expect(t.quotaKey("v1.short.sig")).toBeNull();
    expect(t.quotaKey(undefined)).toBeNull();
    expect(t.quotaKey("x".repeat(300))).toBeNull();
    expect(new InstallTokens("o".repeat(48)).quotaKey(token)).toBeNull();
  });

  it("accepts opaque legacy tokens only when no secret is configured", () => {
    const dev = new InstallTokens("");
    expect(dev.signing).toBe(false);
    const legacy = crypto.randomUUID() + crypto.randomUUID();
    expect(dev.quotaKey(legacy)).toMatch(/^t:/);
    expect(dev.quotaKey("short")).toBeNull();
    expect(dev.quotaKey(dev.issue())).toMatch(/^t:/);
    expect(new InstallTokens(SECRET).quotaKey(legacy)).toBeNull();
  });

  it("parses bearer headers and hashes IPs", () => {
    expect(bearerToken("Bearer abc.def")).toBe("abc.def");
    expect(bearerToken("bearer   xyz")).toBe("xyz");
    expect(bearerToken("Basic abc")).toBeUndefined();
    expect(bearerToken(undefined)).toBeUndefined();
    expect(ipQuotaKey("1.2.3.4")).toMatch(/^ip:[0-9a-f]{32}$/);
    expect(ipQuotaKey("1.2.3.4")).not.toContain("1.2.3.4");
  });
});

describe("estimateCostUsd", () => {
  it("prices known models from the list price table", () => {
    // Haiku 4.5: $1 in / $5 out per MTok.
    expect(estimateCostUsd("claude-haiku-4-5-20251001", 1_000_000, 0)).toBe(1);
    expect(estimateCostUsd("claude-haiku-4-5-20251001", 5000, 200)).toBeCloseTo(
      0.006,
      6,
    );
    expect(estimateCostUsd("claude-sonnet-5-5", 0, 1_000_000)).toBe(10);
    expect(estimateCostUsd("claude-haiku-5-5", 1_000_000, 1_000_000)).toBe(0.6);
  });

  it("prices unknown models high", () => {
    expect(estimateCostUsd("some-new-model", 1_000_000, 0)).toBe(5);
  });
});

describe("CostGuard", () => {
  const at = new Date("2026-10-11T15:30:00Z");
  const mk = (
    opts: Partial<ConstructorParameters<typeof CostGuard>[1]> = {},
  ) => {
    const usage = new MemoryUsageStore();
    const guard = new CostGuard(usage, {
      dailyAnalysesPerInstall: 2,
      dailyBudgetUsd: 1,
      now: () => at,
      ...opts,
    });
    return { usage, guard };
  };

  it("allows up to the per-install quota, then refuses until 00:00 UTC", async () => {
    const { guard } = mk();
    expect(await guard.reserve("i:a")).toEqual({ ok: true });
    expect(await guard.reserve("i:a")).toEqual({ ok: true });
    expect(await guard.reserve("i:a")).toEqual({
      ok: false,
      reason: "install_quota",
      resetAt: "2026-10-12T00:00:00.000Z",
    });
    expect(await guard.reserve("i:b")).toEqual({ ok: true });
  });

  it("stops every install once the daily budget is spent, and reports it once", async () => {
    const reached: number[] = [];
    const { guard } = mk({ onBudgetReached: (s) => reached.push(s) });
    // 1,000,000 Haiku 4.5 input tokens = $1 = the whole budget.
    await guard.recordUsage("claude-haiku-4-5-20251001", 1_000_000, 0);
    const refused = await guard.reserve("i:new");
    expect(refused).toMatchObject({ ok: false, reason: "global_budget" });
    await guard.reserve("i:other");
    expect(reached).toEqual([1]);
  });

  it("treats a zero budget as the LLM kill switch", async () => {
    const { guard } = mk({ dailyBudgetUsd: 0 });
    expect(await guard.reserve("i:a")).toMatchObject({
      reason: "llm_disabled",
    });
  });

  it("refuses requests without a valid install", async () => {
    const { guard } = mk();
    expect(await guard.reserve(null)).toMatchObject({
      reason: "unauthenticated",
    });
  });

  it("computes UTC days and resets", () => {
    expect(utcDay(at)).toBe("2026-10-11");
    expect(
      nextUtcMidnight(new Date("2026-12-31T23:59:59Z")).toISOString(),
    ).toBe("2027-01-01T00:00:00.000Z");
  });
});

describe("MemoryUsageStore", () => {
  it("starts a fresh count each day", async () => {
    const s = new MemoryUsageStore();
    expect(await s.consumeInstall("2026-10-11", "k", 1)).toBe(true);
    expect(await s.consumeInstall("2026-10-11", "k", 1)).toBe(false);
    expect(await s.consumeInstall("2026-10-12", "k", 1)).toBe(true);
    await s.addSpend("2026-10-12", 0.25);
    await s.addSpend("2026-10-12", 0.25);
    expect(await s.getSpend("2026-10-12")).toBe(0.5);
    expect(await s.getSpend("2026-10-11")).toBe(0);
  });
});

describe("PostgresUsageStore (SQL mapping)", () => {
  function pool(rows: unknown[]) {
    const calls: { sql: string; params: unknown[] }[] = [];
    return {
      calls,
      pool: {
        query: async (sql: string, params: unknown[]) => {
          calls.push({ sql, params });
          return { rows };
        },
      } as unknown as Pool,
    };
  }

  it("counts atomically and refuses at the limit", async () => {
    const ok = pool([{ analyses: 1 }]);
    expect(
      await new PostgresUsageStore(ok.pool).consumeInstall(
        "2026-10-11",
        "k",
        5,
      ),
    ).toBe(true);
    expect(ok.calls[0]!.sql).toMatch(
      /WHERE install_usage_daily.analyses < \$3/,
    );
    expect(ok.calls[0]!.params).toEqual(["2026-10-11", "k", 5]);
    const full = pool([]);
    expect(
      await new PostgresUsageStore(full.pool).consumeInstall(
        "2026-10-11",
        "k",
        5,
      ),
    ).toBe(false);
    const zero = pool([{ analyses: 1 }]);
    expect(
      await new PostgresUsageStore(zero.pool).consumeInstall(
        "2026-10-11",
        "k",
        0,
      ),
    ).toBe(false);
    expect(zero.calls).toHaveLength(0);
  });

  it("reads and accumulates spend", async () => {
    expect(
      await new PostgresUsageStore(pool([{ usd: "0.123400" }]).pool).getSpend(
        "d",
      ),
    ).toBeCloseTo(0.1234, 6);
    expect(await new PostgresUsageStore(pool([]).pool).getSpend("d")).toBe(0);
    const p = pool([]);
    await new PostgresUsageStore(p.pool).addSpend("d", 0.01, 100, 20);
    expect(p.calls[0]!.params).toEqual(["d", 0.01, 100, 20]);
  });
});
