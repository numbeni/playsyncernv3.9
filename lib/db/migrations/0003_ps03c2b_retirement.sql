-- PS-03C2B: retire legacy Account, Backup Code, and Capacity fields.
--> statement-breakpoint
DROP INDEX "accounts_email_normalized_active_uniq";--> statement-breakpoint
DROP INDEX "accounts_status_idx";--> statement-breakpoint
DROP INDEX "account_backup_codes_status_idx";--> statement-breakpoint
DROP INDEX "account_backup_codes_code_lookup_hash_v2_idx";--> statement-breakpoint
ALTER TABLE "account_capacities" DROP CONSTRAINT "account_capacities_unique_slot";--> statement-breakpoint
ALTER TABLE "accounts" DROP COLUMN "email";--> statement-breakpoint
ALTER TABLE "accounts" DROP COLUMN "email_normalized";--> statement-breakpoint
ALTER TABLE "accounts" DROP COLUMN "playstation_password_encrypted";--> statement-breakpoint
ALTER TABLE "accounts" DROP COLUMN "email_password_encrypted";--> statement-breakpoint
ALTER TABLE "accounts" DROP COLUMN "family_management_email_encrypted";--> statement-breakpoint
ALTER TABLE "accounts" DROP COLUMN "status";--> statement-breakpoint
ALTER TABLE "account_backup_codes" DROP COLUMN "code_encrypted_v2";--> statement-breakpoint
ALTER TABLE "account_backup_codes" DROP COLUMN "code_lookup_hash_v2";--> statement-breakpoint
ALTER TABLE "account_backup_codes" DROP COLUMN "status";--> statement-breakpoint
ALTER TABLE "account_backup_codes" DROP COLUMN "used_at";--> statement-breakpoint
ALTER TABLE "account_backup_codes" RENAME COLUMN "code_encrypted" TO "code_ciphertext";--> statement-breakpoint
ALTER TABLE "account_capacities" DROP COLUMN "capacity_kind";--> statement-breakpoint
ALTER TABLE "account_capacities" ALTER COLUMN "capacity_kind_v2" SET NOT NULL;--> statement-breakpoint
DROP INDEX "account_capacities_v2_unique_slot";--> statement-breakpoint
CREATE UNIQUE INDEX "account_capacities_v2_unique_slot" ON "account_capacities" USING btree ("account_id", "capacity_kind_v2", "instance_no");--> statement-breakpoint
DROP TYPE "public"."account_status";--> statement-breakpoint
DROP TYPE "public"."backup_code_status";--> statement-breakpoint
DROP TYPE "public"."capacity_kind";
