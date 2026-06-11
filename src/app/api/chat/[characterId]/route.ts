/**
 * GET /api/chat/[characterId] — Chat History
 *
 * 返回当前用户与指定角色的扁平历史消息（最新在前）。
 * 同时返回角色记忆状态，供前端实时显示。
 *
 * Query params:
 *   ?limit=50    — 每页条数（默认 50，最大 100）
 *   ?before=msgId — 游标分页（可选）
 */

import { jsonOk, jsonErr } from "../../_base/response";
import { requireAuth } from "../../_base/auth";
import { messageRepository } from "@/server/repositories/message.repository";
import { characterRepository } from "@/server/repositories/character.repository";
import { memoryRepository } from "@/server/repositories/memory.repository";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ characterId: string }> },
) {
  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;

  const { characterId } = await params;

  // Verify character exists and is accessible
  const character = await characterRepository.findById(characterId);
  if (!character || character.deletedAt) {
    return jsonErr("角色不存在", 404);
  }

  // Ownership check: non-official characters are private
  if (!character.isOfficial && character.userId !== auth.userId) {
    return jsonErr("无权访问此角色的对话", 403);
  }

  // Parse pagination
  const url = new URL(req.url);
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "50", 10) || 50, 100);

  const messages = await messageRepository.findHistory(
    characterId,
    auth.userId,
    limit,
  );

  // Create greeting message if no history exists and character has greeting
  if (messages.length === 0 && character.greeting) {
    const { messageRepository } = await import("@/server/repositories/message.repository");
    const greetingText = character.greeting.split('<START>')[0].trim();
    
    if (greetingText) {
      const greetingMessage = await messageRepository.create({
        characterId,
        userId: auth.userId,
        role: 'ASSISTANT',
        content: greetingText,
      });
      
      messages.push(greetingMessage);
    }
  }

  // Memory status for frontend display
  const memCount = await memoryRepository.countByCharacter(characterId, auth.userId);
  const isVip = auth.subscription === "vip";
  const memoryLimit = isVip ? 10000 : 100;

  return jsonOk({
    messages: messages.reverse(), // chronological order (oldest first)
    memory: { used: memCount, limit: memoryLimit },
  });
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ characterId: string }> },
) {
  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;

  const { characterId } = await params;

  const character = await characterRepository.findById(characterId);
  if (!character || character.deletedAt) {
    return jsonErr("角色不存在", 404);
  }
  if (!character.isOfficial && character.userId !== auth.userId) {
    return jsonErr("无权操作", 403);
  }

  const { db } = await import("@/db");
  const { messages } = await import("@/db/schema/messages");
  const { and, eq } = await import("drizzle-orm");
  await db.delete(messages).where(and(eq(messages.characterId, characterId), eq(messages.userId, auth.userId)));

  return jsonOk({ deleted: true });
}