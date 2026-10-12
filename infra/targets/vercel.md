# Target: Vercel

**Not used.** The API is a long-running Fastify server with a Postgres pool, a Redis client and an hourly purge timer, so it runs as a container (`infra/Dockerfile.api`), not as Vercel functions. The extension ships through the Chrome Web Store, not a website.

If a marketing or privacy site is ever deployed on Vercel, list its names here. `VERCEL_GIT_COMMIT_SHA` is already the second name `/healthz` checks for the deployed commit.

| Name   | Source |
| ------ | ------ |
| (none) | —      |
