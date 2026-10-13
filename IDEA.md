# SkipSponsor AI

**SkipSponsor AI** is an MV3 Chrome extension that automatically detects and skips in-video sponsor reads on YouTube using AI-powered caption analysis. Powered by Anthropic Claude, it targets ≥93% precision and ≥90% recall on a labeled evaluation set (a design target from the technical spec, not yet measured) while respecting user preferences and privacy.

## Features

- **AI-Powered Detection:** Uses Claude Haiku 4.5 (Sonnet 5.5 fallback; see `MODEL_POLICY` in `src/shared/constants.ts`) to analyze video captions and identify sponsor segments
- **Auto-Skip:** Automatically seeks past detected sponsor reads with a 4-second undo window
- **Per-Channel Control:** Enable/disable detection on specific channels via allowlist/blocklist
- **Honest fallback:** When captions are unavailable or the LLM fails, the video is reported as not analyzed. (A SponsorBlock fallback exists behind `SPONSORBLOCK_ENABLED`, off by default since 2026-10-13: its data is CC BY-NC-SA.)
- **Privacy-First:** Zero audio upload; transcript text only with 30-day retention
- **High Performance:** p95 analysis latency <4.0s, skip trigger <300ms
- **Low Cost:** ~$0.004 per video with 65%+ cache hit rate

## Quick Start

### Prerequisites

