/**
 * AssetService - 统一软删除服务
 * 
 * P1安全边界建设：替代所有 db.delete() 调用，
 * 提供幂等软删除 + 审计日志 + 脱敏处理
 * 
 * 设计原则：
 * 1. 所有删除操作必须通过本服务，禁止直接 db.delete()
 * 2. 每次软删除自动记录审计日志
 * 3. 幂等设计：已软删除的记录不会重复操作
 * 4. 事务保证：软删除与审计日志在同一事务内
 */

import { db, schema } from '@/db';
import { characters, memories, messages, userCharacterSettings, apiConfigs } from '@/db/schema';
import { auditLogs, AuditAction } from '@/db/schema/audit-logs';
import { eq, and, sql, desc, isNull } from 'drizzle-orm';
import { uuidv7 } from '@/db/helpers';

// ============================================================
// 类型定义
// ============================================================

/**
 * 软删除选项 - 用于审计日志追踪
 */
export interface SoftDeleteOptions {
  /** 操作者ID（未提供时默认'system'） */
  actorId?: string;
  /** 操作者IP地址 */
  actorIp?: string;
  /** 操作者User-Agent */
  actorUa?: string;
  /** 请求ID（用于链路追踪） */
  requestId?: string;
  /** HTTP请求方法 */
  requestMethod?: string;
  /** HTTP请求路径 */
  requestPath?: string;
  /** 删除原因（人工标注） */
  reason?: string;
}

/**
 * 软删除结果
 */
export interface SoftDeleteResult {
  /** 操作是否成功 */
  success: boolean;
  /** 被操作的记录ID */
  id?: string;
  /** 影响的记录数 */
  affectedCount: number;
  /** 记录已被软删除（幂等命中） */
  alreadyDeleted?: boolean;
  /** 错误信息 */
  error?: string;
}

// ============================================================
// AssetService 主类
// ============================================================

export class AssetService {

  // ----------------------------------------------------------
  // 私有方法：审计日志
  // ----------------------------------------------------------

  /**
   * 插入审计日志（事务内调用）
   * 
   * @param tx - 事务对象
   * @param params - 审计日志参数
   */
  private async insertAuditLog(
    tx: any,
    params: {
      action: (typeof AuditAction)[keyof typeof AuditAction];
      actorId: string;
      actorType?: string;
      actorIp?: string;
      actorUa?: string;
      targetType: string;
      targetId: string;
      targetName?: string;
      oldValue: Record<string, unknown> | null;
      newValue: Record<string, unknown> | null;
      metadata?: Record<string, unknown>;
      requestId?: string;
      requestMethod?: string;
      requestPath?: string;
    }
  ): Promise<void> {
    await tx.insert(auditLogs).values({
      id: uuidv7(),
      action: params.action,
      actorType: params.actorType ?? 'user',
      actorId: params.actorId,
      actorIp: params.actorIp ?? null,
      actorUa: params.actorUa ?? null,
      actionCategory: 'data',
      actionResult: 'success',
      targetType: params.targetType,
      targetId: params.targetId,
      targetName: params.targetName ?? null,
      oldValue: params.oldValue,
      newValue: params.newValue,
      metadata: params.metadata ?? {},
      requestId: params.requestId ?? null,
      requestMethod: params.requestMethod ?? null,
      requestPath: params.requestPath ?? null,
      createdAt: new Date(),
    });
  }

  // ----------------------------------------------------------
  // 私有方法：脱敏
  // ----------------------------------------------------------

  /**
   * 通用记录脱敏 - 移除敏感字段
   */
  private sanitizeRecord(record: Record<string, unknown>): Record<string, unknown> {
    const { apiKeyEncrypted, ...rest } = record;
    return rest;
  }

  /**
   * API配置记录脱敏 - 替换敏感字段为占位符
   */
  private sanitizeApiConfigRecord(record: Record<string, unknown>): Record<string, unknown> {
    const sanitized = { ...record };
    if ('apiKeyEncrypted' in sanitized) {
      sanitized.apiKeyEncrypted = '[REDACTED]';
    }
    return sanitized;
  }

  // ----------------------------------------------------------
  // 1. softDeleteCharacter
  // ----------------------------------------------------------

