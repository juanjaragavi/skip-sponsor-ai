# AGENTS.md

Guidance for AI coding agents (Claude Code, Codex, OpenCode, Hermes, and others) working in this repository. `CLAUDE.md` imports this file; keep shared instructions here.

## DevSpeak Labs core rules (generated)

Generated from devspeak-labs-company/rules (version 1.1.0, 2026-10-17). Do not edit here; edit rules.json and run sync-rules.
Scope: all, web, llm, api. MUST rules only; SHOULD rules and the reason for each rule are in the registry.

**Authority (AUTH)**

- **AUTH-02** T1, act then report: doc-drift fixes (not AGENTS.md, CLAUDE.md or legal), branches, worktrees, drafts, explicit-path local commits.
- **AUTH-03** T2, ask Juan first: push (Vercel deploys main on push), PRs, merges, deploys, releases, publishing, emailing others.
- **AUTH-04** T2, ask Juan first: AGENTS.md or CLAUDE.md edits, mutating cloud or SaaS actions, any spend, price or plan change.
- **AUTH-05** T3, never: move money, accept terms, or change passwords, 2FA, key scopes or IAM permissions.
- **AUTH-06** T3, never delete cloud projects, resources, databases, buckets, repos, domains or user data; report strays to Juan.
- **AUTH-07** T3, never send mass messages or run automated engagement (bulk follows, likes, DMs, email).
- **AUTH-08** Non-CTO agents commit, push or deploy only when Juan asks; the CTO logs approved T2 actions in decision-log.md.

**Git (GIT)**

- **GIT-01** Never force-push (--force, -f, --force-with-lease) or rewrite shared history.
- **GIT-02** Never run git reset --hard, filter-repo or filter-branch on main, dev or other shared branches.
- **GIT-03** Stage explicit paths only (never git add -A, git add . or commit -a); Conventional Commits, narrow diffs.
- **GIT-04** Work in a worktree under ~/GitHub/.worktrees/; leave changes you did not make in place.
- **GIT-06** Never put HTML comments with ignore, system, secret or hidden in AGENTS.md; use plain headings as markers.

**Secrets (SEC)**

- **SEC-01** Never read, print, copy or commit .env* values or secrets, or dump the environment; use variable names.
- **SEC-02** Never write tokens, keys, bypass secrets or DSNs into logs, test artifacts, transcripts, commits or docs.
- **SEC-03** Move secrets only via Juan-run file-to-stdin runbooks (vercel-env-put.py); never vercel env add from a pipe or vercel env pull.
- **SEC-04** Never put a secret in a client bundle (`NEXT_PUBLIC_*`, `VITE_*`) or import server-only modules client-side.

**Gates (GATE)**

- **GATE-01** Never raise a budget, baseline or threshold, add skip/only, or edit AGENTS.md to pass a failing gate.
- **GATE-02** Only the CTO changes a test baseline or ratchet, with the reason logged in decision-log.md.
- **GATE-03** Run the repo's local gates before pushing; shipped means green CI on the pushed head.
- **GATE-05** Report the exact gate commands run and their results; fixing what you break is part of the task.
- **GATE-06** Never disable email confirmation or other auth checks for a test; confirm the account via the admin API.

**Models (LLM)**

- **LLM-01** Default to Claude Haiku 5.5; the repo's AGENTS.md declares its fallback chain.
- **LLM-02** OpenRouter and Cerebras are production-only user fallbacks, behind a guard on VERCEL_ENV=production or the box prod flag.
- **LLM-03** Never use OpenRouter or Cerebras for development, tests, deploys or agent harnesses.
- **LLM-04** Never send temperature, top_p or top_k to Claude Opus 4.7+ or any Claude 5.x model.
- **LLM-05** Offer only models that answer live; word a supported but unfunded one 'supported; currently unavailable'.

**Deploys (DEP)**

