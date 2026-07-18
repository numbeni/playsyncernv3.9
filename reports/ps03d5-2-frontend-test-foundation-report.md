# PS-03D5-2 — Frontend Test Foundation Report

## Phase

- **Previous stage:** PS-03D5-1 — Account Mutation Planning and Security Gate (approved and closed)
- **Current stage:** PS-03D5-2 — Frontend Test Foundation (sub-stage of PS-03D5 — Account Mutation Implementation, Runtime Disabled)
- **Status:** APPROVED AND CLOSED
- **Baseline HEAD:** `b45ad14f85c7fa649d476772382108fc1fa3caa5`

## Summary

This stage established the frontend test infrastructure for `artifacts/playsyncer` and added the first read-only Account UI tests required by the PS-03D5-1 decision gate. No Account mutation routes, read-write UI, Secret Reveal, Backup Code management, or product runtime source changes were added. No schema, migration, OpenAPI, generated-client, backend behavior, Auth, RBAC, or Audit behavior changed. The only dependency changes were the approved Vitest and Testing Library frontend test tooling.

`.replit` was restored unchanged from the stage baseline `b45ad14f85c7fa649d476772382108fc1fa3caa5`; no version-controlled workflow configuration was intentionally deleted in this stage.

## Approved PS-03D5-1 decisions recorded

- **Option A** — Account mutations will be implemented and tested in the backend while runtime routes remain disabled; activation is deferred to PS-03D7.
- **Duplicate warnings** must return HTTP `409` with code `DUPLICATE_WARNING`, a safe Persian message, field names only, and require caller retry with `confirmed: true`.
- **Frontend tests** are mandatory before any read-write Account UI is built or activated.
- **Sensitive-field edits** may later be allowed with full re-encryption and lookup-hash regeneration.
- **Backup Code management** is excluded from the general Edit form and deferred to PS-03D8.
- **Account deletion** remains blocked until an authoritative Assignment-history model is approved.

These decisions are recorded in `docs/DECISION_LOG.md` and the stage boundary is reflected in `docs/CURRENT_PHASE.md`.

## Files changed

See `reports/ps03d5-2-frontend-test-foundation-manifest.txt` for the full list. Key additions and corrections:

- `artifacts/playsyncer/vitest.config.ts` — Vitest configuration with jsdom, `@vitejs/plugin-react`, and path aliases.
- `artifacts/playsyncer/src/test/setup.ts` — jest-dom matchers, automatic cleanup, and a no-network guard that spies on `global.fetch` and fails any test that initiates an unexpected real HTTP request.
- `artifacts/playsyncer/src/test/render.tsx` — `render` helper with `MemoryRouter`, `QueryClientProvider`, and optional `GamesProvider`.
- `artifacts/playsyncer/src/test/fixtures.ts` — canonical safe DTO fixtures for Games, Accounts, and Capacities.
- `artifacts/playsyncer/src/test/mocks.ts` — mock helpers for generated React Query results that include the required `queryKey` field.
- `artifacts/playsyncer/src/components/AccountStatusBadge.test.tsx` — status label tests.
- `artifacts/playsyncer/src/components/AccountCardReadOnly.test.tsx` — 15 tests covering safe rendering, accordion behavior, capacities, copy/view isolation, and keyboard toggling.
- `artifacts/playsyncer/src/components/AccountDetailsReadOnly.test.tsx` — 13 tests covering independent Account/Capacity loading and error states, safe metadata, retry behavior, and disabled mutation controls.
- `artifacts/playsyncer/src/pages/GameDetailPage.test.tsx` — 13 tests covering the read-only Account workspace, empty state, error handling, refresh, live count, and route-change modal cleanup. These tests use the mocked `useGames` hook and do **not** mount the real `GamesProvider`, so `useListGames()` is never invoked.
- `artifacts/playsyncer/package.json` — added `vitest`, `jsdom`, `@testing-library/dom`, `@testing-library/react`, `@testing-library/jest-dom`, `@testing-library/user-event`, and test scripts.
- `docs/CURRENT_PHASE.md` and `docs/DECISION_LOG.md` — updated for PS-03D5-2 closure and PS-03D5-3 authorization.
- `pnpm-lock.yaml` — lockfile updated for the new dev dependencies.
- `.replit` — restored byte-for-byte from baseline `b45ad14f85c7fa649d476772382108fc1fa3caa5`; no version-controlled workflow configuration was deleted in this stage.

