# ADR 0002: API hosting on DevSpeak Labs Cloud (the box)

- **Status:** Accepted, 2026-10-12. Supersedes [ADR 0001](0001-api-hosting-instacloud.md).
- **Decision maker:** Juan Jaramillo (migration order of 2026-10-12, "every product except DevSpeak"), carried out by the CTO agent.

## Context

The hosted platform org that ran the API was suspended on 2026-10-12, so the API answered `503 service is stopped`. DevSpeak Labs runs its own self-hosted instacloud-oss box (`cloud.devspeak.dev`) for every backend except DevSpeak. The extension is not in the Chrome Web Store yet, so moving the API breaks no installed user.

## Decision

- Project `skipsponsor` on the box: `compute/api` (the `infra/Dockerfile.api` image, ceiling 1 vCPU / 256 MB, always on), managed `postgres/db` (Postgres 16) and managed `redis/cache`. Public origin: `https://api-skipsponsor-main.cloud.devspeak.dev` (Let's Encrypt).
- The extension's production API origin is that host: `npm run package:store` builds the store zip with it.
- The platform standard applies: `GET /api/health`, JSON log lines with `correlation_id`, `x-correlation-id` from the extension (one per user action), the outbound retry policy, the message catalog and the adapter boundary, each with a guard test.
- The cost guard stays: `LLM_DAILY_BUDGET_USD=2`, `DAILY_ANALYSES_PER_INSTALL=25`.

## Consequences

- Runbook: [`docs/runbooks/deploy-box.md`](../runbooks/deploy-box.md). `deploy-instacloud.md` is historical.
- The box stops outside its schedule (07:00–21:00 Bogotá, Mon–Fri, as of 2026-10-12). The extension already degrades to community segments and plays videos normally when the API is unreachable.
- The AI key is set by the owner (file → stdin script); until then `/api/health` reports `degraded` with `llm: down` and fresh analyses answer `503 llm_not_configured`.
