/**
 * DELETE /api/plaza/comments/[commentId] — 删除角色评论
 *
 * 权限控制：
 * - 管理员：可删除任意评论
 * - 角色创作者：可删除自己角色的任意评论（绝对评论修剪权）
 * - 评论作者：可删除自己的评论
 * - 其他用户：无权删除
 */

import { jsonOk, jsonErr } from "../../../_base/response";
import { requireAuth } from "../../../_base/auth";
import { commentRepository } from "@/server/repositories/comment.repository";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ commentId: string }> },
) {
  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;

  const { commentId } = await params;

  if (!UUID_RE.test(commentId)) {
    return jsonErr("评论 ID 格式无效", 400);
  }

  // 获取评论信息
  const comment = await commentRepository.findById(commentId);
  if (!comment || comment.deletedAt) {
    return jsonErr("评论不存在", 404);
  }

  // 权限校验链
  const isAdmin = auth.role === "ADMIN";
  const isCommentAuthor = comment.userId === auth.userId;

  // 获取角色创作者ID，校验创作者权限
  let isCharacterOwner = false;
  if (!isAdmin) {
    const characterOwnerId = await commentRepository.getCharacterOwnerId(commentId);
    isCharacterOwner = characterOwnerId === auth.userId;
  }

  // 权限判定：管理员 || 角色创作者 || 评论作者
  if (!isAdmin && !isCharacterOwner && !isCommentAuthor) {
    return jsonErr("无权删除该评论", 403);
  }

  const deleted = await commentRepository.softDelete(commentId);
  if (!deleted) {
    return jsonErr("删除失败", 500);
  }

  return jsonOk({ id: commentId, deleted: true });
}
