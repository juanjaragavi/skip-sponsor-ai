#!/usr/bin/env node
/**
 * Stages a minimal, self-contained build context for the API image, with the
 * Dockerfile at its root, for hosts that build "the directory's Dockerfile"
 * (InstaCloud `insta deploy <dir>`, Oracle VM `docker build <dir>`).
 *
 *   node scripts/stage-api-context.mjs [outDir]   # default: dist/deploy-api
 *
 * Only what the image needs is copied: no .env files, no extension sources'
 * build output, no store assets. infra/Dockerfile.api stays the single source.
 */
import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const out = resolve(root, process.argv[2] ?? "dist/deploy-api");

const files = [
  ["infra/Dockerfile.api", "Dockerfile"],
  [".dockerignore", ".dockerignore"],
  ["package.json", "package.json"],
  ["package-lock.json", "package-lock.json"],
  ["tsconfig.json", "tsconfig.json"],
  ["tsconfig.api.json", "tsconfig.api.json"],
  ["scripts/build-api.mjs", "scripts/build-api.mjs"],
  ["src/api", "src/api"],
  ["src/shared", "src/shared"],
  ["src/types", "src/types"],
  ["infra/db/migrations", "infra/db/migrations"],
  ["infra/start.sh", "infra/start.sh"],
];

rmSync(out, { recursive: true, force: true });
for (const [from, to] of files) {
  const src = join(root, from);
  if (!existsSync(src)) throw new Error(`missing ${from}`);
  mkdirSync(dirname(join(out, to)), { recursive: true });
  cpSync(src, join(out, to), { recursive: true });
}
console.log(`✓ API build context staged at ${out}`);
