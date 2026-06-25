export const runtime = 'nodejs';

import { requireAuth } from "../../_base/auth";
import { jsonOk, jsonErr } from "../../_base/response";
import { messageRepository } from "@/server/repositories/message.repository";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ messageId: string }> },
) {
  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;

  const { messageId } = await params;

  // 防御性校验：拦截前端临时 ai-{timestamp} 非法 UUID
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!UUID_RE.test(messageId)) {
    return jsonErr("Invalid messageId format", 400);
  }

  let body: { content?: string };
  try {
    body = await req.json();
  } catch {
    return jsonErr("Invalid JSON body", 400);
  }

  const { content } = body;
  if (!content || typeof content !== "string" || content.trim() === "") {
    return jsonErr("content is required and must be a non-empty string", 400);
  }

  // 验证消息存在且属于当前用户
  const existing = await messageRepository.findById(messageId);
  if (!existing) {
    return jsonErr("Message not found", 404);
  }
  if (existing.userId !== auth.userId) {
    return jsonErr("Forbidden", 403);
  }

  const updated = await messageRepository.updateContent(messageId, content);
  if (!updated) {
    return jsonErr("Failed to update message", 500);
  }

  return jsonOk({ id: updated.id, content: updated.content });
}
