> **Historical (2026-10-12).** The API moved to DevSpeak Labs Cloud (the box): [ADR 0002](../adr/0002-api-hosting-devspeak-labs-cloud.md), [`deploy-box.md`](deploy-box.md). The hosted project below is suspended; nothing depends on it.

# Runbook: deploy and operate the API on InstaCloud

The decision record is [ADR 0001](../adr/0001-api-hosting-instacloud.md).
This runbook covers the live project, so its names and URLs are real. Agents
run every command as `insta --agent …`. Humans can omit `--agent`.

## What exists

| Item | Value |
| --- | --- |
| Org | DevSpeak Labs Backend Service (`5457af74-5b2c-4731-84f0-4bc29bf7f6ef`), Free tier |
| Project | `skip-sponsor-ai` (`34a72ea1-7f91-439f-be91-44c2f56a86ad`), branch `main`, region `us-east` |
| `compute/api` | Port 3000, scale-to-zero, ceiling 1 vCPU / 512 MB. URL: `https://prod-main-api-0081d6-00y4hcqxyhb.compute.instacloud-edge.com` |
| `postgres/db` | Postgres 16, ceiling 2 vCPU / 2 GiB (the minimum), scale-to-zero (`postgres always-on off`) |
| Redis | Not provisioned (optional in code, see [Adding Redis](#adding-redis)) |
| State | **Stopped** since 2026-10-11, after verification. The URL answers `503 {"error":"service is stopped"}` |

### Environment of `compute/api`

These are names only. Values never go in docs, chat, argv or git.

| Name | Kind | Value / source |
| --- | --- | --- |
| `DATABASE_URL` | binding | `postgres/db` (`insta secrets bind DATABASE_URL postgres/db --to compute/api`) |
| `INSTALL_TOKEN_SECRET` | secret | `openssl rand -base64 48`, piped on stdin |
| `ANTHROPIC_API_KEY` | secret | **Not set yet.** The owner runs `notes/cto/runbooks/set-skipsponsor-anthropic-key.sh` |
| `TRUST_PROXY` | config | `1` (InstaCloud routes through Cloudflare) |
| `LLM_DAILY_BUDGET_USD` | config | `2` |
| `DAILY_ANALYSES_PER_INSTALL` | config | `25` |
| `CACHE_TTL_DAYS` | config | `30` (must match `PRIVACY.md`) |
| `PG_POOL_MAX` | config | `3` |
| `INSTALLS_PER_IP_PER_HOUR` | config | `20` |
| `NODE_ENV`, `PORT` | image / platform | `production` (Dockerfile), `3000` (injected) |

`CORS_ORIGIN` is unset, so any `chrome-extension://` origin is allowed. Pin it
after the first Chrome Web Store upload:
`printf 'chrome-extension://<item id>' | insta secrets set CORS_ORIGIN --service compute/api`.

## Start, stop, check

```bash
cd <repo or worktree linked to the project>     # .insta/project.json → skip-sponsor-ai
insta --agent compute start api                 # back online, auto-wake on
insta --agent compute status api                # desired vs live
curl -s https://prod-main-api-0081d6-00y4hcqxyhb.compute.instacloud-edge.com/readyz
insta --agent compute stop api                  # offline until `start` (never `delete`)
```

`/readyz` returns, for example,
`{"ok":true,"persistence":"postgres","redis":"disabled","ai":"not_configured"}`.
It answers 200 when Postgres answers. Redis and AI are reported but never gate it.

Postgres has no stop. It suspends when idle, but only while always-on is off.
Check it with `insta --agent postgres always-on --json`, which should show
`"scaleToZero": true`. On 2026-10-11 the new database turned out to be warm
(`scaleToZero: false`) with no always-on command issued, possibly after the
`postgres limits` change. It was switched back with
`insta --agent postgres always-on off db` (InstaCloud ticket
`f43ffcb9-771b-4516-8ad4-708c05aa5ffa`).

## Redeploy (a new release)

```bash
npm ci && npm run verify
npm run stage:api                                       # → dist/deploy-api (Dockerfile at root, no .env)
docker build --platform linux/amd64 -t skipsponsor-api:local dist/deploy-api   # local check first
insta --agent build dist/deploy-api --port 3000         # offline readiness verdict: deployable
insta --agent deploy dist/deploy-api --group api --port 3000
```

The deploy builds remotely, pins the image by digest and rolls `compute/api`.
After that, poll `/healthz` and `/readyz` until both return 200. The first hit
may cold-start.

Rollback: redeploy the previous commit's staged context, or
`insta --agent deploy --image <previous digest> --group api --port 3000`. The
digest of each deploy is printed and recorded in `insta agent events`.

## Migrations

Run them from a laptop. `insta run` injects the branch's `DATABASE_URL` and
writes nothing to disk:

```bash
insta --agent run -- npm run db:migrate     # "Applied: …" or "Database schema is up to date."
```

- The runner (`src/api/db/migrate.ts`) takes an advisory lock and keeps a
  `schema_migrations` ledger, so a re-run is safe. Migrations never run at
  container start unless `DB_MIGRATE_ON_START=1`.
- The repo defines no separate database roles. Migrations and the app both use
  the user InstaCloud provisions, which may create the `pgcrypto` and
  `btree_gist` extensions that migration 001 needs.
- TLS: InstaCloud's URL carries `sslmode=require`. The API pins it to
  `verify-full` (`src/api/db/connection.ts`), so the certificate and hostname
  are checked now and still will be after pg 9. TLS ends at InstaCloud's
  Postgres proxy, which is why `pg_stat_ssl` on the server reports `ssl=false`.

## The Anthropic key

Without `ANTHROPIC_API_KEY`:

- `POST /v1/segments:analyze` answers `503` with
  `reason: "llm_not_configured"`, "AI analysis is not configured". The
  extension shows "AI analysis is unavailable" once per day and keeps skipping
  community segments.
- `GET /v1/segments/:id` serves cached results or SponsorBlock data, marked
  `status: "degraded"`.
- No Claude call is attempted.

To enable the AI, the owner runs
`~/GitHub/notes/cto/runbooks/set-skipsponsor-anthropic-key.sh`. It reads the key
from `~/.hermes/.env` and pipes it to
`insta secrets set ANTHROPIC_API_KEY --service compute/api`, and never prints
it. `secrets set` redeploys `compute/api` with the key, so the service must be
started first. Then `/readyz` reports `"ai":"configured"`.

## Point the extension at the API

The extension reads the API origin at build time only:

```bash
VITE_API_BASE_URL=https://prod-main-api-0081d6-00y4hcqxyhb.compute.instacloud-edge.com npm run build:extension
# store package (also refuses localhost and placeholder hosts):
VITE_API_BASE_URL=https://<api host> npm run package:extension
```

Once a custom domain is attached (`insta domain attach api.<domain> --group api`),
rebuild with that origin instead.

## Adding Redis

The code already supports Redis (`REDIS_URL`, read-through cache in front of
Postgres, TLS with SNI for `rediss://`). It is left out to save credit. To add it:

```bash
insta --agent service add redis cache
insta --agent secrets bind REDIS_URL redis/cache --source-name REDIS_URL --to compute/api
insta --agent compute restart api            # or the next deploy
curl -s <url>/readyz                          # "redis":"ok"
```

## Cost guard rails

- The org's credit is shared. When it runs out, **every** project pauses,
  including the paying Utilities backends. Check `insta --agent billing --json`
  before starting the API, and stop it when idle periods are long.
- A warm Postgres bills RAM around the clock. After any `postgres limits`
  change, re-check that `postgres always-on` is off.
- `LLM_DAILY_BUDGET_USD=0` turns all Claude calls off immediately.
  `insta --agent compute stop api` takes the whole API offline.

## Verification record (2026-10-11)

Evidence is in the CTO scratch dir
`~/.hermes/profiles/devspeak-cto/cache/scratch/ssa-deploy/`:

- `remote-flow.json`: the extension's routes and payloads against the live URL.
  `/healthz` and `/readyz` returned 200. `POST /v1/installs` returned 201. The
  segment lookup returned 200 and its second read came from the Postgres cache.
  `analyze` returned 503 `llm_not_configured`. Telemetry returned 204. A
  correction write returned 201 and was read back.
- `ext-remote-run.json` and `.png`: the built extension in Playwright Chromium
  on a real YouTube watch page. It minted a signed token, looked up segments,
  uploaded the page transcript and received 503 `llm_not_configured`, announced
  the limit once, and skipped the SponsorBlock segment.
- `ext-stopped-run.json`: the same extension with the API stopped. It made one
  attempt per call, threw no page errors, and the video kept playing.
- `remote-db-check.json`: three migrations in the ledger, rows in
  `video_analyses` and `telemetry_events`, Postgres 16.15.
