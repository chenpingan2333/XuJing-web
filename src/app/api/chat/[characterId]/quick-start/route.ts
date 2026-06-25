/**
 * POST /api/chat/[characterId]/quick-start — 广场一键开聊联动接口
 *
 * 职责：自动点赞（fakeLikes + fakeChats 原子累加）+ 自动建立聊天房间关联。
 * 触发场景：用户从角色广场点击「开始聊天」时调用。
 */

import { requireAuth } from "../../../_base/auth";
import { jsonOk, jsonErr } from "../../../_base/response";
import { characterRepository } from "@/server/repositories/character.repository";
import { db } from "@/db";
import { conversations } from "@/db/schema/conversations";
import { characters } from "@/db/schema/characters";
import { eq, and, isNull, sql } from "drizzle-orm";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(
  req: Request,
  { params }: { params: Promise<{ characterId: string }
> },
) {
  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;

  const { characterId } = await params;

  // UUID 格式校验
  if (!UUID_RE.test(characterId)) {
    return jsonErr("Invalid characterId format", 400);
  }

  // 校验角色存在且未删除
  const character = await characterRepository.findById(characterId);
  if (!character || character.deletedAt) {
    return jsonErr("角色不存在", 404);
  }

  // 非官方角色需校验可见性（公开或本人创建）
  if (!character.isOfficial && !character.isPublic && character.userId !== auth.userId) {
    return jsonErr("无权访问此角色", 403);
  }

  // ─── 1. 原子化自动点赞与热度累加 ───
  await characterRepository.update(characterId, {
    fakeLikes: sql`${characters.fakeLikes} + 1`,
    fakeChats: sql`${characters.fakeChats} + 1`,
  } as unknown as Parameters<typeof characterRepository.update>[1]);

  // ─── 2. 聊天房间自动同步（确保显示在最近聊天列表） ───
  const existing = await db
    .select({ id: conversations.id })
    .from(conversations)
    .where(
      and(
        eq(conversations.userId, auth.userId),
        eq(conversations.characterId, characterId),
        isNull(conversations.deletedAt)
      )
    )
    .limit(1);

  if (existing.length === 0) {
    await db.insert(conversations).values({
      userId: auth.userId,
      characterId,
    });
  } else {
    // 已存在则刷新 updatedAt，确保排在最近列表前面
    await db
      .update(conversations)
      .set({ updatedAt: new Date() })
      .where(eq(conversations.id, existing[0].id));
  }

  return jsonOk({ success: true, liked: true, roomCreated: existing.length === 0 });
}
