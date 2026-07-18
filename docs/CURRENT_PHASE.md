# Current Phase

## Previous Completed Sub-Stage

PS-03D5-2 — Frontend Test Foundation

## Previous Sub-Stage Status

APPROVED_AND_CLOSED

## Current Sub-Stage

PS-03D5-3 — Create Account Backend, Runtime Disabled

## Current Status

PS-03D5-3 — COMPLETED

## Restrictions

- Account mutation routes remain disabled at runtime (POST, PATCH, DELETE, status override, capacity finish/unfinish, Secret Reveal, Backup Code Reveal).
- Secret Reveal remains disabled.
- Customer Assignment writes remain disabled.
- OpenAPI and generated-client changes are authorized **only** for the Create Account endpoint in this sub-stage.
- No manual edits to generated clients.
- Account deletion remains blocked pending an authoritative Assignment-history model.
- Backup Code management is excluded from the general Edit form and deferred to PS-03D8.
- Duplicate warnings must use HTTP 409, code `DUPLICATE_WARNING`, safe Persian message, field names only, and caller retries with `confirmed: true`.
- Runtime activation of Account mutations is deferred to PS-03D7.

## Next Planned Sub-Stage

PS-03D5-4 — Update and Status Override Backend, Runtime Disabled

## Closure Notes

- OpenAPI now includes `POST /api/games/{gameId}/accounts` with `operationId: createAccount`.
- Generated React Query client and Zod schemas include the Create Account contract.
- The public production route remains disabled (returns HTTP 403).
- An exported `createAccountHandler` is implemented and tested in a dedicated test Express app.
- Handler maps domain errors to HTTP codes and returns safe `AccountDetailResponse`.
- Route-level integration tests verify public 403 behavior and handler success/failure paths.
