# PS-03D5-4 — Update and Status Override Backend Review Package

## Summary

This review package adds the backend-only implementations for `PATCH /api/accounts/{accountId}` and `PATCH /api/accounts/{accountId}/status-override`, as required by PS-03D5-4. Both production routes are intentionally hard-disabled at runtime with `403 ACCOUNT_OPS_DISABLED`, keeping activation deferred to PS-03D7.

## What changed

- **OpenAPI contract** (`lib/api-spec/openapi.yaml`): added the two new PATCH paths and the `UpdateAccountRequest` and `SetAccountStatusOverrideRequest` schemas.
- **Generated clients** (`lib/api-client-react`, `lib/api-zod`): regenerated hooks, Zod input types, and schema exports via Orval.
- **Service layer** (`artifacts/api-server/src/services/account/index.ts`): added `updateAccount` and `setAccountStatusOverride` with duplicate detection, advisory locking, encryption, transaction rollback, and the `statusOverride` return value.
- **Routes** (`artifacts/api-server/src/routes/accounts.ts`): added `updateAccountHandler` and `setAccountStatusOverrideHandler` and wired the production routes to return `403 ACCOUNT_OPS_DISABLED`.
- **Tests**: added `accounts.update.test.ts`, `accounts.status-override.test.ts`, updated `accounts.disabled.test.ts` for the new `code` field and the status-override route, and updated `account-contract.test.ts` to allow the new operations while keeping the frontend read-only.
- **Database module** (`lib/db/src/index.ts`): converted the singleton pool to lazy initialization so integration tests that change `DATABASE_URL` in their `before` hooks are isolated from the environment’s default database.
- **Docs** (`docs/CURRENT_PHASE.md`): moved to `IMPLEMENTATION COMPLETE, AWAITING SOURCE REVIEW`.

## Validation results

All validation commands ran with exit code 0 (see `reports/validation.txt`):

- `pnpm --filter @workspace/api-spec run codegen`
- `pnpm run typecheck`
- `pnpm --filter @workspace/api-server run test`
- `pnpm --filter @workspace/api-server run typecheck`

Test summary: 124 tests, 0 failures, 9 suites.

## Smoke test — production routes disabled

Started the API server and confirmed the disabled routes return the expected 403 with code `ACCOUNT_OPS_DISABLED`:

```
PATCH /api/accounts/{uuid}
{ "error": "Account operations are not authorized", "code": "ACCOUNT_OPS_DISABLED" }

PATCH /api/accounts/{uuid}/status-override
{ "error": "Account operations are not authorized", "code": "ACCOUNT_OPS_DISABLED" }
```

## Frontend read-only boundary

The active PlaySyncer frontend remains read-only: `account-contract.test.ts` asserts that `useUpdateAccount`, `useSetAccountStatusOverride`, `updateAccount`, and `setAccountStatusOverride` are not referenced in `artifacts/playsyncer/src`.

## Notes

- No runtime activation is enabled; the routes are gated behind an explicit 403 response.
- No database schema or migration changes were made.
- The DB module was adjusted to lazy-init the connection pool to fix integration-test cross-contamination caused by the environment-scoped `DATABASE_URL` and singleton pool.
