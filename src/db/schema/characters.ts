/**
 * characters 表 — V1.2
 *
 * 软删除: deleted_at。System Character: is_official=true AND user_id=NULL。
 */

import { pgTable, uuid, varchar, timestamp, integer, boolean, jsonb, text, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users } from "./users";
import { uuidv7 } from "../helpers";

export const characters = pgTable(
  "characters",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    userId: uuid("user_id").references(() => users.id),
    name: varchar("name", { length: 100 }).notNull(),
    avatarUrl: varchar("avatar_url", { length: 500 }),
    backgroundUrl: varchar("background_url", { length: 500 }),
    setting: text("setting").notNull(),
    greeting: text("greeting").notNull(),
    personality: text("personality"),
    scenario: text("scenario"),
    dialogueExamples: jsonb("dialogue_examples"),
    nickname: varchar("nickname", { length: 100 }),
    groupGreeting: text("group_greeting"),
    mainPrompt: text("main_prompt"),
    postHistoryInstructions: text("post_history_instructions"),
    extraFields: jsonb("extra_fields"),
    oneLineIntro: text("one_line_intro"),
    isPublic: boolean("is_public").notNull().default(false),
    publicityFields: jsonb("publicity_fields"),
    fakeChats: integer("fake_chats").notNull().default(100),
    fakeLikes: integer("fake_likes").notNull().default(10),
    isOfficial: boolean("is_official").notNull().default(false),
    version: integer("version").notNull().default(1),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .$defaultFn(() => new Date())
      .$onUpdateFn(() => new Date()),
  },
  (table) => ({
    userIdIdx: index("idx_characters_user_id").on(table.userId),
    isOfficialIdx: index("idx_characters_is_official").on(table.isOfficial),
    isPublicIdx: index("idx_characters_is_public").on(table.isPublic),
    publicActiveIdx: index("idx_characters_public_active")
      .on(table.isPublic, table.isOfficial)
      .where(sql`${table.deletedAt} IS NULL`),
    activeIdx: index("idx_characters_active")
      .on(table.userId)
      .where(sql`${table.deletedAt} IS NULL AND ${table.userId} IS NOT NULL`),
  })
);

export type Character = typeof characters.$inferSelect;
export type NewCharacter = typeof characters.$inferInsert;