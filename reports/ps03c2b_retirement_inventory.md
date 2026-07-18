# PS-03C2B — Schema Retirement Inventory

**Status:** Corrected for PS-03C2A, awaiting PS-03C2B execution.  
This inventory lists the schema objects that migration `0003` may later remove or rename once the PS-03C2A corrections have been merged and validated.

## Final objects — must NOT be retired

These objects are part of the approved long-term Account runtime contract and must remain unchanged in migration 0003.

| Object | Kind | Reason |
|--------|------|--------|
| `accounts.status_override` | column | Manual override enum (`SOLD`, `INACTIVE`) is the approved runtime status model. |
| `account_status_override` | enum | Approved override values; nullable on `accounts.status_override`. |
| `accounts.online_id` | column | Non-secret Account identifier. |
| `accounts.birth_date` | column | Non-secret Account identifier. |
| `accounts.psn_email_encrypted` | column | Canonical PSN Email ciphertext storage. |
| `accounts.psn_email_lookup_hash` | column | Canonical PSN Email lookup hash. |
| `accounts.psn_password_encrypted` | column | Canonical PSN Password ciphertext storage. |
| `accounts.psn_password_lookup_hash` | column | Canonical PSN Password lookup hash. |
| `accounts.email_password_encrypted_v2` | column | Canonical Email Password ciphertext storage. |
| `accounts.email_password_lookup_hash` | column | Canonical Email Password lookup hash. |
| `accounts.family_management_email_encrypted_v2` | column | Canonical Family Management Email ciphertext storage. |
| `accounts.family_management_email_lookup_hash` | column | Canonical Family Management Email lookup hash. |
| `capacity_customers` | table | Out of scope for Account Core; must remain untouched. |
| `account_code_seq` | sequence | Global Account code allocator; final. |
| `game_account_sequences` | table | Per-game Account number counter; final. |
| `accounts_game_seq_unique` | unique constraint | Per-game sequence-number uniqueness; final. |
| `accounts_game_display_unique` | unique constraint | Per-game display-number uniqueness; final. |
| `accounts_protect_identifiers_trigger` | trigger | Enforces immutable Account identifiers; final. |

## Objects to retire in migration 0003

### 1. Legacy plaintext Account columns and index

| Object | Kind | Notes |
|--------|------|-------|
| `accounts.email` | column | Plaintext PSN email. |
| `accounts.email_normalized` | column | Normalized plaintext email. |
| `accounts_email_normalized_active_uniq` | partial unique index | ON `email_normalized` WHERE `deleted_at IS NULL`. |

### 2. Legacy Account status column, index, and enum

| Object | Kind | Notes |
|--------|------|-------|
| `accounts.status` | column | `account_status` enum (`active`, `disabled`). Superseded by `status_override`. |
| `accounts_status_idx` | index | ON `status`. |
| `account_status` | enum | Legacy `active`/`disabled` values. |

### 3. Legacy password / family-email columns

| Object | Kind | Notes |
|--------|------|-------|
| `accounts.playstation_password_encrypted` | column | Legacy PSN password value. |
| `accounts.email_password_encrypted` | column | Legacy email password value. |
| `accounts.family_management_email_encrypted` | column | Legacy family-management email value. |

### 4. Legacy Capacity kind column, enum, constraint, and value

| Object | Kind | Notes |
|--------|------|-------|
| `account_capacities.capacity_kind` | column | `capacity_kind` enum, NOT NULL. |
| `capacity_kind` | enum | Values `Z2_PS5`, `Z2_PS4`, `Z3_PS5`. |
| `Z3_PS5` | enum value | Replaced by `Z3_SHARED_PS5_PS4` in Runtime logic. |
| `account_capacities_unique_slot` | unique constraint | ON (`account_id`, `capacity_kind`, `instance_no`). |

After retirement, `capacity_kind_v2` (enum `capacity_kind_v2` with values `Z2_PS5`, `Z2_PS4`, `Z3_SHARED_PS5_PS4`) becomes the canonical column and `account_capacities_v2_unique_slot` becomes the active unique index.

Approved Runtime templates (post-PS-03C2A):

