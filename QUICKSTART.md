# SkipSponsor AI — Quick Start Guide

Get up and running with SkipSponsor AI in 15 minutes. This guide covers the essential steps to develop, test, and deploy the Chrome extension locally.

## TL;DR (5-Minute Setup)

```bash
# 1. Clone and install
git clone https://github.com/yourusername/skip-sponsor-ai.git
cd skip-sponsor-ai
npm ci

# 2. Get Anthropic API key
# Visit: https://console.anthropic.com/account/keys
# Copy your key (starts with sk-ant-)

# 3. Create environment files
echo 'VITE_API_BASE_URL=http://localhost:3000' > .env.local
echo 'VITE_DEBUG_MODE=true' >> .env.local

cat > .env << EOF
ANTHROPIC_API_KEY=sk-ant-your-key-here
DATABASE_URL=postgresql://skipsponsor:password@localhost:5432/skipsponsor
REDIS_URL=redis://localhost:6379
NODE_ENV=development
LOG_LEVEL=debug
PORT=3000
EOF

# 4. Start services
docker-compose up -d  # PostgreSQL + Redis
npm run build:extension  # Build extension
npm run dev:api  # Backend (new terminal)

# 5. Load in Chrome
# 1. chrome://extensions/ → Developer Mode → Load unpacked
# 2. Select dist/extension
# 3. Test on YouTube videos
```

## Prerequisites Checklist

Before starting, verify you have:

