import type { FastifyInstance } from "fastify";

export function registerInstallRoutes(app: FastifyInstance): void {
  app.post("/v1/installs", async (_req, reply) => {
    const token = crypto.randomUUID() + crypto.randomUUID().replace(/-/g, "");
    return reply.code(201).send({ installToken: token });
  });
  app.get("/v1/config", async (_req, reply) => {
    return reply.send({
      globalKill: process.env["GLOBAL_KILL"] === "1",
      minVersion: "1.0.0",
    });
  });
}
