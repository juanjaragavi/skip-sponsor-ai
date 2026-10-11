# AGENTS.md

Guidance for AI coding agents (Claude Code, Codex, OpenCode, Hermes, and others) working in this repository. `CLAUDE.md` imports this file; keep shared instructions here.

## Project Overview

**SkipSponsor AI** is an MV3 Chrome extension that detects in-video sponsor reads on YouTube via caption analysis using Anthropic Claude and auto-seeks past them. The complete technical specification is at [skip-sponsor-ai-technical-spec.md](./skip-sponsor-ai-technical-spec.md) — read this first for any implementation task.

**Tech Stack Summary:**

- **Extension:** TypeScript 5.5 + Chrome MV3 + Vite 7 + CRXJS
- **Backend:** Node.js + Fastify 5 + Zod
- **LLM:** Anthropic `claude-haiku-4-5-20251001` (primary) / `claude-sonnet-5-5` (fallback). Source of truth: `MODEL_POLICY` in `src/shared/constants.ts`
- **Persistence:** in-memory `MemorySegmentRepository` today (`getRepository()` in `src/api/repositories/segment-repository.ts`). PostgreSQL 16 + Redis 7 are provisioned (`infra/docker-compose.yml`, `infra/db/migrations/001_init.sql`, Terraform) and `pg` / `ioredis` are installed, but no repository uses them yet
- **Infrastructure:** Docker 24, Terraform 1.9, AWS ECS Fargate + ALB
- **CI/CD:** GitHub Actions (`.github/workflows/ci.yml`: lint, typecheck, test with coverage, extension build) + ESLint + Prettier + Vitest + Playwright

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
│   │   ├── transcript.ts          # Reads YouTube's transcript panel
│   │   ├── video-adapter.ts       # VideoAdapter interface + DomVideoAdapter
│   │   ├── skip-guard.ts          # Skip loop guard
│   │   ├── settings.ts            # Policy in chrome.storage.sync
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
│   │   │   ├── sponsorblock.ts    # SponsorBlock fallback
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
│       └── ci.yml                 # lint, typecheck, test --coverage, build:extension
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
- **Batching:** `LLM_BATCH_CUES` (350) caption cues per call with `LLM_BATCH_OVERLAP_CUES` (25) overlap; `chunkTranscript()` windows are 60s with 10s overlap
- **Confidence threshold:** 0.78 default (range 0.5–0.95)
- **System prompt:** `SYSTEM_PROMPT` in `src/shared/constants.ts` (spec §5.4)

### Cache & Persistence

- **Repository today:** in-memory map keyed by `videoId`, TTL 30d (`MemorySegmentRepository`)
- **Planned Redis:** `seg:{videoId}` → JSON `VideoAnalysis`, TTL 30d (spec; not implemented)
- **PostgreSQL schema:** `video_analyses` table (indexed on `expires_at`, `channel_id`), `sponsor_segments` with GIST exclusion for overlapping segments, `telemetry_events` — in `infra/db/migrations/001_init.sql`, not yet read or written by the API
- **In-flight deduplication:** the service worker's `inflight` map prevents duplicate API calls for the same `videoId`
- **Chrome storage:** policy in `chrome.storage.sync`, install token in `chrome.storage.local`; not server-side

## Testing Strategy

### Unit Tests (Vitest, ≥80% coverage gate)

- `mergeSegments()`, `thresholdFilter()`, `chunkTranscript()`, `decideSkip()` (files in `src/tests/unit/`)
- LLM mock returns fixed JSON
- `VideoAdapter` stubbed for content-script testing
- Route tests run in-process with `app.inject()` (`src/tests/unit/analyze-route.test.ts`)

### Contract Tests (Pact + Schemathesis — spec target, not implemented)

- All `/v1/*` endpoints tested against Zod schemas
- Contract validation in CI; schema drift fails pipeline
- No such suite or `src/tests/integration/` directory exists yet

### E2E Tests (Playwright + fixture YouTube page)

- Load extension, play 3 fixture videos (pre-roll sponsor, mid-roll, no sponsor) against the fixture page and fake API in `src/tests/e2e/fixtures/`
- Assert skip execution + undo toast rendering
- Precision/recall gate before promotion

### Manual QA Checklist

- [ ] Per-channel allow/blocklist persistence
- [ ] Notify-mode banner display
- [ ] No-captions fallback (SponsorBlock API read-only)
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
- **A09 Components w/ Known Vulnerabilities:** Dependabot + `npm audit` gate (spec target; `ci.yml` does not run it and no Dependabot config exists yet)
- **A10 SSRF:** Allowlist enforcement (`assertFetchAllowed()` in `src/api/services/transcript-fetcher.ts`) — server fetches only `*.youtube.com/api/timedtext*` and `sponsor.ajay.app`

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
