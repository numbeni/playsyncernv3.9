# PS-03C2A — Correction Report

**Status:** CORRECTED, AWAITING COMMAND CENTER REVIEW

**Scope:** Complete the interrupted PS-03C2A final validation. No new migration was created, no existing migration file was modified, and no source schema was changed.

## Corrections made

### 1. Restored accidentally removed Games API tests

File: `artifacts/api-server/src/routes/games.test.ts`

The following three tests were restored:

- `created Game returns a valid UUID and is retrievable by GET /games/:id`
  - Asserts `POST /games` returns 201 with a valid UUID.
  - Asserts `GET /games/:id` returns 200 and the same game.
- `created Game appears in GET /games`
  - Asserts a newly created game is present in the list returned by `GET /games`.
- `normal POST /games validation/conflict failures never return 404`
  - Asserts duplicate-title responses return 409, not 404.
  - Asserts whitespace-only title validation responses return 400, not 404.

### 2. Corrected `reports/ps03c2b_retirement_inventory.md`

Clarified the boundary between the database schema and the generic Account DTO:

- Added the canonical Account ciphertext and lookup-hash columns to the **Final objects — must NOT be retired** table:
  - `accounts.psn_email_encrypted`
  - `accounts.psn_email_lookup_hash`
  - `accounts.psn_password_encrypted`
  - `accounts.psn_password_lookup_hash`
  - `accounts.email_password_encrypted_v2`
  - `accounts.email_password_lookup_hash`
  - `accounts.family_management_email_encrypted_v2`
  - `accounts.family_management_email_lookup_hash`
- Added `accounts.online_id` and `accounts.birth_date` to the final objects table.
- Preserved `accounts.status_override` and the `account_status_override` enum in the final objects table.
- Replaced the inaccurate “new canonical Account storage contract … should expose only non-secret identifier fields” note with:
  - The database Account contract **retains** the canonical ciphertext and lookup-hash columns.
  - Generic Account DTOs **only** expose non-secret identifier fields (`id`, `game_id`, `account_code`, `account_number_prefix`, `account_number_seq`, `display_number`, `online_id`, `birth_date`, `created_at`, `updated_at`, `deleted_at`, plus `status_override`).

### 3. Resolved the reported `GET /games` HTTP 500

The dev database was empty after the project import, so `GET /games` failed with `relation "games" does not exist`. The existing approved migrations (`0000`–`0002`) were applied once to initialize the dev database. No new migration was created, no existing migration file was modified, and all Account-related tables remain empty.

After migration:
- `GET /api/games` returns `{"games":[]}` (HTTP 200).
- `GET /api/games/:id` for a missing game returns HTTP 404.

## Required checks and results

| Command | Result |
|---------|--------|
| `pnpm run typecheck` | PASS |
| `pnpm --filter @workspace/api-server run test` | PASS (33 tests) |
| `pnpm --filter @workspace/db run test` | PASS (16 tests) |
| `pnpm --filter @workspace/db run test:migrations` | PASS (26 tests) |
| `PORT=24351 BASE_PATH=/ pnpm --filter @workspace/playsyncer run build` | PASS |

### API Server test output

```
▶ Account operations are disabled
  ✔ POST /games/:gameId/accounts returns 403 and writes nothing
  ✔ PATCH /accounts/:id returns 403 and writes nothing
  ✔ DELETE /accounts/:id returns 403 and writes nothing
  ✔ GET /accounts/:id returns 403 and exposes no secrets
  ✔ GET /games/:gameId/accounts returns only non-secret account fields
▶ Games API
  ✔ creates a game successfully
  ✔ created Game returns a valid UUID and is retrievable by GET /games/:id
  ✔ created Game appears in GET /games
  ✔ normal POST /games validation/conflict failures never return 404
  ✔ rejects duplicate normalized titles
  ✔ rejects whitespace-only titles on create
  ✔ rejects whitespace-only titles on update
  ✔ collapses repeated internal spaces in the stored title
  ✔ rejects invalid UUID with 400
  ✔ returns 404 for missing game
  ✔ allows platform change without account history
  ✔ blocks platform change with active account history
  ✔ allows same-platform update when an account exists
  ✔ blocks platform change with a soft-deleted account
  ✔ changes status from ACTIVE to INACTIVE
  ✔ allows hard delete without history
  ✔ blocks hard delete with active account history
  ✔ blocks hard delete with a soft-deleted account
  ✔ enforces global normalized-title uniqueness across soft-deleted games
  ✔ lists all games including inactive ones
ℹ tests 33
ℹ suites 3
ℹ pass 33
ℹ fail 0
```

## Confirmations

1. **Account write/detail routes remain disabled**
   - `GET /accounts/:id` → `403 Account operations are not authorized`
   - `POST /games/:gameId/accounts` → `403 Account operations are not authorized`
   - `PATCH /accounts/:id` → `403 Account operations are not authorized`
   - `DELETE /accounts/:id` → `403 Account operations are not authorized`
2. **No migration `0003` exists** — `lib/db/migrations/` contains only `0000_zippy_leech.sql`, `0001_glossy_onslaught.sql`, and `0002_warm_swarm.sql`.
3. **Migrations `0000`–`0002` were not modified**
   - `0000`: `a43ab14cacf73a107d5c115c2025dc56de3537efe4d409ca65c79e48a8aa07ca`
   - `0001`: `c09f28b3895fa3ee2732f42438d55e4ad136a02d485386bfe001c4530d14c4c2`
   - `0002`: `99f124e4bb93a8763d485813a65355c44e4a0aa4a1a6b4eb8ddffc47e3059b6a`
4. **No schema source change occurred** — `git diff` shows no changes under `lib/db/src/schema` or `lib/db/migrations/meta` snapshots.
5. **Live database row counts remain empty for Account-related tables**
   - `accounts`: 0
   - `account_backup_codes`: 0
   - `account_capacities`: 0
   - `capacity_customers`: 0
   - `game_account_sequences`: 0
   - `orders`: 0
6. **No source file was changed under `lib/db/migrations` or `lib/db/migrations/meta`**.

## Evidence artifacts

- `reports/ps03c2a_correction_report.md` — this file.
- `reports/ps03c2a_corrected_complete.diff` — exact git diff of the corrections.
- `docs/CURRENT_PHASE.md` — updated to stage **PS-03C2A** with status **CORRECTED, AWAITING COMMAND CENTER REVIEW**.
