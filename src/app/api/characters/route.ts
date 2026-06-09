/**
 * GET  /api/characters — list (official + user characters)
 * POST /api/characters — create character
 *
 * Phase 7.1 Hardened — Rate limit + requireAuth + CharacterError -> jsonErr
 */

import { jsonOk, jsonErr } from "../_base/response";
import { requireAuth } from "../_base/auth";
import { rateLimit } from "../_base/rate-limit";
import { characterService, CharacterError } from "@/server/services/character.service";
import { CreateCharacterSchema } from "./validations";
import { db } from "@/db";
import { characters } from "@/db/schema/characters";
import { eq, and, count } from "drizzle-orm";

const FREE_USER_CHARACTER_LIMIT = 2;

// ─── GET: list ────────────────────────────────────────────────

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
    return jsonErr("Failed to list characters", 500);
  }
}

// ─── POST: create ─────────────────────────────────────────────

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
    return jsonErr("Invalid JSON body", 400);
  }

  const parsed = CreateCharacterSchema.safeParse(body);
  if (!parsed.success) {
    const first = parsed.error.errors[0];
    return jsonErr(first ? first.message : "Validation failed", 400);
  }

  // ── Quota check: count private (non-official) characters only ──
  if (auth.subscription !== "vip") {
    const [row] = await db
      .select({ count: count() })
      .from(characters)
      .where(
        and(
          eq(characters.userId, auth.userId),
          eq(characters.isOfficial, false)
        )
      );

    const privateCharacterCount = row?.count ?? 0;
    if (privateCharacterCount >= FREE_USER_CHARACTER_LIMIT) {
      return jsonErr("Character limit reached (2/2)", 403);
    }
  }

  try {
    const character = await characterService.createCharacter(auth, parsed.data);
    return jsonOk(character, 201);
  } catch (err) {
    if (err instanceof CharacterError) return jsonErr(err.message, err.status);
    return jsonErr("Failed to create character", 500);
  }
}
