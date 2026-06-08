/**
 * API Route Auth Helper — Phase 4.2 Strict Auth
 *
 * Middleware 已完成 JWT 验证 + JTI 黑名单检查，通过请求头传递用户上下文。
 * 路由处理器通过 headers 读取，不再依赖 AsyncLocalStorage。
 */

import { jsonErr } from "./response";
import type { AuthUser } from "@/lib/auth";

export type { AuthUser };

/**
 * 从中间件注入的请求头构建 AuthUser。
 * 未认证 → 401。
 */
export async function requireAuth(req: Request): Promise<AuthUser | Response> {
  const userId = req.headers.get("x-auth-user-id");
  if (!userId) return jsonErr("Authentication required", 401);

  return {
    id: userId,
    userId,
    role: (req.headers.get("x-auth-role") as "USER" | "ADMIN") ?? "USER",
    subscription: (req.headers.get("x-auth-subscription") as "free" | "vip") ?? "free",
    authenticated: true,
    jti: req.headers.get("x-auth-jti") ?? "",
  };
}

/**
 * Admin 守卫。
 */
export function guardAdmin(user: AuthUser): Response | null {
  if (user.role !== "ADMIN") return jsonErr("Admin access required", 403);
  return null;
}
