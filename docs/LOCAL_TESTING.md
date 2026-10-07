# Local Testing & Deployment Guide

Complete step-by-step instructions for setting up, building, and testing the SkipSponsor AI extension on your local Chrome browser.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Environment Setup](#environment-setup)
3. [Backend Setup (Optional)](#backend-setup-optional)
4. [Building the Extension](#building-the-extension)
5. [Loading in Chrome](#loading-in-chrome)
6. [Testing Functionality](#testing-functionality)
7. [Debugging](#debugging)
8. [Troubleshooting](#troubleshooting)

## Prerequisites

Before starting, ensure you have:

### Required
- **macOS/Windows/Linux** with Chrome 116 or later installed
- **Node.js 20 LTS** → [Download](https://nodejs.org/en/download/current)
- **npm** (included with Node.js) or **pnpm** → [Install pnpm](https://pnpm.io/installation)
- **Git** for version control
- **Anthropic API Key** → [Get one free](https://console.anthropic.com/account/keys)

### Optional (for full backend testing)
- **Docker & Docker Compose** → [Install](https://docs.docker.com/get-docker/)
- **PostgreSQL 16** client tools (psql)
- **Redis CLI** (redis-cli)

### Verify Installations

```bash
node --version        # v20.x.x
npm --version         # 8.x.x or higher
chrome --version      # 116+
git --version         # 2.x.x
docker --version      # 24.x.x (optional)
```

## Environment Setup

### Step 1: Clone Repository

```bash
git clone https://github.com/yourusername/skip-sponsor-ai.git
cd skip-sponsor-ai
```

### Step 2: Install Dependencies

```bash
npm ci
```

This installs all dependencies from `package-lock.json` (reproducible builds).

### Step 3: Create Environment Files

#### Extension Environment (`.env.local`)

Create `.env.local` in project root:

```bash
cat > .env.local << 'EOF'
# SkipSponsor AI Extension Configuration
VITE_API_BASE_URL=http://localhost:3000
VITE_ENVIRONMENT=development
VITE_DEBUG_MODE=true
EOF
```

**Explanation:**
- `VITE_API_BASE_URL`: Backend API endpoint (http://localhost:3000 for local dev)
- `VITE_ENVIRONMENT`: Set to `development` for local testing
- `VITE_DEBUG_MODE`: Enable verbose console logging for debugging

#### Backend Environment (`.env`) — Optional

If running backend locally:

```bash
cat > .env << 'EOF'
# Anthropic Configuration
ANTHROPIC_API_KEY=sk-ant-your-key-here

# Database Configuration
DATABASE_URL=postgresql://skipsponsor:password@localhost:5432/skipsponsor
REDIS_URL=redis://localhost:6379

# Server Configuration
NODE_ENV=development
LOG_LEVEL=debug
PORT=3000
CORS_ORIGIN=*

# LLM Configuration
LLM_TIMEOUT_MS=8000
LLM_MAX_RETRIES=1
CONFIDENCE_THRESHOLD=0.78

# Cache Configuration
CACHE_TTL_DAYS=30

# Rate Limiting
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=60
EOF
```

**⚠️ Important:** Add `.env` to `.gitignore` to prevent accidental credential commits:

```bash
echo ".env" >> .gitignore
echo ".env.local" >> .gitignore
echo ".env.*.local" >> .gitignore
```

### Step 4: Get Your Anthropic API Key

1. Visit [console.anthropic.com](https://console.anthropic.com)
2. Sign in or create a free account
3. Navigate to **Account** → **API Keys** (left sidebar)
4. Click **Create Key**
5. Name it (e.g., "SkipSponsor Local Dev")
6. Copy the full key (starts with `sk-ant-`)
7. Paste into `.env` file:
   ```
   ANTHROPIC_API_KEY=sk-ant-abc123xyz789...
   ```

**Note:** Free tier includes $5 credit monthly, sufficient for development/testing.

## Backend Setup (Optional)

For full end-to-end testing with LLM classification, you'll need the backend running.

### Option A: Using Docker Compose (Recommended)

#### Start PostgreSQL & Redis

```bash
docker-compose up -d
```

This starts:
- PostgreSQL on `localhost:5432` (user: skipsponsor, pass: password)
- Redis on `localhost:6379`

Verify:
```bash
docker-compose ps
# Should show postgres and redis running
```

#### Run Database Migrations

```bash
npm run db:migrate
```

If `db:migrate` script doesn't exist yet, you can create tables manually:

```bash
psql postgresql://skipsponsor:password@localhost:5432/skipsponsor << 'EOF'
CREATE TABLE IF NOT EXISTS video_analyses (
  video_id TEXT PRIMARY KEY CHECK (char_length(video_id) = 11),
  channel_id TEXT,
  duration_sec REAL NOT NULL,
  language TEXT NOT NULL DEFAULT 'en',
  status TEXT NOT NULL DEFAULT 'ready',
  transcript_hash TEXT NOT NULL,
  analyzed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT now() + INTERVAL '30 days'
);

CREATE TABLE IF NOT EXISTS sponsor_segments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id TEXT NOT NULL REFERENCES video_analyses(video_id),
  start_time DOUBLE PRECISION NOT NULL,
  end_time DOUBLE PRECISION NOT NULL,
  confidence REAL NOT NULL,
  category TEXT NOT NULL,
  source TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_video_expires ON video_analyses (expires_at);
CREATE INDEX idx_seg_video ON sponsor_segments (video_id, start_time);
EOF
```

#### Start Backend Server

In a new terminal:

```bash
npm run dev:api
```

Backend starts on `http://localhost:3000`. You should see:
```
[Fastify] listening on port 3000
```

#### Verify Backend is Working

```bash
curl -X GET http://localhost:3000/health
# Should return: {"status":"ok"}
```

### Option B: Manual PostgreSQL + Redis Setup

If not using Docker:

1. **Install PostgreSQL 16:**
   ```bash
   # macOS
   brew install postgresql@16
   brew services start postgresql@16
   
   # Ubuntu/Debian
   sudo apt-get install postgresql postgresql-contrib
   sudo service postgresql start
   ```

2. **Create database & user:**
   ```bash
   psql -U postgres -c "CREATE USER skipsponsor WITH PASSWORD 'password';"
   psql -U postgres -c "CREATE DATABASE skipsponsor OWNER skipsponsor;"
   ```

3. **Install Redis:**
   ```bash
   # macOS
   brew install redis
   brew services start redis
   
   # Ubuntu/Debian
   sudo apt-get install redis-server
   sudo service redis-server start
   ```

4. **Run migrations** and **Start backend** (same as above)

## Building the Extension

### Development Build (with HMR)

For rapid iteration with hot module replacement:

```bash
npm run dev:extension
```

This starts Vite dev server with live reload. Any changes to `src/extension/` trigger automatic rebuild.

### Production Build

For testing the actual bundled extension:

```bash
npm run build:extension
```

This generates:
- `dist/extension/` — Bundled MV3 extension files
- Ready for loading in Chrome or uploading to Web Store

Verify build succeeded:
```bash
ls -la dist/extension/
# Should contain: manifest.json, content.js, service-worker.js, etc.
```

## Loading in Chrome

### Method 1: Load Unpacked (for development)

**Best for active development with frequent code changes.**

1. **Open Chrome Extensions:**
   ```
   chrome://extensions/
   ```

2. **Enable Developer Mode:**
   - Toggle **Developer mode** switch (top-right corner)

3. **Load Extension:**
   - Click **Load unpacked**
   - Navigate to `/path/to/skip-sponsor-ai/dist/extension`
   - Select folder and confirm

4. **Verify Installation:**
   - Extension appears in Chrome toolbar
   - Click extension icon to see popup (if implemented)
   - Check `chrome://extensions/` for extension details

5. **Reload After Changes:**
   - After rebuilding, click reload icon on extension card in `chrome://extensions/`
   - Or press Ctrl+R (Cmd+R) in extension details

### Method 2: Load CRX File (for testing builds)

**Better for testing production builds.**

1. **Build extension:**
   ```bash
   npm run build:extension
   ```

2. **Convert to CRX (if needed):**
   Most production builds generate `.zip`. To create `.crx`:
   ```bash
   # Using CRXJS (already integrated in vite.config.ts)
   npm run build:extension -- --outDir=dist-crx
   ```

3. **Load in Chrome:**
   ```
   chrome://extensions/ → Load unpacked → dist/extension
   ```

4. **Export for distribution:**
   ```bash
   # After loading, right-click extension → "Pack extension"
   # Generates .crx + .pem files
   ```

## Testing Functionality

### Test Video Selection

Use official YouTube test videos with known sponsor segments:

| Video | Channel | Sponsors | Purpose |
| --- | --- | --- | --- |
| [dQw4w9WgXcQ](https://www.youtube.com/watch?v=dQw4w9WgXcQ) | Rick Astley | Pre-roll, mid-roll | Standard testing |
| [jNQXAC9IVRw](https://www.youtube.com/watch?v=jNQXAC9IVRw) | YouTube | N/A | API test video |

Or find real videos with known sponsors using [SponsorBlock database](https://www.sponsorblock.org).

### Basic Functionality Test

#### 1. Navigate to YouTube Video

1. Open Chrome
2. Go to any YouTube video: `https://www.youtube.com/watch?v=VIDEO_ID`
3. Ensure video has captions (check for CC icon in player)

#### 2. Verify Extension Activation

1. Open Chrome DevTools: `F12` or `Cmd+Option+I`
2. Select **Console** tab
3. In the dropdown next to "All messages", select **youtube.com** (content script context)
4. Reload page: `Cmd+R` or `F5`
5. Look for logs from extension (if `VITE_DEBUG_MODE=true`):
   ```
   [SkipSponsor] Initializing detector for video: dQw4w9WgXcQ
   [SkipSponsor] Captions found, fetching segments...
   ```

#### 3. Test Auto-Skip

1. Watch video or manually jump to timestamp with sponsor segment
2. When entering sponsor segment, video should auto-seek forward
3. Toast notification appears (bottom-right) with:
   - "Sponsor skipped!" message
   - "Undo" button
   - Auto-disappear after 4 seconds

#### 4. Test Undo

1. Trigger skip (see above)
2. Click **Undo** button in toast within 4 seconds
3. Video seeks back to 1 second before sponsor segment
4. Toast disappears

#### 5. Verify Cache (if backend enabled)

1. Reload page with same video
2. Check backend logs (if running `npm run dev:api`):
   ```
   [Cache HIT] videoId: dQw4w9WgXcQ
   ```
3. Segments should return immediately (no LLM call)

### Settings/Policy Test

#### Per-Channel Control (if implemented)

1. Click extension icon in toolbar
2. Open extension popup/options page
3. Add channel to **Blocklist**:
   - `UC_x5XG1OV2P6uZZ5FSM9Ttw` (YouTube Official)
4. Navigate to video from that channel
5. Sponsor skip should NOT trigger (blocklist applied)

#### Global Enable/Disable

1. Toggle **Enable SkipSponsor** in extension options
2. Disabled: No skip, no API calls
3. Re-enable: Skip resumes

#### Skip Mode

1. Change to **Notify Mode** (if implemented):
   - Toast shows "Sponsor detected at 2:30–3:15"
   - No auto-skip
2. Change to **Manual Mode**:
   - Only user-marked sponsors skipped
3. Change to **Auto Mode** (default):
   - All detected sponsors skipped

## Debugging

### Chrome DevTools Console

**Content Script Logs:**
```
chrome://extensions/ → SkipSponsor AI → Details
→ Inspect views → content-script → Console
```

Look for:
- Segment detection logs
- Skip events
- Policy decisions

**Service Worker Logs:**
```
chrome://extensions/ → SkipSponsor AI → Service Workers
→ Click service-worker link
→ Console tab
```

Check:
- Cache hits/misses
- API requests
- Telemetry events

### Backend API Logs

If running `npm run dev:api`:

```bash
# Terminal shows structured JSON logs:
{"level":"INFO","reqId":"abc123","videoId":"dQw4w9WgXcQ","latencyMs":1200,"model":"claude-4-5-haiku"}
```

Increase verbosity:
```bash
LOG_LEVEL=debug npm run dev:api
```

### Network Request Inspection

1. Open DevTools: `F12`
2. Go to **Network** tab
3. Filter by `Fetch/XHR`
4. Reload YouTube page
5. Look for requests to `http://localhost:3000/v1/segments/...`

Check response:
- Status: 200 (OK) or 202 (Accepted, pending)
- Payload: `{videoId, segments[], status, analyzedAt}`

### Extension Manifest Issues

Verify manifest is valid:
```bash
npm run typecheck
# Should pass with no TypeScript errors
```

Check in Chrome:
```
chrome://extensions/ → SkipSponsor AI → Details → Errors
# Should show no errors
```

### Database Queries (if using PostgreSQL)

Open psql terminal:
```bash
psql postgresql://skipsponsor:password@localhost:5432/skipsponsor
```

Check stored segments:
```sql
SELECT * FROM sponsor_segments 
WHERE video_id = 'dQw4w9WgXcQ' 
ORDER BY start_time;
```

Check cache status:
```bash
redis-cli
> GET seg:dQw4w9WgXcQ
# Returns JSON if cached, nil otherwise
```

## Troubleshooting

### Extension Not Loading

**Problem:** `chrome://extensions/` shows error or extension missing

**Solution:**
1. Verify `dist/extension/manifest.json` exists:
   ```bash
   ls -la dist/extension/manifest.json
   ```
2. Rebuild:
   ```bash
   npm run build:extension
   ```
3. Clear Chrome extensions cache:
   ```
   chrome://settings/privacy → Clear browsing data → Extensions
   ```
4. Reload unpacked extension again

### "Videopath not recognized" or manifest errors

**Problem:** Chrome shows red error in extensions page

**Solution:**
1. Check `manifest.json` syntax:
   ```bash
   npm run typecheck
   ```
2. Verify build output contains all required files:
   ```bash
   ls dist/extension/{manifest.json,content.js,service-worker.js}
   ```
3. Rebuild with clean slate:
   ```bash
   rm -rf dist && npm run build:extension
   ```

### API calls return 404 or connection refused

**Problem:** Extension can't reach backend

**Solution:**
1. Verify backend is running:
   ```bash
   curl http://localhost:3000/health
   # Should return {"status":"ok"}
   ```
2. Check `.env.local`:
   ```bash
   grep VITE_API_BASE_URL .env.local
   # Should be http://localhost:3000
   ```
3. Rebuild extension:
   ```bash
   npm run build:extension
   ```
4. Reload in Chrome

### Backend crashes with "ANTHROPIC_API_KEY not set"

**Problem:** Backend fails on startup

**Solution:**
1. Verify `.env` file exists and has `ANTHROPIC_API_KEY`:
   ```bash
   grep ANTHROPIC_API_KEY .env
   ```
2. Verify API key format (starts with `sk-ant-`):
   ```bash
   cat .env | grep ANTHROPIC_API_KEY
   ```
3. Test API key directly:
   ```bash
   curl -H "Authorization: Bearer sk-ant-your-key" \
     https://api.anthropic.com/v1/messages \
     -X POST -H "Content-Type: application/json" \
     -d '{"model":"claude-haiku-4-5-20251001","max_tokens":100,"messages":[{"role":"user","content":"hi"}]}'
   ```

### LLM calls timeout

**Problem:** Sponsor detection hangs, times out

**Solution:**
1. Check Anthropic API status: https://status.anthropic.com
2. Increase timeout in `.env`:
   ```
   LLM_TIMEOUT_MS=15000  # 15 seconds instead of 8
   ```
3. Check network latency:
   ```bash
   curl -w "time_connect: %{time_connect}s\n" \
     -H "Authorization: Bearer $ANTHROPIC_API_KEY" \
     https://api.anthropic.com/v1/messages -X POST
   ```
4. Restart backend:
   ```bash
   npm run dev:api
   ```

### PostgreSQL connection errors

**Problem:** `error: connect ECONNREFUSED 127.0.0.1:5432`

**Solution:**
1. Verify PostgreSQL is running:
   ```bash
   docker-compose ps | grep postgres
   # Should show "postgres ... Up"
   ```
2. Restart if needed:
   ```bash
   docker-compose restart postgres
   ```
3. Check connection string:
   ```bash
   grep DATABASE_URL .env
   # Should be: postgresql://skipsponsor:password@localhost:5432/skipsponsor
   ```
4. Test connection:
   ```bash
   psql postgresql://skipsponsor:password@localhost:5432/skipsponsor -c "SELECT 1"
   ```

### Redis cache issues

**Problem:** Cache not working, always hitting LLM

**Solution:**
1. Verify Redis running:
   ```bash
   docker-compose ps | grep redis
   # Should show "redis ... Up"
   ```
2. Test connection:
   ```bash
   redis-cli PING
   # Should return PONG
   ```
3. Check cache TTL:
   ```bash
   redis-cli TTL seg:dQw4w9WgXcQ
   # Should return seconds remaining (or -2 if not cached)
   ```

### Sponsor segments not detected

**Problem:** Extensions skips correctly but no segments returned

**Solution:**
1. Verify video has captions:
   - Open video in browser
   - Look for CC button in player (should be enabled)
   - If none available, use different video
2. Check backend logs:
   ```bash
   npm run dev:api | grep -i "no captions\|transcript"
   ```
3. Enable debug mode for detailed logs:
   ```bash
   VITE_DEBUG_MODE=true npm run dev:extension
   ```
4. Check LLM response:
   ```bash
   LOG_LEVEL=debug npm run dev:api
   # Look for "llm_response" entries
   ```

## Next Steps

- **Run full test suite:** `npm run test`
- **Check code quality:** `npm run verify`
- **Build for Web Store:** `npm run build:extension -- --mode production`
- **Deploy backend:** `npm run tf:plan && npm run tf:apply`

For more information, see:
- [README.md](../README.md)
- [CLAUDE.md](../CLAUDE.md)
- [Technical Specification](../skip-sponsor-ai-technical-spec.md)
