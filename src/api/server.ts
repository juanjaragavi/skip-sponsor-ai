import Fastify, { LogController } from "fastify";
import { ZodError } from "zod";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import { config, checkProductionConfig, llmStubActive } from "./config";
import { corsOrigin } from "./cors";
import { registerSegmentRoutes } from "./routes/segments";
import { registerTelemetryRoutes } from "./routes/telemetry";
import { registerInstallRoutes } from "./routes/installs";
import { registerUsageRoutes } from "./routes/usage";
import {
  MemoryUsageStatsStore,
  PostgresUsageStatsStore,
  type UsageStatsStore,
} from "./repositories/usage-stats";
import {
  createPersistence,
  memoryPersistence,
  type Persistence,
} from "./persistence";
import { CostGuard } from "./services/cost-guard";
import {
  InstallTokens,
  bearerToken,
  ipQuotaKey,
} from "./services/install-token";
import { setLlmUsageListener } from "./services/llm-client";
import type { AnalysisGate } from "./routes/segments";
import { buildHealth } from "./health";
import {
  CORRELATION_HEADER,
  acceptCorrelationId,
  runWithCorrelationId,
} from "./observability/correlation";
import {
  SERVICE_NAME,
  createLogger,
  loggerOptions,
} from "./observability/logger";

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
  installTokenSecret: string;
  dailyAnalysesPerInstall: number;
  llmDailyBudgetUsd: number;
  installsPerIpPerHour: number;
  corsOrigin: string;
  isProduction: boolean;
  trustProxy: boolean;
  /** ADMIN_API_TOKEN: operator-only cache mutations; empty disables them (404). */
  adminToken: string;
  /** Anonymous install/usage counts; defaults to the persistence's database (memory without one). */
  usageStats: UsageStatsStore;
  /** SPONSORBLOCK_ENABLED: SponsorBlock fallback and gap filling (default off). */
  sponsorBlockEnabled: boolean;
  /** An AI provider key is set. Defaults to ANTHROPIC_API_KEY presence (true under Vitest, where the LLM is mocked). */
  llmConfigured: boolean;
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
  const app = Fastify({
    // One JSON object per line: ts, level, service, msg, correlation_id.
    logger: loggerOptions(),
    // The request id is the correlation id (caller's when valid, else UUIDv4).
    genReqId: (req) => acceptCorrelationId(req.headers[CORRELATION_HEADER]),
    logController: new LogController({ requestIdLogLabel: "correlation_id" }),
    bodyLimit: 4 * 1024 * 1024,
    // Behind the DevSpeak Labs Cloud edge (Caddy): req.ip from X-Forwarded-For, so
    // rate limits apply per client instead of per proxy.
    trustProxy: deps.trustProxy ?? config.trustProxy,
  });
  const persistence =
    deps.persistence ??
    (process.env["VITEST"] === "true"
      ? memoryPersistence()
      : createPersistence(config, app.log));
  persistenceOf.set(app, persistence);
  // Echo the correlation id and expose it to outbound calls (retry.ts).
  app.addHook("onRequest", (req, reply, done) => {
    void reply.header(CORRELATION_HEADER, req.id);
    runWithCorrelationId(req.id, done);
  });
  app.addHook("onClose", async () => persistence.close());
  void app.register(cors, {
    origin: corsOrigin(
      deps.corsOrigin ?? config.corsOrigin,
      deps.isProduction ?? config.isProduction,
    ),
    methods: ["GET", "POST", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "authorization",
      "content-type",
      "x-extension-version",
      CORRELATION_HEADER,
    ],
    exposedHeaders: [CORRELATION_HEADER],
    maxAge: 86400,
  });
  void app.register(rateLimit, { max: 500, timeWindow: "1 minute" });
  // RFC7807 error envelope
  app.setErrorHandler((err, req, reply) => {
    const status =
      err instanceof ZodError
        ? 400
        : ((err as { statusCode?: number }).statusCode ?? 500);
    // 5xx bodies stay generic: internals (driver errors, hosts) go to the log only.
    const message =
      status >= 500
        ? "Internal Server Error"
        : err instanceof Error
          ? err.message
          : "Unexpected error";
    if (err instanceof ZodError)
      req.log.warn(
        {
          issues: err.issues
            .slice(0, 5)
            .map((i) => `${i.path.join(".")}: ${i.message}`),
          // Dev only: the offending caption cues, to debug client parsing.
          ...(!config.isProduction && {
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
  app.get("/healthz", async () => ({
    ok: true,
    version: config.version,
    commit: config.commit,
  }));
  // Readiness: the store answers. Liveness (/healthz) stays dependency-free.
  const llmConfigured =
    deps.llmConfigured ??
    (process.env["VITEST"] === "true" ||
      Boolean(config.anthropicKey) ||
      llmStubActive(config));
  // Platform-standard health for the portfolio monitor (health.ts).
  app.get("/api/health", async (_req, reply) => {
    const [database, redis] = await Promise.all([
      persistence.ping(),
      persistence.redisStatus(),
    ]);
    const { code, body } = buildHealth({
      service: SERVICE_NAME,
      version: config.version,
      commit: config.commit,
      database,
      redis,
      llmConfigured,
    });
    return reply.code(code).send(body);
  });
  const sponsorBlockEnabled =
    deps.sponsorBlockEnabled ?? config.sponsorBlockEnabled;
  // Redis is optional and reported, not gated on; `ai` says whether fresh
  // analyses can run at all (no key: cached results only); `sponsorblock`
  // whether SponsorBlock data may be fetched and served.
  app.get("/readyz", async (_req, reply) => {
    const [ok, redis] = await Promise.all([
      persistence.ping(),
      persistence.redisStatus(),
    ]);
    return reply.code(ok ? 200 : 503).send({
      ok,
      persistence: persistence.mode,
      redis,
      ai: llmConfigured ? "configured" : "not_configured",
      sponsorblock: sponsorBlockEnabled ? "on" : "off",
    });
  });
  // Cost guard: per-install daily quota + global daily LLM budget.
  const tokens = new InstallTokens(
    deps.installTokenSecret ?? config.installTokenSecret,
  );
  const dailyAnalysesPerInstall =
    deps.dailyAnalysesPerInstall ?? config.dailyAnalysesPerInstall;
  const guard = new CostGuard(persistence.usage, {
    llmConfigured,
    dailyAnalysesPerInstall,
    dailyBudgetUsd: deps.llmDailyBudgetUsd ?? config.llmDailyBudgetUsd,
    onBudgetReached: (spentUsd) =>
      app.log.warn(
        { spentUsd },
        "LLM daily budget reached; serving cached results until 00:00 UTC",
      ),
  });
  setLlmUsageListener((model, input, output) => {
    guard
      .recordUsage(model, input, output)
      .catch((err: unknown) =>
        app.log.warn({ err }, "recording LLM usage failed"),
      );
  });
  const gate: AnalysisGate = {
    reserve: (req) => {
      const key =
        tokens.quotaKey(bearerToken(req.headers.authorization)) ??
        // Local development only: no token, meter by client IP.
        (tokens.signing ? null : ipQuotaKey(req.ip));
      return guard.reserve(key);
    },
  };
  // Registered as a plugin so it loads after @fastify/rate-limit: routes
  // added before the limiter loads get neither the global nor a per-route limit.
  void app.register(async (api) => {
    registerSegmentRoutes(
      api,
      persistence.repo,
      gate,
      deps.adminToken ?? config.adminToken,
      { sponsorBlockEnabled },
    );
    registerTelemetryRoutes(api, persistence.repo);
    registerInstallRoutes(api, {
      tokens,
      dailyAnalysesPerInstall,
      installsPerHour: deps.installsPerIpPerHour ?? config.installsPerIpPerHour,
    });
    registerUsageRoutes(api, {
      store:
        deps.usageStats ??
        (persistence.pool
          ? new PostgresUsageStatsStore(persistence.pool)
          : new MemoryUsageStatsStore()),
      tokens,
      adminToken: deps.adminToken ?? config.adminToken,
    });
  });
  return app;
}

const PURGE_INTERVAL_MS = 3600 * 1000;

async function main(): Promise<void> {
  const boot = createLogger();
  const { errors, warnings } = checkProductionConfig(config);
  for (const w of warnings) boot.warn(`config warning: ${w}`);
  if (errors.length) {
    for (const e of errors) boot.error(`config error: ${e}`);
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
    .listen({ port: config.port, host: config.host })
    .catch((e: unknown) => {
      if ((e as { code?: string }).code === "EADDRINUSE")
        boot.error(
          `Port ${config.port} is already in use — another API instance is running. Stop it or set PORT.`,
        );
      else boot.error({ err: e }, "listen failed");
      process.exit(1);
    });
}

if (process.env["VITEST"] !== "true") void main();
