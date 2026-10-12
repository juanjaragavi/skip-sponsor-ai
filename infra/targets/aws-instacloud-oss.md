# Target: DevSpeak Labs Cloud (the box, instacloud-oss on AWS)

**Live since 2026-10-12** ([ADR 0002](../../docs/adr/0002-api-hosting-devspeak-labs-cloud.md), runbook [`docs/runbooks/deploy-box.md`](../../docs/runbooks/deploy-box.md)): project `skipsponsor` with `compute/api`, `postgres/db` and `redis/cache`. The extension's store build uses `VITE_API_BASE_URL=https://api-skipsponsor-main.cloud.devspeak.dev` (`npm run package:store`).

| Name                                                                                                              | Kind      | Source                                                             |
| ----------------------------------------------------------------------------------------------------------------- | --------- | ------------------------------------------------------------------ |
| `DATABASE_URL`, `REDIS_URL`                                                                                       | injected  | the project's managed Postgres and Redis                           |
| `PORT`, `NODE_ENV`, `GIT_COMMIT_SHA`                                                                              | image     | `3000`, `production`, the build commit (`--build-arg`)             |
| `INSTALL_TOKEN_SECRET`                                                                                            | secret    | generated, set through the box API                                 |
| `ANTHROPIC_API_KEY`                                                                                               | secret    | owner-run file → stdin script (pending)                            |
| `TRUST_PROXY`                                                                                                     | config    | `1` (the box edge in front)                                        |
| `CORS_ORIGIN`                                                                                                     | secret    | `chrome-extension://<item id>` after the first store upload        |
| `PG_POOL_MAX`, `CACHE_TTL_DAYS`, `LLM_DAILY_BUDGET_USD`, `DAILY_ANALYSES_PER_INSTALL`, `INSTALLS_PER_IP_PER_HOUR` | config    | `3`, `30`, `2`, `25`, `20`                                         |
| `VITE_API_BASE_URL` (extension build)                                                                             | build env | `https://api-skipsponsor-main.cloud.devspeak.dev`                  |

Smoke test: `GET /api/health` returns the deployed `commit`; `GET /readyz` returns `persistence: "postgres"` and `redis: "ok"`.
