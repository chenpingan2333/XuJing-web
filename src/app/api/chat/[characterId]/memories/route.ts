/**
 * GET /api/chat/[characterId]/memories — 角色记忆列表
 *
 * 返回当前用户与指定角色的所有记忆，按 importance 降序。
 */

import { jsonOk, jsonErr } from "../../../_base/response";
import { requireAuth } from "../../../_base/auth";
import { memoryRepository } from "@/server/repositories/memory.repository";
import { characterRepository } from "@/server/repositories/character.repository";

export async function GET(
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
    return jsonErr("无权访问", 403);
  }

  const memories = await memoryRepository.findByCharacter(characterId, auth.userId, 200);

  // 🔴 移除原有的 sorted 降序重排，直接透传 Repository 层的时间倒序数组
  return jsonOk(memories.map((m) => ({
    id: m.id,
    content: m.content,
    category: (body.category as any) || "FACT",
    importance: Number(m.importance ?? 0),
    createdAt: m.createdAt,
  })));
}

/**
 * POST /api/chat/[characterId]/memories — 记忆文档存盘接收
 *
 * 接收前端发送的记忆文档内容，存入数据库。
 */
export async function POST(
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
    return jsonErr("无权访问", 403);
  }

  let body: { content: string; category?: string; importance?: number };
  try {
    body = await req.json();
  } catch {
    return jsonErr("Invalid JSON body", 400);
  }

  if (!body.content) {
    return jsonErr("content is required", 400);
  }

  const memory = await memoryRepository.create({
    characterId,
    userId: auth.userId,
    content: body.content,
    category: (body.category as any) || "FACT",
    importance: body.importance || 0,
  });

  return jsonOk({
    id: memory.id,
    content: memory.content,
    category: (body.category as any) || "FACT",
    importance: Number(memory.importance ?? 0),
    createdAt: memory.createdAt,
  });
}
