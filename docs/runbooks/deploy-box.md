# Runbook: the API on DevSpeak Labs Cloud (the box)

Decision record: [ADR 0002](../adr/0002-api-hosting-devspeak-labs-cloud.md). Agents run the CLI as `insta --agent …` with `INSTA_API_URL=https://api.cloud.devspeak.dev` and the operator token; operator scripts live outside the repository (`~/.local/state/mig-ad-ss/`).

## What exists

| Item | Value |
| --- | --- |
| Project | `skipsponsor`, branch `main` |
| `compute/api` | `https://api-skipsponsor-main.cloud.devspeak.dev`, port 3000, always on, ceiling 1 vCPU / 256 MB |
| `postgres/db` | Postgres 16, managed; nightly `pg_dump` by the box's backup job; scales to zero after 10 idle minutes |
| `redis/cache` | managed Redis (read-through cache; never authoritative) |

### Environment of `compute/api` (names only)

| Name | Kind | Value / source |
| --- | --- | --- |
| `DATABASE_URL`, `REDIS_URL` | injected by the box | the project's Postgres and Redis |
| `INSTALL_TOKEN_SECRET` | service secret | generated (`openssl rand -base64 48`) |
| `ANTHROPIC_API_KEY` | service secret | set by the owner (`notes/cto/runbooks/set-skipsponsor-anthropic-key-box.sh`); `/api/health` reports `llm: ok` |
| `TRUST_PROXY` | service secret | `1` (the box edge is in front) |
| `LLM_DAILY_BUDGET_USD` | service secret | `2` |
| `DAILY_ANALYSES_PER_INSTALL` | service secret | `25` |
| `CACHE_TTL_DAYS` | service secret | `30` (must match `PRIVACY.md`) |
| `PG_POOL_MAX` | service secret | `3` |
| `INSTALLS_PER_IP_PER_HOUR` | service secret | `20` |
| `CORS_ORIGIN` | service secret | unset until the store item exists, then `chrome-extension://<item id>` |
| `SPONSORBLOCK_ENABLED` | (unset) | must stay unset or `0`: SponsorBlock data is CC BY-NC-SA. `/readyz` must report `sponsorblock: "off"` |
| `NODE_ENV`, `PORT`, `GIT_COMMIT_SHA` | image | `production`, `3000`, the build commit |

## Check

```bash
curl -s https://api-skipsponsor-main.cloud.devspeak.dev/api/health   # {status, service, version, commit, checks, time}
curl -s https://api-skipsponsor-main.cloud.devspeak.dev/readyz       # persistence, redis, ai, sponsorblock
```

`/api/health` is `degraded` while `llm` is `down` (no AI key) or the cache is down, `down` (503) when Postgres does not answer.

## Release

```bash
npm ci && npm run verify
docker buildx build --platform linux/amd64 --build-arg GIT_COMMIT_SHA=$(git rev-parse --short=7 HEAD) \
  -f infra/Dockerfile.api -t <registry>/skipsponsor-api:<sha> --load .
docker push <registry>/skipsponsor-api:<sha>
# on the box host, as root over SSM (the box cannot log in to ECR by itself):
#   aws ecr get-login-password | docker login --username AWS --password-stdin <registry>
#   docker pull <registry>/skipsponsor-api:<sha>
insta --agent deploy --image <registry>/skipsponsor-api:<sha> --group api --port 3000
```

Pre-pull before every deploy: a deploy that has to pull on its own can leave the API down while the pull runs. After the deploy, `/api/health` must report the new `commit` with `status: ok`; otherwise deploy the previous tag again.

| Date | Image | Change |
| --- | --- | --- |
| 2026-10-12 | `59e4c41` | first deploy on the box |
| 2026-10-13 | `3628a1b` | SSRF allowlist matches the parsed host (`b75fbc7`): https only, no credentials, `youtube.com`/`*.youtube.com` `/api/timedtext` or exactly `sponsor.ajay.app` |
| 2026-10-13 | `20687a1` | First-party promos reported as self-promo, never auto-skipped (`fc55059`); no `temperature` for Claude 5.x / Opus 4.7+ / unknown ids, so the Sonnet re-ask works (`f0bc002`, `8ecbbde`); `SPONSORBLOCK_ENABLED` off by default (`20687a1`): no SponsorBlock lookups, no transcript → `unanalyzable`. Health gate also requires `/readyz` `ai: configured` and `sponsorblock: off` |

Migrations: `DATABASE_URL=<project url, sslmode=verify-full> npx tsx src/api/db/migrate-cli.ts` from a laptop (advisory-locked, ledgered, safe to re-run). Rollback: deploy the previous image tag.

## Extension build for the Chrome Web Store

```bash
npm run package:store      # VITE_API_BASE_URL=https://api-skipsponsor-main.cloud.devspeak.dev → release/skipsponsor-ai-<version>.zip
```

After the first upload, set `CORS_ORIGIN=chrome-extension://<item id>` on `compute/api` and restart it.

## Cost guard rails

- `LLM_DAILY_BUDGET_USD=0` turns every Claude call off at once; `insta --agent compute stop api` takes the API offline (the extension keeps playing videos; already-loaded segments still skip).
