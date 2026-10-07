# Setup Summary: Environment Variables & Configuration Files

Complete reference of all environment variables, configuration files, and setup steps for SkipSponsor AI.

## Files Created/Updated

### Documentation Files

| File | Purpose | Read Time |
| --- | --- | --- |
| [README.md](../README.md) | Project overview, features, deployment | 10 min |
| [CLAUDE.md](../CLAUDE.md) | AI assistant guidance for development | 5 min |
| [QUICKSTART.md](../QUICKSTART.md) | 15-minute setup guide | 5 min |
| [LOCAL_TESTING.md](./LOCAL_TESTING.md) | Detailed local testing & debugging | 20 min |
| [ENV_VARIABLES.md](./ENV_VARIABLES.md) | Complete environment variable reference | 30 min |
| [skip-sponsor-ai-technical-spec.md](../skip-sponsor-ai-technical-spec.md) | Full technical specification | 45 min |
| [SETUP_SUMMARY.md](./SETUP_SUMMARY.md) | This file | 5 min |

### Configuration Files

| File | Purpose | Status |
| --- | --- | --- |
| [.env.example](../.env.example) | Template for backend environment | Created |
| [.env](../.env) | Backend configuration (secrets, API keys) | Created by user |
| [.env.local](../.env.local) | Extension build-time configuration | Created by user |
| [.gitignore](../.gitignore) | Git ignore patterns (secrets, build output) | Updated |

---

## Quick Reference: All Environment Variables

### Extension Client (`.env.local`)

```bash
# Build-time configuration for MV3 Chrome extension
VITE_API_BASE_URL=http://localhost:3000           # Backend API endpoint
VITE_ENVIRONMENT=development                      # development|staging|production
VITE_DEBUG_MODE=true                              # Enable verbose console logs
```

**When to set:**
- Before: `npm run build:extension`
- After: reload extension in Chrome

### Backend Server (`.env`)

```bash
# Required (API & Database)
ANTHROPIC_API_KEY=sk-ant-...                      # Anthropic Claude API key (REQUIRED)
DATABASE_URL=postgresql://user:pass@host/db      # PostgreSQL connection (REQUIRED)
REDIS_URL=redis://host:port                      # Redis cache (REQUIRED)

# Optional (Server Config)
NODE_ENV=development                              # development|staging|production
LOG_LEVEL=debug                                   # trace|debug|info|warn|error|fatal
PORT=3000                                         # HTTP server port
CORS_ORIGIN=*                                     # Allowed CORS origins

# Optional (LLM Behavior)
LLM_TIMEOUT_MS=8000                               # Max LLM inference time
LLM_MAX_RETRIES=1                                 # Retry attempts on timeout
CONFIDENCE_THRESHOLD=0.78                         # Min segment confidence (0.5-0.95)

# Optional (Cache)
CACHE_TTL_DAYS=30                                 # Cache retention days

# Optional (Rate Limiting)
RATE_LIMIT_WINDOW_MS=60000                        # Rate limit window (ms)
RATE_LIMIT_MAX_REQUESTS=60                        # Max requests per window

# Optional (Monitoring)
SENTRY_DSN=                                       # Sentry error tracking (optional)
```

**When to set:**
- Before: `npm run dev:api` or `npm start`

---

## Setup Checklist

### Initial Setup (One-Time)

