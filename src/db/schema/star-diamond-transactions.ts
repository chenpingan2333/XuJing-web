/**
 * star_diamond_transactions 表 — V1.2
 *
 * 完整资金流水。amount: 正=入账 负=出账。balance_after: 变动后余额快照。
 */

import { pgTable, uuid, timestamp, bigint, index } from "drizzle-orm/pg-core";
import { desc } from "drizzle-orm";
import { transactionTypeEnum } from "../enums";
import { users } from "./users";
import { uuidv7 } from "../helpers";

export const starDiamondTransactions = pgTable(
  "star_diamond_transactions",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    amount: bigint("amount", { mode: "number" }).notNull(),
    balanceAfter: bigint("balance_after", { mode: "number" }).notNull(),
    type: transactionTypeEnum("type").notNull(),
    referenceId: uuid("reference_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    userCreatedIdx: index("idx_sdt_user_created").on(table.userId, desc(table.createdAt)),
    typeIdx: index("idx_sdt_type").on(table.type),
    referenceIdIdx: index("idx_sdt_reference_id").on(table.referenceId),
  })
);

export type StarDiamondTransaction = typeof starDiamondTransactions.$inferSelect;
export type NewStarDiamondTransaction = typeof starDiamondTransactions.$inferInsert;