/**
 * PATCH /api/chat/[characterId]/memories/[memoryId] — 更新单条记忆
 * DELETE /api/chat/[characterId]/memories/[memoryId] — 软删除单条记忆
 */

import { jsonOk, jsonErr } from "../../../../_base/response";
import { requireAuth } from "../../../../_base/auth";
import { memoryRepository } from "@/server/repositories/memory.repository";
import { characterRepository } from "@/server/repositories/character.repository";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ characterId: string; memoryId: string }> },
) {
  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;

  const { characterId, memoryId } = await params;

  if (!UUID_RE.test(memoryId)) {
    return jsonErr("记忆 ID 格式无效", 400);
  }

  const character = await characterRepository.findById(characterId);
  if (!character || character.deletedAt) {
    return jsonErr("角色不存在", 404);
  }
  if (!character.isOfficial && character.userId !== auth.userId) {
    return jsonErr("无权访问", 403);
  }

  let body: { content?: string };
  try {
    body = await req.json();
  } catch {
    return jsonErr("请求体解析失败", 400);
  }

  const content = body?.content?.trim();
  if (!content || content.length === 0) {
    return jsonErr("记忆内容不能为空", 400);
  }
  if (content.length > 2000) {
    return jsonErr("记忆内容过长，最多 2000 字", 400);
  }

  const updated = await memoryRepository.updateMemory(memoryId, auth.userId, content);
  if (!updated) {
    return jsonErr("记忆不存在或无权修改", 404);
  }

  return jsonOk({
    id: updated.id,
    content: updated.content,
    category: updated.category,
    importance: Number(updated.importance ?? 0),
    createdAt: updated.createdAt,
  });
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ characterId: string; memoryId: string }> },
) {
  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;

  const { characterId, memoryId } = await params;

  if (!UUID_RE.test(memoryId)) {
    return jsonErr("记忆 ID 格式无效", 400);
  }

  const character = await characterRepository.findById(characterId);
  if (!character || character.deletedAt) {
    return jsonErr("角色不存在", 404);
  }
  if (!character.isOfficial && character.userId !== auth.userId) {
    return jsonErr("无权访问", 403);
  }

  const deleted = await memoryRepository.deleteMemoryById(memoryId, auth.userId);
  if (!deleted) {
    return jsonErr("记忆不存在或无权删除", 404);
  }

  return jsonOk({ id: memoryId, deleted: true });
}
