/**
 * Platform-standard hooks of the API: `/api/health` JSON, correlation ids
 * (accept / mint / echo / forward) and the JSON log line shape.
 */
import { Writable } from "node:stream";
import pino from "pino";
import { describe, expect, it } from "vitest";
import { buildHealth } from "../../api/health";
import {
  acceptCorrelationId,
  currentCorrelationId,
  runWithCorrelationId,
} from "../../api/observability/correlation";
import { SERVICE_NAME, loggerOptions } from "../../api/observability/logger";
import { buildServer } from "../../api/server";

const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe("GET /api/health", () => {
  it("answers the standard JSON shape", async () => {
    const app = buildServer();
    const res = await app.inject({ method: "GET", url: "/api/health" });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(Object.keys(body).sort()).toEqual(
      ["checks", "commit", "service", "status", "time", "version"].sort(),
    );
    expect(body).toMatchObject({
      status: "ok",
      service: "skip-sponsor-ai/api",
      version: "1.0.0",
      checks: { database: "ok", llm: "ok" },
    });
    expect(new Date(body.time).toISOString()).toBe(body.time);
    await app.close();
  });

  it("is degraded without an AI key or with the cache down, down without the store", () => {
    const base = {
      service: SERVICE_NAME,
      version: "1.0.0",
      commit: "abc",
      now: new Date(0),
    };
    expect(
      buildHealth({
        ...base,
        database: true,
        redis: "ok",
        llmConfigured: true,
      }),
    ).toMatchObject({
      code: 200,
      body: { status: "ok", checks: { cache: "ok" } },
    });
    expect(
      buildHealth({
        ...base,
        database: true,
        redis: "disabled",
        llmConfigured: false,
      }),
    ).toMatchObject({
      code: 200,
      body: { status: "degraded", checks: { llm: "down" } },
    });
    expect(
      buildHealth({
        ...base,
        database: true,
        redis: "down",
        llmConfigured: true,
      }),
    ).toMatchObject({
      code: 200,
      body: { status: "degraded", checks: { cache: "down" } },
    });
    const down = buildHealth({
      ...base,
      database: false,
      redis: "ok",
      llmConfigured: true,
    });
    expect(down.code).toBe(503);
    expect(down.body.status).toBe("down");
    expect(JSON.stringify(down.body)).not.toMatch(/postgres:\/\/|redis:\/\//);
  });
});

describe("x-correlation-id", () => {
  it("accepts a valid caller id and echoes it", async () => {
    const app = buildServer();
    const res = await app.inject({
      method: "GET",
      url: "/healthz",
      headers: { "x-correlation-id": "ext.Action-42_a" },
    });
    expect(res.headers["x-correlation-id"]).toBe("ext.Action-42_a");
    await app.close();
  });

  it("replaces an invalid or missing id with a UUIDv4", async () => {
    const app = buildServer();
    for (const headers of [
      {},
      { "x-correlation-id": "bad id with spaces" },
      { "x-correlation-id": "x".repeat(129) },
    ]) {
      const res = await app.inject({ method: "GET", url: "/healthz", headers });
      expect(String(res.headers["x-correlation-id"])).toMatch(UUID_V4);
    }
    await app.close();
  });

  it("validates length and charset", () => {
    expect(acceptCorrelationId("a".repeat(128))).toBe("a".repeat(128));
    expect(acceptCorrelationId(["first", "second"])).toBe("first");
    expect(acceptCorrelationId("semi;colon")).toMatch(UUID_V4);
    expect(acceptCorrelationId(undefined)).toMatch(UUID_V4);
  });

  it("is visible to outbound calls made while handling the request", async () => {
    expect(currentCorrelationId()).toBeUndefined();
    const seen = await runWithCorrelationId("abc", async () => {
      await new Promise((r) => setTimeout(r, 1));
      return currentCorrelationId();
    });
    expect(seen).toBe("abc");
  });
});

describe("JSON log lines", () => {
  it("carry ts, level, service, msg and correlation_id", () => {
    const lines: string[] = [];
    const sink = new Writable({
      write(chunk, _enc, cb) {
        lines.push(String(chunk));
        cb();
      },
    });
    const log = pino(loggerOptions(), sink);
    log.child({ correlation_id: "c-1" }).info({ videoId: "v" }, "lookup");
    const line = JSON.parse(lines[0]!) as Record<string, unknown>;
    expect(line).toMatchObject({
      level: "info",
      service: "skip-sponsor-ai/api",
      msg: "lookup",
      correlation_id: "c-1",
    });
    expect(typeof line["ts"]).toBe("string");
    expect(new Date(line["ts"] as string).toISOString()).toBe(line["ts"]);
  });

  it("logs the request path without query string or headers", () => {
    const serializers = loggerOptions().serializers as Record<
      string,
      (v: unknown) => unknown
    >;
    expect(
      serializers["req"]!({
        method: "GET",
        url: "/v1/segments/abc?token=secret",
        headers: { authorization: "Bearer x" },
      }),
    ).toEqual({ method: "GET", path: "/v1/segments/abc" });
  });
});
