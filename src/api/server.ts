import Fastify from "fastify";
import { ZodError } from "zod";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import { config } from "./config";
import { registerSegmentRoutes } from "./routes/segments";
import { registerTelemetryRoutes } from "./routes/telemetry";
import { registerInstallRoutes } from "./routes/installs";
import { getRepository } from "./repositories/segment-repository";

export function buildServer(): ReturnType<typeof Fastify> {
  const app = Fastify({ logger: true });
  void app.register(cors, { origin: true });
  void app.register(rateLimit, { max: 500, timeWindow: "1 minute" });
  // RFC7807 error envelope
  app.setErrorHandler((err, req, reply) => {
    const status =
      err instanceof ZodError
        ? 400
        : ((err as { statusCode?: number }).statusCode ?? 500);
    const message = err instanceof Error ? err.message : "Unexpected error";
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
  app.listen({ port: config.port, host: "0.0.0.0" }).catch((e: unknown) => {
    console.error(e);
    process.exit(1);
  });
}
