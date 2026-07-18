# PS-03C2B-2 — Migration 0003 Build and Test Report

**Date:** 2026-07-16

**Current commit:** `412b1eb` — `Refactor database schema and migrations to remove deprecated account enums and fields`

**Approved baseline:** `84f0116` — `PS-03C2A: restore Games API tests, correct retirement inventory, finalize validation`

**Git status:** clean except for the untracked instruction file `attached_assets/Pasted-Do-not-modify-any-file-Do-not-run-migrations-Do-not-mod_1784225841752.txt`.

```
?? attached_assets/Pasted-Do-not-modify-any-file-Do-not-run-migrations-Do-not-mod_1784225841752.txt
```

---

## 1. Created, modified and deleted files

| File | Status | Lines |
|------|--------|-------|
| `lib/db/migrations/0003_ps03c2b_retirement.sql` | created | +25 |
| `lib/db/migrations/meta/0003_snapshot.json` | created | +1309 |
| `lib/db/migrations/meta/_journal.json` | modified | +9 / -1 |
| `lib/db/src/migrations/ps03c2b.test.ts` | created | +464 |
| `lib/db/src/migrations/ps03c1.test.ts` | modified | +33 / -14 |
| `lib/db/src/schema/accounts.ts` | modified | +25 / -25 |
| `lib/db/src/schema/account-backup-codes.ts` | modified | +17 / -17 |
| `lib/db/src/schema/account-capacities.ts` | modified | +21 / -33 |
| `lib/db/src/schema/enums.ts` | modified | -17 |
| `artifacts/api-server/src/routes/accounts.disabled.test.ts` | modified | +5 / -5 |
| `reports/ps03c2b_0003_complete.diff` | created | +2103 |
| `reports/ps03c2b_migration_build_report.md` | created | this file |

No other files were modified. Migrations `0000`, `0001`, and `0002` were not touched.

---

## 2. Migration 0003

- **Filename:** `lib/db/migrations/0003_ps03c2b_retirement.sql`
- **SHA-256:** `2fa056d4a7e45c70339aa09e7316a1917e1cc4a909c2eeb6009b17edd166194a`
- **No `IF EXISTS` for expected baseline objects:** confirmed (`grep -i "if exists"` returned nothing).
- **Not applied to live database:** confirmed. The live DB `drizzle.__drizzle_migrations` table contains exactly 3 rows, and the live `accounts` table still contains the legacy columns (`email`, `email_normalized`, `status`, `playstation_password_encrypted`, `email_password_encrypted`, `family_management_email_encrypted`).

### Migration 0003 SQL operations

```sql
-- 1. Drop legacy-dependent indexes and constraints.
DROP INDEX "accounts_email_normalized_active_uniq";
DROP INDEX "accounts_status_idx";
DROP INDEX "account_backup_codes_status_idx";
DROP INDEX "account_backup_codes_code_lookup_hash_v2_idx";
ALTER TABLE "account_capacities" DROP CONSTRAINT "account_capacities_unique_slot";

-- 2. Drop legacy Account columns.
ALTER TABLE "accounts" DROP COLUMN "email";
ALTER TABLE "accounts" DROP COLUMN "email_normalized";
ALTER TABLE "accounts" DROP COLUMN "playstation_password_encrypted";
ALTER TABLE "accounts" DROP COLUMN "email_password_encrypted";
ALTER TABLE "accounts" DROP COLUMN "family_management_email_encrypted";
ALTER TABLE "accounts" DROP COLUMN "status";

-- 3. Drop legacy Backup Code columns and rename the canonical column.
ALTER TABLE "account_backup_codes" DROP COLUMN "code_encrypted_v2";
ALTER TABLE "account_backup_codes" DROP COLUMN "code_lookup_hash_v2";
ALTER TABLE "account_backup_codes" DROP COLUMN "status";
ALTER TABLE "account_backup_codes" DROP COLUMN "used_at";
ALTER TABLE "account_backup_codes" RENAME COLUMN "code_encrypted" TO "code_ciphertext";

-- 4. Drop legacy Capacity column, make v2 required, and rebuild the unique index unconditionally.
ALTER TABLE "account_capacities" DROP COLUMN "capacity_kind";
ALTER TABLE "account_capacities" ALTER COLUMN "capacity_kind_v2" SET NOT NULL;
DROP INDEX "account_capacities_v2_unique_slot";
CREATE UNIQUE INDEX "account_capacities_v2_unique_slot" ON "account_capacities" USING btree ("account_id", "capacity_kind_v2", "instance_no");

-- 5. Drop retired enums.
DROP TYPE "public"."account_status";
DROP TYPE "public"."backup_code_status";
DROP TYPE "public"."capacity_kind";
```

---

## 3. Migrations 0000–0002 unchanged

```
a43ab14cacf73a107d5c115c2025dc56de3537efe4d409ca65c79e48a8aa07ca  lib/db/migrations/0000_zippy_leech.sql
c09f28b3895fa3ee2732f42438d55e4ad136a02d485386bfe001c4530d14c4c2  lib/db/migrations/0001_glossy_onslaught.sql
99f124e4bb93a8763d485813a65355c44e4a0aa4a1a6b4eb8ddffc47e3059b6a  lib/db/migrations/0002_warm_swarm.sql
```