- **Node.js:** 20 LTS
- **npm:** 8.x+ (the repo ships `package-lock.json`)
- **Chrome:** 116+
- **Docker:** For local PostgreSQL + Redis (optional, for full backend setup)
- **Anthropic API Key:** Sign up at [console.anthropic.com](https://console.anthropic.com)

### 1. Clone & Install

```bash
git clone https://github.com/yourusername/skip-sponsor-ai.git
cd skip-sponsor-ai
npm ci
```

### 2. Environment Setup

Copy the example env file and populate with your credentials:

```bash
cp .env.example .env.local
```

See [Environment Variables](#environment-variables) below for required keys.

### 3. Development Build

```bash
npm run build:extension
```

This generates `dist/extension/` with the bundled `.crx` or `.zip` for local testing.

### 4. Load Extension in Chrome

1. Open `chrome://extensions/`
2. Enable **Developer Mode** (toggle in top-right)
3. Click **Load unpacked**
4. Select `/path/to/skip-sponsor-ai/dist/extension`
5. Extension appears in toolbar; test on YouTube videos

### 5. Backend Setup (Optional)

For full local development with LLM inference:

```bash
# Start PostgreSQL + Redis
docker compose -f infra/docker-compose.yml up -d

# Apply the schema (no migrate script yet)
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f infra/db/migrations/001_init.sql

# Start backend server
npm run dev:api
```

Backend listens on `http://localhost:3040` by default.

## Environment Variables

### Extension (Client-Side)

Located in `.env.local` and loaded at build time:

| Variable            | Required | Default                                                                     | Description                                      |
| ------------------- | -------- | --------------------------------------------------------------------------- | ------------------------------------------------ |
| `VITE_API_BASE_URL` | Yes      | none for production builds (they fail without an https URL); dev: `http://localhost:3040` | Backend API endpoint (dev) or production domain  |
| `VITE_ENVIRONMENT`  | No       | `development`                                                               | `development`, `staging`, or `production`        |
| `VITE_DEBUG_MODE`   | No       | `false`                                                                     | Enable verbose console logging in content script |

Only `VITE_API_BASE_URL` is read by the extension code today; the other two are placeholders.

### Backend API (Server-Side)

Located in `.env` and loaded at server startup:

| Variable                     | Required        | Default                                                   | Description                                                                      |
| ---------------------------- | --------------- | --------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `ANTHROPIC_API_KEY`          | Yes             | —                                                         | API key from [console.anthropic.com](https://console.anthropic.com)              |
| `DATABASE_URL`               | Production      | — (in-memory store when unset)                            | PostgreSQL connection string; the shared analysis cache                          |
| `REDIS_URL`                  | No              | —                                                         | Optional hot cache in front of Postgres                                          |
| `INSTALL_TOKEN_SECRET`       | Production      | — (any opaque token accepted in dev)                      | HMAC key for anonymous install tokens (≥32 chars)                                |
| `DAILY_ANALYSES_PER_INSTALL` | No              | `25`                                                      | Fresh LLM analyses per install per UTC day; cached videos never count            |
| `LLM_DAILY_BUDGET_USD`       | No              | `2`                                                       | Global daily LLM spend cap; `0` switches the LLM off                             |
| `CORS_ORIGIN`                | No              | dev: any; production: any `chrome-extension://` origin    | Comma-separated origins, e.g. `chrome-extension://<item id>`                     |
| `TRUST_PROXY`                | Behind a proxy  | `0`                                                       | `1` = use `X-Forwarded-For` for client IPs (rate limits)                         |
| `NODE_ENV`                   | No              | `development`                                             | `production` enables the startup config checks                                   |
| `CACHE_TTL_DAYS`             | No              | `30`                                                      | Analysis retention; expired rows are hard-deleted hourly                         |
| `PORT`                       | No              | `3040` local (`npm run dev:api`), `3000` in the container | Server listen port                                                               |

Full list (pool size, migrations on start, install-token rate limit, kill switch) in [`.env.example`](.env.example) and [`docs/DEPLOY.md`](docs/DEPLOY.md). `LOG_LEVEL`, `RATE_LIMIT_*`, `LLM_TIMEOUT_MS`, `LLM_MAX_RETRIES`, `CONFIDENCE_THRESHOLD` and `SENTRY_DSN` in `.env.example` are spec placeholders that no code reads yet.

### Getting Anthropic API Key

1. Visit [console.anthropic.com](https://console.anthropic.com)
2. Sign in or create account
3. Navigate to **API Keys** section
4. Create new API key
5. Copy and paste into `.env` file as `ANTHROPIC_API_KEY=sk-ant-...`
6. **Never commit `.env` to git** — add to `.gitignore`

## Development

### Common Commands

```bash
# Type checking
npm run typecheck

# Linting
npm run lint
npm run lint -- --fix

# Formatting
npm run format

# Testing
npm run test                    # Run all tests
npm run test:watch             # Watch mode
npm run test:coverage          # Coverage report (80% gate)
npm run test:e2e               # E2E with Playwright

# Building
npm run build:extension        # Bundle MV3 extension
npm run build:api              # Build backend

# Local development
npm run dev:extension          # Vite HMR + CRXJS
npm run dev:api                # Fastify dev server

# Code quality verification
npm run verify                 # lint + typecheck + test

# Database: no migrate/seed scripts yet; apply SQL directly
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f infra/db/migrations/001_init.sql
```

### Project Structure

```
src/
├── extension/              # Chrome MV3 extension
│   ├── content-script.ts  # detector + skipper
│   ├── service-worker.ts  # API calls, in-flight dedupe, install token
│   ├── policy.ts          # decideSkip() policy engine
│   ├── toast.ts           # Shadow DOM UI
│   ├── popup.* / options.* # toolbar popup and options page
│   └── manifest.json
├── api/                    # Fastify backend
│   ├── routes/            # API endpoints
│   ├── services/          # business logic (LLM, chunking, SponsorBlock)
│   ├── repositories/      # Postgres + optional Redis; in-memory for dev/tests
│   ├── config.ts          # config loader
│   └── server.ts          # Fastify setup
├── shared/                 # shared types, Zod validators, constants
├── types/                  # ambient declarations (opossum)
└── tests/                  # unit (Vitest) and e2e (Playwright)
```

## Testing & Quality

### Unit Tests

```bash
npm run test -- --run
```

Covers: `mergeSegments()`, `thresholdFilter()`, `policyEngine()`, API route validation.

### E2E Tests

```bash
npm run test:e2e
```

Loads extension, plays fixture YouTube videos, asserts skip execution + undo.

### Coverage Gate

Minimum **80% coverage** enforced in CI:

- Lines: ≥80%
- Branches: ≥80%
- Functions: ≥80%

## Deployment

### Chrome Web Store

1. **Build for production:**

   ```bash
   npm run build:extension -- --mode production
   ```

2. **Create `.zip`:**

   ```bash
   cd dist/extension && zip -r ../skipsponsor.zip . && cd ../..
   ```

3. **Upload to Web Store:**
   - Visit [chromewebstore.google.com/devconsole](https://chromewebstore.google.com/devconsole)
   - Create new item or update existing
   - Upload `.zip` file
   - Fill store details, privacy policy, screenshots
   - Submit for review

### Backend Deployment

One container (`infra/Dockerfile.api`) plus PostgreSQL on InstaCloud
([ADR 0001](./docs/adr/0001-api-hosting-instacloud.md),
[runbook](./docs/runbooks/deploy-instacloud.md)). [docs/DEPLOY.md](./docs/DEPLOY.md)
keeps an Oracle Cloud Always Free VM as a fallback. `infra/terraform` (AWS ECS
Fargate, RDS, ElastiCache) is superseded and was never applied.

## Local Testing Guide

See [LOCAL_TESTING.md](./docs/LOCAL_TESTING.md) for step-by-step instructions on:

- Setting up local PostgreSQL + Redis
- Running backend server
- Loading extension in Chrome
- Testing sponsor skip functionality
- Debugging with Chrome DevTools
- Monitoring backend logs and metrics

## Architecture

For complete architecture details, see [skip-sponsor-ai-technical-spec.md](./skip-sponsor-ai-technical-spec.md).

**High-level flow:**

1. Content script captures captions from YouTube video
2. Sends `videoId` to service worker
3. Service worker queries backend API
4. Backend checks cache; if miss, classifies with Claude
5. Segments returned; content script seeks past sponsor reads
6. Toast shows undo option within 4 seconds

## Security & Privacy

- **Zero audio upload:** Transcript text only
- **30-day retention:** Automatic hard delete after TTL
- **No tracking:** No cross-site tracking or profiling
- **Install tokens:** Opaque 256-bit auth per browser profile
- **GDPR/CCPA compliant:** Data subject delete via API
- **DPA:** Zero-retention inference flag with Anthropic

See [skip-sponsor-ai-technical-spec.md § 6](./skip-sponsor-ai-technical-spec.md#6-security--compliance-rules) for complete security controls.

## Monitoring & Observability

Spec targets; only Fastify's pino request logging exists in code today.

- **Metrics:** Prometheus + Grafana dashboard
- **Tracing:** OpenTelemetry with 10% sampling
- **Logging:** Pino structured JSON → CloudWatch
- **Error tracking:** Sentry for exceptions
- **Performance:** Lighthouse audits, Web Vitals monitoring

## Troubleshooting

### Extension doesn't detect sponsors

1. Check YouTube video has captions (auto or manual)
2. Verify `VITE_API_BASE_URL` points to running backend
3. Check `chrome://extensions/` → Details → Errors for exceptions
4. Enable `VITE_DEBUG_MODE=true` for verbose logging

### Backend API errors

1. Verify `ANTHROPIC_API_KEY` is set and valid
2. Check PostgreSQL + Redis running: `docker compose -f infra/docker-compose.yml ps`
3. Review backend logs: `npm run dev:api`
4. Check rate limiting: default 60 req/min/install

### LLM timeouts

- Increase `LLM_TIMEOUT_MS` in `.env` (default 8000ms)
- Check Anthropic API status: [status.anthropic.com](https://status.anthropic.com)
- Review backend logs for `llm_timeout` events

## Contributing

1. Create feature branch: `git checkout -b feature/my-feature`
2. Implement with tests: `npm run test -- --watch`
3. Verify quality: `npm run verify`
4. Create PR with test plan
5. Await review and merge

See [CONTRIBUTING.md](./docs/CONTRIBUTING.md) for contribution guidelines.

## License

MIT — See [LICENSE](./LICENSE) for details.

## Support

- **Issues:** [GitHub Issues](https://github.com/yourusername/skip-sponsor-ai/issues)
- **Discussions:** [GitHub Discussions](https://github.com/yourusername/skip-sponsor-ai/discussions)
- **Security:** See [SECURITY.md](./SECURITY.md) for vulnerability reporting

## Acknowledgments

- Built with [Anthropic Claude](https://www.anthropic.com)
- [SponsorBlock](https://www.sponsorblock.org) fallback integration
- YouTube caption API
- Chrome Web Store review team
