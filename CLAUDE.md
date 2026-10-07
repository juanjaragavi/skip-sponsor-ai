# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**SkipSponsor AI** is an MV3 Chrome extension that detects in-video sponsor reads on YouTube via caption analysis using Anthropic Claude and auto-seeks past them. The complete technical specification is at [skip-sponsor-ai-technical-spec.md](./skip-sponsor-ai-technical-spec.md) — read this first for any implementation task.

**Tech Stack Summary:**

- **Extension:** TypeScript 5.5 + Chrome MV3 + Vite 5 + CRXJS
- **Backend:** Node.js 20 LTS + Fastify 4 + Zod
- **LLM:** Anthropic Claude 3.5 Haiku (primary) / Sonnet (fallback)
- **Persistence:** PostgreSQL 16 + Redis 7
- **Infrastructure:** Docker 24, Terraform 1.9, AWS ECS Fargate + ALB
- **CI/CD:** GitHub Actions + ESLint + Prettier + Vitest + Playwright

## Development Workflow

### Prerequisites

- Node.js 20 LTS
- npm or pnpm
- Chrome 116+
- Docker (for local PostgreSQL + Redis)

### Common Commands (to be implemented)

```bash
# Install dependencies
npm ci

# Type checking
npm run typecheck

# Linting & formatting
npm run lint
npm run format

# Testing
npm run test                    # Run all unit tests
npm run test:watch             # Watch mode
npm run test:coverage          # With coverage report (gate: 80%)
npm run test:e2e               # E2E with Playwright against fixture YouTube

# Build
npm run build:extension        # Bundle MV3 extension (.zip)
npm run build:api              # Backend server

# Local development
npm run dev:extension          # Vite HMR + CRXJS
npm run dev:api                # Fastify dev server (port TBD)

# Infrastructure
npm run tf:plan                # Terraform dry-run
npm run tf:apply               # Deploy to AWS

# Code quality gates
npm run verify                 # lint + typecheck + test
```

## Architecture & Component Topology

### High-Level Flow

```
YouTube watch page (captions available)
  ↓
Content Script (VideoAdapter, Detector, Skipper)
  ↓ GET /v1/segments/{videoId}
Service Worker (Policy Engine, Cache, chrome.storage)
  ↓ cache miss → call backend
Fastify API (/v1/segments)
  ↓ cache miss → classify with Claude
Claude LLM (Haiku primary, Sonnet fallback)
  ↓ persist + cache
PostgreSQL (video_analyses, sponsor_segments) + Redis (TTL 30d)
```

### Directory Structure

```
.
├── src/
│   ├── extension/
│   │   ├── content-script.ts     # Detector + Skipper
│   │   ├── service-worker.ts      # Policy Engine + Cache
│   │   ├── toast.ts               # Shadow DOM toast UI
│   │   ├── manifest.json
│   │   └── index.html
│   ├── api/
│   │   ├── server.ts              # Fastify setup
│   │   ├── routes/
│   │   │   ├── segments.ts        # GET/POST /v1/segments*
│   │   │   ├── telemetry.ts       # POST /v1/telemetry
│   │   │   └── installs.ts        # POST /v1/installs
│   │   ├── services/
│   │   │   ├── llm-client.ts      # Anthropic + circuit breaker
│   │   │   ├── transcript-fetcher.ts
│   │   │   └── segment-classifier.ts
│   │   ├── repositories/
│   │   │   ├── segment-repository.ts   # Postgres + Redis abstraction
│   │   │   └── video-analysis-repo.ts
│   │   ├── config.ts
│   │   └── types.ts               # Shared TypeScript domain types
│   ├── shared/
│   │   ├── types.ts               # SponsorSegment, VideoAnalysis, UserPolicy
│   │   ├── validators.ts          # Zod schemas for API contracts
│   │   └── constants.ts
│   └── tests/
│       ├── unit/
│       ├── integration/
│       └── e2e/
├── infra/
│   ├── terraform/
│   │   ├── main.tf
│   │   ├── ecs.tf
│   │   ├── rds.tf
│   │   └── redis.tf
│   └── docker-compose.yml         # Local dev (postgres + redis)
├── .github/
│   └── workflows/
│       ├── ci.yml                 # ESLint, typecheck, test, e2e
│       └── deploy.yml             # Terraform apply, artifact push
├── package.json
├── tsconfig.json
├── vite.config.ts                 # Extension bundling via CRXJS
├── vitest.config.ts
└── skip-sponsor-ai-technical-spec.md  # Complete specification
```

## Key Design Patterns & Conventions

### TypeScript Standards

- `strict: true`, `noUncheckedIndexedAccess: true`
- No `any` without `// eslint-disable + justification`
- Path aliases: `@/` → `src/`
- Import order: React → Next → 3rd party → local

### Content Script Architecture