- **DEP-01** Deploy previews only, unless Juan approved this release and its path.
- **DEP-02** Run vercel --prod only inside an approved release script: push:prod, labs-investors-prod.sh, mig-ta/pipeline.sh.
- **DEP-03** Never vercel --prod a project with no deployments yet; its first deployment becomes production.
- **DEP-04** Before any deploy, link the worktree to the right Vercel project (vercel link --project <name>).
- **DEP-05** After a deploy, verify live: health commit equals the pushed SHA and the changed flow works.
- **DEP-06** Never npm publish or push a release tag without Juan's yes; publish from tags after a dry run.
- **DEP-07** Register each production datastore in backup-production.sh; take a verified, restored dump before any data move.
- **DEP-08** Before a box deploy, keep MemAvailable at least 600 MB and give each service a memory limit.

**Web standard (WEB)**

- **WEB-01** Every clickable shows cursor: pointer (disabled: not-allowed) via the base-layer :where() rule, with a guard test.
- **WEB-02** Titles are brand-first: Brand · Slogan on landing and dashboard, Brand · Page elsewhere.
- **WEB-03** Ship favicons, description, canonical, OG/Twitter 1200×630, robots, sitemap, app-route noindex and truthful JSON-LD.
- **WEB-04** User copy never names Supabase, Firebase, Appwrite, InstaCloud, AWS or Vercel; say DevSpeak Labs Cloud.
- **WEB-06** Every animation has a reduced-motion fallback; corporate sites add a visible Pause motion control.

**Brand and copy (BRAND)**

- **BRAND-07** Write Spanish natively (Colombian-neutral), never translated; usted on corporate surfaces and legal text.
- **BRAND-08** AI-generated images are allowed; never present generated people as clients, staff or testimonials.
- **BRAND-09** Never invent brand assets; derive them from the existing logo, design system or .pen files.

**Truth and claims (TRUTH)**

- **TRUTH-01** Never publish invented testimonials, clients, logos, ratings, metrics, versions, status, unbuilt features or legal entities.
- **TRUTH-02** Re-read the source before quoting a price, version, model or metric; downloads are not users.
- **TRUTH-03** Every figure has value, label, as-of date and linked source; industry figures are never our results.
- **TRUTH-04** Never edit privacy, terms or legal text without escalating to Juan; agents draft only.
- **TRUTH-05** Company facts come only from company.generated.ts (devspeak-labs-company); never hardcode entity, copyright or contact.

**Ports (PORT)**

- **PORT-01** Use only your repo's ports from the ~/GitHub/AGENTS.md table; reserve new ones there first.

**Local work (LOCAL)**

- **LOCAL-02** Use the repo's fixed package manager and committed lockfile; never switch or add a lockfile.

**Assets (ASSET)**

- **ASSET-01** Create Proton Drive Proyectos/<Project>/ (numbered layout, pinned offline) for every new project before its first non-code asset.
- **ASSET-02** File finished non-code assets there: copy from repos, move from Downloads or scratch, log each action, never delete, never secrets.

## End of generated rules

## Project Overview

**SkipSponsor AI** is an MV3 Chrome extension that detects in-video sponsor reads on YouTube via caption analysis using Anthropic Claude and auto-seeks past them. The complete technical specification is at [skip-sponsor-ai-technical-spec.md](./skip-sponsor-ai-technical-spec.md) — read this first for any implementation task.

**Tech Stack Summary:**

- **Extension:** TypeScript 5.5 + Chrome MV3 + Vite 7 + CRXJS
- **Backend:** Node.js + Fastify 5 + Zod
- **LLM:** Anthropic `claude-haiku-4-5-20251001` (primary) / `claude-sonnet-5-5` (fallback). Source of truth: `MODEL_POLICY` in `src/shared/constants.ts`
- **Persistence:** in-memory `MemorySegmentRepository` today (`getRepository()` in `src/api/repositories/segment-repository.ts`). PostgreSQL 16 + Redis 7 are provisioned (`infra/docker-compose.yml`, `infra/db/migrations/001_init.sql`, Terraform) and `pg` / `ioredis` are installed, but no repository uses them yet
- **Infrastructure:** Docker 24, Terraform 1.9, AWS ECS Fargate + ALB
- **CI/CD:** GitHub Actions (`.github/workflows/ci-main.yml`: lint, typecheck, test with coverage, extension build) + ESLint + Prettier + Vitest + Playwright

