# PS-03D5-3-F1 — Final Error Contract Correction

Final status: **PS-03D5-3-F1 — COMPLETE, AWAITING SOURCE REVIEW**

## 1. Scope

Applied only the PS-03D5-3-F1 error-contract corrections. No schema, migration, dependency, frontend mutation UI, Auth, RBAC, Audit, Capacity, Delete, Secret Reveal, or Backup Code behavior was changed. Account mutations remain runtime-disabled; PS-03D5-4 was not started.

## 2. Corrections applied

### 2.1 Unexpected server errors return HTTP 500 with `INTERNAL_ERROR`

`artifacts/api-server/src/middlewares/error-handler.ts` now responds to any unhandled, non-`HttpError`, non-Zod, non-body-parser error with:

```json
{
  "error": "Internal server error",
  "code": "INTERNAL_ERROR"
}
```

No raw exception message, stack trace, SQL details, or configuration values are exposed.

### 2.2 Malformed JSON bodies return HTTP 400 with `INVALID_JSON`

The body-parser `SyntaxError` branch now returns:

```json
{
  "error": "Invalid JSON request body",
  "code": "INVALID_JSON"
}
```

Detection is still limited to actual Express JSON parser errors (`type === "entity.parse.failed"`). Existing Zod validation behavior is unchanged.

### 2.3 Tests

`artifacts/api-server/src/routes/accounts.create.test.ts` adds two focused tests:

1. `malformed JSON body returns HTTP 400 INVALID_JSON and performs zero writes` — proves the malformed JSON code and that no Account, Capacity, or Backup Code rows are written.
2. `unexpected error in the create account route returns 500 INTERNAL_ERROR and hides details` — proves unhandled errors return the canonical 500 shape and that the response body does not leak secret, password, stack, or database markers.

Existing tests continue to prove:

- public `POST /games/:gameId/accounts` returns 403 + `ACCOUNT_OPS_DISABLED`
- test-only `createAccountHandler` returns 201
- duplicate warning returns 409 + `DUPLICATE_WARNING`
- body `gameId` returns 400 + `VALIDATION_ERROR`

## 3. Validation commands and exit codes

| Command | Exit code | Notes |
|---|---|---|
| `pnpm --filter @workspace/api-spec run codegen` | 0 | Orval regenerated clients |
| `pnpm run typecheck` | 0 | all workspace packages |
| `pnpm --filter @workspace/api-server run test` | 0 | **98 tests passed, 0 failed** |
| `pnpm --filter @workspace/api-server run build` | 0 | esbuild bundle |
| `pnpm --filter @workspace/db run test` | 0 | **16 tests passed, 0 failed** |
| `pnpm --filter @workspace/db run test:migrations` | 0 | **38 tests passed, 0 failed** |
| `pnpm --filter @workspace/playsyncer run test` | 0 | **47 tests passed, 0 failed** |
| `PORT=24351 BASE_PATH=/ pnpm --filter @workspace/playsyncer run build` | 0 | production build |
| `git diff --check` | 0 | no whitespace errors |

## 4. Smoke test proof — public Create Account route still disabled

After restarting the API server workflow, the live environment confirms:

- `POST /api/games/:gameId/accounts` → **HTTP 403** with body:

```json
{ "error": "Account operations are not authorized", "code": "ACCOUNT_OPS_DISABLED" }
```

- Malformed JSON `POST /api/games/:gameId/accounts` → **HTTP 400** with body:

```json
{ "error": "Invalid JSON request body", "code": "INVALID_JSON" }
```

- `GET /api/games` → **HTTP 200**.

## 5. Files changed

```
artifacts/api-server/src/middlewares/error-handler.ts
artifacts/api-server/src/routes/accounts.create.test.ts
```

## 6. Deliverables

- `reports/ps03d5-3-final-error-contract-report.md` (this file)
- `reports/ps03d5-3-final-error-contract.diff`
- `reports/ps03d5-3-final-error-contract-manifest.txt`
- `playsyncer-ps03d5-3-final-error-contract-review.zip`
  - Size: **694 KB**
  - SHA-256: `220f91663ca217602b11535a77c53c50688328be743cb045ca375a80c9eeb759`

## 7. Final git status

```
 M artifacts/api-server/src/middlewares/error-handler.ts
 M artifacts/api-server/src/routes/accounts.create.test.ts
?? playsyncer-ps03d5-3-final-error-contract-review.zip
?? reports/ps03d5-3-final-error-contract-manifest.txt
?? reports/ps03d5-3-final-error-contract.diff
?? reports/ps03d5-3-final-error-contract-report.md
?? screenshots/playsyncer-ps03d5-3-f1-smoke.jpg
```

Changes were left uncommitted per the instruction not to commit yet.
