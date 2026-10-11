import { readdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { Pool } from "pg";

/** Arbitrary constant: serializes concurrent migrators (two instances booting). */
const MIGRATION_LOCK_ID = 7_340_201;

export const DEFAULT_MIGRATIONS_DIR = resolve(
  process.env["MIGRATIONS_DIR"] ?? join(process.cwd(), "infra/db/migrations"),
);

/**
 * Apply `NNN_name.sql` files in order, each in its own transaction, recording
 * them in schema_migrations. Already-applied files are skipped. Returns the
 * files applied by this call.
 */
export async function runMigrations(
  pool: Pool,
  dir: string = DEFAULT_MIGRATIONS_DIR,
): Promise<string[]> {
  const files = (await readdir(dir))
    .filter((f) => /^\d+_[\w-]+\.sql$/.test(f))
    .sort();
  const client = await pool.connect();
  const applied: string[] = [];
  try {
    await client.query("SELECT pg_advisory_lock($1)", [MIGRATION_LOCK_ID]);
    await client.query(
      `CREATE TABLE IF NOT EXISTS schema_migrations (
         version    TEXT PRIMARY KEY,
         applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
       )`,
    );
    const done = new Set(
      (
        await client.query<{ version: string }>(
          "SELECT version FROM schema_migrations",
        )
      ).rows.map((r) => r.version),
    );
    for (const file of files) {
      if (done.has(file)) continue;
      const sql = await readFile(join(dir, file), "utf8");
      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query(
          "INSERT INTO schema_migrations (version) VALUES ($1)",
          [file],
        );
        await client.query("COMMIT");
      } catch (err) {
        await client.query("ROLLBACK");
        throw new Error(`migration ${file} failed: ${(err as Error).message}`);
      }
      applied.push(file);
    }
    return applied;
  } finally {
    await client
      .query("SELECT pg_advisory_unlock($1)", [MIGRATION_LOCK_ID])
      .catch(() => undefined);
    client.release();
  }
}