  /**
   * 软删除角色
   * 
   * 替代场景：暂无直接 db.delete(characters) 调用，
   * 但 chat route 已有软删除感知 (character.deletedAt → 404)，
   * 提供此方法以备角色管理API使用
   */
  async softDeleteCharacter(
    characterId: string,
    options: SoftDeleteOptions = {}
  ): Promise<SoftDeleteResult> {
    try {
      return await db.transaction(async (tx) => {
        // 查询记录
        const [record] = await tx
          .select()
          .from(characters)
          .where(eq(characters.id, characterId))
          .limit(1);

        if (!record) {
          return { success: false, id: characterId, affectedCount: 0, error: 'Character not found' };
        }

        // 幂等检查
        if (record.deletedAt) {
          return { success: true, id: characterId, affectedCount: 0, alreadyDeleted: true };
        }

        // 执行软删除
        await tx
          .update(characters)
          .set({ deletedAt: new Date() })
          .where(eq(characters.id, characterId));

        // 审计日志
        await this.insertAuditLog(tx, {
          action: AuditAction.CHARACTER_DELETE,
          actorId: options.actorId ?? 'system',
          actorIp: options.actorIp,
          actorUa: options.actorUa,
          targetType: 'character',
          targetId: characterId,
          oldValue: this.sanitizeRecord(record as unknown as Record<string, unknown>),
          newValue: null,
          metadata: { reason: options.reason },
          requestId: options.requestId,
          requestMethod: options.requestMethod,
          requestPath: options.requestPath,
        });

        return { success: true, id: characterId, affectedCount: 1 };
      });
    } catch (error) {
      return {
        success: false,
        id: characterId,
        affectedCount: 0,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  // ----------------------------------------------------------
  // 2. softDeleteMemory
  // ----------------------------------------------------------

  /**
   * 软删除单条记忆
   * 
   * 替代：memory.repository.ts:48 evictLowest 中的 db.delete(memories)
   */
  async softDeleteMemory(
    memoryId: string,
    options: SoftDeleteOptions = {}
  ): Promise<SoftDeleteResult> {
    try {
      return await db.transaction(async (tx) => {
        const [record] = await tx
          .select()
          .from(memories)
          .where(eq(memories.id, memoryId))
          .limit(1);

        if (!record) {
          return { success: false, id: memoryId, affectedCount: 0, error: 'Memory not found' };
        }

        if (record.deletedAt) {
          return { success: true, id: memoryId, affectedCount: 0, alreadyDeleted: true };
        }

        await tx
          .update(memories)
          .set({ deletedAt: new Date() })
          .where(eq(memories.id, memoryId));

        await this.insertAuditLog(tx, {
          action: AuditAction.MEMORY_DELETE,
          actorId: options.actorId ?? 'system',
          actorIp: options.actorIp,
          actorUa: options.actorUa,
          targetType: 'memory',
          targetId: memoryId,
          oldValue: this.sanitizeRecord(record as unknown as Record<string, unknown>),
          newValue: null,
          metadata: { reason: options.reason, source: 'evictLowest' },
          requestId: options.requestId,
          requestMethod: options.requestMethod,
          requestPath: options.requestPath,
        });

        return { success: true, id: memoryId, affectedCount: 1 };
      });
    } catch (error) {
      return {
        success: false,
        id: memoryId,
        affectedCount: 0,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  // ----------------------------------------------------------
  // 3. softDeleteMemoriesByCharacter
  // ----------------------------------------------------------

  /**
   * 软删除角色下所有记忆（批量）
   * 
   * 替代：memory.repository.ts:53 deleteByCharacter 中的 db.delete(memories)
   */
  async softDeleteMemoriesByCharacter(
    characterId: string,
    options: SoftDeleteOptions = {}
  ): Promise<SoftDeleteResult> {
    try {
      return await db.transaction(async (tx) => {
        // 查询未删除的记忆
        const records = await tx
          .select()
          .from(memories)
          .where(and(eq(memories.characterId, characterId), isNull(memories.deletedAt)));

        if (records.length === 0) {
          return { success: true, id: characterId, affectedCount: 0, alreadyDeleted: true };
        }

        // 批量软删除
        await tx
          .update(memories)
          .set({ deletedAt: new Date() })
          .where(and(eq(memories.characterId, characterId), isNull(memories.deletedAt)));

        // 审计日志（批量）
        const sampleIds = records.slice(0, 10).map((r) => r.id);
        await this.insertAuditLog(tx, {
          action: AuditAction.MEMORY_DELETE,
          actorId: options.actorId ?? 'system',
          actorIp: options.actorIp,
          actorUa: options.actorUa,
          targetType: 'memory',
          targetId: characterId,
          oldValue: { count: records.length, sampleIds },
          newValue: null,
          metadata: {
            batch: true,
            affectedCount: records.length,
            reason: options.reason,
            source: 'deleteByCharacter',
          },
          requestId: options.requestId,
          requestMethod: options.requestMethod,
          requestPath: options.requestPath,
        });

        return { success: true, id: characterId, affectedCount: records.length };
      });
    } catch (error) {
      return {
        success: false,
        id: characterId,
        affectedCount: 0,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  // ----------------------------------------------------------
  // 4. softDeleteMessage
  // ----------------------------------------------------------

  /**
   * 软删除单条消息
   * 
   * 替代：message.repository.ts:21 deleteMessage 中的 db.delete(messages)
   */
  async softDeleteMessage(
    messageId: string,
    options: SoftDeleteOptions = {}
  ): Promise<SoftDeleteResult> {
    try {
      return await db.transaction(async (tx) => {
        const [record] = await tx
          .select()
          .from(messages)
          .where(eq(messages.id, messageId))
          .limit(1);

        if (!record) {
          return { success: false, id: messageId, affectedCount: 0, error: 'Message not found' };
        }

        if (record.deletedAt) {
          return { success: true, id: messageId, affectedCount: 0, alreadyDeleted: true };
        }

        await tx
          .update(messages)
          .set({ deletedAt: new Date() })
          .where(eq(messages.id, messageId));

        await this.insertAuditLog(tx, {
          action: AuditAction.MESSAGE_DELETE,
          actorId: options.actorId ?? 'system',
          actorIp: options.actorIp,
          actorUa: options.actorUa,
          targetType: 'message',
          targetId: messageId,
          oldValue: this.sanitizeRecord(record as unknown as Record<string, unknown>),
          newValue: null,
          metadata: { reason: options.reason, source: 'deleteMessage' },
          requestId: options.requestId,
          requestMethod: options.requestMethod,
          requestPath: options.requestPath,
        });

        return { success: true, id: messageId, affectedCount: 1 };
      });
    } catch (error) {
      return {
        success: false,
        id: messageId,
        affectedCount: 0,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  // ----------------------------------------------------------
  // 5. softDeleteMessagesByCharacter
  // ----------------------------------------------------------

  /**
   * 软删除角色下所有消息（批量）
   * 
   * 替代：
   * - chat/[characterId]/route.ts:96 DELETE 中的 db.delete(messages)
   * - message.repository.ts:33 deleteAllByCharacter 中的 db.delete(messages)
   */
  async softDeleteMessagesByCharacter(
    characterId: string,
    userId: string,
    options: SoftDeleteOptions = {}
  ): Promise<SoftDeleteResult> {
    try {
      return await db.transaction(async (tx) => {
        const records = await tx
          .select()
          .from(messages)
          .where(
            and(
              eq(messages.characterId, characterId),
              eq(messages.userId, userId),
              isNull(messages.deletedAt)
            )
          );

        if (records.length === 0) {
          return { success: true, id: characterId, affectedCount: 0, alreadyDeleted: true };
        }

        await tx
          .update(messages)
          .set({ deletedAt: new Date() })
          .where(
            and(
              eq(messages.characterId, characterId),
              eq(messages.userId, userId),
              isNull(messages.deletedAt)
            )
          );

        const sampleIds = records.slice(0, 10).map((r) => r.id);
        await this.insertAuditLog(tx, {
          action: AuditAction.MESSAGE_DELETE,
          actorId: options.actorId ?? 'system',
          actorIp: options.actorIp,
          actorUa: options.actorUa,
          targetType: 'message',
          targetId: characterId,
          oldValue: { count: records.length, sampleIds },
          newValue: null,
          metadata: {
            batch: true,
            affectedCount: records.length,
            userId,
            reason: options.reason,
            source: 'deleteAllByCharacter',
          },
          requestId: options.requestId,
          requestMethod: options.requestMethod,
          requestPath: options.requestPath,
        });

        return { success: true, id: characterId, affectedCount: records.length };
      });
    } catch (error) {
      return {
        success: false,
        id: characterId,
        affectedCount: 0,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  // ----------------------------------------------------------
  // 6. softDeleteLastAssistantMessage
  // ----------------------------------------------------------

  /**
   * 软删除最后一条助手消息
   * 
   * 替代：message.repository.ts:38 deleteLastAssistant 中的 db.delete(messages)
   */
  async softDeleteLastAssistantMessage(
    characterId: string,
    userId: string,
    options: SoftDeleteOptions = {}
  ): Promise<SoftDeleteResult> {
    try {
      return await db.transaction(async (tx) => {
        // 查找最后一条ASSISTANT消息（未删除的）
        const [record] = await tx
          .select()
          .from(messages)
          .where(
            and(
              eq(messages.characterId, characterId),
              eq(messages.userId, userId),
              eq(messages.role, 'ASSISTANT'),
              isNull(messages.deletedAt)
            )
          )
          .orderBy(desc(messages.createdAt))
          .limit(1);

        if (!record) {
          return { success: false, id: undefined, affectedCount: 0, error: 'No assistant message found' };
        }

        await tx
          .update(messages)
          .set({ deletedAt: new Date() })
          .where(eq(messages.id, record.id));

        await this.insertAuditLog(tx, {
          action: AuditAction.MESSAGE_DELETE,
          actorId: options.actorId ?? 'system',
          actorIp: options.actorIp,
          actorUa: options.actorUa,
          targetType: 'message',
          targetId: record.id,
          oldValue: this.sanitizeRecord(record as unknown as Record<string, unknown>),
          newValue: null,
          metadata: { reason: options.reason, source: 'deleteLastAssistant' },
          requestId: options.requestId,
          requestMethod: options.requestMethod,
          requestPath: options.requestPath,
        });

        return { success: true, id: record.id, affectedCount: 1 };
      });
    } catch (error) {
      return {
        success: false,
        id: undefined,
        affectedCount: 0,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  // ----------------------------------------------------------
  // 7. softDeleteUserCharacterSetting
  // ----------------------------------------------------------

  /**
   * 软删除用户角色设置
   * 
   * 替代：settings/route.ts:116 DELETE 中的 db.delete(userCharacterSettings)
   */
  async softDeleteUserCharacterSetting(
    userId: string,
    characterId: string,
    options: SoftDeleteOptions = {}
  ): Promise<SoftDeleteResult> {
    try {
      return await db.transaction(async (tx) => {
        const [record] = await tx
          .select()
          .from(userCharacterSettings)
          .where(
            and(
              eq(userCharacterSettings.userId, userId),
              eq(userCharacterSettings.characterId, characterId)
            )
          )
          .limit(1);

        if (!record) {
          return {
            success: false,
            id: `${userId}:${characterId}`,
            affectedCount: 0,
            error: 'UserCharacterSetting not found',
          };
        }

        if (record.deletedAt) {
          return { success: true, id: record.id, affectedCount: 0, alreadyDeleted: true };
        }

        await tx
          .update(userCharacterSettings)
          .set({ deletedAt: new Date() })
          .where(eq(userCharacterSettings.id, record.id));

        await this.insertAuditLog(tx, {
          action: AuditAction.USER_SETTINGS_DELETE,
          actorId: options.actorId ?? 'system',
          actorIp: options.actorIp,
          actorUa: options.actorUa,
          targetType: 'user_character_setting',
          targetId: record.id,
          oldValue: this.sanitizeRecord(record as unknown as Record<string, unknown>),
          newValue: null,
          metadata: { reason: options.reason, userId, characterId },
          requestId: options.requestId,
          requestMethod: options.requestMethod,
          requestPath: options.requestPath,
        });

        return { success: true, id: record.id, affectedCount: 1 };
      });
    } catch (error) {
      return {
        success: false,
        id: `${userId}:${characterId}`,
        affectedCount: 0,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  // ----------------------------------------------------------
  // 8. softDeleteApiConfig
  // ----------------------------------------------------------

  /**
   * 软删除API配置
   * 
   * 替代：
   * - api-config.repository.ts:96 delete(id) 中的 db.delete(apiConfigs)
   * - api-config.service.ts:59 调用 apiConfigRepository.delete(id)
   */
  async softDeleteApiConfig(
    configId: string,
    options: SoftDeleteOptions = {}
  ): Promise<SoftDeleteResult> {
    try {
      return await db.transaction(async (tx) => {
        const [record] = await tx
          .select()
          .from(apiConfigs)
          .where(eq(apiConfigs.id, configId))
          .limit(1);

        if (!record) {
          return { success: false, id: configId, affectedCount: 0, error: 'ApiConfig not found' };
        }

        if (record.deletedAt) {
          return { success: true, id: configId, affectedCount: 0, alreadyDeleted: true };
        }

        await tx
          .update(apiConfigs)
          .set({ deletedAt: new Date() })
          .where(eq(apiConfigs.id, configId));

        await this.insertAuditLog(tx, {
          action: AuditAction.API_CONFIG_DELETE,
          actorId: options.actorId ?? 'system',
          actorIp: options.actorIp,
          actorUa: options.actorUa,
          targetType: 'api_config',
          targetId: configId,
          oldValue: this.sanitizeApiConfigRecord(record as unknown as Record<string, unknown>),
          newValue: null,
          metadata: { reason: options.reason },
          requestId: options.requestId,
          requestMethod: options.requestMethod,
          requestPath: options.requestPath,
        });

        return { success: true, id: configId, affectedCount: 1 };
      });
    } catch (error) {
      return {
        success: false,
        id: configId,
        affectedCount: 0,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}

// ============================================================
// 单例导出
// ============================================================

export const assetService = new AssetService();
