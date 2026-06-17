/**
 * conversations 表 — Phase 9
 *
 * 会话容器：User 1:N Conversation N:1 Character。
 * 首次聊天时自动创建，24h 内复用，超时则新建。
 */

import { pgTable, uuid, timestamp, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { characters } from "./characters";
import { users } from "./users";
import { uuidv7 } from "../helpers";

export const conversations = pgTable(
  "conversations",
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
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => ({
    userCharIdx: index("idx_conversations_user_char").on(table.userId, table.characterId),
    updatedIdx: index("idx_conversations_updated").on(table.updatedAt),
    activeIdx: index("idx_conversations_active").on(table.id).where(sql`${table.deletedAt} IS NULL`),
  })
);

export type Conversation = typeof conversations.$inferSelect;
export type NewConversation = typeof conversations.$inferInsert;