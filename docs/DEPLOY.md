# Deploying the SkipSponsor AI API

The extension needs one HTTPS API. It is a single stateless container plus
PostgreSQL. Redis is optional; skip it at launch. The API is hosted on
**InstaCloud** ([ADR 0001](adr/0001-api-hosting-instacloud.md)). The live
project, its URL and the verified commands are in
[runbooks/deploy-instacloud.md](runbooks/deploy-instacloud.md). This guide
keeps the generic steps and an **Oracle Cloud Always Free VM** fallback. The
AWS Terraform in `infra/terraform` is superseded.

- [What you deploy](#what-you-deploy)
- [Production environment](#production-environment)
- [Option A: InstaCloud](#option-a-instacloud-preferred)
- [Option B: Oracle Cloud Always Free VM](#option-b-oracle-cloud-always-free-vm)
- [Build and publish the extension](#build-and-publish-the-extension)
- [Operating it](#operating-it)

## What you deploy

| Piece | Required | Notes |
| --- | --- | --- |
| API container | Yes | Image from `infra/Dockerfile.api` (Node 22, runs as `node`, listens on `PORT`, default 3000). Liveness `GET /healthz`, readiness `GET /readyz` (gates on Postgres; also reports `redis` and `ai`). |
| PostgreSQL 16+ | Yes | The shared analysis cache. Schema: `infra/db/migrations/*.sql`, applied by `node dist/api/migrate.mjs`. Migration 001 creates the `pgcrypto` and `btree_gist` extensions, so the database user must be allowed to create them. |
| Redis 7 | No | Hot cache in front of Postgres (`REDIS_URL`). Postgres alone meets the cache-hit goal across instances. |

One API instance is enough for launch. Analyses are cached in Postgres for
`CACHE_TTL_DAYS`, so a restart or a second instance never pays twice for the
same video.

Build a self-contained context (Dockerfile at its root) for hosts that build
"the directory's Dockerfile":

```bash
npm ci
npm run stage:api            # → dist/deploy-api/ (no .env files, API sources only)
```

## Production environment

Set these on the host. Never commit them. `.env.example` lists every name.

| Variable | Value | Why |
| --- | --- | --- |
| `NODE_ENV` | `production` | Turns on the startup checks below. |
| `DATABASE_URL` | Postgres connection string (`?sslmode=require` when remote; pinned to `verify-full`) | Persistence. The API refuses to start in production without it, unless `PERSISTENCE=memory` is set. |
| `INSTALL_TOKEN_SECRET` | 32+ random characters (`openssl rand -base64 48`) | Signs install tokens. Required in production. Rotating it invalidates every token; extensions fetch a new one on the next 401. |
| `ANTHROPIC_API_KEY` | Your key | Without it `POST /v1/segments:analyze` answers 503 `llm_not_configured` and lookups serve only cached and SponsorBlock data (`status: "degraded"`). No Claude call is attempted. |
| `LLM_DAILY_BUDGET_USD` | e.g. `2` | Global daily LLM spend cap (estimated from token usage × list price). `0` turns the LLM off. |
| `DAILY_ANALYSES_PER_INSTALL` | e.g. `25` | Fresh analyses one browser may trigger per UTC day. Cached videos never count. |
| `TRUST_PROXY` | `1` | Both hosts below put a proxy in front: rate limits must see the client IP. |
| `CORS_ORIGIN` | `chrome-extension://<item id>` | Unset allows any `chrome-extension://` origin. Pin it once the store assigns the item ID. |
| `REDIS_URL` | optional | `rediss://` URLs get TLS with SNI. |
| `CACHE_TTL_DAYS` | `30` | Must match the retention in `PRIVACY.md`. |
| `PG_POOL_MAX` | `5` | Keep it small on free tiers. |
| `INSTALLS_PER_IP_PER_HOUR` | `20` | Install-token minting limit per IP. |
| `DB_MIGRATE_ON_START` | `0` (default) | `1` runs migrations in `start.sh` before the server starts. |

On boot the API prints `config warning:` lines for risky but legal settings
(no API key, unpinned CORS, `TRUST_PROXY` off) and exits with `config error:`
when a required setting is missing.

## Option A: InstaCloud (live)

Deployed and verified on 2026-10-11 as project `skip-sponsor-ai`. The exact
service names, secret names, URL, stop/start and the verification record are
in [runbooks/deploy-instacloud.md](runbooks/deploy-instacloud.md). That
runbook is authoritative; the generic outline below is for a fresh project.
Billing is by actual usage, and new compute and Postgres scale to zero when
idle. Agents add `--agent` to every command. Check flags against
`insta <command> --help` first, because the CLI changes often.

```bash
# 1. Project and services (one-time)
insta login
insta project create skipsponsor-ai
insta service add postgres db
insta service add compute api --port 3000

# 2. Credentials: bind the database, set secrets (values typed by you, never pasted into chat)
insta secrets bind DATABASE_URL postgres/db --to compute/api
openssl rand -base64 48 | insta secrets set INSTALL_TOKEN_SECRET
# ANTHROPIC_API_KEY: notes/cto/runbooks/set-skipsponsor-anthropic-key.sh (stdin, never printed)
insta secrets set NODE_ENV production
insta secrets set TRUST_PROXY 1
insta secrets set LLM_DAILY_BUDGET_USD 2
insta secrets set DAILY_ANALYSES_PER_INSTALL 25

# 3. Schema (once per release that adds a migration). The bundled runner
#    uses an advisory lock and a schema_migrations ledger, so re-running is safe.
insta run -- npm run db:migrate                     # injects the branch's DATABASE_URL; nothing on disk
#    or, after the first deploy:  insta compute exec api -- node dist/api/migrate.mjs

# 4. Build remotely from the staged context and deploy
npm run stage:api
insta build dist/deploy-api --port 3000             # local, offline readiness check
insta deploy dist/deploy-api --group api --port 3000

# 5. Verify: poll the printed URL
curl -s https://<printed-host>/healthz              # {"ok":true,"version":"1.0.0"}
curl -s https://<printed-host>/readyz               # {"ok":true,"persistence":"postgres","redis":"disabled","ai":"configured"}
```

Notes:

- **Cold starts.** A scale-to-zero service wakes on the first request, which
  adds a few seconds. Analysis requests are already slow (seconds), so this is
  acceptable at launch. `insta compute always-on on api` removes cold starts;
  the InstaCloud docs put an idle always-on minimum-spec app at about
  $1–2.50/month.
- **Custom domain.** `insta domain attach api.<your-domain>` prints the DNS
  records for a domain you own. TLS is issued by the platform.
- **Rollback.** Redeploy the previous staged context, or `insta deploy --image`
  with the previous image reference.

## Option B: Oracle Cloud Always Free VM

An Ampere A1 VM (for example 2 OCPU / 12 GB) running Docker, with Postgres in
a container next to the API and Caddy terminating TLS. Cost: $0 within the
Always Free limits. You run the OS: updates, backups and monitoring are yours.

```bash
# On the VM (Ubuntu 24.04 aarch64), as a sudo user
sudo apt-get update && sudo apt-get install -y docker.io docker-compose-v2 git
sudo usermod -aG docker "$USER" && newgrp docker

git clone https://github.com/juanjaragavi/skip-sponsor-ai.git && cd skip-sponsor-ai
cp infra/oracle/.env.example infra/oracle/.env   # fill in the values; chmod 600
chmod 600 infra/oracle/.env

docker compose -f infra/oracle/docker-compose.yml --env-file infra/oracle/.env up -d --build
docker compose -f infra/oracle/docker-compose.yml exec api node dist/api/migrate.mjs
curl -s https://api.<your-domain>/readyz
```

`infra/oracle/docker-compose.yml` runs `postgres` (internal network only, data
on a named volume), `api` (built from `infra/Dockerfile.api`, never published)
and `caddy` (ports 80/443, automatic Let's Encrypt). Before `up`:

1. Point an `A` record for `api.<your-domain>` at the VM's public IP.
2. Open TCP 80 and 443 in the VCN security list **and** in the VM firewall.
   Oracle's Ubuntu images ship restrictive iptables rules: insert ACCEPT rules
   for 80/443 and persist them.
3. Back up Postgres off the VM, e.g. a nightly
   `docker compose exec -T postgres pg_dump -U skipsponsor skipsponsor | gzip`
   to object storage.

Risks to accept knowingly: Oracle may reclaim Always Free instances it
considers idle (check the current policy; upgrading the tenancy to Pay As You
Go keeps Always Free pricing and avoids that), and a single VM has no failover.

## Build and publish the extension

The API URL is fixed at build time. Production builds fail without it, and
`npm run package:extension` refuses bundles that point at `localhost`,
`127.0.0.1` or the old placeholder host.

```bash
echo "VITE_API_BASE_URL=https://api.<your-domain>" > .env.production   # gitignored
npm run package:extension      # → release/skipsponsor-ai-<version>.zip
```

After the first store upload, copy the item ID and set
`CORS_ORIGIN=chrome-extension://<item id>` on the API.

## Operating it

- **Spend.** `SELECT * FROM llm_spend_daily ORDER BY day DESC LIMIT 7;` shows
  estimated spend, calls and tokens per UTC day. The Anthropic console stays
  the billing source of truth; set a monthly spend limit there too.
- **Emergency stop.** `LLM_DAILY_BUDGET_USD=0` stops all LLM calls (cached and
  SponsorBlock results keep working). `GLOBAL_KILL=1` is advertised to clients
  in `GET /v1/config`, but the content script does not act on it yet.
- **Retention.** The API hard-deletes expired analyses, telemetry older than
  30 days and quota counters older than 2 days every hour. Request logs are
  the host's: keep them for 7 days or less to match `PRIVACY.md`.