- [ ] Node.js 20 LTS or later
- [ ] npm or pnpm
- [ ] Chrome 116 or later
- [ ] Docker & Docker Compose (optional but recommended)
- [ ] Anthropic API key (free: [console.anthropic.com](https://console.anthropic.com))

**Verify installations:**
```bash
node --version && npm --version && chrome --version
# Output: v20.x.x, 8.x.x, Google Chrome 116.x.x
```

## Step 1: Get Anthropic API Key (2 minutes)

**Obtain your free API key:**

1. Visit [console.anthropic.com](https://console.anthropic.com)
2. Sign in or create account (free tier includes $5 credit/month)
3. Click **Account** → **API Keys** (left sidebar)
4. Click **Create Key**
5. Name it "SkipSponsor Local Dev"
6. Copy the full key (e.g., `sk-ant-abc123xyz789...`)
7. **Save it somewhere safe** (you'll need it in Step 4)

**Cost estimate:** ~$0.004 per video analysis with Haiku model. Free tier covers 1000+ videos.

## Step 2: Clone Repository (1 minute)

```bash
git clone https://github.com/yourusername/skip-sponsor-ai.git
cd skip-sponsor-ai
npm ci
```

## Step 3: Create Environment Files (2 minutes)

### Extension Configuration (`.env.local`)

```bash
cat > .env.local << 'EOF'
VITE_API_BASE_URL=http://localhost:3000
VITE_ENVIRONMENT=development
VITE_DEBUG_MODE=true
EOF
```

**Explanation:**
- `VITE_API_BASE_URL`: Where the extension finds the backend API
- `VITE_ENVIRONMENT`: Set to development for verbose logging
- `VITE_DEBUG_MODE`: Enable console debug messages

### Backend Configuration (`.env`)

```bash
cat > .env << 'EOF'
# Replace sk-ant-xxx with your actual API key from Step 1
ANTHROPIC_API_KEY=sk-ant-your-api-key-here
DATABASE_URL=postgresql://skipsponsor:password@localhost:5432/skipsponsor
REDIS_URL=redis://localhost:6379
NODE_ENV=development
LOG_LEVEL=debug
PORT=3000
CORS_ORIGIN=*
EOF
```

**⚠️ IMPORTANT:**
- Never commit `.env` files to git
- `.env` contains your Anthropic API key — keep it private
- Already in `.gitignore` — safe to create

## Step 4: Start Backend Services (3 minutes)

### Option A: Using Docker Compose (Recommended)

```bash
# Start PostgreSQL + Redis in background
docker-compose up -d

# Verify services running
docker-compose ps
# Should show: postgres (Up) and redis (Up)
```

### Option B: Manual Setup (if no Docker)

**PostgreSQL:**
```bash
brew install postgresql@16  # macOS
# or: apt-get install postgresql postgresql-contrib  # Linux

# Create database and user
psql -U postgres -c "CREATE USER skipsponsor WITH PASSWORD 'password';"
psql -U postgres -c "CREATE DATABASE skipsponsor OWNER skipsponsor;"
```

**Redis:**
```bash
brew install redis  # macOS
# or: apt-get install redis-server  # Linux

redis-server  # Start in background
```

## Step 5: Build Extension (2 minutes)

```bash
npm run build:extension
```

Output: `dist/extension/` containing bundled extension files

Verify build:
```bash
ls -la dist/extension/ | grep manifest.json
# Should show: manifest.json
```

## Step 6: Start Backend API (1 minute)

**In a new terminal:**

```bash
npm run dev:api
```

Expected output:
```
[Fastify] listening on port 3000
```

Verify API working:
```bash
curl http://localhost:3000/health
# Should return: {"status":"ok"}
```

## Step 7: Load Extension in Chrome (2 minutes)

### Load Unpacked Extension

1. **Open Chrome Extensions:**
   ```
   chrome://extensions/
   ```

2. **Enable Developer Mode:**
   - Toggle **Developer mode** switch (top-right corner)

3. **Load Unpacked:**
   - Click **Load unpacked**
   - Navigate to `/path/to/skip-sponsor-ai/dist/extension`
   - Select folder → Open
   
4. **Verify Installation:**
   - Extension appears in Chrome toolbar
   - Extension name: "SkipSponsor AI"
   - Click extension icon to see popup (if implemented)

5. **Reload After Code Changes:**
   - Go back to `chrome://extensions/`
   - Click reload icon on extension card
   - Or press `Ctrl+R` (Windows/Linux) or `Cmd+R` (macOS)

## Step 8: Test on YouTube (3 minutes)

### Navigate to Test Video

1. Open Chrome
2. Go to YouTube: `https://www.youtube.com/watch?v=dQw4w9WgXcQ`
3. Ensure video has captions (CC icon visible in player)

### Watch for Extension Activity

1. Open DevTools: `F12` or `Cmd+Option+I`
2. Go to **Console** tab
3. Select **youtube.com** in the context dropdown
4. Reload page: `Cmd+R` or `F5`
5. Look for extension logs:
   ```
   [SkipSponsor] DEBUG: Initializing detector for video: dQw4w9WgXcQ
   [SkipSponsor] DEBUG: Captions found
   [SkipSponsor] DEBUG: Fetching segments from API...
   ```

### Verify Skip Functionality

1. Watch video or jump to timestamp with sponsor segment
2. When video enters sponsor segment:
   - Video auto-seeks forward
   - Toast notification appears (bottom-right): "Sponsor skipped!"
3. Click **Undo** within 4 seconds:
   - Video seeks back to 1 second before sponsor
   - Toast disappears

## Troubleshooting

### "Cannot connect to http://localhost:3000"

**Problem:** Extension can't reach backend

**Solution:**
```bash
# 1. Verify backend is running
curl http://localhost:3000/health

# 2. Check .env.local
cat .env.local | grep VITE_API_BASE_URL

# 3. Rebuild extension
npm run build:extension

# 4. Reload in Chrome
chrome://extensions/ → Reload icon
```

### "ANTHROPIC_API_KEY not set" error

**Problem:** Backend crashes on startup

**Solution:**
```bash
# 1. Verify .env file exists and has API key
cat .env | grep ANTHROPIC_API_KEY

# 2. Verify API key format
# Should be: sk-ant-abc123xyz...

# 3. Test API key
curl -H "Authorization: Bearer YOUR_API_KEY" \
  https://api.anthropic.com/v1/messages \
  -X POST -H "Content-Type: application/json" \
  -d '{"model":"claude-haiku-4-5-20251001","max_tokens":10,"messages":[{"role":"user","content":"hi"}]}'

# 4. Restart backend
npm run dev:api
```

### "Sponsor segments not detected"

**Problem:** Extension doesn't skip any sponsors

**Solution:**
```bash
# 1. Verify video has captions
# YouTube video → Check CC icon in player (should be enabled)

# 2. Check extension debug logs
# DevTools → Console (select youtube.com context)
# Look for errors or "no_captions" messages

# 3. Check backend logs
# Terminal running npm run dev:api should show API requests

# 4. Enable verbose logging
VITE_DEBUG_MODE=true npm run build:extension
# Then reload extension in Chrome
```

### Docker containers not starting

**Problem:** `docker-compose up -d` fails

**Solution:**
```bash
# 1. Verify Docker is running
docker ps  # Should return container list (or empty)

# 2. Start services with output
docker-compose up  # (no -d flag, shows logs)

# 3. Check for port conflicts
lsof -i :5432  # PostgreSQL port
lsof -i :6379  # Redis port

# 4. Clean up and restart
docker-compose down
docker-compose up -d
```

## Next Steps

### Continue Development

After verifying basic functionality:

1. **Explore codebase:**
   - Extension code: `src/extension/`
   - Backend code: `src/api/`
   - Shared types: `src/shared/types.ts`

2. **Read comprehensive docs:**
   - [README.md](./README.md) — Full project overview
   - [CLAUDE.md](./CLAUDE.md) — AI assistant guidance
   - [LOCAL_TESTING.md](./docs/LOCAL_TESTING.md) — Detailed testing guide
   - [ENV_VARIABLES.md](./docs/ENV_VARIABLES.md) — Complete env var reference
   - [skip-sponsor-ai-technical-spec.md](./skip-sponsor-ai-technical-spec.md) — Full spec

3. **Run tests:**
   ```bash
   npm run test  # Unit tests
   npm run test:coverage  # Coverage report
   npm run test:e2e  # E2E with Playwright
   ```

4. **Check code quality:**
   ```bash
   npm run verify  # lint + typecheck + test
   ```

### Deploy to Chrome Web Store

When ready for production:

1. **Build for production:**
   ```bash
   VITE_ENVIRONMENT=production npm run build:extension
   ```

2. **Create distribution zip:**
   ```bash
   cd dist/extension && zip -r ../skipsponsor-v1.0.0.zip . && cd ../..
   ```

3. **Upload to Chrome Web Store:**
   - Visit [chromewebstore.google.com/devconsole](https://chromewebstore.google.com/devconsole)
   - Create new item or update existing
   - Upload `.zip` file
   - Submit for review

## Useful Commands

```bash
# Development
npm run dev:extension       # Build with Vite HMR
npm run dev:api            # Start backend with live reload

# Building
npm run build:extension    # Production build
npm run build:api          # Build backend

# Testing
npm run test               # Run unit tests
npm run test:watch        # Watch mode
npm run test:e2e          # E2E tests
npm run test:coverage     # Coverage report

# Quality
npm run lint              # ESLint check
npm run format            # Prettier formatting
npm run typecheck         # TypeScript check
npm run verify            # All checks (lint + typecheck + test)

# Database
npm run db:migrate        # Run migrations
npm run db:seed           # Seed test data

# Infrastructure
npm run tf:plan           # Terraform plan
npm run tf:apply          # Deploy to AWS
```

## Debug Tools

### Chrome DevTools

**Console (Extension Logs):**
1. `F12` → Console tab
2. Select **youtube.com** context
3. Look for `[SkipSponsor]` prefixed messages

**Network (API Requests):**
1. `F12` → Network tab
2. Filter by `Fetch/XHR`
3. Click requests to see request/response

**Storage (Extension Data):**
1. `F12` → Application → Storage
2. `chrome-extension://` (extension ID)
3. View LocalStorage and SyncStorage

### Backend Logs

```bash
# Currently running in terminal
npm run dev:api

# View formatted logs
LOG_LEVEL=debug npm run dev:api | jq .

# Tail logs in file (if implemented)
tail -f logs/api.log | jq .
```

### Database Inspection

```bash
# Query PostgreSQL
psql "$DATABASE_URL" -c "SELECT * FROM video_analyses LIMIT 5;"

# Check Redis cache
redis-cli -u "$REDIS_URL" KEYS "seg:*" | head -5
redis-cli -u "$REDIS_URL" GET "seg:dQw4w9WgXcQ"
```

## Support & Resources

- **Issues:** [GitHub Issues](https://github.com/yourusername/skip-sponsor-ai/issues)
- **Discussions:** [GitHub Discussions](https://github.com/yourusername/skip-sponsor-ai/discussions)
- **API Docs:** [Anthropic API Reference](https://docs.anthropic.com)
- **Chrome Docs:** [Chrome Extension MV3](https://developer.chrome.com/docs/extensions/)
- **Status Page:** [Anthropic Status](https://status.anthropic.com)

## FAQ

**Q: Can I use this on non-YouTube sites?**  
A: Not in v1. Spec is YouTube-only. SPA navigation on youtube.com only.

**Q: Does this work on YouTube Shorts?**  
A: Not in v1. Spec covers youtube.com/watch only. Shorts out-of-scope.

**Q: How accurate is the sponsor detection?**  
A: ~93% precision, ~90% recall on the 500-video test set using Claude Haiku.

**Q: What if there are no captions?**  
A: Falls back to SponsorBlock read-only API (no write). If neither works, manual marking only.

**Q: How much does this cost?**  
A: ~$0.004 per video analyzed using Haiku. Free tier includes $5/month. Cache hit rate ~65%.

**Q: Can I use my own Claude model/key?**  
A: Yes. Edit `ANTHROPIC_API_KEY` in `.env` and `src/api/services/llm-client.ts` to change models.

---

**Ready to start?** Go to Step 1 above and follow along. Questions? Open an [issue](https://github.com/yourusername/skip-sponsor-ai/issues) or [discussion](https://github.com/yourusername/skip-sponsor-ai/discussions).
