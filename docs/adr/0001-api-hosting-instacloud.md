# ADR 0001: API hosting on InstaCloud instead of AWS ECS

- **Status:** Accepted (2026-10-11)
- **Decider:** Juan Jaramillo (owner), proposed by the CTO agent
- **Supersedes:** the AWS ECS Fargate + ALB design in `infra/terraform/` and in
  `skip-sponsor-ai-technical-spec.md` §2/§6 (Anthropic key from AWS Secrets Manager)

## Context

SkipSponsor AI is a free visibility asset with low commercial priority. Its API
is one stateless Fastify container plus PostgreSQL; Redis is an optional hot
cache in front of Postgres (`src/api/persistence.ts`).

DevSpeak Labs hosts frontends on Vercel and backends on InstaCloud (company rule,
2026-10-11 hosting audit). Only DevSpeak's own backend stays on AWS, because of
its credits. Nothing of SkipSponsor was ever deployed to AWS:
`api.skipsponsor.ai` and `skipsponsor.ai` do not resolve.

The Terraform path (ECS Fargate, ALB, RDS, ElastiCache, Secrets Manager) costs
a fixed monthly floor even with no traffic: ALB hours, an always-running Fargate
task, an RDS instance. It also needs Terraform state, an AWS account and IAM
for a product that has no users yet.

## Decision

Host the API on InstaCloud, project `skip-sponsor-ai` (org "DevSpeak Labs
Backend Service"):

| Piece | InstaCloud service | Notes |
| --- | --- | --- |
| API | `compute/api`, port 3000, scale-to-zero, ceiling 1 vCPU / 512 MB | Built remotely from `npm run stage:api` (`infra/Dockerfile.api`) |
| Database | `postgres/db`, Postgres 16, ceiling 2 vCPU / 2 GiB (the minimum) | `DATABASE_URL` bound into `compute/api`; TLS verified (`verify-full`) |
| Redis | none | Optional in code. Add `redis/cache` and bind `REDIS_URL` when traffic justifies it |

- Secrets live in InstaCloud user secrets scoped to `compute/api`
  (`insta secrets set … --service compute/api`), not in AWS Secrets Manager.
  `INSTALL_TOKEN_SECRET` is generated with `openssl` and piped in on stdin.
  `ANTHROPIC_API_KEY` is set by the owner with
  `notes/cto/runbooks/set-skipsponsor-anthropic-key.sh`.
- Without `ANTHROPIC_API_KEY` the API reports it rather than faking results:
  `/readyz` says `"ai":"not_configured"`, `POST /v1/segments:analyze` answers
  `503` with `reason: "llm_not_configured"`, and lookups serve only cached
  results and SponsorBlock data, labelled `status: "degraded"`.
- The extension takes the API origin from `VITE_API_BASE_URL` at build time,
  set to the InstaCloud URL or a custom domain attached later. Nothing is
  hard-coded.
- `infra/terraform/` stays in the repo, marked superseded. It is not deleted,
  in case scale ever justifies AWS.

## Consequences

- **Cost:** usage-billed. An idle scale-to-zero API and a suspended Postgres
  cost close to nothing. With no traffic there is no fixed floor like an ALB
  plus an always-on Fargate task.
- **Cold starts:** the first request after idling wakes the API (seconds) and
  Postgres (seconds). The extension already tolerates slow or failed calls:
  it keeps playback untouched and falls back to cached or community data.
  `insta compute always-on on api` removes cold starts at roughly $1–2.50/month.
- **Shared credit:** the InstaCloud org is on the Free tier with shared credit.
  Exhausting it pauses every project in the org, including paying Utilities
  backends. Keep the API **stopped** (`insta compute stop api`) until launch,
  and keep `LLM_DAILY_BUDGET_USD` low.
- **Limits:** the public URL waits at most 60 s for response headers. Long
  analyses must stay under that, or move to 202 + polling.
- **Lock-in:** low. The image is a plain Dockerfile and the database is plain
  Postgres. The Oracle VM path (`infra/oracle/`) and Terraform remain as
  alternatives.

## Alternatives considered

1. **AWS ECS Fargate + ALB (Terraform):** the original design. Rejected: fixed
   monthly floor, more moving parts, and against the hosting rule.
2. **Oracle Cloud Always Free VM (`infra/oracle/`):** $0, but we would run the
   OS, TLS, backups and monitoring ourselves, and Oracle may reclaim idle
   instances. Kept as a documented fallback.
3. **Vercel functions:** frontends only by company rule. The API also needs a
   long-lived Postgres pool and an hourly retention purge.
