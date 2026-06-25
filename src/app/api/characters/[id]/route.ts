/**
 * GET    /api/characters/[id]       — 详情
 * PUT    /api/characters/[id]       — 更新
 * DELETE /api/characters/[id]       — 删除
 *
 * Phase 7.1 Hardened — Rate limit + requireAuth + CharacterError → jsonErr。
 */

import { jsonOk, jsonErr } from "../../_base/response";
import { requireAuth } from "../../_base/auth";
import { rateLimit } from "../../_base/rate-limit";
import { characterService, CharacterError } from "@/server/services/character.service";
import { UpdateCharacterSchema } from "../validations";
import { revalidatePath } from "next/cache";

// ——— GET: 详情 ———
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;
  const { id } = await params;

  const rl = await rateLimit(auth.userId, "characters:get", {
    free: { limit: 30, windowMs: 60_000 },
    vip: { limit: 60, windowMs: 60_000 },
  }, auth.subscription);
  if (rl) return rl;

  try {
    const character = await characterService.getCharacter(auth, id);
    return jsonOk(character);
  } catch (err) {
    if (err instanceof CharacterError) return jsonErr(err.message, err.status);
    return jsonErr("获取角色失败", 500);
  }
}

// ——— PUT: 更新 ———
export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;
  const { id } = await params;

  const rl = await rateLimit(auth.userId, "characters:update", {
    free: { limit: 10, windowMs: 60_000 },
    vip: { limit: 30, windowMs: 60_000 },
  }, auth.subscription);
  if (rl) return rl;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonErr("无效的 JSON 请求体", 400);
  }

  const parsed = UpdateCharacterSchema.safeParse(body);
  if (!parsed.success) {
    const first = parsed.error.errors[0];
    return jsonErr(first ? first.message : "参数验证失败", 400);
  }

  try {
    const updated = await characterService.updateCharacter(auth, id, parsed.data);
    revalidatePath("/plaza");
    revalidatePath("/api/plaza");
    return jsonOk(updated);
  } catch (err) {
    if (err instanceof CharacterError) return jsonErr(err.message, err.status);
    return jsonErr("更新角色失败", 500);
  }
}

// ——— DELETE: 删除 ———
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;
  const { id } = await params;

  const rl = await rateLimit(auth.userId, "characters:delete", {
    free: { limit: 5, windowMs: 60_000 },
    vip: { limit: 10, windowMs: 60_000 },
  }, auth.subscription);
  if (rl) return rl;

  try {
    const result = await characterService.deleteCharacter(auth, id);
    return jsonOk(result);
  } catch (err) {
    if (err instanceof CharacterError) return jsonErr(err.message, err.status);
    return jsonErr("删除角色失败", 500);
  }
}