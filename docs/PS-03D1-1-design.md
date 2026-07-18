# PS-03D1-1 — Account Domain Core Design and Preflight

**Status:** CORRECTED DESIGN COMPLETE, AWAITING COMMAND CENTER REVIEW

**Scope:** Inspection and design only. No source code, schema, migration, database, or route changes were made to produce this document. Command Center has accepted the current workspace as the working baseline; the missing commit `a78514e` is not a blocker.

---

## 1. Inspected files

### Schema and database layer
- `lib/db/src/schema/accounts.ts` — Account table, sequence, constraints, indexes
- `lib/db/src/schema/account-backup-codes.ts` — Backup Code storage-only contract
- `lib/db/src/schema/account-capacities.ts` — Capacity table, FINISHED state, uniqueness
- `lib/db/src/schema/game-account-sequences.ts` — Per-game sequence counter
- `lib/db/src/schema/games.ts` — Game table and platform enum
- `lib/db/src/schema/enums.ts` — All Drizzle enums
- `lib/db/src/schema/index.ts` — Schema exports
- `lib/db/migrations/0000_zippy_leech.sql` — Baseline schema
- `lib/db/migrations/0001_glossy_onslaught.sql` — Games contract migration
- `lib/db/migrations/0002_warm_swarm.sql` — PS-03C1 additive schema (identifiers, sequences, encrypted columns, trigger)
- `lib/db/migrations/0003_ps03c2b_retirement.sql` — PS-03C2B retirement migration
- `lib/db/src/migrations/ps03c2b.test.ts` — Migration correctness test
- `lib/db/src/helpers/account-number.ts` — Display-number formatting
- `lib/db/src/helpers/capacity-definitions.ts` — Approved platform-to-capacity templates
- `lib/db/src/helpers/order-code.ts` — Order-code normalization pattern (reference for similar Account input normalization)
- `lib/db/src/helpers/index.ts` — Helper exports
- `reports/ps03c2b_retirement_inventory.md` — Retired and preserved objects

### API / backend layer
- `artifacts/api-server/src/routes/accounts.ts` — Currently disabled routes
- `artifacts/api-server/src/routes/games.ts` — Game CRUD, transaction patterns, platform-change guards
- `artifacts/api-server/src/routes/orders.ts` — Order CRUD and normalization pattern
- `artifacts/api-server/src/routes/capacity-customers.ts` — Transaction boundary example
- `artifacts/api-server/src/routes/index.ts` — Router mount points
- `artifacts/api-server/src/routes/accounts.disabled.test.ts` — Disabled-route safety test
- `artifacts/api-server/src/routes/games.test.ts` — DB test harness and seed patterns
- `artifacts/api-server/src/lib/crypto.ts` — AES-256-GCM encrypt/decrypt and HMAC-SHA256 lookup hash
- `artifacts/api-server/src/lib/crypto.test.ts` — Crypto unit tests
- `artifacts/api-server/src/lib/dto.ts` — Safe Account DTO
- `artifacts/api-server/src/lib/req-param.ts` — Express v5 param helper
- `artifacts/api-server/src/lib/validate-uuid.ts` — UUID validation
- `artifacts/api-server/src/middlewares/error-handler.ts` — HttpError and centralized error handling
- `artifacts/api-server/src/lib/test-pg.ts` (referenced, not read in detail) — Test harness for API routes

### Product and phase docs
- `docs/PRODUCT_RULES.md` — Account Core rules
- `docs/DECISION_LOG.md` — Approved PS-03B decisions D1–D13 and PS-03C2B closure
- `docs/CURRENT_PHASE.md` — Phase status and restrictions
- `docs/MIGRATIONS.md` — Migration policy
- `AGENTS.md` — Agent rules

### Frontend / fixture references (non-runtime)
- `fixtures/legacy/playSyncerMockData.ts` — Legacy Account/Capacity mock data (not imported by runtime)
- `artifacts/playsyncer/src/domain/slots/types.ts` — Still references `Z3_PS5` (needs frontend update later)
- `lib/api-spec/openapi.yaml` — Currently only Games/health/orders paths; no Account paths

### Current baseline verification
- Command Center has accepted the current workspace as the working baseline.
- The requested baseline commit `a78514e` is **not present** and is **not required**.
- Current `git log` head: `90aa46a Update Replit configuration`.
- `git status` shows only the untracked `attached_assets/` file.
- I used the current repository content as the inspected baseline.

