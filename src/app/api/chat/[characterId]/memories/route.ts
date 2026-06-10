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

  // Sort by importance desc
  const sorted = [...memories].sort((a, b) => Number(b.importance ?? 0) - Number(a.importance ?? 0));

  return jsonOk(sorted.map((m) => ({
    id: m.id,
    content: m.content,
    category: m.category,
    importance: Number(m.importance ?? 0),
    createdAt: m.createdAt,
  })));
}
