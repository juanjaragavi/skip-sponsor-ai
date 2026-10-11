<div align="center">
  <img src="brand/png/mark-512.png" alt="SkipSponsor AI logo" width="96" />
  <h1>SkipSponsor AI</h1>
  <p><strong>Skip sponsor reads inside YouTube videos. AI reads the captions, marks the sponsor segment, and jumps past it — with one-click Undo.</strong></p>
  <p>
    <a href="./LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT" /></a>
    <a href="https://github.com/juanjaragavi/skip-sponsor-ai/actions/workflows/ci.yml"><img src="https://github.com/juanjaragavi/skip-sponsor-ai/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
    <img src="https://img.shields.io/badge/Chrome-116%2B-blue?logo=googlechrome&logoColor=white" alt="Chrome 116+" />
    <img src="https://img.shields.io/badge/Manifest-V3-green" alt="Manifest V3" />
    <a href="./CONTRIBUTING.md"><img src="https://img.shields.io/badge/PRs-welcome-brightgreen.svg" alt="PRs welcome" /></a>
  </p>
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="brand/png/lockup-horizontal-on-dark.png" />
    <img src="brand/png/lockup-horizontal-on-light.png" alt="SkipSponsor AI lockup" width="480" />
  </picture>
</div>

---

**SkipSponsor AI** is an open source MV3 Chrome extension that automatically detects and skips in-video sponsor reads on YouTube using AI-powered caption analysis. Powered by Anthropic Claude, it offers precision sponsor detection with 93%+ accuracy while respecting user preferences and privacy.

- 🧠 **AI-powered** — Claude Haiku 4.5 analyzes captions; Claude Sonnet 5.5 fallback for ambiguous cases
- ⏭️ **Auto-skip with Undo** — jumps past sponsor reads, 4-second window to go back
- 🎛️ **You're in control** — Auto / Notify / Off per video, confidence threshold (50–95%), per-channel opt-out
- 🌍 **Any language** — works with auto or uploaded captions; SponsorBlock fallback when captions are missing
- 🔒 **Private by design** — caption text only (never audio), no account, 30-day result retention
- ⚡ **Fast & cheap** — p95 analysis <4.0s, skip trigger <300ms, ~$0.004/video with 65%+ cache hits

## Screenshots

![SkipSponsor AI in action](store/showcase/showcase-1280x720.png)

| Skip automatically                                                               | Changed your mind? Undo                       | Auto, Notify, or Off                                     |
| -------------------------------------------------------------------------------- | --------------------------------------------- | -------------------------------------------------------- |
| ![Skip sponsor reads automatically](store/screenshots/01-skip-sponsor-reads.png) | ![Undo a skip](store/screenshots/02-undo.png) | ![Three modes](store/screenshots/03-auto-notify-off.png) |

| Works in any language                                           | Private by design                                                |
| --------------------------------------------------------------- | ---------------------------------------------------------------- |
| ![Works in any language](store/screenshots/04-any-language.png) | ![Private by design](store/screenshots/05-private-by-design.png) |

> All screenshots are 1280×800 Chrome Web Store assets in [`store/screenshots/`](store/screenshots/). Brand marks and lockups live in [`brand/`](brand/).

## Contents

