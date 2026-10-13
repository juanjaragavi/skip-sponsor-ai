import { describe, it, expect } from "vitest";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Pool } from "pg";
import { runMigrations } from "../../api/db/migrate";
import { createPersistence } from "../../api/persistence";
import { checkProductionConfig, config } from "../../api/config";

/** A pg Pool whose single client records SQL and fails on demand. */
function fakePool(applied: string[], failOn?: string) {
  const sql: string[] = [];
  let released = false;
  const client = {
    query: async (text: string) => {
      sql.push(text.trim().split(/\s+/).slice(0, 4).join(" "));
      if (failOn && text.includes(failOn)) throw new Error("boom");
      if (text.startsWith("SELECT version FROM schema_migrations"))
        return { rows: applied.map((version) => ({ version })) };
      return { rows: [] };
    },
    release: () => (released = true),
  };
  return {
    pool: { connect: async () => client } as unknown as Pool,
    sql,
    released: () => released,
  };
}

async function migrationsDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "ss-mig-"));
  await writeFile(join(dir, "002_b.sql"), "SELECT 'two';");
  await writeFile(join(dir, "001_a.sql"), "SELECT 'one';");
  await writeFile(join(dir, "README.md"), "not a migration");
  return dir;
}

describe("runMigrations", () => {
  it("applies pending files in order inside transactions, under a lock", async () => {
    const dir = await migrationsDir();
    const f = fakePool(["001_a.sql"]);
    expect(await runMigrations(f.pool, dir)).toEqual(["002_b.sql"]);
    expect(f.sql[0]).toMatch(/pg_advisory_lock/);
    expect(f.sql).toContain("BEGIN");
    expect(f.sql).toContain("COMMIT");
    expect(f.sql.at(-1)).toMatch(/pg_advisory_unlock/);
    expect(f.released()).toBe(true);
  });

  it("rolls back and reports the failing file", async () => {
    const dir = await migrationsDir();
    const f = fakePool([], "'two'");
    await expect(runMigrations(f.pool, dir)).rejects.toThrow(
      /migration 002_b.sql failed: boom/,
    );
    expect(f.sql).toContain("ROLLBACK");
    expect(f.released()).toBe(true);
  });
});

describe("createPersistence", () => {
  const log = { warn: () => undefined, debug: () => undefined } as never;
  const base = {
    databaseUrl: "postgres://u:p@127.0.0.1:1/db",
    redisUrl: "",
    pgPoolMax: 1,
    cacheTtlSeconds: 60,
  };

  it("uses memory unless Postgres is selected", () => {
    expect(
      createPersistence({ ...base, persistence: "memory" }, log).mode,
    ).toBe("memory");
  });

  it("requires DATABASE_URL for Postgres", () => {
    expect(() =>
      createPersistence(
        { ...base, persistence: "postgres", databaseUrl: "" },
        log,
      ),
    ).toThrow(/DATABASE_URL/);
  });

  it("reports not-ready when Postgres is unreachable, with or without Redis", async () => {
    for (const redisUrl of ["", "redis://127.0.0.1:1"]) {
      const p = createPersistence(
        { ...base, persistence: "postgres", redisUrl },
        log,
      );
      expect(p.mode).toBe("postgres");
      expect(await p.ping()).toBe(false);
      expect(await p.redisStatus()).toBe(redisUrl ? "down" : "disabled");
      await p.close();
    }
  });
});

describe("checkProductionConfig", () => {
  const prod = {
    ...config,
    isProduction: true,
    installTokenSecret: "x".repeat(48),
    persistence: "postgres" as const,
    persistenceExplicit: false,
    anthropicKey: "set",
    corsOrigin: "chrome-extension://abc",
    trustProxy: true,
  };

  it("accepts a complete production config", () => {
    expect(checkProductionConfig(prod)).toEqual({ errors: [], warnings: [] });
  });

  it("ignores development", () => {
    expect(
      checkProductionConfig({
        ...prod,
        isProduction: false,
        installTokenSecret: "",
      }).errors,
    ).toEqual([]);
  });

  it("refuses a short token secret and implicit in-memory persistence", () => {
    const { errors } = checkProductionConfig({
      ...prod,
      installTokenSecret: "short",
      persistence: "memory",
    });
    expect(errors).toHaveLength(2);
    expect(
      checkProductionConfig({
        ...prod,
        persistence: "memory",
        persistenceExplicit: true,
      }).errors,
    ).toEqual([]);
  });

  it("warns about missing key, CORS pin and proxy trust", () => {
    const { warnings } = checkProductionConfig({
      ...prod,
      anthropicKey: "",
      corsOrigin: "",
      trustProxy: false,
    });
    expect(warnings).toHaveLength(3);
  });
});

describe("health endpoints", () => {
  it("serves liveness and readiness from the configured store", async () => {
    const { buildServer, persistenceFor } = await import("../../api/server");
    const app = buildServer();
    expect(persistenceFor(app).mode).toBe("memory");
    expect(() => persistenceFor({})).toThrow();
    expect(
      (await app.inject({ method: "GET", url: "/healthz" })).json(),
    ).toEqual({
      ok: true,
      version: "1.0.0",
      commit: config.commit,
    });
    expect(
      (await app.inject({ method: "GET", url: "/readyz" })).json(),
    ).toEqual({
      ok: true,
      persistence: "memory",
      redis: "disabled",
      ai: "configured",
      sponsorblock: "off",
    });
    await app.close();
  });
});
