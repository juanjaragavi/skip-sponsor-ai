#!/usr/bin/env bash
# Sanitized restore of the newest nightly PRODUCTION backup into the LOCAL compose Postgres
# (local-first standard LF-4, "down" direction only; nothing ever goes local -> production).
#
#   bash scripts/local/restore-backup.sh [--set <backup set dir>] [--export-only | --check]
#     --check  prove the load without touching the local database: a second throwaway
#              container gets the production schema, then the same load transaction runs there.
#
# 1. Newest laptop set (backup-production.sh): ${SS_BACKUP_ROOT:-~/Backups/devspeak-labs}/
#    cloud-box/<stamp>/skipsponsor-main-pg-db/app.dump, sha256 checked against SHA256SUMS.
# 2. Restored into a THROWAWAY postgres:16 container (tmpfs, no published port, removed on exit).
# 3. Sanitized there: per-install data (telemetry events, install usage counters) is dropped.
#    What stays is public-video data only: analyses and segments keyed by YouTube video id,
#    plus the daily LLM spend totals. SkipSponsor stores no accounts, emails or names.
# 4. Exported (data only) to .backups/local/restore/<stamp>-sanitized.sql (0600, gitignored).
# 5. Unless --export-only: loaded into the local compose database in ONE transaction (the
#    tables it carries are emptied first; the migration ledger is never touched).
# Prints counts only.
set -euo pipefail
cd "$(dirname "$0")/../.."
ROOT="$(pwd)"
BACKUP_ROOT="${SS_BACKUP_ROOT:-$HOME/Backups/devspeak-labs}"
ID=skipsponsor-main-pg-db
IMAGE="${SS_RESTORE_IMAGE:-postgres:16-alpine}"
SET=""; EXPORT_ONLY=0; CHECK=0
while [ $# -gt 0 ]; do
  case "$1" in
    --set) SET="$2"; shift 2 ;;
    --export-only) EXPORT_ONLY=1; shift ;;
    --check) CHECK=1; shift ;;
    *) echo "usage: restore-backup.sh [--set <dir>] [--export-only | --check]" >&2; exit 2 ;;
  esac
done
if [ -z "$SET" ]; then
  SET="$(ls -d "$BACKUP_ROOT"/cloud-box/*/ 2>/dev/null | sed 's:/$::' | sort | while read -r d; do
    [ -s "$d/$ID/app.dump" ] && echo "$d"; done | tail -1)"
fi
[ -n "$SET" ] && [ -s "$SET/$ID/app.dump" ] || {
  echo "restore: no backup set with $ID/app.dump under $BACKUP_ROOT/cloud-box/." >&2
  echo "  fix: bash ~/GitHub/notes/cto/runbooks/backup-production.sh box" >&2; exit 1; }
STAMP="$(basename "$SET")"
( cd "$SET" && grep -E "  $ID/app.dump\$" SHA256SUMS | shasum -a 256 -c - >/dev/null ) ||
  { echo "restore: sha256 mismatch (or no SHA256SUMS) for $STAMP; refusing" >&2; exit 1; }
echo "restore: set $STAMP, sha256 ok"

NAME="ss-local-restore-$$"
CHECKNAME="ss-local-restore-check-$$"
trap 'docker rm -f "$NAME" "$CHECKNAME" >/dev/null 2>&1 || true' EXIT
docker run -d --name "$NAME" -e POSTGRES_PASSWORD="$(openssl rand -hex 16)" -e POSTGRES_DB=app \
  --tmpfs /var/lib/postgresql/data:rw,size=1g "$IMAGE" >/dev/null
for _ in $(seq 1 60); do docker exec "$NAME" pg_isready -q -U postgres -d app 2>/dev/null && break; sleep 1; done
sleep 2; docker exec "$NAME" pg_isready -q -U postgres -d app
docker exec -i "$NAME" pg_restore -U postgres -d app --no-owner --no-privileges <"$SET/$ID/app.dump" >/dev/null 2>&1 || true
docker exec -i "$NAME" psql -X -q -U postgres -d app -v ON_ERROR_STOP=1 >/dev/null <<'SQL'
set client_min_messages = warning;
do $$
declare t text;
begin
  -- per-install data: dropped
  foreach t in array array['telemetry_events', 'install_usage_daily'] loop
    if to_regclass('public.' || t) is not null then execute format('truncate table public.%I', t); end if;
  end loop;
end $$;
SQL
OUTDIR="$ROOT/.backups/local/restore"; mkdir -p "$OUTDIR"; chmod 700 "$OUTDIR"
OUT="$OUTDIR/$STAMP-sanitized.sql"
( umask 077; docker exec "$NAME" pg_dump -U postgres -d app --data-only --no-owner --no-privileges \
    -n public --exclude-table=public.schema_migrations --exclude-table=public.telemetry_events \
    --exclude-table=public.install_usage_daily >"$OUT" )
chmod 600 "$OUT"
docker exec "$NAME" psql -X -tA -U postgres -d app -c \
  "select 'sanitized: ' || (select count(*) from public.video_analyses) || ' analyses, ' || (select count(*) from public.sponsor_segments) || ' segments kept; telemetry and install usage dropped'"
echo "restore: exported -> .backups/local/restore/$(basename "$OUT")"
[ "$EXPORT_ONLY" = 1 ] && exit 0

# load_into <container> <user> <db>: one transaction, carried tables emptied first.
load_into() {
  local c="$1" u="$2" d="$3" tables
  tables="$(awk '/^COPY public\./{print $2}' "$OUT" | sort -u | paste -sd, -)"
  {
    echo "\\set ON_ERROR_STOP on"
    echo "set client_min_messages = warning;"
    echo "set session_replication_role = replica;"
    [ -n "$tables" ] && echo "truncate table $tables cascade;"
    cat "$OUT"
  } | docker exec -i "$c" psql -X -q -U "$u" -d "$d" --single-transaction -f - >/dev/null
  docker exec "$c" psql -X -tA -U "$u" -d "$d" -c \
    "select 'loaded: ' || (select count(*) from public.video_analyses) || ' analyses, ' || (select count(*) from public.sponsor_segments) || ' segments'"
}

if [ "$CHECK" = 1 ]; then
  docker run -d --name "$CHECKNAME" -e POSTGRES_PASSWORD="$(openssl rand -hex 16)" -e POSTGRES_DB=app \
    --tmpfs /var/lib/postgresql/data:rw,size=1g "$IMAGE" >/dev/null
  for _ in $(seq 1 60); do docker exec "$CHECKNAME" pg_isready -q -U postgres -d app 2>/dev/null && break; sleep 1; done
  sleep 2
  docker exec -i "$CHECKNAME" pg_restore -U postgres -d app --schema-only --no-owner --no-privileges <"$SET/$ID/app.dump" >/dev/null 2>&1 || true
  load_into "$CHECKNAME" postgres app
  echo "restore: --check OK (the local database was not touched)"
  exit 0
fi

DB="$(docker compose -f infra/docker-compose.yml ps -q --status running postgres)"
[ -n "$DB" ] || { echo "restore: local Postgres not running: bash scripts/local.sh up" >&2; exit 1; }
load_into "$DB" skipsponsor skipsponsor
echo "restore: OK (set $STAMP)"
