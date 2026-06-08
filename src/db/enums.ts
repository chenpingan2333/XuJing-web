/**
 * 叙境（Xujing）Database Enums
 *
 * 基于 Database Design Constraints Report V1.2
 * 使用 PostgreSQL 原生 enum 类型（pgEnum）
 */

import { pgEnum } from "drizzle-orm/pg-core";

// ─── 4.1 UserRole ────────────────────────────────────
// role 仅表示权限身份。VIP 状态由 vip_expires_at 表达。
export const userRoleEnum = pgEnum("user_role", ["USER", "ADMIN"]);

// ─── 4.2 UserStatus ──────────────────────────────────
export const userStatusEnum = pgEnum("user_status", ["ACTIVE", "BANNED"]);

// ─── 4.3 OrderStatus ─────────────────────────────────
// 流转: PENDING_PAYMENT → PENDING_REVIEW → COMPLETED / REJECTED
export const orderStatusEnum = pgEnum("order_status", [
  "PENDING_PAYMENT",
  "PENDING_REVIEW",
  "COMPLETED",
  "REJECTED",
]);

// ─── 4.4 MessageRole ─────────────────────────────────
export const messageRoleEnum = pgEnum("message_role", ["USER", "ASSISTANT"]);

// ─── 4.5 VipPlanType ─────────────────────────────────
export const vipPlanTypeEnum = pgEnum("vip_plan_type", [
  "MONTHLY",
  "QUARTERLY",
  "YEARLY",
]);

// ─── 4.6 ApiPlatform ─────────────────────────────────
export const apiPlatformEnum = pgEnum("api_platform", [
  "OPENAI",
  "ANTHROPIC",
  "GEMINI",
  "DEEPSEEK",
  "GROK",
  "CUSTOM_OPENAI",
  "CUSTOM_ANTHROPIC",
  "CUSTOM_GEMINI",
]);

// ─── 4.7 AdminActionType ─────────────────────────────
export const adminActionTypeEnum = pgEnum("admin_action_type", [
  "USER_CREATE",
  "USER_BAN",
  "USER_UNBAN",
  "CHARACTER_UNLIST",
  "ORDER_APPROVE",
  "ORDER_REJECT",
  "VIP_GRANT",
  "VIP_REVOKE",
]);

// ─── 4.8 AdminTargetType ─────────────────────────────
export const adminTargetTypeEnum = pgEnum("admin_target_type", [
  "USER",
  "CHARACTER",
  "ORDER",
  "VIP",
]);

// ─── 4.10 MemoryCategory ────────────────────────
export const memoryCategoryEnum = pgEnum("memory_category", [
  "FACT",
  "PREFERENCE",
  "EVENT",
]);
// ─── 4.9 TransactionType ─────────────────────────────
export const transactionTypeEnum = pgEnum("transaction_type", [
  "RECHARGE",
  "VIP_PURCHASE",
  "CHAT_CONSUME",
  "ADMIN_ADJUST",
]);