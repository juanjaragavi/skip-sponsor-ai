import Fastify from "fastify";
import { ZodError } from "zod";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import { config, checkProductionConfig } from "./config";
import { registerSegmentRoutes } from "./routes/segments";
import { registerTelemetryRoutes } from "./routes/telemetry";
import { registerInstallRoutes } from "./routes/installs";
import {
  createPersistence,
  memoryPersistence,
  type Persistence,
} from "./persistence";

/** Cues around each failing transcript index (dev diagnostics). */
function badCues(body: unknown, err: ZodError): unknown[] {
  const transcript = (body as { transcript?: unknown[] } | null)?.transcript;
  if (!Array.isArray(transcript)) return [];
  return err.issues
    .filter((i) => i.path[0] === "transcript")
    .slice(0, 3)
    .map((i) => {
      const n = Number(i.path[1]);
      return { index: n, around: transcript.slice(Math.max(0, n - 1), n + 2) };
    });
}

export interface ServerDeps {
  /** Defaults to config-driven wiring (memory under Vitest). */
  persistence: Persistence;
}

const persistenceOf = new WeakMap<object, Persistence>();

/** The store a server built by buildServer() uses. */
export function persistenceFor(app: object): Persistence {
  const p = persistenceOf.get(app);
  if (!p) throw new Error("not a buildServer() instance");
  return p;
}

export function buildServer(
  deps: Partial<ServerDeps> = {},
): ReturnType<typeof Fastify> {
  // 4 MB: up to 5,000 caption cues of 600 chars (non-Latin scripts are
  // 3 bytes/char in UTF-8) did not fit Fastify's 1 MB default.
  const app = Fastify({ logger: true, bodyLimit: 4 * 1024 * 1024 });
  const persistence =
    deps.persistence ??
    (process.env["VITEST"] === "true"
      ? memoryPersistence()
      : createPersistence(config, app.log));
  persistenceOf.set(app, persistence);
  app.addHook("onClose", async () => persistence.close());
  void app.register(cors, { origin: true });
  void app.register(rateLimit, { max: 500, timeWindow: "1 minute" });
  // RFC7807 error envelope
  app.setErrorHandler((err, req, reply) => {
    const status =
      err instanceof ZodError
        ? 400
        : ((err as { statusCode?: number }).statusCode ?? 500);
    const message = err instanceof Error ? err.message : "Unexpected error";
    if (err instanceof ZodError)
      req.log.warn(
        {
          issues: err.issues
            .slice(0, 5)
            .map((i) => `${i.path.join(".")}: ${i.message}`),
          // Dev only: the offending caption cues, to debug client parsing.
          ...(process.env["NODE_ENV"] !== "production" && {
            cues: badCues(req.body, err),
          }),
        },
        "request validation failed",
      );
    else if (status >= 500) req.log.error({ err }, "request failed");
    void reply.code(status).send({
      type: `https://api.skipsponsor.example.com/problems/${status}`,
      title: message,
      status,
      detail: message,
      instance: req.url,
    });
  });
  app.get("/healthz", async () => ({ ok: true, version: config.version }));
  // Readiness: the store answers. Liveness (/healthz) stays dependency-free.
  app.get("/readyz", async (_req, reply) => {
    const ok = await persistence.ping();
    return reply
      .code(ok ? 200 : 503)
      .send({ ok, persistence: persistence.mode });
  });
  registerSegmentRoutes(app, persistence.repo);
  registerTelemetryRoutes(app, persistence.repo);
  registerInstallRoutes(app);
  return app;
}

const PURGE_INTERVAL_MS = 3600 * 1000;

async function main(): Promise<void> {
  const { errors, warnings } = checkProductionConfig(config);
  for (const w of warnings) console.warn(`config warning: ${w}`);
  if (errors.length) {
    for (const e of errors) console.error(`config error: ${e}`);
    process.exit(1);
  }
  const app = buildServer();
  const persistence = persistenceFor(app);
  // A stray rejection must not take the API down silently (the dev server
  // once died inside `tsx watch` with nothing listening on :3000).
  process.on("unhandledRejection", (reason) => {
    app.log.error({ err: reason }, "unhandled promise rejection");
  });
  process.on("uncaughtException", (err) => {
    app.log.fatal({ err }, "uncaught exception — exiting");
    process.exit(1);
  });
  for (const signal of ["SIGTERM", "SIGINT"] as const)
    process.once(signal, () => {
      void app.close().finally(() => process.exit(0));
    });
  // Retention: hard-delete expired analyses and old telemetry (PRIVACY.md).
  const purge = (): void => {
    persistence
      .purge()
      .then((n) => {
        if (Object.values(n).some((v) => v > 0))
          app.log.info({ purged: n }, "retention purge");
      })
      .catch((err: unknown) => app.log.warn({ err }, "retention purge failed"));
  };
  if (persistence.mode === "postgres") {
    purge();
    setInterval(purge, PURGE_INTERVAL_MS).unref();
  }
  app.log.info({ persistence: persistence.mode }, "persistence ready");
  await app
    .listen({ port: config.port, host: "0.0.0.0" })
    .catch((e: unknown) => {
      console.error(
        (e as { code?: string }).code === "EADDRINUSE"
          ? `Port ${config.port} is already in use — another API instance is running. Stop it or set PORT.`
          : e,
      );
      process.exit(1);
    });
}

if (process.env["VITEST"] !== "true") void main();
