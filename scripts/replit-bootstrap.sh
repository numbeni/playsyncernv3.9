#!/bin/bash
set -euo pipefail

# Replit bootstrap script for workflow startup.
#
# Goals:
#   - Install dependencies only when node_modules is missing or workspace
#     manifests/lockfile changed.
#   - Build shared TypeScript declarations.
#   - Check and apply database migrations safely.
#   - Use a lock so parallel workflow starts (API + Frontend) do not race on
#     install or migrate.
#   - Remain safe and idempotent when executed repeatedly.
#
# It intentionally does NOT run drizzle-kit push and does NOT create sample data.

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

LOCK_FILE="$ROOT/.replit-bootstrap.lock"
HASH_FILE="$ROOT/node_modules/.replit-bootstrap.hash"

# Acquire an exclusive lock for the whole bootstrap so that parallel workflow
# starts (e.g., API Server + Frontend) serialize install/migrate steps.
exec 200>"$LOCK_FILE"
flock -x 200

compute_hash() {
  # Hash the lockfile and every workspace package.json to detect dependency
  # or script changes. The hash is stored inside node_modules so it is
  # removed when node_modules is deleted.
  sha256sum pnpm-lock.yaml \
    $(find . -name package.json -not -path './node_modules/*' -not -path './.git/*' | sort) \
    2>/dev/null \
    | sha256sum \
    | awk '{print $1}'
}

needs_install() {
  if [ ! -d "$ROOT/node_modules" ]; then
    return 0
  fi
  if [ ! -f "$HASH_FILE" ]; then
    return 0
  fi
  local current_hash stored_hash
  current_hash="$(compute_hash)"
  stored_hash="$(cat "$HASH_FILE")"
  if [ "$current_hash" != "$stored_hash" ]; then
    return 0
  fi
  return 1
}

echo "==> Replit bootstrap started in $ROOT"

if needs_install; then
  echo "==> Dependencies changed or node_modules missing; installing..."
  pnpm install --frozen-lockfile
  compute_hash > "$HASH_FILE"
else
  echo "==> Dependencies are up to date; skipping install"
fi

echo "==> Building shared library TypeScript declarations..."
pnpm run typecheck:libs

echo "==> Checking database migration state..."
if [ -z "${DATABASE_URL:-}" ]; then
  echo "ERROR: DATABASE_URL is required but not set." >&2
  exit 1
fi
pnpm --filter @workspace/db run db:check

echo "==> Applying pending database migrations..."
pnpm --filter @workspace/db run db:migrate

echo "==> Replit bootstrap complete."
