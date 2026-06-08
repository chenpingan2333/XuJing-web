/**
 * messages 表 — V1.2
 *
 * 扁平线性结构。无 parent / generation_index / branch。
 * 角色物理清理时 CASCADE。
 */

import { pgTable, uuid, text, timestamp, index } from "drizzle-orm/pg-core";
import { desc } from "drizzle-orm";
import { messageRoleEnum } from "../enums";
import { characters } from "./characters";
import { users } from "./users";
import { uuidv7 } from "../helpers";

export const messages = pgTable(
  "messages",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    characterId: uuid("character_id")
      .notNull()
      .references(() => characters.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    role: messageRoleEnum("role").notNull(),
    content: text("content").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    charCreatedIdx: index("idx_messages_char_created").on(table.characterId, desc(table.createdAt)),
    userCharIdx: index("idx_messages_user_char").on(table.userId, table.characterId),
    userCharCreatedIdx: index("idx_messages_user_char_created").on(
      table.userId,
      table.characterId,
      desc(table.createdAt)
    ),
  })
);

export type Message = typeof messages.$inferSelect;
export type NewMessage = typeof messages.$inferInsert;