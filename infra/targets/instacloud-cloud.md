# Target: InstaCloud (hosted)

Project `skip-sponsor-ai`, service `compute/api` from `infra/Dockerfile.api`, Postgres `postgres/db`. Stopped since 2026-10-11; the operational runbook is `docs/runbooks/deploy-instacloud.md`. Superseded as the production plan by [`aws-instacloud-oss.md`](./aws-instacloud-oss.md) (no paid InstaCloud, decision 2026-10-12).

| Name                                                                                                              | Kind      | Source                                                                               |
| ----------------------------------------------------------------------------------------------------------------- | --------- | ------------------------------------------------------------------------------------ |
| `DATABASE_URL`                                                                                                    | binding   | `insta secrets bind DATABASE_URL postgres/db --to compute/api`                       |
| `PORT`                                                                                                            | platform  | injected (3000)                                                                      |
| `NODE_ENV`                                                                                                        | image     | `production` (Dockerfile)                                                            |
| `INSTALL_TOKEN_SECRET`                                                                                            | secret    | `openssl rand -base64 48`, piped on stdin                                            |
| `ANTHROPIC_API_KEY`                                                                                               | secret    | owner-run script `notes/cto/runbooks/set-skipsponsor-anthropic-key.sh` (not set yet) |
| `TRUST_PROXY`                                                                                                     | config    | `1`                                                                                  |
| `PG_POOL_MAX`, `CACHE_TTL_DAYS`, `LLM_DAILY_BUDGET_USD`, `DAILY_ANALYSES_PER_INSTALL`, `INSTALLS_PER_IP_PER_HOUR` | config    | runbook table                                                                        |
| `CORS_ORIGIN`                                                                                                     | secret    | `chrome-extension://<item id>` after the first store upload (unset today)            |
| `REDIS_URL`                                                                                                       | binding   | not provisioned (optional)                                                           |
| `DB_MIGRATE_ON_START`                                                                                             | config    | TODO: confirm whether migrations run at start or by `migrate.mjs`                    |
| `GIT_COMMIT_SHA`                                                                                                  | config    | TODO: not set today; set to the deployed SHA on each deploy                          |
| `VITE_API_BASE_URL` (extension build)                                                                             | build env | the `compute/api` URL, in `.env.production` (gitignored)                             |
