/**
 * vip_records 表 — V1.2
 */

import { pgTable, uuid, timestamp, bigint, boolean, index } from "drizzle-orm/pg-core";
import { vipPlanTypeEnum } from "../enums";
import { users } from "./users";
import { uuidv7 } from "../helpers";

export const vipRecords = pgTable(
  "vip_records",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    planType: vipPlanTypeEnum("plan_type").notNull(),
    starDiamondsSpent: bigint("star_diamonds_spent", { mode: "number" }).notNull(),
    isFirstPurchase: boolean("is_first_purchase").notNull().default(false),
    activatedAt: timestamp("activated_at", { withTimezone: true }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    userIdIdx: index("idx_vip_records_user_id").on(table.userId),
    expiresAtIdx: index("idx_vip_records_expires_at").on(table.expiresAt),
  })
);

export type VipRecord = typeof vipRecords.$inferSelect;
export type NewVipRecord = typeof vipRecords.$inferInsert;