- **PS5_ONLY**: `Z2_PS5 #1`, `Z2_PS5 #2`, `Z3_SHARED_PS5_PS4`
- **PS4_ONLY**: `Z2_PS4 #1`, `Z3_SHARED_PS5_PS4`
- **PS4_AND_PS5**: `Z2_PS5 #1`, `Z2_PS5 #2`, `Z2_PS4 #1`, `Z3_SHARED_PS5_PS4`

No Runtime test or API path depends on `Z3_PS5`.

### 5. Obsolete Backup Code value and lifecycle columns

### 5.1 Value field to become canonical ciphertext

| Object | Kind | Notes |
|--------|------|-------|
| `account_backup_codes.code_encrypted` | column | Legacy value column; migration 0003 should rename/replace to `code_ciphertext` and keep it as the single storage field. |

### 5.2 Fields superseded by the storage-only decision

| Object | Kind | Notes |
|--------|------|-------|
| `account_backup_codes.code_encrypted_v2` | column | Additive v2 ciphertext; no longer needed. |
| `account_backup_codes.code_lookup_hash_v2` | column | Additive lookup hash; no longer needed. |
| `account_backup_codes.status` | column | `backup_code_status` enum (`AVAILABLE`, `USED`, `REVOKED`). |
| `account_backup_codes.used_at` | column | Lifecycle timestamp. |
| `backup_code_status` | enum | Lifecycle status enum. |
| `account_backup_codes_status_idx` | index | ON `status`. |
| `account_backup_codes_code_lookup_hash_v2_idx` | index | ON `code_lookup_hash_v2`. |

After retirement, the authoritative Backup Code storage contract is:

- `id`
- `account_id`
- `code_ciphertext`
- `created_at`

Runtime code, types, and documentation must not depend on lookup hashes, lifecycle status, `AVAILABLE`/`USED`/`REVOKED`, `used_at`, or any validation/consumption/search logic for Backup Codes.

## 6. Remaining Runtime/test coupling that still blocks retirement

| Location | Coupling | Action required in PS-03C2B or a follow-up stage |
|----------|----------|---------------------------------------------------|
| `artifacts/api-server/src/routes/games.test.ts` `seedAccountForGame()` | Inserts dummy values into legacy `email`, `email_normalized`, `playstation_password_encrypted`, `email_password_encrypted` only when those columns exist. After 0003 removes them, the fixture will skip them automatically. | No action needed unless the post-0003 fixture requires additional non-secret columns to satisfy new constraints. |
| `lib/db/src/migrations/ps03c1.test.ts` | Frozen PS-03C1 baseline test asserts the existence of legacy columns and `Z3_PS5` after 0002. | Keep as the 0002 baseline; add a new PS-03C2B migration test that verifies the post-0003 schema. |
| `fixtures/legacy/playSyncerMockData.ts` | Contains `Z3_PS5` and legacy Account mock fields (email, password, backupCodes). | Update or remove when the frontend is integrated with the Account backend. |
| `artifacts/playsyncer/src/domain/slots/types.ts` | `SlotType` still includes `Z3_PS5`. | Update when frontend integrates with the canonical `Z3_SHARED_PS5_PS4` capacity model. |

## 7. Notes for migration 0003 design

- All Account-related tables are empty in the live database, so destructive schema changes are safe.
- `capacity_customers` must remain untouched.
- The database Account contract after 0003 still retains the canonical ciphertext and lookup-hash columns listed in the Final objects table above. Those columns are never exposed by generic Account DTOs.
- Generic Account DTOs expose only non-secret identifier fields: `id`, `game_id`, `account_code`, `account_number_prefix`, `account_number_seq`, `display_number`, `online_id`, `birth_date`, `created_at`, `updated_at`, `deleted_at`, plus `status_override`.
- The new canonical Backup Code storage contract is `id`, `account_id`, `code_ciphertext`, `created_at`.
- The new canonical Capacity kind contract is `capacity_kind_v2` with values `Z2_PS5`, `Z2_PS4`, `Z3_SHARED_PS5_PS4`.
- `game_account_sequences`, `account_code_seq`, and the identifier immutability trigger are final and must not be changed.