## Development Workflow

### Prerequisites

- Node.js 20 LTS (`engines.node >=20`; CI uses 20)
- npm (the repo ships `package-lock.json`)
- Chrome 116+
- Docker (for local PostgreSQL + Redis)

### Common Commands (`package.json` scripts)

```bash
# Install dependencies
npm ci

# Type checking
npm run typecheck

# Linting & formatting
npm run lint
npm run format                 # prettier --write on src/**/*.{ts,json,html}

# Testing
npm run test                    # Run all unit tests
npm run test:watch             # Watch mode
npm run test:coverage          # With coverage report (gate: 80%)
npm run test:e2e               # E2E with Playwright against fixture YouTube

# Build
npm run build:extension        # Bundle MV3 extension
npm run package:extension      # Build + zip for the Chrome Web Store (scripts/zip-extension.mjs)
npm run build:api              # Backend server (tsconfig.api.json)
npm run icons                  # Regenerate extension icons (scripts/build-icons.mjs)

# Local development
npm run dev:extension          # Vite HMR + CRXJS on :5174 (strictPort)
npm run dev:api                # Fastify dev server on :3040 (PORT > .env PORT > package.json config.port), tsx watch, reads .env if present

# Infrastructure (no npm scripts; run Terraform directly)
terraform -chdir=infra/terraform plan
terraform -chdir=infra/terraform apply
docker compose -f infra/docker-compose.yml up -d   # local Postgres on host 5434 + Redis on host 6380

# Code quality gates
npm run verify                 # lint + typecheck + test
```

### Local stack and tunnel

- `npm run dev:tunnel`: Cloudflare quick tunnel to the API on :3040. It starts the compose Postgres/Redis, migrates, runs `dev:api` against them, and builds `dist/extension-tunnel/` pointed at the tunnel URL for testers. There are no inbound webhooks.
- `npm run db:dump:local` / `npm run db:restore:local -- <file> --yes`: `pg_dump -Fc` backups of the compose Postgres into `.backups/local/`.

## Architecture & Component Topology

### High-Level Flow

```
YouTube watch page (captions available)
  ↓
Content Script (VideoAdapter, transcript reader, Policy Engine, Skipper)
  ↓ chrome.runtime message
Service Worker (in-flight dedupe, install token, chrome.storage)
  ↓ GET /v1/segments/{videoId}, POST /v1/segments:analyze
Fastify API (/v1/segments)
  ↓ cache miss → classify with Claude
Claude LLM (Haiku primary, Sonnet fallback)
  ↓ persist + cache
SegmentRepository (in-memory today, TTL 30d; Postgres + Redis planned)
```

### Directory Structure

