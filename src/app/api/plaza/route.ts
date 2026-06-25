/**
 * GET /api/plaza — 广场数据聚合路由
 *
 * 支持两种模式：
 * - ?tab=characters：公开角色列表（关注者优先置顶）
 * - ?tab=creators：按创作者分组聚合
 *
 * 图片压缩路径后缀：
 * - 头像：?w=200&h=200&fit=cover
 * - 大图：?w=800&h=400&fit=cover
 */

import { jsonOk, jsonErr } from "../_base/response";
import { requireAuth } from "../_base/auth";
import { plazaRepository } from "@/server/repositories/plaza.repository";
import { db } from "@/db";
import { sql } from "drizzle-orm";

/** 图片压缩后缀配置（已废弃，原样返回） */
const IMAGE_SUFFIX = {
  avatar: "",
  background: "",
};

/** 为图片URL添加压缩后缀（已去参数化，原样返回） */
function withImageSuffix(url: string | null, type: "avatar" | "background"): string | null {
  if (!url) return null;
  // 彻底去参数化：原样返回，不追加任何后缀
  return url;
}

/** 防御性建表：确保 character_comments 和 user_follows 物理表存在 */
async function ensurePlazaTables() {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS character_comments (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      character_id UUID NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      content TEXT NOT NULL,
      likes INTEGER NOT NULL DEFAULT 0,
      deleted_at TIMESTAMP,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS user_follows (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      follower_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      following_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      character_id UUID REFERENCES characters(id) ON DELETE SET NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);
}

export async function GET(req: Request) {
  // 防御性建表：确保依赖的物理表存在
  try { await ensurePlazaTables(); } catch (e) { console.error("[plaza] ensurePlazaTables failed:", e); }

  const auth = await requireAuth(req);
  const userId = auth instanceof Response ? null : auth.userId;

  const { searchParams } = new URL(req.url);
  const tab = searchParams.get("tab") ?? "characters";
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
  const pageSize = Math.min(50, Math.max(1, parseInt(searchParams.get("pageSize") ?? "20", 10)));

  if (tab === "characters") {
    // 获取用户关注的创作者ID列表（用于置顶排序）
    let followingIds: string[] = [];
    if (userId) {
      followingIds = await plazaRepository.getFollowingIds(userId);
    }

    const { items, total } = await plazaRepository.findPublicCharacters(
      userId,
      page,
      pageSize,
      followingIds
    );

    // 处理图片压缩路径 + creator 非空防御
    const processedItems = items.map((item) => ({
      ...item,
      avatarUrl: withImageSuffix(item.avatarUrl, "avatar"),
      backgroundUrl: withImageSuffix(item.backgroundUrl, "background"),
      creator: item.creator
        ? { ...item.creator, avatarUrl: withImageSuffix(item.creator.avatarUrl, "avatar") }
        : { id: "", nickname: "未知创作者", avatarUrl: null },
    }));

    return jsonOk({
      items: processedItems,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    });
  }

  if (tab === "creators") {
    const { items, total } = await plazaRepository.findCreatorsWithCharacters(page, pageSize);

    // 处理图片压缩路径 + creator 非空防御
    const processedItems = items.map((group) => ({
      creator: group.creator
        ? { ...group.creator, avatarUrl: withImageSuffix(group.creator.avatarUrl, "avatar") }
        : { id: "", nickname: "未知创作者", avatarUrl: null },
      characters: group.characters.map((char) => ({
        ...char,
        avatarUrl: withImageSuffix(char.avatarUrl, "avatar"),
        backgroundUrl: withImageSuffix(char.backgroundUrl, "background"),
        creator: char.creator
          ? { ...char.creator, avatarUrl: withImageSuffix(char.creator.avatarUrl, "avatar") }
          : { id: "", nickname: "未知创作者", avatarUrl: null },
      })),
    }));

    return jsonOk({
      items: processedItems,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    });
  }

  return jsonErr("无效的 tab 参数，支持 characters 或 creators", 400);
}

/**
 * POST /api/plaza — 关注/点赞等写操作兜底
 * 当前仅做静默兜底，后续可扩展为实际业务逻辑
 */
export async function POST(req: Request) {
  // 防御性建表
  try { await ensurePlazaTables(); } catch (e) { console.error("[plaza] ensurePlazaTables failed:", e); }
  return jsonOk({ success: true });
}
