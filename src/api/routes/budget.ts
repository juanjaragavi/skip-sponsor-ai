import type { FastifyInstance } from "fastify";
import { ADMIN_TOKEN_HEADER, adminTokenMatches } from "../services/admin-token";
import type { BudgetStatus } from "../services/cost-guard";
import { problemType } from "../problem-type";

export interface BudgetRouteOptions {
  status: () => Promise<BudgetStatus>;
  /** ADMIN_API_TOKEN; empty disables the route (404). */
  adminToken: string;
}

/**
 * GET /v1/usage/budget (operator only, `x-admin-token`): today's LLM spend
 * against LLM_DAILY_BUDGET_USD. Polled hourly by ops-alerts, which emails at
 * 80 % (`warning`) and at 100 % (`exhausted`).
 */
export function registerBudgetRoutes(
  app: FastifyInstance,
  opts: BudgetRouteOptions,
): void {
  app.get("/v1/usage/budget", async (req, reply) => {
    const problem = (status: number, title: string) => ({
      type: problemType(status),
      title,
      status,
      detail: title,
      instance: req.url,
    });
    if (opts.adminToken.length === 0)
      return reply.code(404).send(problem(404, "Not found"));
    if (!adminTokenMatches(opts.adminToken, req.headers[ADMIN_TOKEN_HEADER]))
      return reply.code(401).send(problem(401, "Admin token required"));
    return reply.header("cache-control", "no-store").send(await opts.status());
  });
}