```
.
├── src/
│   ├── extension/
│   │   ├── content-script.ts      # Detector + Skipper
│   │   ├── main-world.ts          # MAIN-world script (document_start)
│   │   ├── service-worker.ts      # API calls, in-flight dedupe, install token
│   │   ├── policy.ts              # decideSkip() policy engine + DEFAULT_POLICY
│   │   ├── segments.ts            # isInSegment(), mergeSegments(), thresholdFilter()
│   │   ├── innertube-transcript.ts # Transcript via YouTube's modern transcript panel API (get_panel, page context)
│   │   ├── transcript.ts          # Fallback: reads the rendered transcript panel; cue building
│   │   ├── video-adapter.ts       # VideoAdapter interface + DomVideoAdapter
│   │   ├── skip-guard.ts          # Skip loop guard
│   │   ├── settings.ts            # Policy in chrome.storage.sync
│   │   ├── sponsorblock-gate.ts   # Extension SponsorBlock switch (default off)
│   │   ├── view-model.ts          # UI view models
│   │   ├── toast.ts               # Shadow DOM toast UI
│   │   ├── popup.{html,ts,css}    # Toolbar popup
│   │   ├── options.{html,ts,css}  # Options page
│   │   ├── ui/                    # brand.ts, icons.ts, tokens.css
│   │   └── manifest.json
│   ├── api/
│   │   ├── server.ts              # Fastify setup, RFC7807 error handler, rate limit, /healthz
│   │   ├── config.ts              # PORT, API_BASE, ANTHROPIC_API_KEY, DATABASE_URL, REDIS_URL, GLOBAL_KILL
│   │   ├── routes/
│   │   │   ├── segments.ts        # GET/POST/DELETE /v1/segments*
│   │   │   ├── telemetry.ts       # POST /v1/telemetry
│   │   │   └── installs.ts        # POST /v1/installs, GET /v1/config
│   │   ├── services/
│   │   │   ├── llm-client.ts      # classifyChunks(): Anthropic + opossum circuit breaker
│   │   │   ├── chunker.ts         # parseTimedText(), chunkTranscript()
│   │   │   ├── candidate-validation.ts
│   │   │   ├── gap-corroboration.ts
│   │   │   ├── segment-classifier.ts
│   │   │   ├── sponsorblock.ts    # SponsorBlock fallback (off unless SPONSORBLOCK_ENABLED)
│   │   │   └── transcript-fetcher.ts  # SSRF allowlist + timedtext fetch
│   │   └── repositories/
│   │       └── segment-repository.ts   # SegmentRepository interface + in-memory impl
│   ├── shared/
│   │   ├── types.ts               # SponsorSegment, VideoAnalysis, UserPolicy
│   │   ├── validators.ts          # Zod schemas for API contracts
│   │   ├── messages.ts            # Extension message types
│   │   ├── speech.ts
│   │   └── constants.ts           # MODEL_POLICY, SYSTEM_PROMPT, thresholds
│   ├── types/opossum.d.ts
│   └── tests/
│       ├── unit/                  # Vitest
│       └── e2e/                   # Playwright + fixture YouTube page and fake API
├── infra/
│   ├── terraform/
│   │   ├── main.tf
│   │   └── ecs.tf
│   ├── db/migrations/001_init.sql # Postgres schema (not yet wired into the API)
│   ├── Dockerfile.api
│   └── docker-compose.yml         # Local dev (postgres + redis)
├── .github/
│   └── workflows/
│       └── ci-main.yml            # lint, typecheck, test --coverage, build:extension
├── scripts/                       # build-icons.mjs, zip-extension.mjs, build-store-assets.py
├── package.json
├── tsconfig.json / tsconfig.api.json
├── vite.config.ts                 # Extension bundling via CRXJS
├── vitest.config.ts
├── playwright.config.ts
└── skip-sponsor-ai-technical-spec.md  # Complete specification
```

## Key Design Patterns & Conventions

### TypeScript Standards

- `strict: true`, `noUncheckedIndexedAccess: true`
- No `any` without `// eslint-disable + justification`
- Path aliases: `@/` → `src/`
- Import order: third party → local (no React or Next.js in this repo)
- **Company facts** (TRUTH-05): `src/shared/company.generated.ts`.

### Content Script Architecture

- **VideoAdapter:** Interface wrapping DOM video access for testability (`src/extension/video-adapter.ts`)
- **Detector:** Pure functions (`isInSegment()`, `mergeSegments()`, `thresholdFilter()` in `src/extension/segments.ts`; server-side windowing is `chunkTranscript()` in `src/api/services/chunker.ts`)
- **Policy Engine:** Centralized skip decision logic in `decideSkip()` (`src/extension/policy.ts`) — `!globalKill && globalEnabled && mode !== "off" && !userOverridden && !channelBlocked && category === "sponsor" && confidence >= threshold`; `mode === "notify"` notifies instead of skipping
- **No framework:** Vanilla TypeScript to avoid CSP collisions with YouTube

