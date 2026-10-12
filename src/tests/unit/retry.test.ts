/**
 * Retry policy with fault injection (portfolio platform standard): a local
 * HTTP server answers 503 then 200, hangs, sends Retry-After, or refuses a
 * 4xx; a fake clock records every wait. Proves attempts, delays and the
 * headers forwarded on every attempt.
 */
import { createServer, type IncomingHttpHeaders, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import {
  DEFAULT_RETRY_POLICY,
  backoffDelay,
  fetchWithRetry,
  parseRetryAfter,
  retryAsync,
  type RetryRuntime,
} from "../../api/lib/retry";
import { runWithCorrelationId } from "../../api/observability/correlation";
import { classifyLlmError } from "../../api/services/llm-client";

interface Hit {
  method: string;
  headers: IncomingHttpHeaders;
}

type Script = (n: number) => {
  status?: number;
  headers?: Record<string, string>;
  hang?: boolean;
};

let server: Server | null = null;

async function faultServer(
  script: Script,
): Promise<{ url: string; hits: Hit[] }> {
  const hits: Hit[] = [];
  server = createServer((req, res) => {
    hits.push({ method: req.method ?? "", headers: req.headers });
    const step = script(hits.length);
    if (step.hang) return; // never answers: the client's timeout fires
    res.writeHead(step.status ?? 200, step.headers);
    res.end("{}");
  });
  await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return { url: `http://127.0.0.1:${port}/x`, hits };
}

afterEach(async () => {
  server?.closeAllConnections();
  await new Promise((resolve) => server?.close(resolve) ?? resolve(null));
  server = null;
});

/** Fake clock: sleeps advance time instantly and are recorded. */
function fakeRuntime(random = 1): RetryRuntime & { waits: number[] } {
  let t = 0;
  const waits: number[] = [];
  return {
    waits,
    now: () => t,
    sleep: async (ms) => {
      waits.push(ms);
      t += ms;
    },
    random: () => random,
  };
}

describe("backoff", () => {
  it("full jitter: random * min(cap, base * 2^(n-1))", () => {
    const p = DEFAULT_RETRY_POLICY;
    expect(backoffDelay(1, p, () => 1)).toBe(200);
    expect(backoffDelay(2, p, () => 1)).toBe(400);
    expect(backoffDelay(3, p, () => 1)).toBe(800);
    expect(backoffDelay(3, p, () => 0.5)).toBe(400);
    expect(backoffDelay(10, p, () => 1)).toBe(5000); // capped
    expect(backoffDelay(2, p, () => 0)).toBe(0);
  });

  it("parses Retry-After as seconds or an HTTP date", () => {
    expect(parseRetryAfter("3", 0)).toBe(3000);
    expect(parseRetryAfter(new Date(10_000).toUTCString(), 4_000)).toBe(6000);
    expect(parseRetryAfter("soon", 0)).toBeNull();
    expect(parseRetryAfter(null, 0)).toBeNull();
  });
});

describe("fetchWithRetry (fault injection)", () => {
  it("retries a 503 then succeeds, forwarding the same headers each time", async () => {
    const { url, hits } = await faultServer((n) => ({
      status: n === 1 ? 503 : 200,
    }));
    const rt = fakeRuntime();
    const res = await runWithCorrelationId("corr-123", () =>
      fetchWithRetry(url, {}, { runtime: rt, idempotencyKey: "idem-1" }),
    );
    expect(res.status).toBe(200);
    expect(hits).toHaveLength(2);
    expect(rt.waits).toEqual([200]);
    for (const h of hits) {
      expect(h.headers["x-correlation-id"]).toBe("corr-123");
      expect(h.headers["idempotency-key"]).toBe("idem-1");
    }
  });

  it("stops after 4 attempts with exponential waits and returns the last answer", async () => {
    const { url, hits } = await faultServer(() => ({ status: 502 }));
    const rt = fakeRuntime();
    const res = await fetchWithRetry(url, {}, { runtime: rt });
    expect(res.status).toBe(502);
    expect(hits).toHaveLength(4);
    expect(rt.waits).toEqual([200, 400, 800]);
  });

  it.each([408, 425, 429, 500, 504])("retries %i", async (status) => {
    const { url, hits } = await faultServer((n) => ({
      status: n === 1 ? status : 200,
    }));
    const res = await fetchWithRetry(url, {}, { runtime: fakeRuntime() });
    expect(res.status).toBe(200);
    expect(hits).toHaveLength(2);
  });

  it.each([400, 401, 403, 404, 409, 422])(
    "never retries %i",
    async (status) => {
      const { url, hits } = await faultServer(() => ({ status }));
      const res = await fetchWithRetry(url, {}, { runtime: fakeRuntime() });
      expect(res.status).toBe(status);
      expect(hits).toHaveLength(1);
    },
  );

  it("does not retry a POST without an Idempotency-Key", async () => {
    const { url, hits } = await faultServer(() => ({ status: 503 }));
    const res = await fetchWithRetry(
      url,
      { method: "POST" },
      { runtime: fakeRuntime() },
    );
    expect(res.status).toBe(503);
    expect(hits).toHaveLength(1);
  });

  it("retries a POST that carries an Idempotency-Key", async () => {
    const { url, hits } = await faultServer((n) => ({
      status: n === 1 ? 503 : 201,
    }));
    const res = await fetchWithRetry(
      url,
      { method: "POST", body: "{}" },
      { runtime: fakeRuntime(), idempotencyKey: "k-1" },
    );
    expect(res.status).toBe(201);
    expect(hits.map((h) => h.headers["idempotency-key"])).toEqual([
      "k-1",
      "k-1",
    ]);
  });

  it("honours Retry-After up to the 5 s cap", async () => {
    const { url } = await faultServer((n) =>
      n === 1
        ? { status: 429, headers: { "retry-after": "2" } }
        : n === 2
          ? { status: 503, headers: { "retry-after": "60" } }
          : { status: 200 },
    );
    const rt = fakeRuntime();
    const res = await fetchWithRetry(url, {}, { runtime: rt });
    expect(res.status).toBe(200);
    expect(rt.waits).toEqual([2000, 5000]);
  });

  it("gives up when the next wait would cross the 15 s deadline", async () => {
    const { url, hits } = await faultServer(() => ({
      status: 503,
      headers: { "retry-after": "5" },
    }));
    const rt = fakeRuntime();
    const res = await fetchWithRetry(
      url,
      {},
      { runtime: rt, policy: { deadlineMs: 9000 } },
    );
    expect(res.status).toBe(503);
    expect(hits).toHaveLength(2); // 0 s, wait 5 s, 5 s; next wait would end at 10 s > 9 s
    expect(rt.waits).toEqual([5000]);
  });

  it("retries after a timeout (hanging server) and forwards the correlation id", async () => {
    const { url, hits } = await faultServer((n) =>
      n === 1 ? { hang: true } : { status: 200 },
    );
    const res = await fetchWithRetry(
      url,
      {},
      {
        attemptTimeoutMs: 150,
        correlationId: "c-timeout",
        runtime: { ...fakeRuntime(), now: Date.now },
      },
    );
    expect(res.status).toBe(200);
    expect(hits).toHaveLength(2);
    expect(
      hits.every((h) => h.headers["x-correlation-id"] === "c-timeout"),
    ).toBe(true);
  });

  it("throws the network error after the last attempt", async () => {
    const rt = fakeRuntime();
    // Nothing listens on port 9 (discard) on loopback: connection refused.
    await expect(
      fetchWithRetry(
        "http://127.0.0.1:9/x",
        {},
        { runtime: rt, policy: { maxAttempts: 3 } },
      ),
    ).rejects.toThrow();
    expect(rt.waits).toEqual([200, 400]);
  });
});

describe("retryAsync (SDK calls)", () => {
  it("retries retryable failures and stops on a fatal one", async () => {
    const rt = fakeRuntime();
    let calls = 0;
    const out = await retryAsync(
      async () => {
        calls++;
        if (calls < 3) throw Object.assign(new Error("busy"), { status: 503 });
        return "ok";
      },
      (e) => ((e as { status?: number }).status === 503 ? "retry" : "fatal"),
      { runtime: rt },
    );
    expect(out).toBe("ok");
    expect(calls).toBe(3);
    expect(rt.waits).toEqual([200, 400]);

    let fatalCalls = 0;
    await expect(
      retryAsync(
        async () => {
          fatalCalls++;
          throw Object.assign(new Error("bad request"), { status: 400 });
        },
        () => "fatal",
        { runtime: fakeRuntime() },
      ),
    ).rejects.toThrow("bad request");
    expect(fatalCalls).toBe(1);
  });

  it("classifies LLM errors by the platform's retryable statuses", () => {
    expect(classifyLlmError({ status: 429 })).toBe("retry");
    expect(classifyLlmError({ status: 503 })).toBe("retry");
    expect(classifyLlmError({ status: 400 })).toBe("fatal");
    expect(classifyLlmError({ status: 401 })).toBe("fatal");
    expect(classifyLlmError(new Error("parse"))).toBe("fatal");
  });
});
