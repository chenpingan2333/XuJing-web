/**
 * user_follows 表 — 用户关注关系
 *
 * follower_id 关注 following_id（被关注者）
 * 复合唯一索引防止重复关注
 */

import { pgTable, uuid, timestamp, uniqueIndex, index } from "drizzle-orm/pg-core";
import { users } from "./users";
import { characters } from "./characters";

export const userFollows = pgTable(
  "user_follows",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    followerId: uuid("follower_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    followingId: uuid("following_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    characterId: uuid("character_id").references(() => characters.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    uniqueFollow: uniqueIndex("idx_user_follows_unique")
      .on(table.followerId, table.followingId, table.characterId),
    followerIdx: index("idx_user_follows_follower").on(table.followerId),
    followingIdx: index("idx_user_follows_following").on(table.followingId),
    characterIdx: index("idx_user_follows_character").on(table.characterId),
  })
);

export type UserFollow = typeof userFollows.$inferSelect;
export type NewUserFollow = typeof userFollows.$inferInsert;
