/**
 * ⚠️  一次性管理员种子脚本 — 使用后请删除此文件
 * POST /api/admin/seed
 * body: { email, seedKey }
 * seedKey 防止误调用
 */
import { jsonOk, jsonErr } from "../_base/response";
import { db } from "@/db";
import { users } from "@/db/schema/users";
import { eq } from "drizzle-orm";

const SEED_KEY = "xujing-admin-seed-2026";

export async function POST(req: Request) {
  let body: { email?: string; seedKey?: string };
  try { body = await req.json(); } catch { return jsonErr("Invalid JSON", 400); }

  if (body.seedKey !== SEED_KEY) return jsonErr("Invalid seed key", 403);
  if (!body.email) return jsonErr("email required", 400);

  const [user] = await db
    .select({ id: users.id, email: users.email })
    .from(users)
    .where(eq(users.email, body.email.toLowerCase().trim()))
    .limit(1);

  if (!user) return jsonErr("User not found: " + body.email, 404);

  await db
    .update(users)
    .set({
      role: "ADMIN",
      vipExpiresAt: new Date("2099-12-31T23:59:59Z"),
      hasPurchasedVip: true,
    })
    .where(eq(users.id, user.id));

  return jsonOk({
    email: user.email,
    role: "ADMIN",
    vipExpiresAt: "2099-12-31T23:59:59Z",
    hasPurchasedVip: true,
  });
}