---

## 2. Existing reusable components

| Component | Location | How it can be reused |
|-----------|----------|----------------------|
| AES-256-GCM encryption + HMAC-SHA256 lookup hash | `artifacts/api-server/src/lib/crypto.ts` | `encrypt(plaintext, key)` and `hashForLookup(value, key)` for all credential fields and backup codes. Already unit-tested. |
| Safe Account DTO | `artifacts/api-server/src/lib/dto.ts` | `toSafeAccount()` is already the return shape for list summaries. Reuse/extend it for Account creation response. |
| Capacity template generator | `lib/db/src/helpers/capacity-definitions.ts` | `buildCapacityDefinitions(platform)` returns the exact slot set required on Account creation. |
| Display number builder | `lib/db/src/helpers/account-number.ts` | `normalizeAccountNumberPrefix()` and `buildDisplayNumber()` produce the approved per-game number. |
| UUID param validation | `artifacts/api-server/src/lib/validate-uuid.ts` | `router.param("gameId", requireUuidParam("gameId"))` pattern. |
| Centralized error handling | `artifacts/api-server/src/middlewares/error-handler.ts` | `HttpError`, ZodError handling, PG 23505/23503 detection patterns (as used in `games.ts`). |
| Transaction pattern | `games.ts`, `capacity-customers.ts` | `db.transaction(async (tx) => { ... })` with `for("update")` row locks. |
| Duplicate/conflict error detection | `games.ts` | `isDuplicateTitleError()` (PG 23505) pattern. |
| Foreign-key violation detection | `games.ts` | `isForeignKeyViolation()` (PG 23503) pattern. |
| Game lookup helper | `games.ts` | `fetchGame()` / `requireGame()` pattern; reuse for `requireGame(gameId)`. |
| Game platform change guard | `games.ts` | Counts accounts for the game before allowing platform change. Same query can be reused for creation preconditions. |
| Zod validation patterns | `games.ts`, `orders.ts`, `capacity-customers.ts` | Body schema pattern using `z.object({...})`. |

---

## 3. Missing components (to be implemented in PS-03D1)

| Missing component | Why it is needed |
|-------------------|------------------|
| Account Domain Service | A dedicated service/module that orchestrates identifier allocation, encryption, capacity generation, and backup-code insertion. |
| Encryption key loader | Load `PLAYSYNCER_ACCOUNT_MASTER_KEY` from a Replit secret, validate it is base64-decodable and represents exactly 32 random bytes, and derive separate encryption and lookup-hash subkeys via Node.js `crypto/HKDF`. |
| Per-game sequence allocator | `game_account_sequences` exists but has no runtime allocator. Must insert a default row with `ON CONFLICT DO NOTHING` if missing, then `UPDATE ... RETURNING` to allocate. |
| Global account code formatter | `account_code_seq` exists but no runtime formatter for `ACC-000001`. Need `formatAccountCode(seq)`. |
| Duplicate detection helper | Query lookup hashes for emails (case-insensitively normalized) and plaintext `online_id` (case-insensitive comparison) for duplicates. |
| Account input validation schema | Zod schema for the Domain Service input including required fields, email formats, canonical birth date `YYYY-MM-DD`, backup codes array, and internal `confirmed` flag. |
| Account status derivation | Derive `AVAILABLE`/`PARTIALLY_SOLD`/`SOLD` from Capacity state; `statusOverride` stores only manual `SOLD`/`INACTIVE` overrides. |
| Account Domain Service tests | Unit and integration tests covering the service. |

---

## 4. Proposed service structure

Introduce a thin service layer under `artifacts/api-server/src/services/` to keep route handlers small and testable:

```
artifacts/api-server/src/
  services/
    account/
      index.ts          # public createAccount() orchestrator
      identifiers.ts    # global accountCode + per-game displayNumber allocation
      encryption.ts     # credential encryption + lookup hash helpers (thin wrapper around lib/crypto.ts)
      duplicates.ts     # duplicate detection using lookup hashes and plaintext online_id
      capacities.ts     # capacity row generation from platform
      backup-codes.ts   # backup code encryption + bulk insert
      errors.ts         # AccountDomainError classes
      create.test.ts    # Domain Service integration tests
```

