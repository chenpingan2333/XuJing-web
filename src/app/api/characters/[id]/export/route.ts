/**
 * GET /api/characters/[id]/export — 导出角色卡 JSON
 *
 * Phase 7.1 Hardened — Rate limit + requireAuth + CharacterError → jsonErr。
 */

import { jsonOk, jsonErr } from "../../../_base/response";
import { requireAuth } from "../../../_base/auth";
import { rateLimit } from "../../../_base/rate-limit";
import { characterService, CharacterError } from "@/server/services/character.service";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;
  const { id } = await params;

  const rl = await rateLimit(auth.userId, "characters:export", {
    free: { limit: 10, windowMs: 60_000 },
    vip: { limit: 20, windowMs: 60_000 },
  }, auth.subscription);
  if (rl) return rl;

  try {
    const exported = await characterService.exportCharacter(auth, id);
    return jsonOk(exported);
  } catch (err) {
    if (err instanceof CharacterError) return jsonErr(err.message, err.status);
    return jsonErr("导出角色失败", 500);
  }
}