### Backend Service Pattern

Route → Zod validator → Service → Repository

- All database access via `SegmentRepository` (never raw SQL in routes)
- LLM calls through `classifyChunks()` in `src/api/services/llm-client.ts`, with circuit breaker (`opossum`, exported as `llmBreaker`)
- Structured logging: Fastify's built-in pino logger (`logger: true`), JSON; target fields `{reqId, videoId, latencyMs, model, confidence}`

### API Contracts

- All endpoints return RFC7807-style problem bodies (`type`, `title`, `status`, `detail`, `instance`) on error
- Zod validation on all inputs
- Rate limit: 500 req/min per IP (`@fastify/rate-limit` in `src/api/server.ts`); the spec's 60 req/min/install limit is not implemented
- Install-token auth: two random UUIDs generated by the service worker, stored client-side in `chrome.storage.local`

### Data Model

See `src/shared/types.ts` for domain types:

- `SponsorSegment`: `{id, videoId, channelId, startTime, endTime, confidence, category, source, createdAt}`
- `VideoAnalysis`: `{videoId, duration, language, status, segments, transcriptVersion, analyzedAt}`
- `UserPolicy`: `{globalEnabled, mode, confidenceThreshold, blockedChannels, allowlistedChannels}`

### LLM Classification

- **Model policy:** Haiku primary (0.8s, 1/5 cost), Sonnet fallback for ambiguous (0.55–0.78 confidence, `MODEL_POLICY.reviewBand`)
- **Temperature:** 0 (deterministic JSON)
- **Sampling params:** `acceptsTemperature()` (`llm-client.ts`) sends `temperature: 0` only to Claude ≤ 4.6; Claude 5.x, Opus 4.7/4.8 and unknown ids get none (they answer 400). First-party promotions are returned as `selfpromo` (shown, never auto-skipped).
- **Batching:** `LLM_BATCH_CUES` (350) caption cues per call with `LLM_BATCH_OVERLAP_CUES` (25) overlap; `chunkTranscript()` windows are 60s with 10s overlap
- **Confidence threshold:** 0.78 default (range 0.5–0.95)
- **Production-only providers (LLM-02):** this repo calls neither today; a new path must add the guard.
- **System prompt:** `SYSTEM_PROMPT` in `src/shared/constants.ts` (spec §5.4)

### Cache & Persistence

- **Repository today:** in-memory map keyed by `videoId`, TTL 30d (`MemorySegmentRepository`)
- **Planned Redis:** `seg:{videoId}` → JSON `VideoAnalysis`, TTL 30d (spec; not implemented)
- **PostgreSQL schema:** `video_analyses` table (indexed on `expires_at`, `channel_id`), `sponsor_segments` with GIST exclusion for overlapping segments, `telemetry_events` — in `infra/db/migrations/001_init.sql`, not yet read or written by the API
- **In-flight deduplication:** the service worker's `inflight` map prevents duplicate API calls for the same `videoId`
- **Chrome storage:** policy in `chrome.storage.sync`, install token in `chrome.storage.local`; not server-side
- Pointer cursor (ES-6.6): src/extension/ui/tokens.css (popup + options) and the toast's shadow CSS; disabled → not-allowed. Guards: src/tests/unit/cursor-pointer.test.ts, src/tests/e2e/cursor-pointer.spec.ts.

## Testing Strategy

### Unit Tests (Vitest, ≥80% coverage gate)

