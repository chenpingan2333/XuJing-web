import { db } from "@/db";
import { characters } from "@/db/schema/characters";
import { eq, and, isNull, sql } from "drizzle-orm";

export class CharacterRepository {
  async findById(id: string) {
    return db.query.characters.findFirst({ where: eq(characters.id, id) });
  }

  async findOfficial() {
    return db.query.characters.findMany({
      where: and(eq(characters.isOfficial, true), isNull(characters.userId)),
    });
  }

  async findUserCharacters(userId: string) {
    return db.query.characters.findMany({
      where: and(
        eq(characters.userId, userId),
        isNull(characters.deletedAt)
      ),
    });
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