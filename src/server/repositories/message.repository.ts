import { db } from "@/db";
import { messages } from "@/db/schema/messages";
import { eq, and, desc } from "drizzle-orm";

export class MessageRepository {
  async findById(id: string) {
    const [r] = await db.select().from(messages).where(eq(messages.id, id)).limit(1);
    return r ?? null;
  }

  async findHistory(characterId: string, userId: string, limit = 50) {
    return db.select().from(messages).where(and(eq(messages.characterId, characterId), eq(messages.userId, userId))).orderBy(desc(messages.createdAt)).limit(limit);
  }

  async create(data: typeof messages.$inferInsert) {
    const [result] = await db.insert(messages).values(data).returning();
    return result;
  }

  async deleteMessage(id: string) {
    await db.delete(messages).where(eq(messages.id, id));
  }

  /** 重生成：删除该角色最近的 ASSISTANT 消息 */
  
  async deleteAllByCharacter(characterId: string, userId: string) {
    await db.delete(messages).where(and(eq(messages.characterId, characterId), eq(messages.userId, userId)));
  }
async deleteLastAssistant(characterId: string, userId: string) {
    const [last] = await db.select().from(messages).where(and(eq(messages.characterId, characterId), eq(messages.userId, userId), eq(messages.role, "ASSISTANT"))).orderBy(desc(messages.createdAt)).limit(1);
    if (last) {
      await db.delete(messages).where(eq(messages.id, last.id));
    }
    return last ?? null;
  }
}

export const messageRepository = new MessageRepository();