/**
 * GET  /api/characters — 列表（官方 + 用户角色）
 * POST /api/characters — 创建角色
 *
 * Phase 7.1 Hardened — Rate limit + requireAuth + CharacterError → jsonErr。
 */

import { jsonOk, jsonErr } from "../_base/response";
import { requireAuth } from "../_base/auth";
import { rateLimit } from "../_base/rate-limit";
import { characterService, CharacterError } from "@/server/services/character.service";
import { CreateCharacterSchema } from "./validations";

// ——— GET: 列表 ———
export async function GET(req: Request) {
  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;

  const rl = await rateLimit(auth.userId, "characters:list", {
    free: { limit: 30, windowMs: 60_000 },
    vip: { limit: 60, windowMs: 60_000 },
  }, auth.subscription);
  if (rl) return rl;

  try {
    const result = await characterService.listCharacters(auth);
    return jsonOk(result);
  } catch (err) {
    if (err instanceof CharacterError) return jsonErr(err.message, err.status);
    return jsonErr("获取角色列表失败", 500);
  }
}

// ——— POST: 创建 ———
export async function POST(req: Request) {
  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;

  const rl = await rateLimit(auth.userId, "characters:create", {
    free: { limit: 5, windowMs: 60_000 },
    vip: { limit: 20, windowMs: 60_000 },
  }, auth.subscription);
  if (rl) return rl;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonErr("无效的 JSON 请求体", 400);
  }

  const parsed = CreateCharacterSchema.safeParse(body);
  if (!parsed.success) {
    const first = parsed.error.errors[0];
    return jsonErr(first ? first.message : "参数验证失败", 400);
  }

  try {
    const character = await characterService.createCharacter(auth, parsed.data);
    return jsonOk(character, 201);
  } catch (err) {
    if (err instanceof CharacterError) return jsonErr(err.message, err.status);
    return jsonErr("创建角色失败", 500);
  }
}