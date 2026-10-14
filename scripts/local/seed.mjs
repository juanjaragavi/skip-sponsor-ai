#!/usr/bin/env node
/**
 * Synthetic seed for the local stack (local-first standard LF-1/LF-4): analyzes
 * the synthetic sponsor transcript (src/tests/local-smoke/fixtures/) through the
 * running LOCAL API, so the cache holds one ready analysis. With the LLM stub
 * this costs nothing and needs no network. Idempotent (a ready result is
 * served from the cache on the next run).
 *
 *   node scripts/local/seed.mjs [http://127.0.0.1:3040]
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const api = process.argv[2] ?? "http://127.0.0.1:3040";
const host = new URL(api).hostname;
if (!["127.0.0.1", "localhost", "::1", "[::1]"].includes(host)) {
  process.stderr.write("[local-seed] refusing: the API URL is not loopback\n");
  process.exit(1);
}
const fixture = JSON.parse(
  readFileSync(
    resolve(root, "src/tests/local-smoke/fixtures/sponsor-transcript.json"),
    "utf8",
  ),
);
const install = await fetch(`${api}/v1/installs`, { method: "POST" });
if (install.status !== 201) {
  process.stderr.write(
    `[local-seed] POST /v1/installs answered ${install.status}\n`,
  );
  process.exit(1);
}
const { installToken } = await install.json();
const res = await fetch(`${api}/v1/segments:analyze`, {
  method: "POST",
  headers: {
    "content-type": "application/json",
    authorization: `Bearer ${installToken}`,
  },
  body: JSON.stringify({
    videoId: fixture.videoId,
    channelId: fixture.channelId,
    languageHint: fixture.languageHint,
    transcript: fixture.transcript,
  }),
});
const body = await res.json().catch(() => ({}));
process.stdout.write(
  `[local-seed] fixture ${fixture.videoId}: HTTP ${res.status}, status ${body.status ?? "?"}, ${(body.segments ?? []).length} segment(s)\n`,
);
if (!res.ok) process.exit(1);
