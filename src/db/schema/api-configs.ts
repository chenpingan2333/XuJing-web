/**
 * api_configs 表 — V1.2
 *
 * is_default + 部分唯一索引 → 每用户最多一个默认配置。
 * api_key_encrypted: AES-256-CBC 密文。
 */

import { pgTable, uuid, varchar, timestamp, boolean, uniqueIndex, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { apiPlatformEnum } from "../enums";
import { users } from "./users";
import { uuidv7 } from "../helpers";

export const apiConfigs = pgTable(
  "api_configs",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    name: varchar("name", { length: 100 }).notNull(),
    platform: apiPlatformEnum("platform").notNull(),
    apiUrl: varchar("api_url", { length: 500 }).notNull(),
    apiKeyEncrypted: varchar("api_key_encrypted", { length: 500 }).notNull(),
    modelId: varchar("model_id", { length: 100 }).notNull(),
    isActive: boolean("is_active").notNull().default(true),
    isDefault: boolean("is_default").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .$defaultFn(() => new Date())
      .$onUpdateFn(() => new Date()),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => ({
    userIdIdx: index("idx_api_configs_user_id").on(table.userId),
    userDefaultUnique: uniqueIndex("idx_api_configs_user_default")
      .on(table.userId)
      .where(sql`${table.isDefault} = true`),
    activeIdx: index("idx_api_configs_active").on(table.userId).where(sql`${table.deletedAt} IS NULL`),
  })
);

export type ApiConfig = typeof apiConfigs.$inferSelect;
export type NewApiConfig = typeof apiConfigs.$inferInsert;