/**
 * 管理后台 — 用户管理 API
 *
 * ⚠️  安全约束：所有端点均经过双重校验：
 *     1. requireAuth — JWT 身份验证
 *     2. guardAdmin — role === 'ADMIN' 角色检查
 *    仅 admin 角色可操作，前端不可绕过后端校验。
 */

import { jsonOk, jsonErr } from "../../_base/response";
import { requireAuth, guardAdmin } from "../../_base/auth";
import { db } from "@/db";
import { users } from "@/db/schema/users";
import { eq, ilike, and, or } from "drizzle-orm";

// ─── GET /api/admin/users — 用户列表 + 搜索 ───
// 支持 ?q=email 模糊搜索
export async function GET(req: Request) {
  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;
  const denied = guardAdmin(auth);
  if (denied) return denied;

  const url = new URL(req.url);
  const q = url.searchParams.get("q")?.trim() ?? "";

  let rows;
  if (q) {
    rows = await db
      .select({
        id: users.id,
        uid: users.uid,
        email: users.email,
        role: users.role,
        status: users.status,
        vipExpiresAt: users.vipExpiresAt,
        hasPurchasedVip: users.hasPurchasedVip,
        starDiamonds: users.starDiamonds,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(ilike(users.email, "%" + q + "%"))
      .orderBy(users.createdAt)
      .limit(100);
  } else {
    rows = await db
      .select({
        id: users.id,
        uid: users.uid,
        email: users.email,
        role: users.role,
        status: users.status,
        vipExpiresAt: users.vipExpiresAt,
        hasPurchasedVip: users.hasPurchasedVip,
        starDiamonds: users.starDiamonds,
        createdAt: users.createdAt,
      })
      .from(users)
      .orderBy(users.createdAt)
      .limit(100);
  }

  return jsonOk(rows);
}

// ─── PATCH /api/admin/users — 管理操作 ───
// body: { userId, action, value }
//   action: "set_role"    → value: "ADMIN" | "USER"
//   action: "set_status"  → value: "ACTIVE" | "BANNED"
//   action: "grant_vip"   → value: number (days: 2,7,30,90,365)
//   action: "revoke_vip"  → 立即清除 VIP
export async function PATCH(req: Request) {
  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;
  const denied = guardAdmin(auth);
  if (denied) return denied;

  let body: { userId?: string; action?: string; value?: unknown };
  try { body = await req.json(); } catch { return jsonErr("Invalid JSON", 400); }

  const { userId, action, value } = body;
  if (!userId || typeof userId !== "string") return jsonErr("userId is required", 400);
  if (!action) return jsonErr("action is required", 400);

  // 防止管理员操作自己降权
  if (userId === auth.id && action === "set_role" && value === "USER") {
    return jsonErr("不能降权自己的管理员角色", 400);
  }

  switch (action) {
    case "set_role": {
      if (value !== "ADMIN" && value !== "USER") return jsonErr("Invalid role value", 400);
      await db.update(users).set({ role: value }).where(eq(users.id, userId));
      return jsonOk({ action, userId, role: value });
    }

    case "set_status": {
      if (value !== "ACTIVE" && value !== "BANNED") return jsonErr("Invalid status value", 400);
      await db.update(users).set({ status: value }).where(eq(users.id, userId));
      return jsonOk({ action, userId, status: value });
    }

    case "grant_vip": {
      const days = Number(value);
      if (![2, 7, 30, 90, 365].includes(days)) return jsonErr("Invalid VIP duration", 400);
      const now = new Date();
      const expiresAt = new Date(now.getTime() + days * 86400 * 1000);
      await db
        .update(users)
        .set({ vipExpiresAt: expiresAt, hasPurchasedVip: true })
        .where(eq(users.id, userId));
      return jsonOk({ action, userId, vipExpiresAt: expiresAt.toISOString(), days });
    }

    case "revoke_vip": {
      await db
        .update(users)
        .set({ vipExpiresAt: null, hasPurchasedVip: false })
        .where(eq(users.id, userId));
      return jsonOk({ action, userId, vipExpiresAt: null });
    }

    default:
      return jsonErr("Unknown action: " + action, 400);
  }
}