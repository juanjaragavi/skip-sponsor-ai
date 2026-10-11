#!/bin/sh
# Container entrypoint. Migrations are opt-in (DB_MIGRATE_ON_START=1) so a
# failing migration never crash-loops the API; the default is to run
# `node dist/api/migrate.mjs` once per release (docs/DEPLOY.md).
set -eu
if [ "${DB_MIGRATE_ON_START:-0}" = "1" ]; then
  node dist/api/migrate.mjs
fi
exec node --enable-source-maps dist/api/server.mjs
