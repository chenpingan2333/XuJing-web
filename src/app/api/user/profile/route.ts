/**
 * PUT /api/user/profile — 更新用户资料
 *
 * 支持更新用户资料字段，目前主要支持头像URL更新
 * 认证要求：需要用户登录
 * 请求体：{ avatarUrl?: string }
 */

import { jsonOk, jsonErr } from "../../_base/response";
import { requireAuth } from "../../_base/auth";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function PUT(req: Request) {
  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;

  let body: { avatarUrl?: string };
  try {
    body = await req.json();
  } catch {
    return jsonErr("Invalid JSON body", 400);
  }

  // 验证请求体
  if (!body || typeof body !== "object") {
    return jsonErr("Invalid request body", 400);
  }

  // 检查是否有可更新的字段
  const updateData: { avatarUrl?: string } = {};
  
  if (body.avatarUrl !== undefined) {
    if (typeof body.avatarUrl !== "string" || body.avatarUrl.length > 500) {
      return jsonErr("Invalid avatarUrl format (max 500 characters)", 400);
    }
    updateData.avatarUrl = body.avatarUrl;
  }

  // 如果没有可更新的字段，返回错误
  if (Object.keys(updateData).length === 0) {
    return jsonErr("No valid fields to update", 400);
  }

  try {
    // 更新用户资料
    const result = await db
      .update(users)
      .set(updateData)
      .where(eq(users.id, auth.id))
      .returning();

    if (result.length === 0) {
      return jsonErr("User not found", 404);
    }

    return jsonOk({ message: "Profile updated successfully", user: result[0] });
  } catch (err) {
    console.error("[user/profile] Update failed:", err instanceof Error ? err.message : String(err));
    return jsonErr("Failed to update profile", 500);
  }
}

// 支持OPTIONS方法用于CORS
// 支持GET方法用于获取用户资料（可选）
export async function OPTIONS() {
  return new Response(null, { status: 204 });
}