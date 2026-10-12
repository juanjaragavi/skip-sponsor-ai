# Target: local

API on `:3040` (`npm run dev:api`), extension dev server on `:5174`, Postgres `:5434` and Redis `:6380` from `infra/docker-compose.yml`. `npm run dev:tunnel` exposes the API through a Cloudflare quick tunnel and builds `dist/extension-tunnel/` against it.

| Name                                                                             | Source                                                                                         |
| -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `PORT`                                                                           | optional; `package.json` `config.port` (3040) when unset                                       |
| `DATABASE_URL`                                                                   | `.env`, pointing at the compose Postgres on 5434 (unset = in-memory store)                     |
| `REDIS_URL`                                                                      | `.env`, optional (compose Redis on 6380)                                                       |
| `PERSISTENCE`, `PG_POOL_MAX`, `CACHE_TTL_DAYS`                                   | `.env`, optional (defaults in `src/api/config.ts`)                                             |
| `ANTHROPIC_API_KEY`                                                              | `.env`, optional; without it fresh analyses answer 503 `llm_not_configured`                    |
| `INSTALL_TOKEN_SECRET`                                                           | `.env`, optional in development (any opaque token accepted)                                    |
| `CORS_ORIGIN`, `TRUST_PROXY`, `GLOBAL_KILL`                                      | `.env`, optional                                                                               |
| `DAILY_ANALYSES_PER_INSTALL`, `LLM_DAILY_BUDGET_USD`, `INSTALLS_PER_IP_PER_HOUR` | `.env`, optional                                                                               |
| `MIGRATIONS_DIR`                                                                 | optional; `npm run db:migrate` defaults to `infra/db/migrations`                               |
| `GIT_COMMIT_SHA`                                                                 | optional; `/healthz` reports `"unknown"` when unset                                            |
| `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`                              | compose defaults in `infra/docker-compose.yml`                                                 |
| `VITE_API_BASE_URL`                                                              | unset in development (defaults to `http://localhost:3040`); `dev:tunnel` sets it for its build |
| `DEV_TUNNEL_NAME`, `DEV_TUNNEL_HOSTNAME`                                         | shell, optional named tunnel (README, "Local tunnel")                                          |
