import { db } from "@/db";
import { messages } from "@/db/schema/messages";
import { eq, and, desc } from "drizzle-orm";

export class MessageRepository {
  async findById(id: string) {
    return db.query.messages.findFirst({ where: eq(messages.id, id) });
  }

  async findHistory(characterId: string, userId: string, limit = 50) {
    return db.query.messages.findMany({
      where: and(
        eq(messages.characterId, characterId),
        eq(messages.userId, userId),
      ),
      orderBy: desc(messages.createdAt),
      limit,
    });
  }

  async create(data: typeof messages.$inferInsert) {
    const [result] = await db.insert(messages).values(data).returning();
    return result;
  }

  async deleteMessage(id: string) {
    await db.delete(messages).where(eq(messages.id, id));
  }

  /** 重生成：删除该角色最近的 ASSISTANT 消息 */
  async deleteLastAssistant(characterId: string, userId: string) {
    const last = await db.query.messages.findFirst({
      where: and(
        eq(messages.characterId, characterId),
        eq(messages.userId, userId),
        eq(messages.role, "ASSISTANT")
      ),
      orderBy: desc(messages.createdAt),
    });
    if (last) {
      await db.delete(messages).where(eq(messages.id, last.id));
    }
    return last ?? null;
  }
}

export const messageRepository = new MessageRepository();