- [ ] Read [QUICKSTART.md](../QUICKSTART.md) (5 min)
- [ ] Get Anthropic API key from [console.anthropic.com](https://console.anthropic.com) (2 min)
- [ ] Clone repository: `git clone https://github.com/yourusername/skip-sponsor-ai.git`
- [ ] Install dependencies: `npm ci`
- [ ] Create `.env.local` with extension config
- [ ] Create `.env` with backend config (with API key)
- [ ] Start Docker services: `docker-compose up -d`
- [ ] Build extension: `npm run build:extension`
- [ ] Start backend: `npm run dev:api`
- [ ] Load in Chrome: `chrome://extensions/ → Load unpacked`

### Development Workflow

**Each coding session:**

```bash
# 1. Make code changes (src/extension/ or src/api/)

# 2. Type check & lint
npm run typecheck
npm run lint --fix

# 3. Build & reload
npm run build:extension
# Then reload extension in Chrome (chrome://extensions/)

# 4. Test on YouTube
# Navigate to https://www.youtube.com/watch?v=...

# 5. Debug with DevTools
# F12 → Console → Select youtube.com context
```

---

## Anthropic API Key: Step-by-Step

### 1. Create Account & Get Key (2 minutes)

```
1. Visit: https://console.anthropic.com
2. Sign up or log in (free account, $5 credit/month)
3. Click "Account" (left sidebar)
4. Click "API Keys"
5. Click "Create Key"
6. Name: "SkipSponsor Local Dev"
7. Copy full key (sk-ant-...)
```

### 2. Add to `.env`

```bash
cat > .env << 'EOF'
ANTHROPIC_API_KEY=sk-ant-your-full-key-here
DATABASE_URL=postgresql://skipsponsor:password@localhost:5432/skipsponsor
REDIS_URL=redis://localhost:6379
NODE_ENV=development
LOG_LEVEL=debug
PORT=3000
CORS_ORIGIN=*
EOF
```

### 3. Verify

```bash
# Test key directly
curl -H "Authorization: Bearer sk-ant-your-key" \
  https://api.anthropic.com/v1/messages \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{
    "model": "claude-3-5-haiku-latest",
    "max_tokens": 100,
    "messages": [{"role": "user", "content": "Say hello"}]
  }'

# Should return valid JSON with message response
```

---

## Database Setup: Step-by-Step

### Option 1: Docker Compose (Recommended)

```bash
# Start PostgreSQL + Redis
docker-compose up -d

# Verify
docker-compose ps
# postgres  ... Up 5432/tcp
# redis     ... Up 6379/tcp
```

### Option 2: Manual PostgreSQL

```bash
# Install
brew install postgresql@16  # macOS

# Create user & database
psql -U postgres << SQL
CREATE USER skipsponsor WITH PASSWORD 'password';
CREATE DATABASE skipsponsor OWNER skipsponsor;
\q
SQL

# Test connection
psql postgresql://skipsponsor:password@localhost:5432/skipsponsor -c "SELECT 1"
```

### Option 3: Manual Redis

```bash
# Install
brew install redis  # macOS

# Start
redis-server

# Test
redis-cli PING
# PONG
```

---

## Building & Loading Extension

### Development Build

```bash
# Build with Vite HMR (hot reload)
npm run dev:extension
# Rebuilds on file changes

# In Chrome:
# chrome://extensions/ → Reload icon (after changes)
```

### Production Build

```bash
npm run build:extension
# Generates dist/extension/

# Verify
ls dist/extension/manifest.json
```

### Load in Chrome

```
1. Open: chrome://extensions/
2. Enable: Developer Mode (toggle, top-right)
3. Click: Load unpacked
4. Select: /path/to/skip-sponsor-ai/dist/extension
5. Confirm: Open
6. Extension appears in toolbar
```

**Reload after changes:**
```
chrome://extensions/ → Find "SkipSponsor AI" → Click reload icon
```

---

## Running Services

### Start Backend API

```bash
npm run dev:api
# Output: [Fastify] listening on port 3000
# Ctrl+C to stop
```

### Start Extension Dev Server

```bash
npm run dev:extension
# Watches for changes, rebuilds automatically
# Ctrl+C to stop
```

### Stop All Services

```bash
# Terminal 1: Stop backend
Ctrl+C

# Terminal 2: Stop extension dev
Ctrl+C

# Docker services
docker-compose down
```

---

## Troubleshooting Environment Issues

### "ANTHROPIC_API_KEY not set"

```bash
# 1. Check file exists
ls -la .env

# 2. Check variable is set
grep ANTHROPIC_API_KEY .env

# 3. Check format (should start with sk-ant-)
cat .env | grep ANTHROPIC_API_KEY

# 4. Restart backend
npm run dev:api
```

### "Cannot connect to database"

```bash
# 1. Check PostgreSQL running
docker-compose ps | grep postgres
# or
psql -U postgres -c "SELECT 1"

# 2. Check connection string format
grep DATABASE_URL .env
# Should be: postgresql://skipsponsor:password@localhost:5432/skipsponsor

# 3. Test connection
psql "$DATABASE_URL" -c "SELECT 1"
```

### "Cannot connect to redis"

```bash
# 1. Check Redis running
docker-compose ps | grep redis
# or
redis-cli PING

# 2. Check connection string
grep REDIS_URL .env
# Should be: redis://localhost:6379

# 3. Test connection
redis-cli -u "redis://localhost:6379" PING
```

### "API returns 404"

```bash
# 1. Check backend running
curl http://localhost:3000/health
# Should return: {"status":"ok"}

# 2. Check .env.local has correct URL
cat .env.local | grep VITE_API_BASE_URL
# Should be: http://localhost:3000

# 3. Rebuild extension
npm run build:extension

# 4. Reload in Chrome
# chrome://extensions/ → Reload icon
```

---

## File Security

### Never Commit These Files

```bash
# Secrets
.env                          # Backend API key, database creds
.env.local                    # Extension API base URL (may be sensitive)
.env.*.local                  # Environment-specific overrides

# Already in .gitignore:
node_modules/                # Dependencies
dist/                         # Build output
*.log                         # Logs
.DS_Store                     # macOS files
```

### Verify `.gitignore` is Working

```bash
# Check .env is ignored
git check-ignore -v .env
# Output: .gitignore:5:.env (if properly ignored)

# Prevent accidental commits
git secrets --install
git secrets --register-aws
git secrets --add-pattern "sk-ant-"  # Anthropic keys
```

---

## Configuration for Different Environments

### Local Development

```bash
# .env.local
VITE_API_BASE_URL=http://localhost:3000
VITE_ENVIRONMENT=development
VITE_DEBUG_MODE=true

# .env
ANTHROPIC_API_KEY=sk-ant-...
DATABASE_URL=postgresql://skipsponsor:password@localhost:5432/skipsponsor
REDIS_URL=redis://localhost:6379
NODE_ENV=development
LOG_LEVEL=debug
CORS_ORIGIN=*
```

### Staging

```bash
# .env.local
VITE_API_BASE_URL=https://staging-api.skipsponsor.ai
VITE_ENVIRONMENT=staging
VITE_DEBUG_MODE=false

# .env
ANTHROPIC_API_KEY=sk-ant-staging-key
DATABASE_URL=postgresql://admin:...@staging-db.rds.amazonaws.com/skipsponsor_staging
REDIS_URL=redis://:password@staging-cache.elasticache.amazonaws.com:6379
NODE_ENV=staging
LOG_LEVEL=info
CORS_ORIGIN=https://staging.skipsponsor.ai
```

### Production

```bash
# .env.local
VITE_API_BASE_URL=https://api.skipsponsor.ai
VITE_ENVIRONMENT=production
VITE_DEBUG_MODE=false

# .env (via AWS Secrets Manager)
ANTHROPIC_API_KEY=<injected at runtime>
DATABASE_URL=<managed RDS endpoint>
REDIS_URL=<managed ElastiCache endpoint>
NODE_ENV=production
LOG_LEVEL=warn
CORS_ORIGIN=https://skipsponsor.ai
SENTRY_DSN=https://...@sentry.io/...
```

---

## Next Steps

After completing setup:

1. **Read full documentation:**
   - [README.md](../README.md)
   - [skip-sponsor-ai-technical-spec.md](../skip-sponsor-ai-technical-spec.md)
   - [ENV_VARIABLES.md](./ENV_VARIABLES.md) for detailed variable descriptions

2. **Run tests:**
   ```bash
   npm run test
   npm run test:coverage
   npm run test:e2e
   ```

3. **Start development:**
   ```bash
   npm run dev:extension  # Terminal 1
   npm run dev:api        # Terminal 2
   # Make changes, rebuild, test
   ```

4. **Deploy locally tested version:**
   - Build: `npm run build:extension`
   - Test on YouTube
   - Export to Chrome Web Store

---

## Support

- **Questions:** [GitHub Discussions](https://github.com/yourusername/skip-sponsor-ai/discussions)
- **Issues:** [GitHub Issues](https://github.com/yourusername/skip-sponsor-ai/issues)
- **API Docs:** [Anthropic Documentation](https://docs.anthropic.com)
- **Chrome Docs:** [Chrome Extension MV3](https://developer.chrome.com/docs/extensions/)

---

**Last Updated:** October 6, 2026  
**Version:** 1.0.0-setup
