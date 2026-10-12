# Deploy targets

One file per place the SkipSponsor AI API (and the extension build that points at it) can run. Each lists the env var **names** the target needs and where each value comes from. Values never go in this folder, in git, in argv or in chat.

| Target                | File                                               | Status                                                                                   |
| --------------------- | -------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Local (laptop)        | [`local.md`](./local.md)                           | Works: `npm run dev:api`, `infra/docker-compose.yml`, `npm run dev:tunnel`               |
| Vercel                | [`vercel.md`](./vercel.md)                         | Not used: the API is a long-running Fastify container                                    |
| InstaCloud (hosted)   | [`instacloud-cloud.md`](./instacloud-cloud.md)     | Historical: org suspended 2026-10-12; nothing depends on it                              |
| DevSpeak Labs Cloud (the box) | [`aws-instacloud-oss.md`](./aws-instacloud-oss.md) | **Live** (2026-10-12, ADR 0002, project `skipsponsor`) |

Other descriptors already in the repo: `infra/Dockerfile.api` (the one image every target runs), `infra/oracle/` (compose + Caddy for any VPS), `infra/terraform/` (AWS ECS Fargate, the original spec target).

Rules:

- The full list of names lives in `.env.example`; `src/tests/unit/infra-agnostic-ratchets.test.ts` fails when code reads a name that is not there.
- The API reads every variable through `src/api/config.ts`. The extension's only build-time variable is `VITE_API_BASE_URL` (`vite.config.ts` → `src/shared/api-origin.ts`).
- `GET /healthz` returns `commit` from the first set of `GIT_COMMIT_SHA`, `VERCEL_GIT_COMMIT_SHA`, `SOURCE_COMMIT` (else `"unknown"`). Every target should set one so a deploy can be checked against git.
