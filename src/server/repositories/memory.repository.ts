import { db } from "@/db";
import { memories } from "@/db/schema/memories";
import { eq, and, desc, sql } from "drizzle-orm";
import { assetService } from "@/services/AssetService";

export class MemoryRepository {
  async findById(id: string) {
    const [r] = await db.select().from(memories).where(eq(memories.id, id)).limit(1);
    return r ?? null;
  }

  async findByCharacter(characterId: string, userId: string, limit = 20) {
    return db.select().from(memories).where(and(eq(memories.characterId, characterId), eq(memories.userId, userId))).orderBy(desc(memories.importance)).limit(limit);
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

  async deleteByCharacter(characterId: string, options: { actorId?: string; reason?: string } = {}) {
    const result = await assetService.softDeleteMemoriesByCharacter(characterId, {
      actorId: options.actorId ?? 'system',
      reason: options.reason ?? 'Delete memories by character',
    });
    if (!result.success) {
      throw new Error(result.error ?? 'Failed to soft delete memories by character');
    }
    return result;
  }
}


export const memoryRepository = new MemoryRepository();