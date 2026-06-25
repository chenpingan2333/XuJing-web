/**
 * POST /api/plaza/comments — 创建角色评论
 * GET /api/plaza/comments — 获取角色评论列表
 */

import { jsonOk, jsonErr } from "../../_base/response";
import { requireAuth } from "../../_base/auth";
import { commentRepository } from "@/server/repositories/comment.repository";
import { characterRepository } from "@/server/repositories/character.repository";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** POST — 创建评论 */
export async function POST(req: Request) {
  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;

  let body: { characterId?: string; content?: string };
  try {
    body = await req.json();
  } catch {
    return jsonErr("请求体解析失败", 400);
  }

  const { characterId, content } = body;

  if (!characterId || !UUID_RE.test(characterId)) {
    return jsonErr("角色 ID 格式无效", 400);
  }

  const trimmedContent = content?.trim();
  if (!trimmedContent || trimmedContent.length === 0) {
    return jsonErr("评论内容不能为空", 400);
  }
  if (trimmedContent.length > 1000) {
    return jsonErr("评论内容过长，最多 1000 字", 400);
  }

  // 校验角色存在且已公开
  const character = await characterRepository.findById(characterId);
  if (!character || character.deletedAt) {
    return jsonErr("角色不存在", 404);
  }
  if (!character.isPublic) {
    return jsonErr("该角色未公开，无法评论", 403);
  }

  const comment = await commentRepository.create({
    characterId,
    userId: auth.userId,
    content: trimmedContent,
  });

  return jsonOk({
    id: comment.id,
    content: comment.content,
    likes: comment.likes,
    createdAt: comment.createdAt,
  }, 201);
}

/** GET — 获取角色评论列表 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const characterId = searchParams.get("characterId");
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
  const pageSize = Math.min(50, Math.max(1, parseInt(searchParams.get("pageSize") ?? "20", 10)));

  if (!characterId || !UUID_RE.test(characterId)) {
    return jsonErr("角色 ID 格式无效", 400);
  }

  // 校验角色存在且已公开
  const character = await characterRepository.findById(characterId);
  if (!character || character.deletedAt) {
    return jsonErr("角色不存在", 404);
  }
  if (!character.isPublic) {
    return jsonErr("该角色未公开", 403);
  }

  const [items, total] = await Promise.all([
    commentRepository.findByCharacter(characterId, page, pageSize),
    commentRepository.countByCharacter(characterId),
  ]);

  return jsonOk({
    items,
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    },
  });
}
