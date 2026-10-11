/**
 * `npm run db:migrate` (dev) / `node dist/api/migrate.mjs` (container).
 * Applies infra/db/migrations/*.sql to DATABASE_URL.
 */
import pg from "pg";
import { runMigrations } from "./migrate";

const url = process.env["DATABASE_URL"];
if (!url) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}
const pool = new pg.Pool({ connectionString: url, max: 1 });
try {
  const applied = await runMigrations(pool);
  console.log(
    applied.length
      ? `Applied: ${applied.join(", ")}`
      : "Database schema is up to date.",
  );
} catch (err) {
  console.error((err as Error).message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
