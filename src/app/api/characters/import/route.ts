/**
 * POST /api/characters/import — 导入角色卡 JSON
 *
 * Phase 7.1 Hardened — 5MB 文件大小限制 + Zod 统一校验链。
 */

import { jsonOk, jsonErr } from "../../_base/response";
import { requireAuth } from "../../_base/auth";
import { rateLimit } from "../../_base/rate-limit";
import { characterService, CharacterError } from "@/server/services/character.service";

const IMPORT_MAX_BYTES = 5 * 1024 * 1024; // 5 MB

export async function POST(req: Request) {
  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;

  // Rate limit
  const rl = await rateLimit(auth.userId, "characters:import", {
    free: { limit: 3, windowMs: 60_000 },
    vip: { limit: 10, windowMs: 60_000 },
  }, auth.subscription);
  if (rl) return rl;

  // Read raw body for size check
  let rawText: string;
  try {
    rawText = await req.text();
  } catch {
    return jsonErr("无法读取请求体", 400);
  }

  // File size limit
  const byteLength = new TextEncoder().encode(rawText).length;
  if (byteLength > IMPORT_MAX_BYTES) {
    return jsonErr("导入文件过大（最大 5 MB）", 413);
  }

  let body: unknown;
  try {
    body = JSON.parse(rawText);
  } catch {
    return jsonErr("无效的 JSON 格式", 400);
  }

  try {
    const character = await characterService.importCharacter(auth, body);
    return jsonOk(character, 201);
  } catch (err) {
    if (err instanceof CharacterError) return jsonErr(err.message, err.status);
    return jsonErr("导入角色失败", 500);
  }
}