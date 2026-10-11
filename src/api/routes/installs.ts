import type { FastifyInstance } from "fastify";
import type { InstallTokens } from "../services/install-token";

export interface InstallRouteOptions {
  tokens: InstallTokens;
  dailyAnalysesPerInstall: number;
  /** New tokens one IP may mint per hour (token farming defeats the quota). */
  installsPerHour: number;
}

export function registerInstallRoutes(
  app: FastifyInstance,
  opts: InstallRouteOptions,
): void {
  app.post(
    "/v1/installs",
    {
      config: {
        rateLimit: { max: opts.installsPerHour, timeWindow: "1 hour" },
      },
    },
    async (_req, reply) =>
      reply.code(201).send({ installToken: opts.tokens.issue() }),
  );
  app.get("/v1/config", async (_req, reply) => {
    return reply.send({
      globalKill: process.env["GLOBAL_KILL"] === "1",
      minVersion: "1.0.0",
      dailyAnalysesPerInstall: opts.dailyAnalysesPerInstall,
    });
  });
}
