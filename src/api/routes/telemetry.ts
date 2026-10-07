import type { FastifyInstance } from "fastify";
import { telemetryRequestSchema } from "../../shared/validators";
import type { SegmentRepository } from "../repositories/segment-repository";

export function registerTelemetryRoutes(
  app: FastifyInstance,
  repo: SegmentRepository,
): void {
  app.post("/v1/telemetry", async (req, reply) => {
    const body = telemetryRequestSchema.parse(req.body);
    await repo.logTelemetry(body.videoId, body.eventType, body.latencyMs);
    return reply.code(204).send();
  });
}