**Why this structure:**
- Keeps the future route file small when Account API routes are implemented in a later stage.
- Each service file is independently unit-testable.
- Transaction orchestrator (`createAccount`) can call helpers and roll back atomically.
- Encryption wrapper isolates key-loading and HKDF subkey derivation from route code.

---

## 5. Complete Account creation flow

Endpoint: `POST /games/:gameId/accounts`

### 5.1 Input contract and validation

**Domain Service input fields (required unless marked optional):**
- `gameId` — UUID, required
- `psnEmail` — string, valid email format, required
- `psnPassword` — string, non-empty, required
- `emailPassword` — string, non-empty, required
- `onlineId` — string, non-empty, required
- `birthDate` — string, required, canonical format `YYYY-MM-DD`
- `familyManagementEmail` — string, valid email format, required
- `backupCodes` — array of non-empty strings, min length 1, required
- `confirmed` — optional boolean (internal flag, default `false`). When `false`, duplicate detection returns a warning instead of creating the Account. When `true`, duplicates are allowed to proceed.

**Validation rules:**
1. `gameId` must be a valid UUID.
2. Body must pass Zod schema.
3. Game must exist and not be soft-deleted.
4. Game must be `ACTIVE`; creation for an `INACTIVE` Game is rejected.
5. `statusOverride` is **not** accepted on initial creation; a new Account starts with `null` `statusOverride`.

### 5.2 Normalization rules

- **PSN Email:** trim whitespace, lowercase before encryption and lookup hash. Duplicate comparison is case-insensitive.
- **Family Management Email:** trim whitespace, lowercase before encryption and lookup hash. Duplicate comparison is case-insensitive.
- **Online ID:** trim whitespace, store as entered. Duplicate comparison is case-insensitive.
- **Birth Date:** validate canonical `YYYY-MM-DD` in Zod; store exactly as provided.
- **Backup Codes:** trim whitespace; no additional normalization.
- **Display prefix:** derive from Game title using `normalizeAccountNumberPrefix(game.title, "ACC")`.

### 5.3 Fields that are encrypted

| Field | Stored column | Algorithm |
|-------|---------------|-----------|
| PSN Email | `accounts.psn_email_encrypted` | AES-256-GCM (random IV per value) |
| PSN Password | `accounts.psn_password_encrypted` | AES-256-GCM |
| Email Password | `accounts.email_password_encrypted_v2` | AES-256-GCM |
| Family Management Email | `accounts.family_management_email_encrypted_v2` | AES-256-GCM |
| Backup Codes | `account_backup_codes.code_ciphertext` | AES-256-GCM (one ciphertext per code) |

### 5.4 Fields that receive keyed lookup hashes

| Field | Stored column | Purpose |
|-------|---------------|---------|
| PSN Email | `accounts.psn_email_lookup_hash` | Duplicate detection; exact normalized search |
| PSN Password | `accounts.psn_password_lookup_hash` | Future exact search / duplicate detection |
| Email Password | `accounts.email_password_lookup_hash` | Future exact search / duplicate detection |
| Family Management Email | `accounts.family_management_email_lookup_hash` | Duplicate detection; exact normalized search |

**Online ID** and **Birth Date** are stored as plaintext identifiers (non-secret) per `PRODUCT_RULES.md` and the current schema. Backup Codes are encrypted but do **not** receive lookup hashes (storage-only contract).

### 5.5 Global account code generation

1. Within the creation transaction, allocate next value from `account_code_seq`:
   ```sql
   SELECT nextval('account_code_seq') AS next_code;
   ```
2. Format as `ACC-${String(next_code).padStart(6, '0')}` (e.g., `ACC-000001`).
3. Insert into `accounts.account_code` (unique constraint `accounts_account_code_unique` guarantees global uniqueness).

**Identifier rules:** identifiers are never reused, even after deletion or rollback. Sequence gaps after a transaction rollback are acceptable.
**Concurrency protection:** `nextval` is atomic; no `MAX + 1`.

### 5.6 Per-game account number generation

1. Ensure a `game_account_sequences` row exists for the game:
   ```sql
   INSERT INTO game_account_sequences (game_id, last_value)
   VALUES (:gameId, 0)
   ON CONFLICT (game_id) DO NOTHING;
   ```
