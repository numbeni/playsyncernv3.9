import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { accountsTable } from "./accounts.ts";

export const accountBackupCodesTable = pgTable(
  "account_backup_codes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accountsTable.id),

    // Authoritative storage-only ciphertext. No validation, consumption,
    // search, lifecycle tracking, lookup hashing, or reveal is performed.
    codeCiphertext: text("code_ciphertext").notNull(),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("account_backup_codes_account_id_idx").on(t.accountId),
  ],
);

export type AccountBackupCode = typeof accountBackupCodesTable.$inferSelect;
export type InsertAccountBackupCode =
  typeof accountBackupCodesTable.$inferInsert;