## Canonical fixture corrections

- Global `accountCode` example: `ACC-000001` (six digits).
- Per-Game `displayNumber` example: `TEST-001` (Game-scoped prefix).
- `accountNumberPrefix`: `TEST`.
- `accountNumberSeq`: `1`.
- Test-specific values: global Account code `ACC-000042`, per-Game display number `TEST-042`.

No runtime identifier logic was changed; corrections apply only to test fixtures and related assertions.

## Test isolation

- `GameDetailPage.test.tsx` mocks `useGames` directly and no longer wraps the tested page in the real `GamesProvider`.
- The `render` helper's optional `withGamesProvider` support remains available for future provider-specific tests.
- All `GameDetailPage` test renders removed `withGamesProvider: true`.

## No-network guard

- `src/test/setup.ts` installs a `beforeEach` spy on `global.fetch` that rejects with a clear error message.
- `afterEach` asserts that `fetch` received zero calls and restores the spy.
- The guard applies only in Vitest, does not affect Vite development or production, and requires no additional dependency.

## Misleading test correction

- Removed the ineffective test `"calls the correct Capacity refetch function on retry"` in `AccountCardReadOnly.test.tsx`. It used a successful query state and only verified that `refetch` was defined, which did not test the claimed retry behavior. The valid error-state retry test ("shows Capacity error state with retry") already verifies that clicking Retry calls the exact refetch mock.

## Test results

```
pnpm --filter @workspace/playsyncer run test
Test Files  4 passed (4)
Tests       47 passed (47)
Unexpected fetch calls 0
```

### Test coverage by file

- `AccountStatusBadge.test.tsx` — 6 tests
- `AccountCardReadOnly.test.tsx` — 15 tests
- `AccountDetailsReadOnly.test.tsx` — 13 tests
- `GameDetailPage.test.tsx` — 13 tests

Frontend tests perform no real network or database requests; all API calls are mocked through the generated React Query hooks.

## Validation results

| Check | Result |
|---|---|
| `pnpm install --frozen-lockfile` | PASS |
| `pnpm --filter @workspace/playsyncer run test` | PASS (47/47, 0 unexpected fetch calls) |
| `pnpm run typecheck` | PASS (all packages clean) |
| `pnpm --filter @workspace/api-spec run codegen` | PASS |
| `pnpm --filter @workspace/api-server run test` | PASS (77/77) |
| `pnpm --filter @workspace/db run test` | PASS (16/16) |
| `pnpm --filter @workspace/db run test:migrations` | PASS (38/38) |
| `PORT=24351 BASE_PATH=/ pnpm --filter @workspace/playsyncer run build` | PASS |
| `git diff --check` | PASS |

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| Generated hook return type requires `queryKey` | Mock helpers explicitly include `queryKey` so generated hook types and TypeScript checks remain aligned. |
| Runtime mutation controls accidentally exposed | Tests assert that Reveal, Edit, Delete, Create, and status controls are absent from the active path. |
| Sensitive data leakage in tests | Fixtures contain only safe DTO fields; tests verify that secret fields are not rendered. |
| Version-controlled workflow drift | `.replit` was restored from the stage baseline; no portable workflow configuration was deleted. |
| Real network or database access in frontend tests | `setup.ts` no-network guard fails any test that calls `global.fetch`. |
| GameDetailPage tests accidentally call `useListGames()` | Tests mock `useGames` directly and no longer mount the real `GamesProvider`. |

## Rollback instructions

If this stage needs to be rolled back, revert the files listed in `reports/ps03d5-2-frontend-test-foundation-manifest.txt` and remove the new dev dependencies from `artifacts/playsyncer/package.json`. No database, schema, or migration changes were made, so there is no DB rollback step.

## Next gate

PS-03D5-2 is closed. The next authorized sub-stage is **PS-03D5-3 — Create Account Backend, Runtime Disabled** (awaiting Command Center authorization to start). Runtime activation of Account mutations remains deferred to PS-03D7.
