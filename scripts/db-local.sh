#!/usr/bin/env bash
# Local Postgres backups for the infra/docker-compose.yml database (compose project skipsponsor).
#
#   npm run db:dump:local                             # writes .backups/local/skipsponsor-<UTC timestamp>.dump
#   npm run db:restore:local -- <file.dump> --yes     # dumps the current state first, then restores <file>
#
# Dumps are pg_dump custom format (-Fc), taken with the container's own pg_dump so client and
# server versions always match. .backups/ is gitignored. Credentials come from the container's
# environment (POSTGRES_USER / POSTGRES_DB); nothing is printed or written outside .backups/local/.
# DB_LOCAL_DATABASE=<name> targets another database in the same container (default POSTGRES_DB).
set -euo pipefail
umask 077

TARGET="${DB_LOCAL_DATABASE:-}"
PREFIX="skipsponsor"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIR="${ROOT}/.backups/local"

log() { printf '[db-local] %s\n' "$1"; }
die() { printf '[db-local] %s\n' "$1" >&2; exit 1; }

CONTAINER="$(docker compose -f "${ROOT}/infra/docker-compose.yml" ps -q --status running postgres 2>/dev/null || true)"
[ -n "$CONTAINER" ] || die "Postgres is not running; start it with: docker compose -f infra/docker-compose.yml up -d --wait"

dump() {
  local label="${1:-}" out
  mkdir -p "$DIR"
  out="${DIR}/${TARGET:-$PREFIX}-$(date -u +%Y%m%dT%H%M%SZ)${label:+-$label}.dump"
  docker exec -e TARGET="$TARGET" "$CONTAINER" sh -c 'pg_dump -U "$POSTGRES_USER" -d "${TARGET:-$POSTGRES_DB}" -Fc' > "${out}.partial" \
    || { rm -f "${out}.partial"; die "pg_dump failed; nothing written"; }
  mv "${out}.partial" "$out"
  chmod 0600 "$out"
  log "wrote ${out#"${ROOT}"/} ($(wc -c < "$out" | tr -d ' ') bytes)"
}

restore() {
  local file="${1:-}" confirm="${2:-}"
  [ -n "$file" ] && [ -f "$file" ] || die "usage: npm run db:restore:local -- <file.dump> --yes"
  [ "$confirm" = "--yes" ] || die "restore replaces the local database; re-run with --yes (stop the dev servers first)"
  docker exec -i "$CONTAINER" sh -c 'pg_restore --list > /dev/null' < "$file" \
    || die "${file} is not a pg_dump custom-format archive; nothing changed"
  dump pre-restore
  docker exec -i -e TARGET="$TARGET" "$CONTAINER" sh -c \
    'pg_restore -U "$POSTGRES_USER" -d "${TARGET:-$POSTGRES_DB}" --clean --if-exists --single-transaction --exit-on-error' \
    < "$file" || die "pg_restore failed; the transaction was rolled back (the pre-restore dump is in .backups/local/)"
  log "restored ${file}"
}

case "${1:-}" in
  dump) dump ;;
  restore) shift; restore "$@" ;;
  *) die "usage: db-local.sh dump | restore <file.dump> --yes" ;;
esac
