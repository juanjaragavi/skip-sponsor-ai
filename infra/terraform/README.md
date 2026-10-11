# infra/terraform: superseded

**Superseded by [ADR 0001](../../docs/adr/0001-api-hosting-instacloud.md) on
2026-10-11.** The API runs on InstaCloud (project `skip-sponsor-ai`). The
deploy steps are in
[docs/runbooks/deploy-instacloud.md](../../docs/runbooks/deploy-instacloud.md).

This Terraform (AWS ECS Fargate + ALB, RDS, ElastiCache, Secrets Manager) was
never applied, and nothing of SkipSponsor runs on AWS. It stays here, unapplied
and unmaintained, as a starting point if scale ever justifies AWS. Re-check
every resource and variable against the current API before using it: it
predates Postgres persistence, install tokens and the cost guard.
