#!/usr/bin/env bash
# SkipSponsor AI local stack, one command (local-first standard LF-1..LF-4).
#
#   bash scripts/local.sh up [--prod] [--llm stub|haiku] [--ext-dev]
#   bash scripts/local.sh down [--stack]        # stop API (+ extension dev server); --stack also stops Postgres/Redis (data kept)
#   bash scripts/local.sh status
#   bash scripts/local.sh doctor                # every check, one fix line per failure
#   bash scripts/local.sh reset                 # empty the local app tables (schema kept)
#   bash scripts/local.sh reset --from-backup   # sanitized restore of the newest nightly backup
#   bash scripts/local.sh smoke                 # Playwright local-smoke against the running stack
#   npm run local -- <same arguments>
#
# Everything is local: Postgres 5434 + Redis 6380 (infra/docker-compose.yml), API 3040 bound to
# 127.0.0.1, extension built into dist/extension-local/ against http://127.0.0.1:3040
# (--ext-dev also starts the HMR dev server on 5174). Analyses come from the deterministic
# LLM stub (LLM_STUB=1) unless --llm haiku with an Anthropic DEV key file
# (SS_LOCAL_ANTHROPIC_KEY_FILE, mode 0600). SponsorBlock stays OFF on both sides (CC BY-NC-SA).
# The API runs under `env -i`: no .env file and no shell variable reaches it except the ones
# set here. --prod: `npm run build:api` + `node dist/api/server.mjs` with NODE_ENV=production
# and a production extension build (LF-3). No secret is printed. Logs: .backups/local/.
set -uo pipefail
cd "$(dirname "$0")/.."
ROOT="$(pwd)"
STATE="$ROOT/.backups/local"
API_PORT=3040
EXT_PORT=5174
API_URL="http://127.0.0.1:$API_PORT"
EXT_DIR="dist/extension-local"
DB_URL="postgresql://skipsponsor:skipsponsor@127.0.0.1:5434/skipsponsor"
REDIS_URL="redis://127.0.0.1:6380"
COMPOSE=(docker compose -f infra/docker-compose.yml)
mkdir -p "$STATE"; chmod 700 "$STATE"

say() { printf '[local] %s\n' "$*"; }
die() { printf '[local] %s\n' "$*" >&2; exit 1; }
pid_of() { [ -s "$STATE/$1.pid" ] && kill -0 "$(cat "$STATE/$1.pid")" 2>/dev/null && cat "$STATE/$1.pid"; }
port_owner() { lsof -nP -iTCP:"$1" -sTCP:LISTEN 2>/dev/null | awk 'NR==2{print $1" pid "$2}'; }
http_code() { curl -s -o /dev/null -m "${2:-5}" -w '%{http_code}' "$1" 2>/dev/null || echo 000; }

secret() { # local-only secret, generated once (0600)
  local f="$STATE/local-secrets.env"
  [ -s "$f" ] || ( umask 077; printf 'INSTALL_TOKEN_SECRET=%s\nADMIN_API_TOKEN=%s\n' "$(openssl rand -hex 32)" "$(openssl rand -hex 32)" >"$f" )
  sed -n "s/^$1=//p" "$f"
}

anthropic_key() {
  local f="${SS_LOCAL_ANTHROPIC_KEY_FILE:-}"
  [ -n "$f" ] && [ -f "$f" ] || die "--llm haiku needs SS_LOCAL_ANTHROPIC_KEY_FILE=<0600 file with the Anthropic DEV key>"
  [ "$(stat -f '%Lp' "$f")" = 600 ] || die "SS_LOCAL_ANTHROPIC_KEY_FILE must be mode 0600"
  head -1 "$f" | tr -d '[:space:]'
}

