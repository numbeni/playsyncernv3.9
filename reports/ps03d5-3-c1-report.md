# PS-03D5-3-C1 — Create Account Contract Corrections and Fresh-Import Verification

Final status: **PS-03D5-3-C1 — COMPLETE, AWAITING SOURCE REVIEW**

## 1. Scope

Applied only the PS-03D5-3-C1 corrections requested in the latest task file. No schema, migration, dependency, frontend mutation UI, Auth, RBAC, Audit, Capacity, Delete, or Secret feature changes were made. Account mutations remain runtime-disabled; PS-03D5-4 was not started.

## 2. Contract corrections

### OpenAPI `POST /api/games/{gameId}/accounts`

`lib/api-spec/openapi.yaml` now declares the `409` response as a `oneOf` of:

- `DuplicateWarningResponse`
- `StandardApiError`

### Reject `gameId` in the request body

`artifacts/api-server/src/routes/accounts.ts` returns **HTTP 400** with code `VALIDATION_ERROR` when the request body contains `gameId`. This is checked before validation, encryption, transactions, or any database writes.

### Disabled production route

The public `POST /games/:gameId/accounts` route returns **HTTP 403** with:

```json
{
  "error": "Account operations are not authorized",
  "code": "ACCOUNT_OPS_DISABLED"
}
```

This response is returned before validation, encryption, transactions, or writes.

### Documentation

`docs/CURRENT_PHASE.md` was updated to exactly:

```text
PS-03D5-3 — IMPLEMENTATION COMPLETE, AWAITING SOURCE REVIEW
```

## 3. Tests

Added or corrected focused tests in `artifacts/api-server/src/routes/accounts.create.test.ts` and `artifacts/api-server/src/routes/accounts.disabled.test.ts`:

- body `gameId` → HTTP 400 and zero writes
- inactive Game → HTTP 409 StandardApiError
- `IdentifierConflictError` → HTTP 409 with `ACCOUNT_IDENTIFIER_CONFLICT`
- forced database failure (backup-code insert trigger) → full rollback of Account, Capacities, and Backup Codes
- duplicate warning matches the OpenAPI `DuplicateWarningResponse` shape
- public disabled route returns `ACCOUNT_OPS_DISABLED`
- production route remains 403 while the test-only handler returns 201

## 4. Validation results

| Command | Exit code | Notes |
|---|---|---|
| `pnpm --filter @workspace/api-spec run codegen` | 0 | Orval regenerated clients |
| `pnpm run typecheck` | 0 | all workspace packages |
| `pnpm --filter @workspace/api-server run test` | 0 | **96 tests passed, 0 failed** |
| `pnpm --filter @workspace/api-server run build` | 0 | esbuild bundle |
| `pnpm --filter @workspace/playsyncer run test` | 0 | **47 tests passed, 0 failed** |
| `PORT=24351 BASE_PATH=/ pnpm --filter @workspace/playsyncer run build` | 0 | production build |
| `git diff --check` | 0 | no whitespace errors |

## 5. Review output

- `reports/ps03d5-3-c1-report.md` (this file)
- `reports/ps03d5-3-c1.diff`
- `reports/ps03d5-3-c1-manifest.txt`
- `playsyncer-ps03d5-3-c1-review.zip`
  - Size: **689 KB**
  - SHA-256: `6440c5de5f408706f216d5cedb2ca5fdd489552755df44bfc12a56527ace7edd`

## 6. Final git status

```
 M artifacts/api-server/src/routes/accounts.create.test.ts
 M artifacts/api-server/src/routes/accounts.disabled.test.ts
 M artifacts/api-server/src/routes/accounts.ts
 M docs/CURRENT_PHASE.md
 M lib/api-spec/openapi.yaml
?? playsyncer-ps03d5-3-c1-review.zip
?? reports/ps03d5-3-c1-manifest.txt
?? reports/ps03d5-3-c1.diff
?? reports/ps03d5-3-c1-report.md
```

Changed files from the original baseline (`origin/main`):

- `artifacts/api-server/src/routes/accounts.create.test.ts`
- `artifacts/api-server/src/routes/accounts.disabled.test.ts`
- `artifacts/api-server/src/routes/accounts.ts`
- `docs/CURRENT_PHASE.md`
- `lib/api-spec/openapi.yaml`
- `attached_assets/Pasted-Continue-in-the-current-PlaySyncer-workspace-Canonical-_1784385114796.txt` (deleted)
- `reports/ps03d5-3-review.zip` (deleted)
- `zipFile.zip` (deleted)

Note: `.replit` was already restored to the project baseline (`["nodejs-24", "python-base-3.13", "postgresql-16"]`) in an earlier setup commit, so it does not appear in the working-tree diff.
