#!/usr/bin/env node
/**
 * Bundles the API for production: dist/api/server.mjs and dist/api/migrate.mjs.
 *
 * `tsc` output cannot run under Node ESM ("type": "module"): the sources use
 * extensionless relative imports (moduleResolution "bundler"). esbuild
 * resolves them at build time; npm dependencies stay external and come from
 * `npm ci --omit=dev` in the image. Type checking stays in `npm run typecheck`.
 */
import { build } from "esbuild";
import { rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outdir = resolve(root, "dist/api");
rmSync(outdir, { recursive: true, force: true });

await build({
  absWorkingDir: root,
  entryPoints: {
    server: "src/api/server.ts",
    migrate: "src/api/db/migrate-cli.ts",
  },
  outdir,
  outExtension: { ".js": ".mjs" },
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  packages: "external",
  sourcemap: true,
  logLevel: "info",
});