urls() {
  cat <<EOF
[local] ---------------------------------------------------------------
[local] API            $API_URL   ($(cat "$STATE/api.mode" 2>/dev/null || echo dev) mode, LLM: $(cat "$STATE/api.llm" 2>/dev/null || echo stub))
[local] Health         $API_URL/api/health
[local] Extension      $ROOT/$EXT_DIR   (chrome://extensions -> Load unpacked)
[local] Ext dev (HMR)  $( [ -n "$(pid_of ext)" ] && echo "http://localhost:$EXT_PORT" || echo "off (up --ext-dev)" )
[local] Postgres       127.0.0.1:5434 (skipsponsor/skipsponsor, local only)   Redis 127.0.0.1:6380
[local] SponsorBlock   OFF (API and extension)
[local] ---------------------------------------------------------------
EOF
}

ensure_stack() {
  command -v docker >/dev/null || die "Docker CLI missing. fix: install Docker Desktop"
  docker info >/dev/null 2>&1 || die "Docker is not running. fix: open -a Docker"
  "${COMPOSE[@]}" up -d --wait >"$STATE/compose.log" 2>&1 || die "Postgres/Redis did not start (see .backups/local/compose.log)"
  env -i PATH="$PATH" HOME="$HOME" DATABASE_URL="$DB_URL" npx tsx src/api/db/migrate-cli.ts >"$STATE/migrate.log" 2>&1 ||
    die "migrations failed (see .backups/local/migrate.log)"
}

api_env() { # prints KEY=VALUE lines for env -i (never echoed to the terminal)
  local mode="$1" llm="$2"
  echo "PATH=$PATH"; echo "HOME=$HOME"
  echo "PORT=$API_PORT"; echo "HOST=127.0.0.1"
  echo "DATABASE_URL=$DB_URL"; echo "REDIS_URL=$REDIS_URL"
  echo "SPONSORBLOCK_ENABLED=0"; echo "CORS_ORIGIN="; echo "TRUST_PROXY=0"
  echo "INSTALL_TOKEN_SECRET=$(secret INSTALL_TOKEN_SECRET)"
  echo "ADMIN_API_TOKEN=$(secret ADMIN_API_TOKEN)"
  echo "LLM_DAILY_BUDGET_USD=2"; echo "DAILY_ANALYSES_PER_INSTALL=1000"; echo "INSTALLS_PER_IP_PER_HOUR=1000"
  if [ "$llm" = haiku ]; then echo "LLM_STUB=0"; echo "ANTHROPIC_API_KEY=$(anthropic_key)"; else echo "LLM_STUB=1"; echo "ANTHROPIC_API_KEY="; fi
  [ "$mode" = prod ] && echo "NODE_ENV=production" || echo "NODE_ENV=development"
}

start_api() { # <mode> <llm>
  local mode="$1" llm="$2" o envf
  if [ -n "$(pid_of api)" ]; then say "API already running (pid $(pid_of api))"; return 0; fi
  o="$(port_owner $API_PORT)"; [ -z "$o" ] || die "port $API_PORT is taken by $o. fix: stop it, then re-run"
  envf="$STATE/api.env"; ( umask 077; api_env "$mode" "$llm" >"$envf" ) || exit 1
  echo "$mode" >"$STATE/api.mode"; echo "$llm" >"$STATE/api.llm"
  if [ "$mode" = prod ]; then
    say "building the API (npm run build:api) ..."
    env -i PATH="$PATH" HOME="$HOME" npm run build:api >"$STATE/build-api.log" 2>&1 || die "API build failed (see .backups/local/build-api.log)"
    ( set -a; . "$envf"; set +a; exec env -i $(cut -d= -f1 "$envf" | while read -r k; do printf '%s=%s ' "$k" "${!k}"; done) \
        nohup perl -e 'setpgrp(0,0); exec @ARGV' node --enable-source-maps dist/api/server.mjs ) >"$STATE/api.log" 2>&1 &
  else
    ( set -a; . "$envf"; set +a; exec env -i $(cut -d= -f1 "$envf" | while read -r k; do printf '%s=%s ' "$k" "${!k}"; done) \
        nohup perl -e 'setpgrp(0,0); exec @ARGV' npx tsx watch src/api/server.ts ) >"$STATE/api.log" 2>&1 &
  fi
  echo $! >"$STATE/api.pid"
  for _ in $(seq 1 90); do
    [ -n "$(pid_of api)" ] || die "API exited (tail of .backups/local/api.log):$(printf '\n'; tail -15 "$STATE/api.log")"
    [ "$(http_code "$API_URL/healthz" 5)" = 200 ] && break; sleep 1
  done
  [ "$(http_code "$API_URL/healthz" 5)" = 200 ] || die "API did not answer /healthz (see .backups/local/api.log)"
}

build_extension() { # <mode>
  local args=(vite build --outDir "$EXT_DIR" --emptyOutDir)
  [ "$1" = prod ] || args+=(--mode development)
  say "building the extension against $API_URL -> $EXT_DIR ($1) ..."
  env -i PATH="$PATH" HOME="$HOME" VITE_API_BASE_URL="$API_URL" VITE_SPONSORBLOCK_ENABLED=0 npx "${args[@]}" >"$STATE/build-extension.log" 2>&1 ||
    die "extension build failed (see .backups/local/build-extension.log)"
}

start_ext_dev() {
  if [ -n "$(pid_of ext)" ]; then return 0; fi
  local o; o="$(port_owner $EXT_PORT)"; [ -z "$o" ] || die "port $EXT_PORT is taken by $o"
  ( exec env -i PATH="$PATH" HOME="$HOME" VITE_API_BASE_URL="$API_URL" VITE_SPONSORBLOCK_ENABLED=0 \
      nohup perl -e 'setpgrp(0,0); exec @ARGV' npx vite --mode development ) >"$STATE/ext-dev.log" 2>&1 &
  echo $! >"$STATE/ext.pid"
}

stop() { # <name>
  local pid; pid="$(pid_of "$1")"
  [ -n "$pid" ] || { rm -f "$STATE/$1.pid"; return 0; }
  kill -TERM -"$pid" 2>/dev/null || kill -TERM "$pid" 2>/dev/null
  for _ in $(seq 1 20); do kill -0 "$pid" 2>/dev/null || break; sleep 0.5; done
  kill -KILL -"$pid" 2>/dev/null || true
  rm -f "$STATE/$1.pid"; say "$1 stopped"
}

doctor() {
  local bad=0 c
  ok() { printf '  ok    %s\n' "$*"; }
  no() { printf '  FAIL  %s\n        fix: %s\n' "$1" "$2"; bad=$((bad + 1)); }
  info() { printf '  info  %s\n' "$*"; }
  say "doctor"
  docker info >/dev/null 2>&1 && ok "Docker running" || no "Docker not running" "open -a Docker"
  [ -d node_modules ] && ok "node_modules present" || no "node_modules missing" "npm ci"
  for p in 5434 6380; do c="$(port_owner $p)"; [ -n "$c" ] && ok "port $p: $c" || no "port $p not listening" "bash scripts/local.sh up"; done
  [ "$("${COMPOSE[@]}" ps --status running -q postgres 2>/dev/null | wc -l | tr -d ' ')" = 1 ] && ok "compose Postgres running" || no "compose Postgres not running" "bash scripts/local.sh up"
  c="$(port_owner $API_PORT)"
  if [ -n "$(pid_of api)" ]; then ok "API running (pid $(pid_of api), $(cat "$STATE/api.mode"), LLM $(cat "$STATE/api.llm"))"
  elif [ -n "$c" ]; then no "port $API_PORT taken by $c (not this script's API)" "stop it, then bash scripts/local.sh up"
  else no "API not running" "bash scripts/local.sh up"; fi
  if [ "$(http_code "$API_URL/api/health" 5)" = 200 ]; then
    body="$(curl -s -m 5 "$API_URL/api/health")"
    printf '%s' "$body" | grep -q '"database":"ok"' && ok "API health: database ok" || no "API health: database not ok" "bash scripts/local.sh up"
    printf '%s' "$body" | grep -q '"cache":"ok"' && ok "API health: Redis cache ok" || no "API health: Redis cache not ok" "bash scripts/local.sh up"
    printf '%s' "$body" | grep -q '"llm":"ok"' && ok "API health: LLM path configured" || no "API health: LLM down" "bash scripts/local.sh down && bash scripts/local.sh up"
  else no "API health endpoint not answering" "bash scripts/local.sh up"; fi
  if [ -s "$STATE/api.env" ]; then
    grep -q '^SPONSORBLOCK_ENABLED=0$' "$STATE/api.env" && ok "SponsorBlock OFF on the API" || no "SponsorBlock not off on the API" "bash scripts/local.sh up"
    grep -q '^HOST=127.0.0.1$' "$STATE/api.env" && ok "API bound to 127.0.0.1 only" || no "API not loopback-bound" "bash scripts/local.sh up"
  fi
  if [ -f "$EXT_DIR/manifest.json" ]; then
    if grep -rqs "127.0.0.1:$API_PORT" "$EXT_DIR"; then ok "extension build targets $API_URL"; else no "extension build does not target $API_URL" "bash scripts/local.sh up"; fi
    if grep -rqs "cloud.devspeak.dev" "$EXT_DIR"; then no "extension build contains the production API host" "bash scripts/local.sh up"; else ok "extension build has no production API host"; fi
  else no "extension not built ($EXT_DIR)" "bash scripts/local.sh up"; fi
  info "Auth, email and payments: none in SkipSponsor (anonymous install tokens), nothing to configure"
  info "Analytics/Sentry: not wired (no-ops)"
  set_dir="$(ls -d "${SS_BACKUP_ROOT:-$HOME/Backups/devspeak-labs}"/cloud-box/*/skipsponsor-main-pg-db 2>/dev/null | tail -1)"
  [ -n "$set_dir" ] && ok "newest backup set for reset --from-backup: $(basename "$(dirname "$set_dir")")" || info "no laptop backup set (reset --from-backup unavailable)"
  [ "$bad" = 0 ] && say "doctor: all checks passed" || say "doctor: $bad check(s) failed"
  [ "$bad" = 0 ]
}

cmd="${1:-up}"; shift || true
case "$cmd" in
  up)
    mode=dev; llm="${SS_LOCAL_LLM:-stub}"; extdev=0
    while [ $# -gt 0 ]; do
      case "$1" in --prod) mode=prod; shift ;; --llm) llm="$2"; shift 2 ;; --ext-dev) extdev=1; shift ;; *) die "unknown option $1" ;; esac
    done
    [ "$llm" = stub ] || [ "$llm" = haiku ] || die "--llm must be stub or haiku"
    ensure_stack
    start_api "$mode" "$llm"
    build_extension "$mode"
    [ "$extdev" = 1 ] && start_ext_dev
    node scripts/local/seed.mjs "$API_URL" || say "seed failed (see message above)"
    urls ;;
  down)
    stop ext; stop api
    [ "${1:-}" = --stack ] && "${COMPOSE[@]}" stop >/dev/null 2>&1 && say "Postgres/Redis stopped (data kept)" ;;
  status)
    "${COMPOSE[@]}" ps --format '{{.Service}} {{.Status}}' 2>/dev/null | sed 's/^/[local] /'
    [ -n "$(pid_of api)" ] && say "API: running, health $(http_code "$API_URL/api/health")" || say "API: stopped"
    urls ;;
  doctor) doctor ;;
  reset)
    ensure_stack
    bash scripts/db-local.sh dump pre-reset >/dev/null || die "safety dump failed; refusing"
    if [ "${1:-}" = --from-backup ]; then bash scripts/local/restore-backup.sh "${@:2}"
    else
      docker exec -i "$("${COMPOSE[@]}" ps -q postgres)" psql -X -q -U skipsponsor -d skipsponsor -v ON_ERROR_STOP=1 -c \
        "do \$\$ declare t text; begin for t in select tablename from pg_tables where schemaname='public' and tablename <> 'schema_migrations' loop execute format('truncate table public.%I cascade', t); end loop; end \$\$;" &&
        say "local app tables emptied (schema and migration ledger kept; safety dump in .backups/local/)"
    fi ;;
  smoke)
    [ "$(http_code "$API_URL/healthz" 30)" = 200 ] || die "API not running: bash scripts/local.sh up"
    SS_LOCAL_SMOKE=1 SS_LOCAL_API="$API_URL" SS_LOCAL_EXT_DIR="$ROOT/$EXT_DIR" npx playwright test -c playwright.local.config.ts "$@" ;;
  *) die "usage: local.sh up [--prod] [--llm stub|haiku] [--ext-dev] | down [--stack] | status | doctor | reset [--from-backup] | smoke" ;;
esac
