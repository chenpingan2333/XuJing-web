import { db } from "@/db";
import { memories } from "@/db/schema/memories";
import { eq, and, desc } from "drizzle-orm";

export class MemoryRepository {
  async findById(id: string) {
    return db.query.memories.findFirst({ where: eq(memories.id, id) });
  }

  async findByCharacter(characterId: string, userId: string, limit = 20) {
    return db.query.memories.findMany({
      where: and(
        eq(memories.characterId, characterId),
        eq(memories.userId, userId)
      ),
      orderBy: desc(memories.importance),
      limit,
    });
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
    const [result] = await db.insert(memories).values(data).returning();
    return result;
  }

  /** 淘汰最低权重记忆 */
  async evictLowest(characterId: string, userId: string, keepCount: number) {
    const toEvict = await db.query.memories.findMany({
      where: and(
        eq(memories.characterId, characterId),
        eq(memories.userId, userId)
      ),
      orderBy: memories.importance,
      limit: 1,
      offset: keepCount - 1,
    });
    if (toEvict.length > 0) {
      await db.delete(memories).where(eq(memories.id, toEvict[0].id));
    }
  }

  async deleteByCharacter(characterId: string) {
    await db.delete(memories).where(eq(memories.characterId, characterId));
  }
}

// Helper
import { sql } from "drizzle-orm";

export const memoryRepository = new MemoryRepository();