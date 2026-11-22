import { describe, it, expect, vi } from "vitest";
import { buildServer } from "../../api/server";
import { memoryPersistence } from "../../api/persistence";
import {
  createInstallTokenClient,
  isSignedToken,
  MINT_BACKOFF_MAX_MS,
  MINT_BACKOFF_START_MS,
  type InstallTokenDeps,
} from "../../extension/install-token";

vi.mock("../../api/services/llm-client", () => ({
  classifyChunks: vi.fn(async () => ({
    candidates: [],
    model: "claude-haiku",
  })),
  setLlmUsageListener: vi.fn(),
}));

const SECRET = "k".repeat(48);
const cues = Array.from({ length: 8 }, (_, i) => ({
  t0: i * 15,
  t1: i * 15 + 15,
  text: `line ${i}`,
}));

type App = ReturnType<typeof buildServer>;

function server(installsPerIpPerHour: number): App {
  return buildServer({
    persistence: memoryPersistence(),
    installTokenSecret: SECRET,
    dailyAnalysesPerInstall: 25,
    llmDailyBudgetUsd: 5,
    installsPerIpPerHour,
  });
}

/** app.inject as the extension's fetch (one shared client IP: 127.0.0.1). */
async function mintVia(app: App): Promise<Response> {
  const res = await app.inject({ method: "POST", url: "/v1/installs" });
  const headers = new Headers();
  for (const [k, v] of Object.entries(res.headers))
    if (v !== undefined) headers.set(k, String(v));
  return new Response(res.body, { status: res.statusCode, headers });
}

/** One browser: its own chrome.storage.local and clock. */
function browser(mint: () => Promise<Response>, clock = { t: 0 }) {
  let stored: string | null = null;
  const deps: InstallTokenDeps = {
    load: async () => stored,
    save: async (t) => {
      stored = t;
    },
    mint: vi.fn(mint),
    now: () => clock.t,
  };
  return { client: createInstallTokenClient(deps), deps, clock };
}

async function analyze(app: App, token: string, videoId: string) {
  return app.inject({
    method: "POST",
    url: "/v1/segments:analyze",
    headers: { authorization: `Bearer ${token}` },
    payload: { videoId, transcript: cues },
  });
}

describe("S-P1-3: 25 installs behind one shared IP", () => {
  it("with the mint limit at 60/h, all 25 get signed tokens and can analyze", async () => {
    const app = server(60);
    for (let i = 0; i < 25; i++) {
      const { client } = browser(() => mintVia(app));
      const token = await client.get();
      expect(isSignedToken(token)).toBe(true);
      expect(await client.settingUp()).toBe(false);
      const res = await analyze(app, token, `vid${String(i).padStart(8, "0")}`);
      expect(res.statusCode).toBe(200);
    }
    await app.close();
  });

  it("with today's 20/h, the 21st is 'setting up' (never refused) and signs on a later video after the backoff", async () => {
    const target = { app: server(20) };
    const browsers = Array.from({ length: 25 }, () =>
      browser(() => mintVia(target.app)),
    );
    const tokens = [];
    for (const b of browsers) tokens.push(await b.client.get());
    expect(tokens.slice(0, 20).every(isSignedToken)).toBe(true);
    for (const [i, b] of browsers.slice(20).entries()) {
      const token = tokens[20 + i]!;
      expect(isSignedToken(token)).toBe(false);
      // The API refuses the unsigned token for a fresh analysis (401)...
      const res = await analyze(target.app, token, "vidB0000021");
      expect(res.statusCode).toBe(401);
      expect(res.json().reason).toBe("unauthenticated");
      // ...and the extension knows it is still setting up (the service
      // worker reports reason "setting_up", not "couldn't be verified").
      expect(await b.client.settingUp()).toBe(true);
    }
    // Next video inside the backoff: no new mint request.
    const b21 = browsers[20]!;
    await b21.client.get();
    expect(b21.deps.mint).toHaveBeenCalledTimes(1);
    await target.app.close();

    // The hour window has passed (a fresh limiter, same signing secret) and
    // the backoff is over: the 21st browser's next video mints a signed token.
    target.app = server(20);
    b21.clock.t += MINT_BACKOFF_MAX_MS + 1;
    const token = await b21.client.get();
    expect(isSignedToken(token)).toBe(true);
    expect(await b21.client.settingUp()).toBe(false);
    expect((await analyze(target.app, token, "vidB0000022")).statusCode).toBe(
      200,
    );
    await target.app.close();
  });
});

describe("install-token client backoff", () => {
  const limited = (retryAfter?: string) =>
    new Response("{}", {
      status: 429,
      headers: retryAfter ? { "retry-after": retryAfter } : {},
    });
  const ok = () =>
    new Response(JSON.stringify({ installToken: `v1.${"a".repeat(32)}.sig` }), {
      status: 201,
    });

  it("keeps a local token after a failed mint and does not ask again before the backoff", async () => {
    let calls = 0;
    const { client, clock } = browser(async () => {
      calls++;
      throw new TypeError("offline");
    });
    const local = await client.get();
    expect(isSignedToken(local)).toBe(false);
    expect(await client.get()).toBe(local);
    expect(calls).toBe(1);
    clock.t += MINT_BACKOFF_START_MS;
    await client.get();
    expect(calls).toBe(2);
    // doubled: 30 s is not enough the second time
    clock.t += MINT_BACKOFF_START_MS;
    await client.get();
    expect(calls).toBe(2);
    clock.t += MINT_BACKOFF_START_MS;
    await client.get();
    expect(calls).toBe(3);
  });

  it("honours Retry-After on a 429, even for a 401 renewal, capped at 10 minutes", async () => {
    const answers = [limited("120"), ok()];
    let calls = 0;
    const { client, clock } = browser(async () => {
      calls++;
      return answers.shift()!;
    });
    await client.get();
    expect(await client.settingUp()).toBe(true);
    await client.get(true); // renewal inside the window: no new request
    expect(calls).toBe(1);
    clock.t += 120_000;
    const token = await client.get(true);
    expect(calls).toBe(2);
    expect(isSignedToken(token)).toBe(true);
    expect(await client.settingUp()).toBe(false);

    const capped = browser(async () => limited("3600"));
    await capped.client.get();
    capped.clock.t += MINT_BACKOFF_MAX_MS;
    await capped.client.get();
    expect(capped.deps.mint).toHaveBeenCalledTimes(2);
  });

  it("a renewal after a network error retries at once", async () => {
    const answers: (() => Promise<Response>)[] = [
      async () => {
        throw new TypeError("offline");
      },
      async () => ok(),
    ];
    const { client } = browser(() => answers.shift()!());
    await client.get();
    expect(isSignedToken(await client.get(true))).toBe(true);
  });
});