---

## 4. Drizzle schema changes

### `accounts.ts`

- Removed: `email`, `emailNormalized`, `playstation_password_encrypted`, `emailPasswordEncrypted`, `familyManagementEmailEncrypted`, `status`.
- Removed imports of `accountStatusEnum` and indexes `accounts_email_normalized_active_uniq`, `accounts_status_idx`.
- Kept: `statusOverride`, `accountStatusOverrideEnum`, all canonical ciphertext/lookup-hash columns, `account_code_seq`, per-game identifier constraints, and the immutability trigger.

### `account-backup-codes.ts`

- Renamed `codeEncrypted` → `codeCiphertext` (column `code_ciphertext`).
- Removed: `codeEncryptedV2`, `codeLookupHashV2`, `status`, `usedAt`.
- Removed `backupCodeStatusEnum` import and indexes `account_backup_codes_status_idx`, `account_backup_codes_code_lookup_hash_v2_idx`.
- Kept: `account_backup_codes_account_id_idx`.

### `account-capacities.ts`

- Removed: `capacityKind`, `capacityKindEnum`, and the `account_capacities_unique_slot` constraint.
- Made `capacityKindV2` NOT NULL.
- Changed `account_capacities_v2_unique_slot` from a conditional index to an unconditional unique index.
- Kept: `capacityKindV2Enum`, `isFinished`, `finishedAt`, `account_capacities_finished_consistency`, and the remaining indexes.

### `enums.ts`

- Removed: `accountStatusEnum`, `backupCodeStatusEnum`, `capacityKindEnum`.
- Kept: `accountStatusOverrideEnum`, `capacityKindV2Enum`, and all other enums.

---

## 5. Preserved objects (verified by `ps03c2b.test.ts`)

- `accounts.status_override` and `account_status_override` enum.
- Canonical ciphertext columns: `psn_email_encrypted`, `psn_password_encrypted`, `email_password_encrypted_v2`, `family_management_email_encrypted_v2`.
- Lookup-hash columns: `psn_email_lookup_hash`, `psn_password_lookup_hash`, `email_password_lookup_hash`, `family_management_email_lookup_hash`.
- `account_code_seq` sequence.
- `game_account_sequences` table and its foreign key.
- Identifier constraints: `accounts_account_code_unique`, `accounts_game_seq_unique`, `accounts_game_display_unique`.
- `accounts_protect_identifiers_trigger` and its backing function.
- `capacity_customers` table, columns, and constraints unchanged.
- `games` table and its existing rows unchanged.

---

## 6. Final Backup Code schema

Confirmed in `ps03c2b.test.ts` by querying `information_schema.columns` on a disposable database after applying all four migrations:

- `id`
- `account_id`
- `code_ciphertext`
- `created_at`

---

## 7. Capacity final state

- `capacity_kind_v2` is **NOT NULL** (`is_nullable = 'NO'`).
- `account_capacities_v2_unique_slot` is an **unconditional** unique index (`CREATE UNIQUE INDEX ... (account_id, capacity_kind_v2, instance_no)` with no `WHERE` clause).
- Legacy `capacity_kind` column and `capacity_kind` enum (including `Z3_PS5`) are retired.

---

## 8. Required files existence

| File | Exists |
|------|--------|
| `lib/db/src/migrations/ps03c2b.test.ts` | ✅ yes |
| `reports/ps03c2b_migration_build_report.md` | ✅ yes (this file) |
| `reports/ps03c2b_0003_complete.diff` | ✅ yes (2103 lines) |

---

## 9. Verification exit codes

| Command | Exit code |
|---------|-----------|
| `pnpm run typecheck` | **0** |
| `pnpm --filter @workspace/api-server run test` | **0** |
| `pnpm --filter @workspace/db run test` | **0** |
| `pnpm --filter @workspace/db run test:migrations` | **0** |
| `PORT=24351 BASE_PATH=/ pnpm --filter @workspace/playsyncer run build` | **0** |

Migration test suite result: `ℹ tests 38 — suites 2 — pass 38 — fail 0`.

---

## 10. Disposable database evidence

- Migration 0003 was tested only on auto-generated disposable databases, never on the active workspace database.
- `ps03c1.test.ts` applies migrations `0000`–`0002` manually to a database named `ps03c1_test_<uuid>` and verifies the post-0002 baseline.
- `ps03c2b.test.ts` applies all migrations via `pnpm run db:migrate` to a database named `ps03c2b_test_<uuid>` and verifies the post-0003 schema.
- Both tests refuse to run against the active workspace database (`ACTIVE_DB_NAME` check).
- Live database evidence:
  - `drizzle.__drizzle_migrations` count = **3**.
  - Live `accounts` still contains legacy columns: `email`, `email_normalized`, `email_password_encrypted`, `family_management_email_encrypted`, `playstation_password_encrypted`, `status`.

---

## 11. Final verdict

**PS-03C2B-2 — MIGRATION BUILT AND TESTED, AWAITING COMMAND CENTER REVIEW**
