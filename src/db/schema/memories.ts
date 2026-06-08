/**
 * memories 表 — Phase 9 Extended
 *
 * 新增 category（FACT / PREFERENCE / EVENT）和 reference_ids（JSONB 溯源）。
 * embedding: JSONB NULL，预留向量检索。不使用 pgvector。
 */

import { pgTable, uuid, text, timestamp, numeric, jsonb, varchar, index } from "drizzle-orm/pg-core";
import { desc } from "drizzle-orm";
import { characters } from "./characters";
import { users } from "./users";
import { memoryCategoryEnum } from "../enums";
import { uuidv7 } from "../helpers";

export const memories = pgTable(
  "memories",
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
    content: text("content").notNull(),
    category: memoryCategoryEnum("category").notNull().default("FACT"),
    importance: numeric("importance", { precision: 3, scale: 2 }).notNull().default("0.50"),
    referenceIds: jsonb("reference_ids").$type<string[]>(),
    extractedFromMessageId: uuid("extracted_from_message_id"),
    embedding: jsonb("embedding"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    charUserIdx: index("idx_memories_char_user").on(table.characterId, table.userId),
    categoryIdx: index("idx_memories_category").on(table.category),
    importanceIdx: index("idx_memories_importance").on(desc(table.importance)),
    charUserImportanceIdx: index("idx_memories_char_user_importance").on(
      table.characterId,
      table.userId,
      desc(table.importance)
    ),
  })
);

export type Memory = typeof memories.$inferSelect;
export type NewMemory = typeof memories.$inferInsert;