# INFRA-R1 — Automatic Replit Startup Preparation Report

## Status

INFRA-R1 — COMPLETE, AWAITING SOURCE REVIEW

## Goal

Eliminate startup failures after a fresh import or when opening the project in another Replit workspace by automatically installing dependencies, building shared libraries, and applying database migrations before the API Server and PlaySyncer Frontend workflows start serving requests.

## Changes

### New file: `scripts/replit-bootstrap.sh`

The shared bootstrap script used by both Replit workflows and the manual `setup.sh` fallback.

Behavior:

- `set -euo pipefail` — stops on any error.
- Computes the project root from the script location and `cd`s into it.
- Uses a file lock (`flock`) so parallel workflow starts (API Server + Frontend) do not race on `pnpm install` or database migrations.
- Runs `pnpm install --frozen-lockfile` only when `node_modules` is missing or when a stored hash of `pnpm-lock.yaml` and every workspace `package.json` differs from the current hash.
- Runs `pnpm run typecheck:libs` to build shared TypeScript declarations.
- Requires `DATABASE_URL` without printing the value.
- Runs `pnpm --filter @workspace/db run db:check` to verify migration history.
- Runs `pnpm --filter @workspace/db run db:migrate` to apply pending migrations.
- Does **not** run `drizzle-kit push`.
- Does **not** create sample data.
- Is idempotent: repeated executions are safe and fast when nothing changed.

### Modified: `scripts/setup.sh`

Now delegates to `./scripts/replit-bootstrap.sh` so the manual fallback command `./scripts/setup.sh` uses the exact same logic as the automated workflows.

### Modified: `.replit`

Both the `API Server` and `PlaySyncer Frontend` workflows now run `./scripts/replit-bootstrap.sh` as their first task before starting their respective dev servers. The `Project` workflow remains unchanged; it continues to run both workflows in parallel, and the lock inside the bootstrap script serializes the shared install/migrate steps.

### Modified: `.gitignore`

Added `.replit-bootstrap.lock` so the runtime lock file created by the bootstrap script is never committed.

## Startup flow

1. Replit opens the workspace.
2. User starts the `API Server` or `PlaySyncer Frontend` workflow (or the `Project` workflow which starts both in parallel).
3. The workflow runs `./scripts/replit-bootstrap.sh`.
4. The bootstrap script acquires an exclusive lock.
5. If `node_modules` is missing or manifests changed, it runs `pnpm install --frozen-lockfile` and stores a new dependency hash in `node_modules/.replit-bootstrap.hash`.
6. It builds shared library declarations with `pnpm run typecheck:libs`.
7. It verifies `DATABASE_URL` is set (without printing it).
8. It checks and applies database migrations with `db:check` and `db:migrate`.
9. It releases the lock and exits successfully.
10. The workflow then starts the API Server or PlaySyncer Frontend dev server.

## Validation results

### Bootstrap twice consecutively

**First run:**

- Exit code: `0`
- Detected missing hash file, ran `pnpm install --frozen-lockfile`, built shared libraries, checked and applied migrations.
- Bootstrap completed successfully.

**Second run:**

- Exit code: `0`
- Dependency hash matched existing `node_modules/.replit-bootstrap.hash`.
- Output: `Dependencies are up to date; skipping install`
- Built shared libraries, checked and applied migrations.
- Bootstrap completed successfully.

### API smoke test

- `GET http://localhost:8080/api/games`
- Response status: `200 OK`
- Response body: `{"games":[]}`
- Confirmed: an empty database correctly returns an empty games list.

### Workflow status

- `API Server` — running
- `PlaySyncer Frontend` — running
- Both workflows successfully started after the bootstrap task completed.

### Secret check

Searched workflow logs under `/tmp/logs` for patterns matching `password`, `postgresql://`, `DATABASE_URL`, `secret`, `token`, and `private_key`. No actual secret values were found in the workflow logs. The only matches were the word "tokens" in Vite's `[replit-cartographer] Loaded @theme tokens ...` log lines, which are unrelated to credentials.

### Scope verification

No product frontend or backend behavior, OpenAPI spec, generated client, schema, existing migration, dependency list, or PS-03 phase documentation was changed. Only infrastructure startup scripts, the Replit workflow configuration, and `.gitignore` were touched.

## Files changed

1. `scripts/replit-bootstrap.sh` — new
2. `scripts/setup.sh` — refactored to delegate to bootstrap
3. `.replit` — added bootstrap task to both dev workflows
4. `.gitignore` — ignore `.replit-bootstrap.lock`

## Files intentionally not changed

- Product source code
- OpenAPI specification
- Generated clients
- Database schema
- Existing migrations
- `package.json` dependency lists
- PS-03 phase documentation (`docs/CURRENT_PHASE.md`, `docs/DECISION_LOG.md`)

## Next steps

Await source review and approval. If approved, this change can be committed with a single infrastructure commit. After that, PS-03D5-3 can be authorized to proceed.
