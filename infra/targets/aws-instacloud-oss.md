# Target: instacloud-oss on AWS

Planned. Self-hosted instacloud-oss on the DevSpeak AWS box (`notes/cto/plans/2026-10-12-aws-instacloud-oss-plan.md`): project `skipsponsor` with the API image, Postgres and Redis. The extension is built with `VITE_API_BASE_URL=https://api-skipsponsor-main.cloud.devspeak.dev` (plan §2, product mapping). Values are filled in by the AWS plan's Phases 2/3.

| Name                                                                                                              | Kind      | Source                                                                           |
| ----------------------------------------------------------------------------------------------------------------- | --------- | -------------------------------------------------------------------------------- |
| `DATABASE_URL`                                                                                                    | binding   | project Postgres (TODO: confirm the OSS binding command)                         |
| `REDIS_URL`                                                                                                       | binding   | project managed Redis (TODO: optional; confirm the binding)                      |
| `PORT`                                                                                                            | platform  | injected by instacloud-oss (TODO: confirm)                                       |
| `NODE_ENV`                                                                                                        | image     | `production` (Dockerfile)                                                        |
| `INSTALL_TOKEN_SECRET`                                                                                            | secret    | new value, `openssl rand -base64 48` piped on stdin                              |
| `ANTHROPIC_API_KEY`                                                                                               | secret    | owner-run script, piped on stdin (TODO: script for the OSS CLI)                  |
| `TRUST_PROXY`                                                                                                     | config    | `1` (io-edge Caddy in front)                                                     |
| `CORS_ORIGIN`                                                                                                     | secret    | `chrome-extension://<item id>`                                                   |
| `PG_POOL_MAX`, `CACHE_TTL_DAYS`, `LLM_DAILY_BUDGET_USD`, `DAILY_ANALYSES_PER_INSTALL`, `INSTALLS_PER_IP_PER_HOUR` | config    | same values as `instacloud-cloud.md` (TODO: confirm)                             |
| `DB_MIGRATE_ON_START`                                                                                             | config    | TODO                                                                             |
| `GIT_COMMIT_SHA`                                                                                                  | config    | TODO: set by push-to-deploy or the deploy script                                 |
| `VITE_API_BASE_URL` (extension build)                                                                             | build env | `https://api-skipsponsor-main.cloud.devspeak.dev` (TODO: confirm the final host) |

Backups: nightly `pg_dump` to the `devspeak-cloud-backups` bucket (AWS plan). TODO: smoke test = `GET /healthz` returns the deployed `commit`, `GET /readyz` returns `persistence: "postgres"`.
