# Environment Variables Reference

Complete documentation of all environment variables used by SkipSponsor AI across the extension client, backend server, and infrastructure.

> **Code status (verified 2026-10-11):** the API reads `ANTHROPIC_API_KEY`, `PORT`, `NODE_ENV`, `GLOBAL_KILL`, `DATABASE_URL` (Postgres persistence; in memory when unset), `REDIS_URL` (optional cache), `PERSISTENCE`, `PG_POOL_MAX`, `CACHE_TTL_DAYS`, `CORS_ORIGIN`, `TRUST_PROXY`, `INSTALL_TOKEN_SECRET`, `ADMIN_API_TOKEN` (optional operator token for `DELETE /v1/segments/:id`, corrections and `force` analyses, header `x-admin-token`; unset disables them), `DAILY_ANALYSES_PER_INSTALL`, `LLM_DAILY_BUDGET_USD`, `INSTALLS_PER_IP_PER_HOUR`, and (container) `DB_MIGRATE_ON_START`. The extension reads only `VITE_API_BASE_URL`, at build time; production builds fail without an https value. `.env.example` marks the rest as not read by code yet. Production values: [DEPLOY.md](DEPLOY.md); the live InstaCloud environment (names only): [runbooks/deploy-instacloud.md](runbooks/deploy-instacloud.md). Secrets live in InstaCloud user secrets, not AWS Secrets Manager ([ADR 0001](adr/0001-api-hosting-instacloud.md)); AWS mentions below are historical. Health checks: `GET /healthz`, `GET /readyz` (reports `persistence`, `redis`, `ai`). Migrations: `npm run db:migrate`.

## Table of Contents

