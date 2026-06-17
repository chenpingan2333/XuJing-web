/**
 * 叙境（Xujing）Drizzle Relations
 *
 * 基于 Database Design Constraints Report V1.2
 * 定义全部 8 组表间关系。
 */

import { relations } from "drizzle-orm";
import { users } from "./schema/users";
import { characters } from "./schema/characters";
import { messages } from "./schema/messages";
import { memories } from "./schema/memories";
import { apiConfigs } from "./schema/api-configs";
import { orders } from "./schema/orders";
import { vipRecords } from "./schema/vip-records";
import { adminLogs } from "./schema/admin-logs";
import { conversations } from "./schema/conversations";
import { starDiamondTransactions } from "./schema/star-diamond-transactions";
import { userCharacterSettings } from "./schema/user-character-settings";

// ─── User ────────────────────────────────────────────
export const usersRelations = relations(users, ({ many }) => ({
  characters: many(characters),
  apiConfigs: many(apiConfigs),
  orders: many(orders),
  vipRecords: many(vipRecords),
  adminLogs: many(adminLogs),
  starDiamondTransactions: many(starDiamondTransactions),
  userCharacterSettings: many(userCharacterSettings),
}));

// ─── Character ────────────────────────────────────────
// user_id IS NULL = System Character（官方角色，无 owner）
export const charactersRelations = relations(characters, ({ one, many }) => ({
  owner: one(users, {
    fields: [characters.userId],
    references: [users.id],
  }),
  messages: many(messages),
  memories: many(memories),
  userCharacterSettings: many(userCharacterSettings),
}));

// ─── Message ──────────────────────────────────────────
export const messagesRelations = relations(messages, ({ one }) => ({
  character: one(characters, {
    fields: [messages.characterId],
    references: [characters.id],
  }),
  user: one(users, {
    fields: [messages.userId],
    references: [users.id],
  }),
}));

// ─── Memory ───────────────────────────────────────────
export const memoriesRelations = relations(memories, ({ one }) => ({
  character: one(characters, {
    fields: [memories.characterId],
    references: [characters.id],
  }),
  user: one(users, {
    fields: [memories.userId],
    references: [users.id],
  }),
}));

// ─── ApiConfig ────────────────────────────────────────

// ─── Conversation ─────────────────────────────────
export const conversationsRelations = relations(conversations, ({ one, many }) => ({
  user: one(users, {
    fields: [conversations.userId],
    references: [users.id],
  }),
  character: one(characters, {
    fields: [conversations.characterId],
    references: [characters.id],
  }),
  messages: many(messages),
}));
export const apiConfigsRelations = relations(apiConfigs, ({ one }) => ({
  user: one(users, {
    fields: [apiConfigs.userId],
    references: [users.id],
  }),
}));

// ─── Order ────────────────────────────────────────────
export const ordersRelations = relations(orders, ({ one }) => ({
  user: one(users, {
    fields: [orders.userId],
    references: [users.id],
  }),
}));

// ─── VipRecord ────────────────────────────────────────
export const vipRecordsRelations = relations(vipRecords, ({ one }) => ({
  user: one(users, {
    fields: [vipRecords.userId],
    references: [users.id],
  }),
}));

// ─── AdminLog ─────────────────────────────────────────
export const adminLogsRelations = relations(adminLogs, ({ one }) => ({
  admin: one(users, {
    fields: [adminLogs.adminId],
    references: [users.id],
  }),
}));

// ─── StarDiamondTransaction ───────────────────────────
export const starDiamondTransactionsRelations = relations(starDiamondTransactions, ({ one }) => ({
  user: one(users, {
    fields: [starDiamondTransactions.userId],
    references: [users.id],
  }),
}));

// ─── UserCharacterSetting ─────────────────────────────
export const userCharacterSettingsRelations = relations(userCharacterSettings, ({ one }) => ({
  user: one(users, {
    fields: [userCharacterSettings.userId],
    references: [users.id],
  }),
  character: one(characters, {
    fields: [userCharacterSettings.characterId],
    references: [characters.id],
  }),
}));