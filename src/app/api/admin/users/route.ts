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
import { eq, ilike, and, or, sql } from "drizzle-orm";

// ─── GET /api/admin/users — 用户列表 + 搜索 ───
// 支持 ?q=email 模糊搜索
export async function GET(req: Request) {
  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;
  const denied = guardAdmin(auth);
  if (denied) return denied;

  const url = new URL(req.url);
  const q = url.searchParams.get("q")?.trim() ?? "";
  const page = parseInt(url.searchParams.get("page") || "1");
  const limit = parseInt(url.searchParams.get("limit") || "50");
  const offset = (page - 1) * limit;

  try {
    // ✅ 使用绝对安全的 SQL 原生语法获取真实总数，防范类型错误
    let totalCount = 0;
    if (q) {
      const countResult = await db
        .select({ count: sql<number>`cast(count(*) as integer)` })
        .from(users)
        .where(ilike(users.email, "%" + q + "%"));
      totalCount = countResult[0]?.count || 0;
    } else {
      const countResult = await db
        .select({ count: sql<number>`cast(count(*) as integer)` })
        .from(users);
      totalCount = countResult[0]?.count || 0;
    }

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
      .limit(limit)
      .offset(offset);
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
      .limit(limit)
      .offset(offset);
  }

    return jsonOk({
      total: totalCount,
      page,
      limit,
      users: rows
    });
  } catch (error) {
    console.error("GET Users Error:", error);
    return jsonErr("获取用户列表失败", 500);
  }
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
      
      // 查询用户当前VIP状态
      const user = await db.select({ vipExpiresAt: users.vipExpiresAt }).from(users).where(eq(users.id, userId)).limit(1);
      const now = new Date();
      
      let newExpiresAt: Date;
      if (user[0]?.vipExpiresAt && user[0].vipExpiresAt > now) {
        // 当前VIP未过期，在现有到期时间基础上叠加
        newExpiresAt = new Date(user[0].vipExpiresAt.getTime() + days * 86400 * 1000);
      } else {
        // 当前VIP已过期或不存在，从当前时间开始计算
        newExpiresAt = new Date(now.getTime() + days * 86400 * 1000);
      }
      
      await db
        .update(users)
        .set({ vipExpiresAt: newExpiresAt, hasPurchasedVip: true })
        .where(eq(users.id, userId));
      return jsonOk({ action, userId, vipExpiresAt: newExpiresAt.toISOString(), days });
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