- **VideoAdapter:** Interface wrapping DOM video access for testability
- **Detector:** Pure functions (`isInSegment()`, `mergeSegments()`, `transcriptChunker()`)
- **Policy Engine:** Centralized skip decision logic — `globalEnabled && !channelBlocked && confidence >= threshold && !userInSegmentOverride`
- **No framework:** Vanilla TypeScript to avoid CSP collisions with YouTube

### Backend Service Pattern

Route → Zod validator → Service → Repository

- All database access via `SegmentRepository` (never raw SQL in routes)
- LLM calls through `LlmClient` with circuit breaker (`opossum`)
- Structured logging (pino JSON): `{reqId, videoId, latencyMs, model, confidence}`

### API Contracts

- All endpoints return RFC7807 `application/problem+json` on error
- Zod validation on all inputs
- Rate limit: 60 req/min/install, 500/min/IP
- Install-token auth: 256-bit random, stored client-side in `chrome.storage.local`

### Data Model

See `src/shared/types.ts` for domain types:

- `SponsorSegment`: `{id, videoId, startTime, endTime, confidence, category, source, createdAt}`
- `VideoAnalysis`: `{videoId, duration, language, status, segments, transcriptVersion, analyzedAt}`
- `UserPolicy`: `{globalEnabled, mode, confidenceThreshold, blockedChannels, allowlistedChannels}`

### LLM Classification

- **Model policy:** Haiku primary (0.8s, 1/5 cost), Sonnet fallback for ambiguous (0.55–0.78 confidence)

- **Temperature:** 0 (deterministic JSON)
- **Chunk size:** 60s windows with 10s overlap
- **Confidence threshold:** 0.78 default (range 0.5–0.95)
- **System prompt:** (See technical spec §5.4)

### Cache & Persistence

- **Redis:** `seg:{videoId}` → JSON `VideoAnalysis`, TTL 30d
- **PostgreSQL:** `video_analyses` table (indexed on `expires_at`, `channel_id`) with GIST exclusion for overlapping segments
- **In-flight deduplication:** `inflight:{videoId}` prevents duplicate LLM calls for concurrent tabs
- **Chrome storage:** Policy stored locally, not server-side

## Testing Strategy

### Unit Tests (Vitest, ≥80% coverage gate)

- `mergeSegments()`, `thresholdFilter()`, `transcriptChunker()`, `policyEngine()`
- LLM mock returns fixed JSON
- `VideoAdapter` stubbed for content-script testing

### Integration Tests (Pact + Schemathesis)

- All `/v1/*` endpoints tested against Zod schemas
- Contract validation in CI; schema drift fails pipeline

### E2E Tests (Playwright + fixture YouTube page)

- Load extension, play 3 fixture videos (pre-roll sponsor, mid-roll, no sponsor)
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
- **Install tokens:** Opaque 256-bit random, rotated per browser profile

### Client Isolation

- Content script in isolated world; toast in Shadow DOM + `all:initial` CSS reset
- CSP: `script-src 'self'` only; no eval, no remote code
- Permissions: `["storage", "alarms"]` only
- Host permissions: `*://*.youtube.com/*` only

### Data Privacy

- **Zero audio upload;** transcript text only
- **Retention:** 30-day TTL, hard delete after expiration
- **Telemetry:** `videoId` + event + latency only; no IP >7d
- **GDPR/CCPA:** Delete via `DELETE /v1/segments/{videoId}`, opt-out disables network calls
- **DPA:** Zero-retention inference flag with Anthropic

### OWASP Top 10 Coverage

- **A01 Broken Access Control:** Least-privilege extension permissions, install-token validation
- **A03 Injection:** Parameterized queries (Drizzle ORM), Zod input validation
- **A07 Cross-Site Scripting:** textContent only (no HTML injection), Shadow DOM isolation
- **A09 Components w/ Known Vulnerabilities:** Dependabot + `npm audit` gate in CI
- **A10 SSRF:** Allowlist enforcement — server fetches only `*.youtube.com/api/timedtext*` and `sponsor.ajay.app`

## Performance Targets

| Metric                                  | Target       |
| --------------------------------------- | ------------ |
| End-to-end analysis (captions → ready)  | p95 <4.0s    |
| Skip trigger latency                    | p95 <300ms   |
| Client overhead (idle / active)         | <2% / <5%    |
| Backend availability                    | 99.9% SLA    |
| Cost per video analysis                 | ≤$0.004      |
| Cache hit rate                          | ≥65%         |

## Observability & Monitoring

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
- Kill-switch: `GET /v1/config` flag `globalKill` disables auto-skip in <5min without extension update

## Common Implementation Tasks

### Adding a New Classification Category

1. Update `SegmentCategory` type in `src/shared/types.ts`
2. Add category to database `sponsor_segments.category` CHECK constraint
3. Update LLM system prompt in `src/api/services/llm-client.ts`
4. Add unit test case in `src/tests/unit/segment-classifier.test.ts`
5. Add telemetry event tracking in content script

### Extending the API

1. Define Zod schema in `src/shared/validators.ts`
2. Create route handler in `src/api/routes/*.ts`
3. Add integration test vs schema in `src/tests/integration/`
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
