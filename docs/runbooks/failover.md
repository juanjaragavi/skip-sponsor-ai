# Failover: running SkipSponsor somewhere else (LF-6)

Status: documented, not rehearsed. Switching DNS or shipping a store update is the owner's decision at the moment of use.

## What depends on what

- The **extension** is distributed by the Chrome Web Store. It has the API origin baked in at build time (`VITE_API_BASE_URL`; store builds use `https://api-skipsponsor-main.cloud.devspeak.dev`, `package.json` `package:store`). Changing the origin needs a store release (review delay), so the fast path is to keep the hostname and move what it points to.
- The **API** is one stateless container (`infra/Dockerfile.api`, Fastify on 3000) plus Postgres 16 (source of truth) and an optional Redis cache. It runs today on the self-hosted box (`docs/runbooks/deploy-box.md`).

## Zero-cash fallback options

1. **Any Docker host** (another box, a laptop behind a Cloudflare tunnel for an emergency): `docker build -f infra/Dockerfile.api .`, run it with the same env names as `infra/targets/aws-instacloud-oss.md`, `DATABASE_URL` pointing at a Postgres restored from the newest nightly dump (`~/Backups/devspeak-labs/cloud-box/<stamp>/skipsponsor-main-pg-db/app.dump`, restore steps in `devspeak-cloud/docs/backups.md`). Health gate: `GET /healthz` and `GET /api/health` (`status: ok`).
2. **Point the hostname at it:** `api-skipsponsor-main.cloud.devspeak.dev` is a DNS name we control, so a record change (owner action) moves every installed extension with no store release. The Anthropic key goes into the new host's secrets by the owner (never from a laptop `.env`).
3. **Degraded but safe:** with no API reachable, the extension gets no analyses and skips nothing. SkipSponsor stores no accounts or personal data, so none is at risk.

## Tested build commands (local, 2026-10-14)

- `npm run local -- up --prod`: `npm run build:api` + `node dist/api/server.mjs` with `NODE_ENV=production`, production extension build, local-smoke green (`docs/LOCAL_TESTING.md`).
