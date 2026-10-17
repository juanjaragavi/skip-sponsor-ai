import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { uninstallQuerySchema, usagePingSchema } from "../../shared/validators";
import { SUPPORT_EMAIL } from "../../shared/company.generated";
import type { InstallTokens } from "../services/install-token";
import type { UsageEvent, UsageStatsStore } from "../repositories/usage-stats";
import { ADMIN_TOKEN_HEADER, adminTokenMatches } from "../services/admin-token";

/**
 * Anonymous install and usage counts (privacy draft 2026-10-17):
 *
 * - POST /v1/usage `{id, event, version}`: the extension's random usage id
 *   (a UUID kept in chrome.storage.local, unrelated to the install token), the
 *   event (install, update, or the first YouTube video of a UTC day) and the
 *   extension version. Nothing else: no URL, video ID, channel or token.
 * - GET /v1/usage/uninstalled?id=&v=: the page Chrome opens after an uninstall
 *   (chrome.runtime.setUninstallURL); it counts the uninstall and says thanks.
 * - GET /v1/usage/summary: operator-only aggregate counts (x-admin-token).
 *
 * Only a keyed hash of the id is stored, with the UTC day. Opted-out
 * extensions send nothing. Storage failures never reach the extension.
 */
export interface UsageRouteOptions {
  store: UsageStatsStore;
  tokens: InstallTokens;
  adminToken: string;
  /** Pings one IP may send per hour (a few profiles behind one NAT are fine). */
  pingsPerHour?: number;
  now?: () => Date;
}

const utcDay = (d: Date): string => d.toISOString().slice(0, 10);

const escapeHtml = (s: string): string =>
  s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** Static thank-you page; no scripts, no external resources. */
export function uninstallPage(email: string = SUPPORT_EMAIL): string {
  const e = escapeHtml(email);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>SkipSponsor AI · Removed</title>
<style>
body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0f1115;color:#e8eaed;font:16px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif}
main{max-width:34rem;padding:2rem}
h1{font-size:1.5rem;margin:0 0 .75rem}
a{color:#8ab4f8;cursor:pointer}
</style>
</head>
<body>
<main>
<h1>SkipSponsor AI was removed</h1>
<p>Thanks for trying it. If something didn't work as you expected, a short note helps us fix it: <a href="mailto:${e}?subject=SkipSponsor%20AI%20feedback">${e}</a>.</p>
<p>Your settings were deleted from your browser along with the extension.</p>
</main>
</body>
</html>
`;
}

export function registerUsageRoutes(
  app: FastifyInstance,
  opts: UsageRouteOptions,
): void {
  const now = opts.now ?? (() => new Date());
  const limit = {
    rateLimit: { max: opts.pingsPerHour ?? 60, timeWindow: "1 hour" },
  };

  const record = async (id: string, event: UsageEvent, version: string) => {
    try {
      await opts.store.record(
        utcDay(now()),
        opts.tokens.usageKey(id),
        event,
        version,
      );
    } catch (err) {
      // Best effort: a missing table (migration 004 not applied) or a
      // database blip must not turn into errors in the extension.
      app.log.warn({ err, event }, "usage ping not recorded");
    }
  };

  app.post("/v1/usage", { config: limit }, async (req, reply) => {
    const body = usagePingSchema.parse(req.body);
    await record(body.id, body.event, body.version);
    return reply.code(204).send();
  });

  app.get("/v1/usage/uninstalled", { config: limit }, async (req, reply) => {
    const q = uninstallQuerySchema.safeParse(req.query);
    if (q.success && q.data.id)
      await record(q.data.id, "uninstall", q.data.v ?? "0.0.0");
    return reply
      .code(200)
      .header("content-type", "text/html; charset=utf-8")
      .header(
        "content-security-policy",
        "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'",
      )
      .header("cache-control", "no-store")
      .header("referrer-policy", "no-referrer")
      .send(uninstallPage());
  });

  app.get("/v1/usage/summary", async (req, reply) => {
    const problem = (status: number, title: string) => ({
      type: `https://api.skipsponsor.example.com/problems/${status}`,
      title,
      status,
      detail: title,
      instance: req.url,
    });
    if (opts.adminToken.length === 0)
      return reply.code(404).send(problem(404, "Not found"));
    if (!adminTokenMatches(opts.adminToken, req.headers[ADMIN_TOKEN_HEADER]))
      return reply.code(401).send(problem(401, "Admin token required"));
    const asOf = z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional()
      .parse((req.query as { asOf?: string }).asOf);
    return reply.send(await opts.store.summary(asOf ?? utcDay(now())));
  });
}