2. Inside the transaction, lock and increment the counter:
   ```sql
   UPDATE game_account_sequences
   SET last_value = last_value + 1
   WHERE game_id = :gameId
   RETURNING last_value;
   ```
3. Derive prefix with `normalizeAccountNumberPrefix(game.title, "ACC")`.
4. Format display number with `buildDisplayNumber(prefix, last_value)` → e.g., `GTA6-001` (no leading `#`).

**Identifier rules:** per-game numbers are never reused, even after deletion or rollback. Sequence gaps after a transaction rollback are acceptable.
**Concurrency protection:** `ON CONFLICT DO NOTHING` guarantees the row exists; `UPDATE ... RETURNING` on a single row serializes per-game number allocation.

### 5.7 Automatic Capacity creation for each platform type

After Account row is inserted, call `buildCapacityDefinitions(game.platform)` and insert one `account_capacities` row per definition:

| Platform | Capacity rows created |
|----------|-----------------------|
| `PS5_ONLY` | `Z2_PS5` instance 1, `Z2_PS5` instance 2, `Z3_SHARED_PS5_PS4` instance 0 |
| `PS4_AND_PS5` | `Z2_PS5` instance 1, `Z2_PS5` instance 2, `Z2_PS4` instance 1, `Z3_SHARED_PS5_PS4` instance 0 |
| `PS4_ONLY` | `Z2_PS4` instance 1, `Z3_SHARED_PS5_PS4` instance 0 |

Each capacity row has `is_finished = false`, `finished_at = null`, and the display label from `capacity-definitions.ts`.

### 5.8 Backup Code encryption and storage

1. For each backup code in the input array:
   - Trim whitespace.
   - Encrypt with `encrypt(code, encryptionSubkey)`.
   - Insert into `account_backup_codes(code_ciphertext)` referencing the new account ID.
2. No lookup hash, status, `used_at`, validation, consumption, search, or lifecycle tracking is stored.
3. At least one non-empty Backup Code is required; multiple codes are allowed.

### 5.9 Transaction boundary and rollback behavior

All writes run inside a single `db.transaction(async (tx) => { ... })`:

1. Lock Game row `for("update")` (optional but recommended for counter consistency).
2. Allocate global code and per-game number.
3. Insert `accounts` row.
4. Insert `account_capacities` rows.
5. Insert `account_backup_codes` rows.
6. Commit.

**Rollback:** any step failure (validation, DB constraint, encryption error) throws and the entire transaction rolls back. No partial Account is created.

### 5.10 Duplicate warning behavior

Before insert, query for the normalized values of:
- PSN Email (`psn_email_lookup_hash`) — compare case-insensitively by normalizing input to lowercase before hashing.
- Family Management Email (`accounts.family_management_email_lookup_hash`) — same case-insensitive normalization.
- Online ID (`online_id`) — plaintext, indexed; duplicate comparison is case-insensitive (`LOWER(online_id) = LOWER(:input)`).

If any match is found in non-deleted accounts and `confirmed` is `false` (or omitted), collect a list of duplicate field names (without exposing the matched values or Account secrets) and return a `DuplicateWarning` result:

```ts
{
  kind: "duplicate-warning",
  duplicateFields: ["psnEmail", "familyManagementEmail"]
}
```

The caller may explicitly confirm and retry with `confirmed: true`, in which case the Account is created even if duplicates exist. The HTTP wire format for this confirmation will be decided when Account routes are designed in a later stage; the Domain Service uses only the internal `confirmed` flag.

### 5.11 Domain errors

The Domain Service returns typed errors; HTTP status codes are the responsibility of the route layer in a later stage.

| Domain error | Meaning |
|-------|---------|
| Game not found | Game does not exist or is soft-deleted. |
| Validation failed | Input fails Zod schema or business rules. |
| Duplicate warning (without confirmation) | Duplicate PSN Email, Online ID, or Family Management Email detected; no data written. |
| Inactive game | Account creation rejected for an `INACTIVE` Game. |
| Identifier conflict | Unique constraint violation on `account_code` or display number (should be extremely rare). |
| Encryption failure | Could not encrypt credentials or derive subkeys; fail closed. |
| Unexpected DB error | Any other database error. |

### 5.12 Concurrency protection

