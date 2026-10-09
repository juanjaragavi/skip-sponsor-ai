import Fastify from "fastify";
import { ZodError } from "zod";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import { config } from "./config";
import { registerSegmentRoutes } from "./routes/segments";
import { registerTelemetryRoutes } from "./routes/telemetry";
import { registerInstallRoutes } from "./routes/installs";
import { getRepository } from "./repositories/segment-repository";

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

export function buildServer(): ReturnType<typeof Fastify> {
  // 4 MB: up to 5,000 caption cues of 600 chars (non-Latin scripts are
  // 3 bytes/char in UTF-8) did not fit Fastify's 1 MB default.
  const app = Fastify({ logger: true, bodyLimit: 4 * 1024 * 1024 });
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
  const repo = getRepository();
  registerSegmentRoutes(app, repo);
  registerTelemetryRoutes(app, repo);
  registerInstallRoutes(app);
  return app;
}

if (process.env["VITEST"] !== "true") {
  const app = buildServer();
  // A stray rejection must not take the API down silently (the dev server
  // once died inside `tsx watch` with nothing listening on :3000).
  process.on("unhandledRejection", (reason) => {
    app.log.error({ err: reason }, "unhandled promise rejection");
  });
  process.on("uncaughtException", (err) => {
    app.log.fatal({ err }, "uncaught exception — exiting");
    process.exit(1);
  });
  app.listen({ port: config.port, host: "0.0.0.0" }).catch((e: unknown) => {
    console.error(
      (e as { code?: string }).code === "EADDRINUSE"
        ? `Port ${config.port} is already in use — another API instance is running. Stop it or set PORT.`
        : e,
    );
    process.exit(1);
  });
}
