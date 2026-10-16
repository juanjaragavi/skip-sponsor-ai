/**
 * Writes PRIVACY.md, TERMS.md and site/ from legal/*.template.md
 * (src/shared/legal/render-legal.ts). `--check` exits 1 when a committed file
 * differs from a fresh build.
 *
 *   npm run legal:build
 *   npm run legal:check
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { buildLegalOutputs } from "../src/shared/legal/render-legal";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p: string) => readFileSync(join(root, p), "utf8");
const outputs = buildLegalOutputs({
  privacy: read("legal/PRIVACY.template.md"),
  terms: read("legal/TERMS.template.md"),
});
const check = process.argv.includes("--check");
let drift = 0;
for (const [path, content] of Object.entries(outputs)) {
  const abs = join(root, path);
  const current = existsSync(abs) ? readFileSync(abs, "utf8") : null;
  if (current === content) continue;
  if (check) {
    console.error(`stale: ${path}`);
    drift++;
    continue;
  }
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, content);
  console.log(`wrote ${path}`);
}
if (check) console.log(`legal drift: ${String(drift)}`);
process.exit(drift > 0 ? 1 : 0);
