import { readFileSync, readdirSync, statSync } from "node:fs";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, expect, test } from "@playwright/test";

/**
 * Local-first acceptance (local-first standard LF-1..LF-4) for SkipSponsor:
 *   the LOCAL API is up on its stack (Postgres + Redis, LLM stub, SponsorBlock off) ->
 *   the extension build in dist/extension-local targets that API, carries no production
 *   host, and its service worker reaches the API from the extension origin ->
 *   one synthetic transcript is analyzed by the stub into a validated sponsor segment,
 *   stored, and served again from the cache.
 * Run with `bash scripts/local.sh smoke` (after `local.sh up` or `up --prod`).
 */
test.describe.configure({ mode: "serial" });
test.skip(
  process.env["SS_LOCAL_SMOKE"] !== "1",
  "local stack only: bash scripts/local.sh smoke",
);

const API = process.env["SS_LOCAL_API"] ?? "http://127.0.0.1:3040";
const EXT_DIR = process.env["SS_LOCAL_EXT_DIR"] ?? "dist/extension-local";
const HERE = dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(
  readFileSync(join(HERE, "fixtures/sponsor-transcript.json"), "utf8"),
) as {
  channelId: string;
  transcript: { t0: number; t1: number; text: string }[];
  expected: { sponsorStart: number; sponsorEnd: number };
};
const ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
const videoId = `Lf${Array.from({ length: 9 }, () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)]).join("")}`;
let token = "";

function filesUnder(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? filesUnder(p) : [p];
  });
}

test.beforeAll(() => {
  const host = new URL(API).hostname;
  if (!["127.0.0.1", "localhost"].includes(host))
    throw new Error(`local-smoke refuses a non-loopback API (${host})`);
});

test("the local API is up on its local stack", async ({ request }) => {
  expect((await request.get(`${API}/healthz`)).status()).toBe(200);
  const health = await (await request.get(`${API}/api/health`)).json();
  expect(health.status).toBe("ok");
  expect(health.checks).toMatchObject({
    database: "ok",
    cache: "ok",
    llm: "ok",
  });
  const cfg = await (await request.get(`${API}/v1/config`)).json();
  expect(cfg.globalKill).toBe(false);
});

test("the extension build targets the local API and no production host", () => {
  const files = filesUnder(EXT_DIR).filter((f) => /\.(js|json|html)$/.test(f));
  expect(files.length).toBeGreaterThan(0);
  const all = files.map((f) => readFileSync(f, "utf8")).join("\n");
  expect(all).toContain(new URL(API).host);
  expect(all).not.toContain("cloud.devspeak.dev");
  const manifest = JSON.parse(
    readFileSync(join(EXT_DIR, "manifest.json"), "utf8"),
  );
  expect(manifest.manifest_version).toBe(3);
});

test("the extension's service worker reaches the local API", async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), "ss-local-smoke-"));
  const ctx = await chromium.launchPersistentContext(userDataDir, {
    // The full Chromium build: the default headless shell cannot load extensions.
    channel: "chromium",
    headless: true,
    args: [
      `--disable-extensions-except=${EXT_DIR}`,
      `--load-extension=${EXT_DIR}`,
    ],
  });
  try {
    const worker =
      ctx.serviceWorkers()[0] ??
      (await ctx.waitForEvent("serviceworker", { timeout: 30_000 }));
    expect(worker.url()).toMatch(/^chrome-extension:\/\//);
    const result = await worker.evaluate(async (api: string) => {
      const r = await fetch(`${api}/healthz`);
      return { status: r.status, body: await r.json() };
    }, API);
    expect(result.status).toBe(200);
    expect(result.body.ok).toBe(true);
  } finally {
    await ctx.close();
    rmSync(userDataDir, { recursive: true, force: true });
  }
});

test("a transcript fixture is analyzed by the local LLM stub", async ({
  request,
}) => {
  const install = await request.post(`${API}/v1/installs`);
  expect(install.status()).toBe(201);
  token = (await install.json()).installToken;
  const res = await request.post(`${API}/v1/segments:analyze`, {
    headers: { authorization: `Bearer ${token}` },
    data: {
      videoId,
      channelId: fixture.channelId,
      languageHint: "en",
      transcript: fixture.transcript,
    },
  });
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body.status).toBe("ready");
  const sponsor = (
    body.segments as { category: string; startTime: number; endTime: number }[]
  ).filter((s) => s.category === "sponsor");
  expect(sponsor).toHaveLength(1);
  expect(
    Math.abs(sponsor[0]!.startTime - fixture.expected.sponsorStart),
  ).toBeLessThanOrEqual(2);
  expect(
    Math.abs(sponsor[0]!.endTime - fixture.expected.sponsorEnd),
  ).toBeLessThanOrEqual(3);
});

test("the stored result is served from the cache", async ({ request }) => {
  const res = await request.get(`${API}/v1/segments/${videoId}`, {
    headers: { authorization: `Bearer ${token}` },
  });
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body.status).toBe("ready");
  expect(body.segments.length).toBeGreaterThan(0);
});
