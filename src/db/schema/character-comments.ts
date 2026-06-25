/**
 * character_comments 表 — 角色评论
 *
 * 支持创作者（character.userId）删除自己角色的评论
 * 管理员可删除任意评论
 */

import { pgTable, uuid, text, timestamp, integer, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users } from "./users";
import { characters } from "./characters";

export const characterComments = pgTable(
  "character_comments",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    characterId: uuid("character_id")
      .references(() => characters.id, { onDelete: "cascade" })
      .notNull(),
    userId: uuid("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    content: text("content").notNull(),
    likes: integer("likes").notNull().default(0),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .$defaultFn(() => new Date())
      .$onUpdateFn(() => new Date()),
  },
  (table) => ({
    characterIdx: index("idx_character_comments_character").on(table.characterId),
    userIdx: index("idx_character_comments_user").on(table.userId),
    activeIdx: index("idx_character_comments_active")
      .on(table.characterId)
      .where(sql`${table.deletedAt} IS NULL`),
  })
);

export type CharacterComment = typeof characterComments.$inferSelect;
export type NewCharacterComment = typeof characterComments.$inferInsert;