- [Quick Start](#quick-start)
- [Environment Variables](#environment-variables)
- [Development](#development)
- [Testing & Quality](#testing--quality)
- [Deployment](#deployment)
- [Architecture](#architecture)
- [Security & Privacy](#security--privacy)
- [Troubleshooting](#troubleshooting)
- [Contributing](#contributing)
- [Code of Conduct](#code-of-conduct)
- [Security](#security)
- [License](#license)
- [Attribution](#attribution)
- [Support](#support)
- [Acknowledgments](#acknowledgments)

## Quick Start

### Prerequisites

- **Node.js:** 20 LTS
- **npm:** 8.x+
- **Chrome:** 116+
- **Docker:** for local PostgreSQL + Redis (optional, full backend setup)
- **Anthropic API Key:** sign up at [console.anthropic.com](https://console.anthropic.com)

### 1. Clone & Install

```bash
git clone https://github.com/juanjaragavi/skip-sponsor-ai.git
cd skip-sponsor-ai
npm ci
```

### 2. Environment Setup

```bash
cp .env.example .env.local
```

See [Environment Variables](#environment-variables) below for required keys.
Never commit `.env*` files — they are git-ignored.

### 3. Development Build

```bash
npm run build:extension
```

This generates `dist/extension/` for local testing.

### 4. Load Extension in Chrome

1. Open `chrome://extensions/`
2. Enable **Developer Mode** (toggle in top-right)
3. Click **Load unpacked**
4. Select `/path/to/skip-sponsor-ai/dist/extension`
5. Test on YouTube videos

### 5. Backend Setup (Optional)

For full local development with LLM inference:

```bash
docker compose -f infra/docker-compose.yml up -d
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f infra/db/migrations/001_init.sql   # no migrate script yet
npm run dev:api
```

Backend listens on `http://localhost:3040` by default.

Local ports are unique across DevSpeak projects so several can run at once:

| Service                                | Host port | Set in                                              |
| -------------------------------------- | --------- | --------------------------------------------------- |
| API (`npm run dev:api`)                | 3040      | `package.json` `config.port` (override with `PORT`) |
| Extension dev server (`dev:extension`) | 5174      | `vite.config.ts` (`strictPort`)                     |
| Postgres (Docker)                      | 5434      | `infra/docker-compose.yml` (container port 5432)    |
| Redis (Docker)                         | 6380      | `infra/docker-compose.yml` (container port 6379)    |

The API container (`infra/Dockerfile.api`) still listens on 3000 when `PORT` is unset.

## Environment Variables

### Extension (Client-Side)

In `.env.local`, loaded at build time:

| Variable            | Required | Default                                                                     | Description                                     |
| ------------------- | -------- | --------------------------------------------------------------------------- | ----------------------------------------------- |
| `VITE_API_BASE_URL` | Yes      | `https://api.skipsponsor.example.com` (set `http://localhost:3040` for dev) | Backend API endpoint (dev) or production domain |
| `VITE_ENVIRONMENT`  | No       | `development`                                                               | `development`, `staging`, or `production`       |
| `VITE_DEBUG_MODE`   | No       | `false`                                                                     | Verbose console logging in content script       |

Only `VITE_API_BASE_URL` is read by the extension code today; the other two are placeholders.

### Backend API (Server-Side)

In `.env`, loaded at server startup:

| Variable                  | Required | Default                                                   | Description                                                         |
| ------------------------- | -------- | --------------------------------------------------------- | ------------------------------------------------------------------- |
| `ANTHROPIC_API_KEY`       | Yes      | —                                                         | API key from [console.anthropic.com](https://console.anthropic.com) |
| `DATABASE_URL`            | Yes      | `postgresql://localhost:5434/skipsponsor`                 | PostgreSQL connection string                                        |
| `REDIS_URL`               | Yes      | `redis://localhost:6380`                                  | Redis connection string                                             |
| `NODE_ENV`                | No       | `development`                                             | `development`, `staging`, or `production`                           |
| `LOG_LEVEL`               | No       | `info`                                                    | `trace`, `debug`, `info`, `warn`, `error`, `fatal`                  |
| `CORS_ORIGIN`             | No       | `*`                                                       | CORS allowed origin (restrict in production)                        |
| `RATE_LIMIT_WINDOW_MS`    | No       | `60000`                                                   | Rate limit window (ms)                                              |
| `RATE_LIMIT_MAX_REQUESTS` | No       | `60`                                                      | Max requests per window                                             |
| `LLM_TIMEOUT_MS`          | No       | `8000`                                                    | LLM inference timeout (ms)                                          |
| `LLM_MAX_RETRIES`         | No       | `1`                                                       | LLM retry attempts on timeout                                       |
| `CONFIDENCE_THRESHOLD`    | No       | `0.78`                                                    | Default confidence threshold (0.5–0.95)                             |
| `CACHE_TTL_DAYS`          | No       | `30`                                                      | Cache retention in days                                             |
| `SENTRY_DSN`              | No       | —                                                         | Sentry error tracking DSN (optional)                                |
| `PORT`                    | No       | `3040` local (`npm run dev:api`), `3000` in the container | Server listen port                                                  |

The server reads only `ANTHROPIC_API_KEY`, `PORT`, `NODE_ENV`, and `GLOBAL_KILL` (kill switch served by `GET /v1/config`). `DATABASE_URL` and `REDIS_URL` are parsed in `src/api/config.ts` but unused while segments live in memory; the remaining rows are `.env.example` placeholders no code reads.

### Getting an Anthropic API Key

1. Visit [console.anthropic.com](https://console.anthropic.com)
2. Sign in or create an account
3. Navigate to **API Keys**
4. Create a new key and set `ANTHROPIC_API_KEY=sk-ant-...` in `.env`
5. **Never commit `.env` to git**

## Development

```bash
npm run typecheck          # tsc --noEmit (strict)
npm run lint               # ESLint
npm run lint -- --fix      # auto-fix
npm run format             # Prettier

npm run test               # Vitest, all tests
npm run test:watch         # watch mode
npm run test:coverage      # coverage report (80% gate)
npm run test:e2e           # Playwright E2E

npm run build:extension    # bundle MV3 extension
npm run build:api          # build backend
npm run dev:extension      # Vite HMR + CRXJS on :5174
npm run dev:api            # Fastify dev server on :3040
npm run verify             # lint + typecheck + test

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
│   ├── repositories/      # data access (in-memory today)
│   ├── config.ts          # config loader
│   └── server.ts          # Fastify setup
├── shared/                 # shared types, Zod validators, constants
├── types/                  # ambient declarations (opossum)
└── tests/                  # unit (Vitest) and e2e (Playwright)
```

## Testing & Quality

```bash
npm run test -- --run   # unit: mergeSegments(), thresholdFilter(), decideSkip(), route validation
npm run test:e2e        # loads extension, plays fixture videos, asserts skip + undo
```

Minimum **80% coverage** enforced in CI (lines, branches, functions).

## Deployment

### Chrome Web Store

```bash
npm run build:extension -- --mode production
cd dist/extension && zip -r ../skipsponsor.zip . && cd ../..
```

Upload the `.zip` at [chromewebstore.google.com/devconsole](https://chromewebstore.google.com/devconsole).
Full listing copy, assets, and privacy answers live in [`store/listing.md`](store/listing.md).

### Backend (AWS ECS)

```bash
terraform -chdir=infra/terraform plan
terraform -chdir=infra/terraform apply
# API image: infra/Dockerfile.api (no deploy:api script yet)
```

Deploys to ECS Fargate with ALB, RDS PostgreSQL, ElastiCache Redis.

### Local Testing Guide

See [`docs/LOCAL_TESTING.md`](docs/LOCAL_TESTING.md) for PostgreSQL + Redis setup,
backend logs, loading the extension, and DevTools debugging.

## Architecture

Full details: [`skip-sponsor-ai-technical-spec.md`](skip-sponsor-ai-technical-spec.md).

1. Content script captures captions from the YouTube video
2. Sends `videoId` to the service worker
3. Service worker queries the backend API
4. Backend checks cache; on miss, classifies with Claude
5. Segments returned; content script seeks past sponsor reads
6. Toast shows an Undo option within 4 seconds

## Security & Privacy

- **Zero audio upload:** transcript text only
- **30-day retention:** automatic hard delete after TTL
- **No tracking:** no cross-site tracking or profiling
- **Install tokens:** opaque 256-bit auth per browser profile
- **GDPR/CCPA compliant:** data-subject delete via API
- **DPA:** zero-retention inference flag with Anthropic

See [`PRIVACY.md`](PRIVACY.md) and the technical spec §6 for complete controls.
To report a vulnerability, see [Security](#security) below — do not open public issues.

## Troubleshooting

### Extension doesn't detect sponsors

1. Check the video has captions (auto or manual)
2. Verify `VITE_API_BASE_URL` points to a running backend
3. Check `chrome://extensions/` → Details → Errors
4. Enable `VITE_DEBUG_MODE=true` for verbose logging

### Backend API errors

1. Verify `ANTHROPIC_API_KEY` is set and valid
2. Check PostgreSQL + Redis: `docker-compose ps`
3. Review logs: `npm run dev:api`
4. Check rate limiting: default 60 req/min/install

### LLM timeouts

- Increase `LLM_TIMEOUT_MS` (default 8000ms)
- Check [status.anthropic.com](https://status.anthropic.com)
- Review backend logs for `llm_timeout` events

## Contributing

Contributions are welcome under the [MIT License](LICENSE) (inbound = outbound).

1. Fork and branch: `git checkout -b feature/my-feature`
2. Implement with tests; run `npm run verify`
3. Sign off commits (`git commit -s`) per the Developer Certificate of Origin
4. Open a PR with a test plan using the template

Please read **[CONTRIBUTING.md](CONTRIBUTING.md)** for setup, Conventional Commits,
quality gates, and review process, and follow the **[Code of Conduct](CODE_OF_CONDUCT.md)**.
Report bugs with the [bug template](.github/ISSUE_TEMPLATE/bug_report.md) and propose
features with the [feature template](.github/ISSUE_TEMPLATE/feature_request.md).

## Code of Conduct

This project follows the [Contributor Covenant v2.1](CODE_OF_CONDUCT.md).
Be kind, be respectful, assume good faith. Report violations via a
[private security advisory](https://github.com/juanjaragavi/skip-sponsor-ai/security/advisories/new).

## Security

Only the latest `1.x` release is supported. **Do not report vulnerabilities in
public issues** — see [SECURITY.md](SECURITY.md) for private reporting,
scope, safe harbor, and response timelines.

## License

MIT © 2026 Juan Jaramillo — see [LICENSE](LICENSE) for the full text.

SPDX: `MIT`. The SkipSponsor AI name and logos are project trademarks;
the MIT License covers code, not trademark rights (see [Attribution](#attribution)).

## Attribution

Third-party packages, fonts, services, and data sources are credited in
**[ATTRIBUTION.md](ATTRIBUTION.md)** — including Anthropic Claude, SponsorBlock
(CC BY-NC-SA 4.0 data), YouTube (independent project, no affiliation),
Roboto (OFL-1.1), and Lucide (ISC). If you vendor new third-party code,
document it there.

## Support

- **Issues:** [GitHub Issues](https://github.com/juanjaragavi/skip-sponsor-ai/issues)
- **Discussions:** [GitHub Discussions](https://github.com/juanjaragavi/skip-sponsor-ai/discussions)
- **Security:** [SECURITY.md](SECURITY.md) for private vulnerability reporting
- **Privacy:** [PRIVACY.md](PRIVACY.md)

## Acknowledgments

- Built with [Anthropic Claude](https://www.anthropic.com)
- [SponsorBlock](https://sponsorblock.org) fallback integration
- YouTube caption API
- Chrome Web Store review team
