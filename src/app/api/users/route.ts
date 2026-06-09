import { jsonOk, jsonErr } from "../_base/response";
import { requireAuth } from "../_base/auth";
import { db } from "@/db";
import { users } from "@/db/schema/users";
import { eq } from "drizzle-orm";

export async function GET(req: Request) {
  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;

  const [row] = await db
    .select({
      createdAt: users.createdAt,
      uid: users.uid,
      personaSetting: users.personaSetting,
    })
    .from(users)
    .where(eq(users.id, auth.userId))
    .limit(1);

  return jsonOk({
    userId: auth.userId,
    role: auth.role,
    subscription: auth.subscription,
    createdAt: row?.createdAt ?? null,
    uid: row?.uid ?? null,
    personaSetting: row?.personaSetting ?? null,
  });
}

export async function PATCH(req: Request) {
  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;

  let body: { personaSetting?: string };
  try { body = await req.json(); } catch { return jsonErr("Invalid JSON", 400); }

  if (typeof body.personaSetting !== "string") {
    return jsonErr("personaSetting is required", 400);
  }

  const trimmed = body.personaSetting.trim().slice(0, 10000);

  await db
    .update(users)
    .set({ personaSetting: trimmed || null })
    .where(eq(users.id, auth.userId));

  return jsonOk({ personaSetting: trimmed || null });
}