- `mergeSegments()`, `thresholdFilter()`, `chunkTranscript()`, `decideSkip()` (files in `src/tests/unit/`)
- LLM mock returns fixed JSON
- `VideoAdapter` stubbed for content-script testing
- Route tests run in-process with `app.inject()` (`src/tests/unit/analyze-route.test.ts`)
- Coverage gate: lines/branches/functions ≥80% (`vitest.config.ts`). Vitest 4 counts only files a test imports. Claude calls are tested via a fake `@anthropic-ai/sdk` (`llm-classify.test.ts`), DOM code via a stubbed `document`/`location` (`dom-video-adapter.test.ts`; no jsdom dependency), and Postgres/Redis wiring via fake clients (`persistence-postgres-wiring.test.ts`).
- CI: `.github/workflows/ci-main.yml` on main pushes, PRs and `gh workflow run ci-main.yml`. The file was renamed from `ci.yml` on 2026-10-13 because the old registration (from the billing lock) never received push events.

### Contract Tests (Pact + Schemathesis — spec target, not implemented)

- All `/v1/*` endpoints tested against Zod schemas
- Contract validation in CI; schema drift fails pipeline
- No such suite or `src/tests/integration/` directory exists yet

### E2E Tests (Playwright + fixture YouTube page)

- Load extension, play 3 fixture videos (pre-roll sponsor, mid-roll, no sponsor) against the fixture page and fake API in `src/tests/e2e/fixtures/`
- Assert skip execution + undo toast rendering
- Precision/recall gate before promotion: ≥ 95% second-level and ≥ 90% segment precision at IoU 0.5 on ≥ 150 labeled videos before a store release (2026-10-13 spike; eval scripts live in the CTO scratch `ss-precision/`: `probe.mjs`, `eval.mts`, `score.py`)
- After a Playwright version bump run `npx playwright install chromium`, or every E2E test fails with "Executable doesn't exist".

### Manual QA Checklist

- [ ] Per-channel allow/blocklist persistence
- [ ] Notify-mode banner display
- [ ] No captions → popup says "Couldn't analyze this video" and nothing is skipped (`SPONSORBLOCK_ENABLED` / `VITE_SPONSORBLOCK_ENABLED` are off by default; turn on only with written permission from SponsorBlock)
- [ ] Undo functionality (restores `startTime - 1.0s` within 100ms)
- [ ] Settings propagation <500ms

## Security & Compliance

### Secrets Management

- **Anthropic API key:** AWS Secrets Manager, injected at ECS runtime only
- **Git protection:** `git-secrets` + GitHub secret scanning block `sk-ant-*` pattern
- **Install tokens:** Opaque random, generated per browser profile

### Client Isolation

- Content script in isolated world; toast in Shadow DOM + `all:initial` CSS reset
- CSP: `script-src 'self'` only; no eval, no remote code
- Permissions: `["storage"]` only
- Host permissions: `https://www.youtube.com/*` only

### Data Privacy

- **Zero audio upload;** transcript text only
- **Retention:** 30-day TTL, hard delete after expiration
- **Telemetry:** `videoId` + event + latency only; no IP >7d
- **GDPR/CCPA:** Delete via `DELETE /v1/segments/{videoId}`, opt-out disables network calls
- **DPA:** Zero-retention inference flag with Anthropic

### OWASP Top 10 Coverage

- **A01 Broken Access Control:** Least-privilege extension permissions, install-token validation
- **A03 Injection:** Zod input validation; there is no ORM — SQL added to a repository must use parameterized `pg` queries
- **A07 Cross-Site Scripting:** textContent only (no HTML injection), Shadow DOM isolation
- **A09 Components w/ Known Vulnerabilities:** Dependabot + `npm audit` gate (spec target; `ci-main.yml` does not run `npm audit`; Dependabot runs weekly from `.github/dependabot.yml`)
- **A10 SSRF:** Allowlist enforcement (`assertFetchAllowed()` in `src/api/services/transcript-fetcher.ts`) — server fetches only `*.youtube.com/api/timedtext*` and `sponsor.ajay.app`. `sponsor.ajay.app` is only contacted when `SPONSORBLOCK_ENABLED=1`.

