/**
 * users 表 — V1.3
 *
 * role={USER, ADMIN}，VIP 用 vip_expires_at 表达。
 * star_diamonds: BIGINT。email: LOWER 存储（应用层 email.trim().toLowerCase()）。
 * password_hash: bcryptjs 哈希，所有新用户必填。
 */

import { pgTable, uuid, varchar, timestamp, bigint, boolean, text, uniqueIndex } from "drizzle-orm/pg-core";
import { userRoleEnum, userStatusEnum } from "../enums";
import { uuidv7 } from "../helpers";

export const users = pgTable(
  "users",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    email: varchar("email", { length: 255 }).notNull(),
    passwordHash: varchar("password_hash", { length: 255 }).notNull(),
    nickname: varchar("nickname", { length: 100 }).default(""),
    avatarUrl: varchar("avatar_url", { length: 500 }),
    role: userRoleEnum("role").notNull().default("USER"),
    status: userStatusEnum("status").notNull().default("ACTIVE"),
    vipExpiresAt: timestamp("vip_expires_at", { withTimezone: true }),
    starDiamonds: bigint("star_diamonds", { mode: "number" }).notNull().default(0),
    personaSetting: text("persona_setting"),
    hasPurchasedVip: boolean("has_purchased_vip").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .$defaultFn(() => new Date())
      .$onUpdateFn(() => new Date()),
  },
  (table) => ({
    emailUnique: uniqueIndex("idx_users_email_unique").on(table.email),
  })
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
