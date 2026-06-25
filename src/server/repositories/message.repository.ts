import { db } from "@/db";
import { messages } from "@/db/schema/messages";
import { eq, and, desc } from "drizzle-orm";
import { assetService } from "@/services/AssetService";
import type { SoftDeleteOptions } from "@/services/AssetService";

export class MessageRepository {
  async findById(id: string) {
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!UUID_RE.test(id)) return null;
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

  async deleteMessage(id: string, options: SoftDeleteOptions = {}) {
    const result = await assetService.softDeleteMessage(id, options);
    if (!result.success) {
      throw new Error(`Failed to soft delete message ${id}: ${result.error ?? 'unknown error'}`);
    }
    return result;
  }

  /** 更新消息内容 */
  async updateContent(id: string, content: string) {
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!UUID_RE.test(id)) return null;
    const [result] = await db.update(messages).set({ content }).where(eq(messages.id, id)).returning();
    return result ?? null;
  }

  /** 重生成：删除该角色最近的 ASSISTANT 消息 */
  
  async deleteAllByCharacter(characterId: string, userId: string, options: SoftDeleteOptions = {}) {
    const result = await assetService.softDeleteMessagesByCharacter(characterId, userId, options);
    if (!result.success) {
      throw new Error(`Failed to soft delete messages for character ${characterId}: ${result.error ?? 'unknown error'}`);
    }
    return result;
  }
async deleteLastAssistant(characterId: string, userId: string, options: SoftDeleteOptions = {}) {
    const [last] = await db.select().from(messages).where(and(eq(messages.characterId, characterId), eq(messages.userId, userId), eq(messages.role, "ASSISTANT"))).orderBy(desc(messages.createdAt)).limit(1);
    if (last) {
      const result = await assetService.softDeleteLastAssistantMessage(characterId, userId, options);
      if (!result.success) {
        throw new Error(`Failed to soft delete last assistant message for character ${characterId}: ${result.error ?? 'unknown error'}`);
      }
    }
    return last ?? null;
  }
}

export const messageRepository = new MessageRepository();