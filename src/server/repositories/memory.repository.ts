import { db } from "@/db";
import { memories } from "@/db/schema/memories";
import { eq, and, desc, sql } from "drizzle-orm";
import { assetService } from "@/services/AssetService";
import { SYSTEM_ACTOR_ID } from "@/db/schema/audit-logs";

export class MemoryRepository {
  async findById(id: string) {
    const [r] = await db.select().from(memories).where(eq(memories.id, id)).limit(1);
    return r ?? null;
  }

  async findByCharacter(characterId: string, userId: string, limit = 20) {
    return db
      .select()
      .from(memories)
      .where(
        and(
          eq(memories.characterId, characterId),
          eq(memories.userId, userId),
          sql`${memories.deletedAt} IS NULL` // 🔴 核心：过滤掉已被软删除的重置记忆
        )
      )
      .orderBy(desc(memories.createdAt)) // 🔴 核心：变更为纯粹按时间顺序排序
      .limit(limit);
  }

  async countByCharacter(characterId: string, userId: string) {
    const result = await db
      .select({ count: sql<number>`count(*)` })
      .from(memories)
      .where(
        and(
          eq(memories.characterId, characterId),
          eq(memories.userId, userId)
        )
      );
    return Number(result[0]?.count ?? 0);
  }

  async create(data: typeof memories.$inferInsert) {
    console.log("[MEMORY] DB insert start", {
      characterId: data.characterId,
      userId: data.userId,
      content: data.content,
    });
    try {
      const [result] = await db.insert(memories).values(data).returning();
      console.log("[MEMORY] DB insert success", result?.id);
      return result;
    } catch (error) {
      console.error("[MEMORY] DB insert failed", error);
      throw error;
    }
  }

  /** 淘汰最低权重记忆（软删除） */
  async evictLowest(characterId: string, userId: string, keepCount: number) {
    const toEvict = await db.select().from(memories).where(and(eq(memories.characterId, characterId), eq(memories.userId, userId))).orderBy(memories.importance).limit(1).offset(keepCount - 1);
    if (toEvict.length > 0) {
      await assetService.softDeleteMemory(toEvict[0].id, { actorId: userId, reason: 'Evict lowest importance memory' });
    }
  }

  /** 🔴 新增：精准软删除"特定用户"与"特定角色"的对话记忆，防止误杀其他用户数据 */
  async deleteByUserAndCharacter(characterId: string, userId: string) {
    return db
      .update(memories)
      .set({ deletedAt: new Date() })
      .where(
        and(
          eq(memories.characterId, characterId),
          eq(memories.userId, userId),
          sql`${memories.deletedAt} IS NULL`
        )
      );
  }

  async deleteByCharacter(characterId: string, options: { actorId?: string; reason?: string } = {}) {
    const result = await assetService.softDeleteMemoriesByCharacter(characterId, {
      actorId: options.actorId ?? SYSTEM_ACTOR_ID,
      reason: options.reason ?? 'Delete memories by character',
    });
    if (!result.success) {
      throw new Error(result.error ?? 'Failed to soft delete memories by character');
    }
    return result;
  }

  /** 更新单条记忆内容 */
  async updateMemory(id: string, userId: string, content: string) {
    const [result] = await db
      .update(memories)
      .set({ content })
      .where(
        and(
          eq(memories.id, id),
          eq(memories.userId, userId),
          sql`${memories.deletedAt} IS NULL`
        )
      )
      .returning();
    return result ?? null;
  }

  /** 按 ID 软删除单条记忆（带用户隔离） */
  async deleteMemoryById(id: string, userId: string) {
    const [result] = await db
      .update(memories)
      .set({ deletedAt: new Date() })
      .where(
        and(
          eq(memories.id, id),
          eq(memories.userId, userId),
          sql`${memories.deletedAt} IS NULL`
        )
      )
      .returning();
    return result ?? null;
  }
}


export const memoryRepository = new MemoryRepository();