1. [Extension Client Variables](#extension-client-variables)
2. [Backend Server Variables](#backend-server-variables)
3. [Security & Secrets](#security--secrets)
4. [Getting Started](#getting-started)
5. [Common Configurations](#common-configurations)

## Extension Client Variables

These variables are loaded at **build time** by Vite and baked into the extension bundle. They control how the extension communicates with the backend API and enable/disable debug features.

**File:** `.env.local` (not committed to git)

### VITE_API_BASE_URL

**Type:** `string` (URL)  
**Required:** Yes for production builds (`npm run build:extension` fails without an https URL)  
**Default:** `http://localhost:3040` in development builds only  
**Example:**

```
VITE_API_BASE_URL=http://localhost:3040
VITE_API_BASE_URL=https://api.skipsponsor.ai
```

**Description:**  
Backend API endpoint used by the extension content script to fetch sponsor segments. The extension sends `GET /v1/segments/{videoId}` requests to this URL.

**Usage:**

- **Local development:** `http://localhost:3040` (backend running locally)
- **Staging:** `https://staging-api.skipsponsor.ai`
- **Production:** `https://api.skipsponsor.ai`

**Impact:** If misconfigured, the extension cannot fetch segments and videos play normally.

**Setting Up:**

```bash
# Create .env.local
echo 'VITE_API_BASE_URL=http://localhost:3040' > .env.local

# After changing, rebuild the extension
npm run build:extension
```

---

### VITE_ENVIRONMENT

**Type:** `string` enum  
**Required:** No  
**Default:** `development`  
**Values:** `development` | `staging` | `production`  
**Example:**

```
VITE_ENVIRONMENT=development
```

**Description:**  
Configures the environment context for the extension. Controls logging verbosity, error handling, and feature flags.

| Value         | Behavior                                                                  |
| ------------- | ------------------------------------------------------------------------- |
| `development` | Console logs enabled, detailed error messages, all features active        |
| `staging`     | Minimal logging, staging-specific endpoints, beta features enabled        |
| `production`  | No console logs (stripped at build), minimal errors, stable features only |

**Impact:** Affects how much debugging information is available in DevTools console.

**Setting Up:**

```bash
# For development
VITE_ENVIRONMENT=development npm run build:extension

# For production builds
VITE_ENVIRONMENT=production npm run build:extension
```

---

### VITE_DEBUG_MODE

**Type:** `boolean` (string: "true" | "false")  
**Required:** No  
**Default:** `false`  
**Example:**

```
VITE_DEBUG_MODE=true
```

**Description:**  
When enabled (`true`), the extension logs detailed information to the browser console. Helps debug detection, skipping, and cache issues.

**Output Format:**

```
[SkipSponsor] DEBUG: Initializing detector for video: dQw4w9WgXcQ
[SkipSponsor] DEBUG: Captions found, 42 segments
[SkipSponsor] DEBUG: Cache hit for dQw4w9WgXcQ
[SkipSponsor] DEBUG: Seeking from 120.5s to 184.8s (sponsor segment)
```

**When to Enable:**

- Active development and debugging
- Testing detection on new videos
- Troubleshooting extension failures

**When to Disable:**

- Production builds (verbose logging slows extension)
- End-user deployments (logs contain videoId)

**Setting Up:**

```bash
# Enable debug logs
VITE_DEBUG_MODE=true npm run build:extension
VITE_DEBUG_MODE=true npm run dev:extension  # Live dev

# View logs in Chrome DevTools
# 1. Open YouTube video
# 2. Press F12 (DevTools)
# 3. Console tab → Select "youtube.com" in dropdown
# 4. Refresh page (Cmd+R)
```

---

## Backend Server Variables

These variables are loaded at **server startup** from the `.env` file and configure the Node.js/Fastify API server, database connections, LLM integration, and monitoring.

**File:** `.env` (not committed to git)

### ANTHROPIC_API_KEY

**Type:** `string` (token)  
**Required:** Yes  
**Default:** None (must be set)  
**Example:**

```
ANTHROPIC_API_KEY=sk-ant-abc123xyz789...
```

**Format:** Starts with `sk-ant-`, followed by base64 characters.

**Description:**  
API key for Anthropic Claude integration. Required for LLM-based sponsor segment classification. Without this, the backend cannot perform inference: fresh analyses answer 503 `llm_not_configured` and lookups serve cached results only.

**Obtaining Your Key:**

1. Visit [console.anthropic.com](https://console.anthropic.com)
2. Sign in or create free account
3. Navigate to **Account** → **API Keys** (left sidebar)
4. Click **Create Key**
5. Name it (e.g., "SkipSponsor Production")
6. Copy full key (starts with `sk-ant-`)
7. Add to `.env`:
   ```
   ANTHROPIC_API_KEY=sk-ant-your-full-key-here
   ```

**Pricing & Limits:**

- **Free tier:** $5 credit/month (sufficient for dev/testing)
- **Pay-as-you-go:** ~$0.80 per 1M input tokens for Haiku
- **Rate limit:** Default ~100k tokens/min (sufficient for 24k videos/day at $0.004/video)

**Security Best Practices:**

- ✅ Store in AWS Secrets Manager / Azure Key Vault in production
- ✅ Use separate keys for dev/staging/prod environments
- ✅ Rotate keys quarterly
- ✅ Monitor usage in Anthropic console ([console.anthropic.com/usage](https://console.anthropic.com/usage))
- ✅ Never commit to git
- ✅ Never expose in logs or error messages

**Verifying Key Validity:**

```bash
# Test key locally
curl -H "Authorization: Bearer $ANTHROPIC_API_KEY" \
  https://api.anthropic.com/v1/messages \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{
    "model": "claude-haiku-4-5-20251001",
    "max_tokens": 100,
    "messages": [{"role": "user", "content": "Say hello"}]
  }'

# Should return: {"id": "msg_...", "type": "message", ...}
```

---

### SPONSORBLOCK_ENABLED

**Required:** No
**Default:** off (`0`)
**Example:** `SPONSORBLOCK_ENABLED=0`

**Description:**
SponsorBlock data: the no-captions fallback and the filling of caption gaps in an AI result. **Off by default.** SponsorBlock's database and API are licensed CC BY-NC-SA 4.0, so commercial use needs the author's written permission before this is turned on.

- **Off (`0`, unset):** the API never contacts `sponsor.ajay.app`. A video without a transcript (or whose AI analysis fails) is answered `status: "unanalyzable"` with no segments, and the extension says it couldn't analyze the video. SponsorBlock segments stored while the switch was on are not served: cached `degraded` results are re-answered as `unanalyzable`, and `source: "sponsorblock"` segments are stripped from `ready` results. `/readyz` reports `sponsorblock: "off"`.
- **On (`1`, `true`, `yes`):** the previous behaviour (SponsorBlock fallback at `degraded`, gap corroboration at 0.85). The production config check logs a licence warning.

The extension has its own build-time switch, `VITE_SPONSORBLOCK_ENABLED` (default off): with it off the extension drops SponsorBlock segments and treats a `degraded` answer as "not analyzed", whatever the server sends.

---

### DATABASE_URL

**Type:** `string` (PostgreSQL connection string)  
**Required:** Yes  
**Default:** None (must be set)  
**Format:** `postgresql://[user]:[password]@[host]:[port]/[database]`  
**Examples:**

```
# Local development
DATABASE_URL=postgresql://skipsponsor:password@localhost:5434/skipsponsor

# Docker Compose
DATABASE_URL=postgresql://skipsponsor:password@postgres:5432/skipsponsor

# AWS RDS
DATABASE_URL=postgresql://admin:SecurePass123@skip-sponsor-db.c9akciq32.us-east-1.rds.amazonaws.com:5432/skipsponsor

# Google Cloud SQL
DATABASE_URL=postgresql://skipsponsor:password@34.89.123.45/skipsponsor
```

**Description:**  
PostgreSQL connection string for the video analysis and sponsor segment database. Stores:

- `video_analyses`: Metadata about analyzed videos (cache)
- `sponsor_segments`: Detected sponsor segments with timestamps
- `telemetry_events`: Skip events for analytics

**Setting Up:**

**Option 1: Docker Compose (recommended for local dev)**

```bash
# Start PostgreSQL
docker compose -f infra/docker-compose.yml up -d postgres

# Connection string is:
DATABASE_URL=postgresql://skipsponsor:password@localhost:5434/skipsponsor
```

**Option 2: Local PostgreSQL**

```bash
# Install PostgreSQL 16
brew install postgresql@16  # macOS
# or apt-get install postgresql postgresql-contrib  # Linux

# Create database and user
psql -U postgres -c "CREATE USER skipsponsor WITH PASSWORD 'password';"
psql -U postgres -c "CREATE DATABASE skipsponsor OWNER skipsponsor;"

# Connection string:
DATABASE_URL=postgresql://skipsponsor:password@localhost:5434/skipsponsor
```

**Option 3: AWS RDS**

```bash
# Create RDS instance (PostgreSQL 16)
aws rds create-db-instance \
  --db-instance-identifier skip-sponsor-db \
  --db-instance-class db.t4g.micro \
  --engine postgres \
  --engine-version 16.1 \
  --master-username admin \
  --master-user-password YourSecurePassword123

# Get endpoint
aws rds describe-db-instances --db-instance-identifier skip-sponsor-db \
  --query 'DBInstances[0].Endpoint.Address'

# Connection string:
DATABASE_URL=postgresql://admin:YourSecurePassword123@skip-sponsor-db.c9akciq32.us-east-1.rds.amazonaws.com:5432/skipsponsor
```

**Verifying Connection:**

```bash
# Test with psql
psql "$DATABASE_URL" -c "SELECT 1"
# Should return: (1 row)

# Apply the schema (no migrate script yet)
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f infra/db/migrations/001_init.sql
```

---

### REDIS_URL

**Type:** `string` (Redis connection string)  
**Required:** Yes  
**Default:** None (must be set)  
**Format:** `redis://[password@][host]:[port][/db]`  
**Examples:**

```
# Local development
REDIS_URL=redis://localhost:6380

# Docker Compose
REDIS_URL=redis://redis:6379

# AWS ElastiCache
REDIS_URL=redis://:MyPassword@skip-sponsor-cache.abc123.ng.0001.use1.cache.amazonaws.com:6379

# Google Cloud Memorystore
REDIS_URL=redis://:password@10.0.0.3:6379
```

**Description:**  
Redis connection string for caching sponsor segments. Implements TTL-based cache (30 days) to avoid redundant LLM calls.

**Cache Behavior:**

- **Key format:** `seg:{videoId}` → JSON `VideoAnalysis` object
- **TTL:** 30 days (configurable via `CACHE_TTL_DAYS`)
- **Hit rate target:** ≥65% (reduces LLM calls significantly)

**Setting Up:**

**Option 1: Docker Compose (recommended)**

```bash
docker compose -f infra/docker-compose.yml up -d redis

# Connection string:
REDIS_URL=redis://redis:6379
```

**Option 2: Local Redis**

```bash
# Install Redis
brew install redis  # macOS
# or apt-get install redis-server  # Linux

# Start Redis
redis-server

# Connection string:
REDIS_URL=redis://localhost:6380
```

**Option 3: AWS ElastiCache**

```bash
# Create ElastiCache cluster
aws elasticache create-cache-cluster \
  --cache-cluster-id skip-sponsor-cache \
  --cache-node-type cache.t4g.micro \
  --engine redis \
  --engine-version 7.2 \
  --num-cache-nodes 1

# Get endpoint
aws elasticache describe-cache-clusters \
  --cache-cluster-id skip-sponsor-cache \
  --query 'CacheClusters[0].CacheNodes[0].Address'

# If auth enabled:
REDIS_URL=redis://:your-auth-token@endpoint:6379
```

**Verifying Connection:**

```bash
# Test with redis-cli
redis-cli -u "redis://localhost:6380" PING
# Should return: PONG

# Check cache entries
redis-cli -u "$REDIS_URL" KEYS "seg:*"
# Lists all cached videos
```

---

### NODE_ENV

**Type:** `string` enum  
**Required:** No  
**Default:** `development`  
**Values:** `development` | `staging` | `production`  
**Example:**

```
NODE_ENV=production
```

**Description:**  
Node.js environment mode. Controls error handling, logging, response headers, and performance optimizations.

| Value         | Effect                                                                  |
| ------------- | ----------------------------------------------------------------------- |
| `development` | Detailed errors, verbose logs, no compression, slower startup           |
| `staging`     | Balanced logging, compression enabled, auth tokens logged (redacted)    |
| `production`  | Minimal logs, max compression, strict error messages, optimized startup |

**Setting Up:**

```bash
# Local development
NODE_ENV=development npm run dev:api

# Production
NODE_ENV=production npm start
```

---

### LOG_LEVEL

**Type:** `string` enum  
**Required:** No  
**Default:** `info`  
**Values:** `trace` | `debug` | `info` | `warn` | `error` | `fatal`  
**Example:**

```
LOG_LEVEL=debug
```

**Description:**  
Minimum logging level for pino structured logger. Controls verbosity of JSON logs to CloudWatch/stdout.

| Level   | Output                                | Use Case                               |
| ------- | ------------------------------------- | -------------------------------------- |
| `trace` | All function calls, argument values   | Deep debugging (performance intensive) |
| `debug` | Variable state, decision points       | Development, troubleshooting           |
| `info`  | Key events, latencies, cache hits     | Normal operations                      |
| `warn`  | Potential issues, fallbacks activated | Monitoring for anomalies               |
| `error` | Failures, exceptions                  | Alert on errors                        |
| `fatal` | Unrecoverable errors, server crashes  | Critical alerts                        |

**Example Output:**

```json
// LOG_LEVEL=debug
{"level":20,"time":"2026-10-06T...","pid":1234,"msg":"Cache HIT","videoId":"dQw4w9WgXcQ"}
{"level":30,"time":"2026-10-06T...","pid":1234,"msg":"LLM classification","model":"claude-haiku-4-5-20251001","latencyMs":820,"confidence":0.91}

// LOG_LEVEL=warn
{"level":40,"time":"2026-10-06T...","pid":1234,"msg":"analysis failed; not analyzed (SponsorBlock off)","videoId":"..."}
```

**Setting Up:**

```bash
# Verbose debugging
LOG_LEVEL=debug npm run dev:api

# Production (info only)
LOG_LEVEL=info npm start
```

---

### PORT

**Type:** `number`  
**Required:** No  
**Default:** `3040` under `npm run dev:api` (package.json `config.port`); `3000` otherwise (the container port in `infra/Dockerfile.api`)  
**Valid Range:** 1024–65535  
**Example:**

```
PORT=8080
```

**Description:**  
HTTP port on which the Fastify server listens. Extension makes requests to `http://localhost:{PORT}/v1/segments/{videoId}`.

**Setting Up:**

```bash
# Custom port
PORT=8080 npm run dev:api
# Now accessible at http://localhost:8080/v1/segments/...

# Check if port is in use
lsof -i :3040  # macOS/Linux
netstat -ano | findstr :3040  # Windows
```

---

### CORS_ORIGIN

**Type:** `string` (comma-separated origins, or `*`)  
**Required:** No  
**Default:** unset = any origin in development; any `chrome-extension://` origin in production  
**Examples:**

```
CORS_ORIGIN=*
CORS_ORIGIN=chrome-extension://abcdefghijklmnopabcdefghijklmnop
CORS_ORIGIN=chrome-extension://<store item id>,chrome-extension://<unpacked dev id>
```

**Description:**  
Origins allowed to call the API from a browser. The extension's service worker
calls from `chrome-extension://<item id>`; the store assigns the ID on the first
upload, so pin it then. CORS only limits browsers: install tokens, the daily
quota and rate limits protect the API from scripts.

---

### LLM_TIMEOUT_MS

**Type:** `number` (milliseconds)  
**Required:** No  
**Default:** `8000` (8 seconds)  
**Valid Range:** 1000–30000  
**Example:**

```
LLM_TIMEOUT_MS=8000
```

**Description:**  
Maximum time the backend waits for Anthropic Claude to return a classification response. If exceeded, the request is retried or escalated to Sonnet.

**When to Adjust:**

- **Increase (e.g., 15000):** If experiencing frequent timeouts, network is slow, or during high API load
- **Decrease (e.g., 5000):** If you want failed analyses to give up sooner

**Behavior on Timeout:**

1. LLM call exceeds threshold
2. Retry once with Haiku (if `LLM_MAX_RETRIES=1`)
3. If retry fails, escalate to Sonnet (slower but more reliable)
4. If Sonnet times out, the video is answered `unanalyzable` (SponsorBlock read-only fallback only with `SPONSORBLOCK_ENABLED=1`)

**Setting Up:**

```bash
LLM_TIMEOUT_MS=15000 npm run dev:api
```

---

### LLM_MAX_RETRIES

**Type:** `number`  
**Required:** No  
**Default:** `1`  
**Valid Range:** 0–3  
**Example:**

```
LLM_MAX_RETRIES=2
```

**Description:**  
Number of retry attempts when Haiku LLM times out before escalating to Sonnet or fallback.

| Value | Behavior                                 |
| ----- | ---------------------------------------- |
| `0`   | No retries; timeout → Sonnet immediately |
| `1`   | Retry Haiku once; if fails → Sonnet      |
| `2`   | Retry Haiku twice; then Sonnet           |

**Trade-off:** More retries = higher success rate but slower response time.

**Setting Up:**

```bash
LLM_MAX_RETRIES=2 npm run dev:api
```

---

### CONFIDENCE_THRESHOLD

**Type:** `number` (0.0–1.0)  
**Required:** No  
**Default:** `0.78`  
**Valid Range:** 0.5–0.95  
**Example:**

```
CONFIDENCE_THRESHOLD=0.85
```

**Description:**  
Minimum confidence score required to accept a sponsor segment. Segments below this threshold are discarded.

**Impact on Accuracy (illustrative targets, not measured; no labeled evaluation has been run yet):**

| Threshold | Precision | Recall   | Use Case                            |
| --------- | --------- | -------- | ----------------------------------- |
| 0.50      | ~70%      | ~98%     | Very lenient, many false positives  |
| 0.70      | ~85%      | ~95%     | Aggressive skipping                 |
| **0.78**  | **~93%**  | **~90%** | Balanced (default)                  |
| 0.85      | ~96%      | ~82%     | Conservative, fewer false positives |
| 0.95      | ~99%      | ~60%     | Very strict, high false negatives   |

**Setting Up:**

```bash
# Conservative (few false positives)
CONFIDENCE_THRESHOLD=0.85 npm run dev:api

# Aggressive (few false negatives)
CONFIDENCE_THRESHOLD=0.70 npm run dev:api
```

---

### CACHE_TTL_DAYS

**Type:** `number` (days)  
**Required:** No  
**Default:** `30`  
**Valid Range:** 1–365  
**Example:**

```
CACHE_TTL_DAYS=30
```

**Description:**  
How long sponsor segment analysis results are cached in Redis and PostgreSQL before being deleted. Reduces LLM calls for frequently watched videos.

**Cache Hit Impact:**

- With 30-day TTL: ~65% hit rate (fewer LLM calls)
- With 7-day TTL: ~40% hit rate (more fresh data)

**Setting Up:**

```bash
CACHE_TTL_DAYS=30 npm run dev:api
```

---

### RATE_LIMIT_WINDOW_MS

**Type:** `number` (milliseconds)  
**Required:** No  
**Default:** `60000` (1 minute)  
**Example:**

```
RATE_LIMIT_WINDOW_MS=60000
```

**Description:**  
Time window for rate limit calculation. Requests are counted within this rolling window.

**Example:** With `RATE_LIMIT_WINDOW_MS=60000` and `RATE_LIMIT_MAX_REQUESTS=60`:

- Allow 60 requests per minute per install
- Requests reset every 60 seconds

---

### RATE_LIMIT_MAX_REQUESTS

**Type:** `number`  
**Required:** No  
**Default:** `60`  
**Example:**

```
RATE_LIMIT_MAX_REQUESTS=100
```

**Description:**  
Maximum requests allowed per install within the rate limit window.

**Calculation:** 60 requests / 60 seconds = 1 request/second per install

---

### SENTRY_DSN

**Type:** `string` (Sentry project DSN)  
**Required:** No  
**Default:** Empty (disabled)  
**Example:**

```
SENTRY_DSN=https://abc123@sentry.io/1234567
```

**Description:**  
Sentry error tracking DSN for monitoring exceptions and crashes. Leave empty to disable.

**Setting Up:**

1. Create Sentry account: [sentry.io](https://sentry.io)
2. Create project (select "Node.js")
3. Copy DSN from Settings → DSN/Keys
4. Add to `.env`:
   ```
   SENTRY_DSN=https://...@sentry.io/...
   ```

---

## Security & Secrets

### Best Practices

✅ **DO:**

- Store API keys in AWS Secrets Manager, Azure Key Vault, or similar
- Use separate keys for dev/staging/prod
- Rotate keys quarterly
- Monitor key usage in vendor console
- Enable audit logging for secret access
- Use environment variable injection at container runtime

❌ **DON'T:**

- Commit `.env` files to git
- Hardcode secrets in source code
- Share API keys via email or Slack
- Use same key for multiple environments
- Log full API keys (redact in logs)

### Git Safety

Prevent accidental commits:

```bash
# Add to .gitignore
echo ".env" >> .gitignore
echo ".env.local" >> .gitignore
echo ".env.*.local" >> .gitignore

# Install git-secrets
brew install git-secrets  # macOS
apt-get install git-secrets  # Linux

# Configure git-secrets
git secrets --install
git secrets --register-aws
git secrets --add-pattern "sk-ant-"  # Block Anthropic keys
```

---

## Getting Started

### 1. Local Development Setup

```bash
# Clone repo
git clone https://github.com/yourusername/skip-sponsor-ai.git
cd skip-sponsor-ai

# Create .env.local (extension config)
cat > .env.local << 'EOF'
VITE_API_BASE_URL=http://localhost:3040
VITE_ENVIRONMENT=development
VITE_DEBUG_MODE=true
EOF

# Create .env (backend config)
cat > .env << 'EOF'
ANTHROPIC_API_KEY=sk-ant-your-key-here
DATABASE_URL=postgresql://skipsponsor:password@localhost:5434/skipsponsor
REDIS_URL=redis://localhost:6380
NODE_ENV=development
LOG_LEVEL=debug
PORT=3040
CORS_ORIGIN=*
EOF

# Install dependencies
npm ci

# Start PostgreSQL + Redis
docker compose -f infra/docker-compose.yml up -d

# Build extension
npm run build:extension

# Start backend (in new terminal)
npm run dev:api

# Load extension in Chrome
# 1. Open chrome://extensions/
# 2. Enable Developer Mode
# 3. Load unpacked → select dist/extension
```

---

## Common Configurations

### Production Deployment

```bash
# .env (production)
ANTHROPIC_API_KEY=sk-ant-...  # From AWS Secrets Manager
DATABASE_URL=postgresql://...@skip-sponsor-db.rds.amazonaws.com/skipsponsor
REDIS_URL=redis://:password@skip-sponsor-cache.elasticache.amazonaws.com:6379
NODE_ENV=production
LOG_LEVEL=warn
PORT=3000
CORS_ORIGIN=https://skipsponsor.ai
SENTRY_DSN=https://...@sentry.io/...
```

### Staging Environment

```bash
# .env (staging)
ANTHROPIC_API_KEY=sk-ant-...  # Staging key
DATABASE_URL=postgresql://...@staging-db.rds.amazonaws.com/skipsponsor_staging
REDIS_URL=redis://...@staging-cache.elasticache.amazonaws.com:6379
NODE_ENV=staging
LOG_LEVEL=debug
PORT=3000
CORS_ORIGIN=https://staging.skipsponsor.ai,http://localhost:3040
SENTRY_DSN=https://...@sentry.io/...
```

### High-Confidence Classification

```bash
# Minimize false positives
CONFIDENCE_THRESHOLD=0.88
LLM_TIMEOUT_MS=5000  # Faster fallbacks
LOG_LEVEL=warn
```

### Aggressive Classification

```bash
# Maximize coverage
CONFIDENCE_THRESHOLD=0.70
LLM_TIMEOUT_MS=15000  # More time for Haiku
LLM_MAX_RETRIES=2
LOG_LEVEL=debug
```

---

For more information, see:

- [README.md](../README.md)
- [LOCAL_TESTING.md](./LOCAL_TESTING.md)
- [skip-sponsor-ai-technical-spec.md](../skip-sponsor-ai-technical-spec.md)
