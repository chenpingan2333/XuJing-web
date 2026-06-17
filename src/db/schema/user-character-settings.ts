/**
 * user_character_settings 表 — 聊天背景 MVP
 *
 * 用户×角色的个性化设置，当前仅存储聊天背景图。
 * UNIQUE(user_id, character_id) 保证每对用户-角色只有一条记录。
 */

import { pgTable, uuid, varchar, timestamp, uniqueIndex, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { characters } from "./characters";
import { users } from "./users";
import { uuidv7 } from "../helpers";

export const userCharacterSettings = pgTable(
  "user_character_settings",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    characterId: uuid("character_id")
      .notNull()
      .references(() => characters.id, { onDelete: "cascade" }),
    backgroundUrl: varchar("background_url", { length: 500 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => ({
    userCharUniqueIdx: uniqueIndex("idx_user_character_settings_user_char").on(table.userId, table.characterId),
    activeIdx: index("idx_user_character_settings_active").on(table.id).where(sql`${table.deletedAt} IS NULL`),
  })
);

export type UserCharacterSetting = typeof userCharacterSettings.$inferSelect;
export type NewUserCharacterSetting = typeof userCharacterSettings.$inferInsert;