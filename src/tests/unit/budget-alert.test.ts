import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { CostGuard } from "../../api/services/cost-guard";
import { MemoryUsageStore } from "../../api/repositories/usage-store";
import { buildServer } from "../../api/server";
import { memoryPersistence } from "../../api/persistence";
import { config } from "../../api/config";

vi.mock("../../api/services/llm-client", () => ({
  classifyChunks: vi.fn(async () => ({
    candidates: [],
    model: "claude-haiku",
  })),
  setLlmUsageListener: vi.fn(),
}));

const day = new Date("2026-11-21T15:00:00Z");

function guard(budget: number, onWarn = vi.fn(), onReached = vi.fn()) {
  const usage = new MemoryUsageStore();
  const g = new CostGuard(usage, {
    dailyAnalysesPerInstall: 1000,
    dailyBudgetUsd: budget,
    now: () => day,
    onBudgetWarning: onWarn,
    onBudgetReached: onReached,
  });
  return { g, usage, onWarn, onReached };
}

describe("S-P1-2: LLM budget warning at 80 %", () => {
  it("fires once per UTC day when spend reaches 80 % of the budget", async () => {
    const { g, onWarn } = guard(10);
    // Haiku 4.5: 1 $/MTok input -> 1,000,000 input tokens = $1.
    for (let i = 0; i < 7; i++) await g.recordUsage("claude-haiku-4-5", 1e6, 0);
    expect(onWarn).not.toHaveBeenCalled();
    expect((await g.status()).state).toBe("ok");
    await g.recordUsage("claude-haiku-4-5", 1e6, 0); // $8 = 80 %
    expect(onWarn).toHaveBeenCalledTimes(1);
    expect(onWarn).toHaveBeenCalledWith(8, 10);
    await g.recordUsage("claude-haiku-4-5", 1e6, 0);
    await g.reserve("i:abc");
    expect(onWarn).toHaveBeenCalledTimes(1);
    expect(await g.status()).toMatchObject({
      day: "2026-11-21",
      spentUsd: 9,
      budgetUsd: 10,
      usedRatio: 0.9,
      warnRatio: 0.8,
      state: "warning",
      resetAt: "2026-11-22T00:00:00.000Z",
    });
  });

  it("reports exhausted at the budget and disabled at budget 0", async () => {
    const { g, onReached } = guard(0.01);
    await g.recordUsage("claude-haiku-4-5", 20_000, 0); // $0.02
    expect((await g.status()).state).toBe("exhausted");
    expect(await g.reserve("i:abc")).toMatchObject({
      ok: false,
      reason: "global_budget",
    });
    expect(onReached).toHaveBeenCalledTimes(1);
    expect((await guard(0).g.status()).state).toBe("disabled");
  });
});

describe("GET /v1/usage/budget (operator only)", () => {
  const ADMIN = "a".repeat(40);
  const app = (adminToken: string) =>
    buildServer({
      persistence: memoryPersistence(),
      installTokenSecret: "k".repeat(48),
      llmDailyBudgetUsd: 5,
      adminToken,
    });

  it("is 404 without ADMIN_API_TOKEN, 401 without the header, 200 with it", async () => {
    const off = app("");
    expect(
      (await off.inject({ method: "GET", url: "/v1/usage/budget" })).statusCode,
    ).toBe(404);
    await off.close();
    const on = app(ADMIN);
    const denied = await on.inject({ method: "GET", url: "/v1/usage/budget" });
    expect(denied.statusCode).toBe(401);
    expect(denied.json().type).not.toMatch(/example\.com/);
    const ok = await on.inject({
      method: "GET",
      url: "/v1/usage/budget",
      headers: { "x-admin-token": ADMIN },
    });
    expect(ok.statusCode).toBe(200);
    expect(ok.headers["cache-control"]).toBe("no-store");
    expect(ok.json()).toMatchObject({
      spentUsd: 0,
      budgetUsd: 5,
      usedRatio: 0,
      state: "ok",
    });
    await on.close();
  });
});

describe("S-P2-2 / S-P2-3: problem types and version label", () => {
  it("no API source points problem types at a placeholder host", () => {
    for (const f of [
      "src/api/server.ts",
      "src/api/routes/segments.ts",
      "src/api/routes/usage.ts",
      "src/api/routes/budget.ts",
    ])
      expect(readFileSync(f, "utf8")).not.toMatch(/\.example\.com/);
  });

  it("/healthz reports the package version", async () => {
    const pkg = JSON.parse(readFileSync("package.json", "utf8")) as {
      version: string;
    };
    expect(config.version).toBe(pkg.version);
    const a = buildServer({ persistence: memoryPersistence() });
    expect(
      (await a.inject({ method: "GET", url: "/healthz" })).json().version,
    ).toBe(pkg.version);
    await a.close();
  });
});
