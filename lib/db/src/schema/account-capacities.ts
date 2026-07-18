import {
  boolean,
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { capacityKindV2Enum } from "./enums.ts";
import { accountsTable } from "./accounts.ts";

/**
 * Persistent capacity rows — one row per slot per account.
 *
 * Final capacity kind contract: Z2_PS5, Z2_PS4, Z3_SHARED_PS5_PS4.
 */
export const accountCapacitiesTable = pgTable(
  "account_capacities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accountsTable.id),
    capacityKindV2: capacityKindV2Enum("capacity_kind_v2").notNull(),
    instanceNo: integer("instance_no").notNull(),
    displayLabel: text("display_label").notNull(),
    // PS-03C1 additive FINISHED state fields.
    isFinished: boolean("is_finished").notNull().default(false),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("account_capacities_v2_unique_slot")
      .on(t.accountId, t.capacityKindV2, t.instanceNo),
    // FINISHED state consistency: indicator and timestamp must agree.
    check(
      "account_capacities_finished_consistency",
      sql`(${t.isFinished} = false AND ${t.finishedAt} IS NULL) OR (${t.isFinished} = true AND ${t.finishedAt} IS NOT NULL)`,
    ),
    index("account_capacities_account_id_idx").on(t.accountId),
    index("account_capacities_is_finished_idx").on(t.isFinished),
  ],
);

export type AccountCapacity = typeof accountCapacitiesTable.$inferSelect;
export type InsertAccountCapacity = typeof accountCapacitiesTable.$inferInsert;
