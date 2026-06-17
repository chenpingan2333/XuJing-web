/**
 * GET    /api/characters/[id]/settings — 获取角色聊天背景设置
 * PUT    /api/characters/[id]/settings — 保存角色聊天背景设置
 * DELETE /api/characters/[id]/settings — 删除角色聊天背景设置（恢复默认）
 *
 * 聊天背景 MVP — user_character_settings 表
 */
import { jsonOk, jsonErr } from "../../../_base/response";
import { requireAuth } from "../../../_base/auth";
import { db } from "@/db";
import { userCharacterSettings } from "@/db/schema";
import { eq, and, isNull } from "drizzle-orm";
import { assetService } from "@/services/AssetService";

// ——— GET: 获取设置 ———
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;

  const { id: characterId } = await params;

  try {
    const [row] = await db
      .select()
      .from(userCharacterSettings)
      .where(
        and(
          eq(userCharacterSettings.userId, auth.userId),
          eq(userCharacterSettings.characterId, characterId),
          isNull(userCharacterSettings.deletedAt),
        ),
      )
      .limit(1);

    return jsonOk({
      backgroundUrl: row?.backgroundUrl ?? null,
    });
  } catch {
    return jsonErr("获取设置失败", 500);
  }
}

// ——— PUT: 保存设置（upsert） ———
export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;

  const { id: characterId } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonErr("无效的 JSON 请求体", 400);
  }

  // 简单校验
  if (
    !body ||
    typeof body !== "object" ||
    !("backgroundUrl" in body) ||
    typeof (body as Record<string, unknown>).backgroundUrl !== "string"
  ) {
    return jsonErr("backgroundUrl 必须为字符串", 400);
  }

  const { backgroundUrl } = body as { backgroundUrl: string };

  // URL长度校验
  if (backgroundUrl.length > 500) {
    return jsonErr("backgroundUrl 长度不能超过500", 400);
  }

  try {
    const [upserted] = await db
      .insert(userCharacterSettings)
      .values({
        userId: auth.userId,
        characterId,
        backgroundUrl,
      })
      .onConflictDoUpdate({
        target: [userCharacterSettings.userId, userCharacterSettings.characterId],
        set: {
          backgroundUrl,
          updatedAt: new Date(),
          deletedAt: null,
        },
      })
      .returning();

    return jsonOk({
      backgroundUrl: upserted.backgroundUrl,
    });
  } catch {
    return jsonErr("保存设置失败", 500);
  }
}

// ——— DELETE: 删除设置（恢复默认） ———
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;

  const { id: characterId } = await params;

  try {
    const result = await assetService.softDeleteUserCharacterSetting(
      auth.userId,
      characterId,
      {
        actorId: auth.userId,
        actorIp: req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown",
        requestPath: `/api/characters/${characterId}/settings`,
        requestMethod: "DELETE",
      },
    );

    if (!result.success) {
      return jsonErr(result.error || "删除设置失败", 500);
    }

    return jsonOk({ backgroundUrl: null });
  } catch {
    return jsonErr("删除设置失败", 500);
  }
}