- Global code: `nextval('account_code_seq')` is atomic.
- Per-game number: `INSERT ... ON CONFLICT DO NOTHING` ensures the counter row exists; `UPDATE game_account_sequences SET last_value = last_value + 1 WHERE game_id = ? RETURNING last_value` serializes per game.
- Unique constraints (`accounts_account_code_unique`, `accounts_game_seq_unique`, `accounts_game_display_unique`) provide a final guard against race conditions.
- Game row lock (`for("update")`) prevents the per-game counter row from being updated concurrently.

### 5.13 Safe returned DTO without secrets

On successful creation, return the same `SafeAccount` shape used by `GET /games/:gameId/accounts`:

```json
{
  "account": {
    "id": "...",
    "gameId": "...",
    "accountCode": "ACC-000042",
    "accountNumberPrefix": "GTA6",
    "accountNumberSeq": 42,
    "displayNumber": "GTA6-042",
    "onlineId": "...",
    "birthDate": "...",
    "createdAt": "...",
    "updatedAt": "..."
  }
}
```

No encrypted fields, lookup hashes, or backup codes are returned.

### 5.14 Required tests

See section 7 for the full test plan.

---

## 6. Transaction design

```
BEGIN
  -- 1. Verify game exists and lock it
  SELECT * FROM games WHERE id = :gameId FOR UPDATE;

  -- 2. Ensure counter row exists and allocate identifiers
  INSERT INTO game_account_sequences (game_id, last_value)
  VALUES (:gameId, 0)
  ON CONFLICT (game_id) DO NOTHING;

  SELECT nextval('account_code_seq') AS global_seq;

  UPDATE game_account_sequences
     SET last_value = last_value + 1
   WHERE game_id = :gameId
   RETURNING last_value;

  -- 3. Encrypt credentials and compute lookup hashes
  -- (in application code, using the loaded encryption key)

  -- 4. Insert account
  INSERT INTO accounts (...)
  VALUES (...)
  RETURNING id;

  -- 5. Insert capacities
  INSERT INTO account_capacities (account_id, capacity_kind_v2, instance_no, display_label, is_finished, finished_at)
  VALUES (...);

  -- 6. Insert backup codes
  INSERT INTO account_backup_codes (account_id, code_ciphertext)
  VALUES (...);
COMMIT
```

**Important notes:**
- All inserts happen in the same DB transaction.
- If the game row is locked by a concurrent platform update, the creation waits; if the platform changes mid-creation, the capacity template is still based on the Game platform value read inside the transaction.
- Identifier immutability trigger `accounts_protect_identifiers_trigger` will reject any later update that changes `account_code`, `account_number_prefix`, `account_number_seq`, or `display_number`.

---

## 7. Test plan

### 7.1 Unit tests (no DB)

| Test | Location | What it proves |
|------|----------|----------------|
| `normalizeAccountNumberPrefix` | `lib/db/src/helpers/account-number.test.ts` (exists? if not, add) | Prefix normalization rules |
| `buildDisplayNumber` | same | Formatting and padding |
| `buildCapacityDefinitions` | `lib/db/src/helpers/capacity-definitions.test.ts` (add) | All three platforms produce exactly the approved slots |
| Encryption wrapper | `artifacts/api-server/src/services/account/encryption.test.ts` (add) | Loads `PLAYSYNCER_ACCOUNT_MASTER_KEY`, derives encryption and lookup subkeys via HKDF, and produces ciphertext + hash; fails closed on missing or invalid key |
| `formatAccountCode` | `artifacts/api-server/src/services/account/identifiers.test.ts` (add) | Padding to 6 digits |

### 7.2 Database / integration tests

| Test | What it proves |
|------|----------------|
| Create Account with all required fields | Happy path: Account, capacities, and backup codes are persisted |
| Create Account for each platform | Correct capacity rows are generated |
| Create Account derives display number from game title | `displayNumber` (e.g., `GTA6-001`) and `accountNumberPrefix` are correct |
| Duplicate PSN Email detection | Returns duplicate warning with field list; no data written |
| Duplicate Family Email detection | Returns duplicate warning with field list; no data written |
| Duplicate Online ID detection | Returns duplicate warning with field list; no data written |
| Duplicate confirmation bypasses warning | With `confirmed: true`, Account is created despite duplicates |
| Missing required fields | Returns validation error |
| Invalid birth date format | Rejects non-`YYYY-MM-DD` values |
| Invalid game UUID | Returns validation error before DB |
| Non-existent game | Returns not-found error |
| Soft-deleted game | Returns not-found error |
| Inactive game | Returns inactive-game error |
| Account code/display number uniqueness | Direct DB constraint violation is surfaced as a domain error, not an unexpected error |
| Missing or invalid PLAYSYNCER_ACCOUNT_MASTER_KEY | Service fails closed before any write |

