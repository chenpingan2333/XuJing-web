import { db } from "@/db";
import { characters } from "@/db/schema/characters";
import { eq, and, isNull, sql } from "drizzle-orm";

export class CharacterRepository {
  async findById(id: string) {
    const [r] = await db.select().from(characters).where(eq(characters.id, id)).limit(1);
    return r ?? null;
  }

  /**
   * 查询全局官方角色（userId IS NULL）。
   * 所有用户共享同一份官方角色，不再为每个用户复制。
   */
  async findGlobalOfficial() {
    return db.select().from(characters).where(
      and(eq(characters.isOfficial, true), isNull(characters.userId), isNull(characters.deletedAt))
    );
  }

  /** @deprecated 保留向后兼容——返回特定用户的官方角色副本 */
  async findOfficial(userId?: string) {
    const conditions = [eq(characters.isOfficial, true)];
    if (userId) {
      conditions.push(eq(characters.userId, userId));
    } else {
      conditions.push(isNull(characters.userId));
    }
    return db.select().from(characters).where(and(...conditions));
  }

  async findUserCharacters(userId: string) {
    return db.select().from(characters).where(and(eq(characters.userId, userId), isNull(characters.deletedAt), eq(characters.isOfficial, false)));
  }

  async countUserCharacters(userId: string) {
    const result = await db
      .select({ count: sql<number>`count(*)` })
      .from(characters)
      .where(
        and(
          eq(characters.userId, userId),
          isNull(characters.deletedAt),
          eq(characters.isOfficial, false)
        )
      );
    return Number(result[0]?.count ?? 0);
  }

  async create(data: typeof characters.$inferInsert) {
    const [result] = await db.insert(characters).values(data).returning();
    return result;
  }

  async update(id: string, data: Partial<typeof characters.$inferInsert>) {
    const [result] = await db
      .update(characters)
      .set(data)
      .where(eq(characters.id, id))
      .returning();
    return result;
  }

  async softDelete(id: string) {
    return this.update(id, {
      deletedAt: new Date(),
    } as Partial<typeof characters.$inferInsert>);
  }

  async duplicate(id: string, userId: string) {
    const original = await this.findById(id);
    if (!original) return null;
    const { id: _id, userId: _uid, deletedAt: _del, createdAt: _cat, updatedAt: _uat, ...rest } = original;
    return this.create({ ...rest, userId, version: original.version ?? 1 });
  }
}

export const characterRepository = new CharacterRepository();