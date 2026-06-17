/**
 * audit_logs 表 — V1.0
 *
 * INSERT-ONLY 审计日志表。禁止 UPDATE / DELETE。
 * 与 admin_logs 互补：admin_logs 仅记录管理员操作，audit_logs 覆盖全部用户+系统操作。
 *
 * 保护机制：
 *   - RLS 策略：仅允许 INSERT
 *   - 触发器：prevent_audit_modification() 阻止 UPDATE/DELETE
 *   - 归档：超过 retention_until 的记录迁移至 audit_logs_archive
 *
 * 详见 docs/p0-security/AUDIT_LOG_SCHEMA.md
 */

import {
  pgTable,
  pgEnum,
  uuid,
  varchar,
  timestamp,
  jsonb,
  text,
  index,
} from "drizzle-orm/pg-core";
import { desc, sql } from "drizzle-orm";
import { uuidv7 } from "../helpers";

// ─── Audit Enums ─────────────────────────────────────

/** 操作者类型 */
export const actorTypeEnum = pgEnum("actor_type", [
  "user",
  "system",
  "admin",
]);

/** 操作分类 */
export const actionCategoryEnum = pgEnum("action_category", [
  "auth",
  "data",
  "file",
  "system",
]);

/** 操作结果 */
export const actionResultEnum = pgEnum("action_result", [
  "success",
  "failure",
  "denied",
]);

/** 目标实体类型 */
export const targetTypeEnum = pgEnum("audit_target_type", [
  "user",
  "character",
  "message",
  "conversation",
  "memory",
  "order",
  "vip_record",
  "transaction",
  "api_config",
  "user_character_settings",
  "file",
  "system",
]);

// ─── Audit Actions 常量 ──────────────────────────────
// 完整操作枚举见 docs/p0-security/AUDIT_ACTIONS.md

/** 审计操作类型（VARCHAR(50)，不使用 pgEnum 以保持可扩展性） */
export const AuditAction = {
  // ── 认证 ──
  AUTH_LOGIN: "auth.login",
  AUTH_LOGOUT: "auth.logout",
  AUTH_TOKEN_REFRESH: "auth.token.refresh",
  AUTH_FAILURE: "auth.failure",

  // ── 文件 ──
  FILE_UPLOAD: "file.upload",
  FILE_UPLOAD_REJECTED: "file.upload.rejected",

  // ── 数据：角色 ──
  CHARACTER_CREATE: "character.create",
  CHARACTER_UPDATE: "character.update",
  CHARACTER_DELETE: "character.delete",

  // ── 数据：消息 ──
  MESSAGE_CREATE: "message.create",
  MESSAGE_UPDATE: "message.update",
  MESSAGE_DELETE: "message.delete",

  // ── 数据：对话 ──
  CONVERSATION_CREATE: "conversation.create",
  CONVERSATION_UPDATE: "conversation.update",
  CONVERSATION_DELETE: "conversation.delete",

  // ── 数据：记忆 ──
  MEMORY_CREATE: "memory.create",
  MEMORY_DELETE: "memory.delete",

  // ── 数据：用户设置 ──
  USER_SETTINGS_CREATE: "user_character_settings.create",
  USER_SETTINGS_UPDATE: "user_character_settings.update",
  USER_SETTINGS_DELETE: "user_character_settings.delete",

  // ── 数据：用户 ──
  USER_CREATE: "user.create",
  USER_UPDATE: "user.update",
  USER_DELETE: "user.delete",

  // ── 数据：订单 ──
  ORDER_CREATE: "order.create",
  ORDER_UPDATE: "order.update",

  // ── 数据：VIP ──
  VIP_RECORD_CREATE: "vip_record.create",

  // ── 数据：交易 ──
  TRANSACTION_CREATE: "transaction.create",

  // ── 数据：API 配置 ──
  API_CONFIG_CREATE: "api_config.create",
  API_CONFIG_UPDATE: "api_config.update",
  API_CONFIG_DELETE: "api_config.delete",

  // ── 系统 ──
  SYSTEM_CONFIG_UPDATE: "system.config.update",
} as const;

export type AuditActionType = (typeof AuditAction)[keyof typeof AuditAction];

// ─── audit_logs 表 ───────────────────────────────────

export const auditLogs = pgTable(
  "audit_logs",
  {
    // 主键
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),

    // 操作时间
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),

    // 操作者信息
    actorId: uuid("actor_id").notNull(),
    actorType: actorTypeEnum("actor_type").notNull().default("user"),
    actorIp: varchar("actor_ip", { length: 45 }),
    actorUa: varchar("actor_ua", { length: 500 }),

    // 操作描述
    action: varchar("action", { length: 50 }).notNull(),
    actionCategory: actionCategoryEnum("action_category").notNull(),
    actionResult: actionResultEnum("action_result")
      .notNull()
      .default("success"),
    errorMessage: text("error_message"),

    // 目标实体
    targetType: targetTypeEnum("target_type").notNull(),
    targetId: varchar("target_id", { length: 255 }).notNull(),
    targetName: varchar("target_name", { length: 255 }),

    // 变更详情
    oldValue: jsonb("old_value"),
    newValue: jsonb("new_value"),
    metadata: jsonb("metadata").default({}),

    // 请求上下文
    requestId: varchar("request_id", { length: 100 }),
    requestMethod: varchar("request_method", { length: 10 }),
    requestPath: varchar("request_path", { length: 500 }),

    // 数据生命周期
    retentionUntil: timestamp("retention_until", { withTimezone: true }),
  },
  (table) => ({
    // 1. 时间范围查询（最常用）
    createdAtIdx: index("idx_audit_logs_created_at").on(
      desc(table.createdAt)
    ),
    // 2. 按操作者查询
    actorIdIdx: index("idx_audit_logs_actor_id").on(
      table.actorId,
      desc(table.createdAt)
    ),
    // 3. 按操作类型查询
    actionIdx: index("idx_audit_logs_action").on(
      table.action,
      desc(table.createdAt)
    ),
    // 4. 按目标实体查询
    targetIdx: index("idx_audit_logs_target").on(
      table.targetType,
      table.targetId,
      desc(table.createdAt)
    ),
    // 5. 按操作结果查询（部分索引：仅 failure/denied）
    resultIdx: index("idx_audit_logs_result")
      .on(table.actionResult, desc(table.createdAt))
      .where(
        sql`${table.actionResult} IN ('failure', 'denied')`
      ),
    // 6. 按分类查询
    categoryIdx: index("idx_audit_logs_category").on(
      table.actionCategory,
      desc(table.createdAt)
    ),
    // 7. JSONB 元数据索引（GIN，部分索引）
    metadataIdx: index("idx_audit_logs_metadata")
      .using("gin", table.metadata)
      .where(
        sql`${table.metadata} IS NOT NULL AND ${table.metadata} != '{}'`
      ),
    // 8. 请求追踪（部分索引）
    requestIdIdx: index("idx_audit_logs_request_id")
      .on(table.requestId)
      .where(sql`${table.requestId} IS NOT NULL`),
  })
);

// ─── 类型导出 ────────────────────────────────────────

export type AuditLog = typeof auditLogs.$inferSelect;
export type NewAuditLog = typeof auditLogs.$inferInsert;