### 7.3 Transaction / rollback tests

| Test | What it proves |
|------|----------------|
| Encryption failure rolls back everything | No Account, capacity, or backup code rows remain |
| Backup code insert failure rolls back Account and capacities | Atomicity |
| Duplicate warning mid-transaction does not write anything | No rows created unless confirmed |

### 7.4 Concurrency tests

| Test | What it proves |
|------|----------------|
| Two simultaneous creations for the same game get distinct `accountNumberSeq` | No duplicate per-game number |
| Two simultaneous creations globally get distinct `accountCode` | No duplicate global code |
| Heavy concurrent creation does not reuse identifiers after deletion | Counter monotonicity |

### 7.5 Security / DTO tests

| Test | What it proves |
|------|----------------|
| Create Account response does not contain encrypted fields, lookup hashes, or backup codes | `SafeAccount` contract |
| GET /games/:gameId/accounts still returns only safe fields | Regression guard |
| Backup Code table has only storage columns | Migration test already covers this |
| Logs do not contain plaintext credentials | Manual/code review + log tests |

### 7.6 Existing test maintenance

- `games.test.ts` `seedAccountForGame()` will need updating if Account route tests are added in a later stage, because it currently inserts legacy columns that are retired. After PS-03C2B, it must insert the new canonical columns (or simply the safe identifier columns) to seed Account rows for Game guard tests.
- `lib/db/src/migrations/ps03c2b.test.ts` is already correct for the post-0003 schema.

---

## 8. Unresolved decisions

### 8.1 Duplicate confirmation HTTP wire format

- **Fact:** The Domain Service uses an internal `confirmed` boolean to bypass duplicate warnings. The caller must explicitly confirm after receiving a warning.
- **Decision made:** Command Center approved the internal `confirmed` flag and the behavior that the first attempt writes no data and the caller may confirm and retry.
- **Remaining question:** The exact HTTP shape and header/body mechanism for the confirmation will be decided when Account API routes are designed in a later stage. No Domain Service change is needed for this decision.

---

## 9. Risks and blockers

| Risk / Blocker | Severity | Mitigation |
|----------------|----------|------------|
| Baseline commit `a78514e` is missing from this workspace | Resolved | Command Center has accepted the current workspace as the working baseline. |
| Encryption key is not configured | Resolved | Use `PLAYSYNCER_ACCOUNT_MASTER_KEY` Replit secret (base64 of 32 bytes). Derive encryption and lookup subkeys via HKDF. |
| `game_account_sequences` rows do not exist for current games | High | The table has no rows until an Account is created. The first creation must insert a default row with `ON CONFLICT DO NOTHING` if missing. |
| Concurrent Account creation may stress the per-game counter row | Low | `INSERT ... ON CONFLICT DO NOTHING` ensures the row exists; `UPDATE ... RETURNING` serializes per game. Load tests are recommended. |
| Legacy frontend type `Z3_PS5` still exists | Low | Does not block Domain Service implementation, but must be updated when frontend integrates with Account/Capacity backend. |
| `games.test.ts` `seedAccountForGame()` inserts retired columns | Medium | Will break after the test DB is migrated to 0003. Update the fixture to insert only current columns before enabling Account route tests. |
| No audit logging / authentication | Medium | Acceptable for Domain Service stage, but Account routes and Secret Reveal remain blocked until RBAC/audit is implemented. |
| Shared Z3 `instanceNo` decision unresolved | Resolved | Command Center approved `instanceNo = 0` for `Z3_SHARED_PS5_PS4`. |

---

## 10. Final status

**PS-03D1-1 — CORRECTED DESIGN COMPLETE, AWAITING COMMAND CENTER REVIEW**

This document is the corrected inspection and design deliverable for the Account Domain Core. No implementation code, schema changes, migrations, database writes, or route activations were performed to produce it. The next authorized step is Command Center review of the corrected design.
