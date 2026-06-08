/**
 * admin_logs 表 — V1.2
 *
 * 无 actor_snapshot。无 UPDATE/DELETE 接口。
 */

import { pgTable, uuid, varchar, timestamp, jsonb, index } from "drizzle-orm/pg-core";
import { desc } from "drizzle-orm";
import { adminActionTypeEnum, adminTargetTypeEnum } from "../enums";
import { users } from "./users";
import { uuidv7 } from "../helpers";

export const adminLogs = pgTable(
  "admin_logs",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    adminId: uuid("admin_id")
      .notNull()
      .references(() => users.id),
    actionType: adminActionTypeEnum("action_type").notNull(),
    targetType: adminTargetTypeEnum("target_type").notNull(),
    targetId: uuid("target_id").notNull(),
    detail: jsonb("detail"),
    requestId: uuid("request_id"),
    ipAddress: varchar("ip_address", { length: 45 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    adminCreatedIdx: index("idx_admin_logs_admin_created").on(table.adminId, desc(table.createdAt)),
    actionTypeIdx: index("idx_admin_logs_action_type").on(table.actionType),
    requestIdIdx: index("idx_admin_logs_request_id").on(table.requestId),
  })
);

export type AdminLog = typeof adminLogs.$inferSelect;
export type NewAdminLog = typeof adminLogs.$inferInsert;