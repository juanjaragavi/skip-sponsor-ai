import { describe, expect, it } from "vitest";
import type { Pool } from "pg";
import {
  MemoryUsageStatsStore,
  PostgresUsageStatsStore,
  daysBefore,
} from "../../api/repositories/usage-stats";
import { InstallTokens } from "../../api/services/install-token";

describe("daysBefore", () => {
  it("counts back in UTC days across month ends", () => {
    expect(daysBefore("2026-11-02", 3)).toBe("2026-10-30");
    expect(daysBefore("2026-10-17", 0)).toBe("2026-10-17");
  });
});

describe("MemoryUsageStatsStore.summary", () => {
  it("counts installs, uninstalls and distinct active ids per window", async () => {
    const s = new MemoryUsageStatsStore();
    await s.record("2026-10-01", "u:a", "install", "1.1.0");
    await s.record("2026-10-15", "u:b", "install", "1.1.0");
    await s.record("2026-10-16", "u:b", "uninstall", "1.1.0");
    await s.record("2026-10-17", "u:a", "active", "1.1.0");
    await s.record("2026-10-12", "u:c", "active", "1.0.0");
    await s.record("2026-10-12", "u:a", "active", "1.0.0");
    await s.record("2026-10-01", "u:d", "active", "1.0.0");
    await s.record("2026-10-18", "u:e", "active", "1.1.0"); // after asOf
    const sum = await s.summary("2026-10-17");
    expect(sum.installs).toEqual({ last7: 1, last28: 2, total: 2 });
    expect(sum.uninstalls).toEqual({ last7: 1, last28: 1, total: 1 });
    expect(sum.dailyActive).toBe(1);
    expect(sum.weeklyActive).toBe(2);
    expect(sum.monthlyActive).toBe(3);
    // latest version each weekly-active id reported
    expect(sum.weeklyActiveByVersion).toEqual({ "1.1.0": 1, "1.0.0": 1 });
  });

  it("ignores a repeated (day, key, event)", async () => {
    const s = new MemoryUsageStatsStore();
    await s.record("2026-10-17", "u:a", "active", "1.1.0");
    await s.record("2026-10-17", "u:a", "active", "1.1.0");
    expect(s.rows).toHaveLength(1);
  });
});

describe("PostgresUsageStatsStore (SQL mapping)", () => {
  function fakePool(respond: (sql: string) => { rows: unknown[] }) {
    const calls: { sql: string; params: unknown[] }[] = [];
    const pool = {
      query: async (sql: string, params: unknown[] = []) => {
        calls.push({ sql, params });
        return respond(sql);
      },
    };
    return { pool: pool as unknown as Pool, calls };
  }

  it("inserts idempotently with parameters only", async () => {
    const { pool, calls } = fakePool(() => ({ rows: [] }));
    await new PostgresUsageStatsStore(pool).record(
      "2026-10-17",
      "u:abc",
      "install",
      "1.1.0",
    );
    expect(calls[0]!.sql).toContain("INSERT INTO usage_pings");
    expect(calls[0]!.sql).toContain(
      "ON CONFLICT (day, usage_key, event) DO NOTHING",
    );
    expect(calls[0]!.params).toEqual([
      "2026-10-17",
      "u:abc",
      "install",
      "1.1.0",
    ]);
  });

  it("maps the aggregate rows to a summary", async () => {
    const { pool, calls } = fakePool((sql) =>
      sql.includes("DISTINCT ON")
        ? { rows: [{ version: "1.1.0", n: "4" }] }
        : {
            rows: [
              {
                installs7: "2",
                installs28: "5",
                installs_total: "9",
                uninstalls7: "1",
                uninstalls28: "1",
                uninstalls_total: "3",
                dau: "3",
                wau: "4",
                mau: "7",
              },
            ],
          },
    );
    const sum = await new PostgresUsageStatsStore(pool).summary("2026-10-17");
    expect(sum).toEqual({
      asOf: "2026-10-17",
      installs: { last7: 2, last28: 5, total: 9 },
      uninstalls: { last7: 1, last28: 1, total: 3 },
      dailyActive: 3,
      weeklyActive: 4,
      monthlyActive: 7,
      weeklyActiveByVersion: { "1.1.0": 4 },
    });
    expect(calls.every((c) => c.params[0] === "2026-10-17")).toBe(true);
  });

  it("reads zeros from an empty table", async () => {
    const { pool } = fakePool(() => ({ rows: [] }));
    const sum = await new PostgresUsageStatsStore(pool).summary("2026-10-17");
    expect(sum.weeklyActive).toBe(0);
    expect(sum.installs.total).toBe(0);
    expect(sum.weeklyActiveByVersion).toEqual({});
  });
});

describe("InstallTokens.usageKey", () => {
  const id = "2f1c6a8e-4b3d-4e5f-9a7b-1c2d3e4f5a6b";

  it("is a stable keyed hash that never contains the id", () => {
    const t = new InstallTokens("k".repeat(40));
    expect(t.usageKey(id)).toBe(t.usageKey(id));
    expect(t.usageKey(id)).toMatch(/^u:[A-Za-z0-9_-]{32}$/);
    expect(t.usageKey(id)).not.toContain(id.slice(0, 8));
  });

  it("depends on the server secret", () => {
    expect(new InstallTokens("k".repeat(40)).usageKey(id)).not.toBe(
      new InstallTokens("j".repeat(40)).usageKey(id),
    );
  });

  it("hashes without a secret in local development", () => {
    expect(new InstallTokens("").usageKey(id)).toMatch(/^u:[0-9a-f]{32}$/);
  });
});
