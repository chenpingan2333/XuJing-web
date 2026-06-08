/**
 * orders 表 — V1.2
 *
 * amount_rmb: NUMERIC(10,2)。transaction_id UNIQUE 防重复审核。
 */

import { pgTable, uuid, varchar, timestamp, numeric, bigint, uniqueIndex, index } from "drizzle-orm/pg-core";
import { sql, desc } from "drizzle-orm";
import { orderStatusEnum } from "../enums";
import { users } from "./users";
import { uuidv7 } from "../helpers";

export const orders = pgTable(
  "orders",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    amountRmb: numeric("amount_rmb", { precision: 10, scale: 2 }).notNull(),
    starDiamonds: bigint("star_diamonds", { mode: "number" }).notNull(),
    status: orderStatusEnum("status").notNull().default("PENDING_PAYMENT"),
    screenshotUrl: varchar("screenshot_url", { length: 500 }),
    reviewNote: varchar("review_note", { length: 500 }),
    reviewedBy: uuid("reviewed_by"),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    transactionId: uuid("transaction_id"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .$defaultFn(() => new Date())
      .$onUpdateFn(() => new Date()),
  },
  (table) => ({
    userIdIdx: index("idx_orders_user_id").on(table.userId),
    statusIdx: index("idx_orders_status").on(table.status),
    transactionIdUnique: uniqueIndex("idx_orders_transaction_id_unique").on(table.transactionId),
    statusCreatedIdx: index("idx_orders_status_created").on(table.status, desc(table.createdAt)),
    pendingReviewIdx: index("idx_orders_pending_review")
      .on(table.status, desc(table.createdAt))
      .where(sql`${table.status} = 'PENDING_REVIEW'`),
  })
);

export type Order = typeof orders.$inferSelect;
export type NewOrder = typeof orders.$inferInsert;