## Performance Targets

| Metric                                 | Target     |
| -------------------------------------- | ---------- |
| End-to-end analysis (captions → ready) | p95 <4.0s  |
| Skip trigger latency                   | p95 <300ms |
| Client overhead (idle / active)        | <2% / <5%  |
| Backend availability                   | 99.9% SLA  |
| Cost per video analysis                | ≤$0.004    |
| Cache hit rate                         | ≥65%       |

## Observability & Monitoring

Spec §7 targets. Only Fastify's pino request logging exists in code today; Prometheus metrics, OpenTelemetry tracing, CloudWatch shipping, and Sentry are not implemented.

### Metrics (Prometheus)

- `analysis_latency_ms_histogram`
- `skip_trigger_latency_ms`
- `llm_cost_per_video`
- `cache_hit_ratio`, `fallback_rate`, `undo_rate`
- **Alerts:** `p95_analysis>4s 5m`, `llm_error_rate>5% 10m`, `cache_hit<50% 1h`

### Tracing (OpenTelemetry)

- `traceId` flows SW → API → Claude
- Sampled at 10%

### Logging (Pino → CloudWatch)

- Structured JSON logs: `{reqId, videoId, latencyMs, model, confidence}`
- Transcript full-text: debug only, redacted after 7d
- Sentry DSN in SW + content script; `beforeSend` strips URLs to `videoId` only

### Release & Rollback

- Semantic versioning (major.minor.patch)
- The box API is redeployed with a pre-pull and a health gate (`commit` and `status: ok`), with automatic rollback (`docs/runbooks/deploy-box.md`).
- Staged rollout: 5% → 50% → 100% via Chrome Web Store
- Kill-switch: `GET /v1/config` flag `globalKill` (env `GLOBAL_KILL=1`) disables auto-skip in <5min without extension update. `decideSkip()` honors it, but the content script still passes `globalKill: false`; wire the fetched flag through before relying on it

## Common Implementation Tasks

### Adding a New Classification Category

1. Update `SegmentCategory` type in `src/shared/types.ts`
2. Add category to database `sponsor_segments.category` CHECK constraint (`infra/db/migrations/001_init.sql`)
3. Update the LLM system prompt (`SYSTEM_PROMPT` in `src/shared/constants.ts`)
4. Add unit test case in `src/tests/unit/classifier.test.ts`
5. Add telemetry event tracking in content script

### Extending the API

1. Define Zod schema in `src/shared/validators.ts`
2. Create route handler in `src/api/routes/*.ts`
3. Add an in-process route test (`app.inject()`) in `src/tests/unit/`, like `analyze-route.test.ts`
4. Document endpoint in RFC7807 problem response style
5. Update rate-limit configuration if needed

### Debugging Extension Issues

1. Load unpacked extension via `chrome://extensions/` → Developer Mode
2. Inspect background service worker via Service Workers panel
3. Inspect content script via YouTube DevTools → Console (select `youtube.com` context)
4. Check `chrome://storage/` for local/sync storage state
5. Review `chrome://net-internals/#events` for API request logs

## Relevant Technical Specification Sections

- **§1:** Functional & non-functional requirements, acceptance criteria
- **§2:** Tech stack justifications and trade-off rationale
- **§3:** Component topology, design patterns, failure modes
- **§4:** Data model and PostgreSQL schema
- **§5:** API contracts and LLM prompt engineering
- **§6:** Security controls and compliance rules
- **§7:** Coding standards, testing, observability

## Resources & References

- [Anthropic API Docs](https://docs.anthropic.com)
- [Chrome Extension Docs (MV3)](https://developer.chrome.com/docs/extensions/)
- [Fastify Docs](https://www.fastify.io/)
- [Vitest Docs](https://vitest.dev/)
- [Playwright Docs](https://playwright.dev/)
- [Terraform AWS Provider Docs](https://registry.terraform.io/providers/hashicorp/aws/latest)
