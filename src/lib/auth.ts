/**
 * Auth — 会员制单轨架构
 *
 * AuthUser 类型：
 *   - subscription: "free" | "vip" (基于 vip_expires_at 推导)
 *   - isMember() 为全站唯一权限判断
 *   - 非会员访问受限功能统一返回 accessDeniedResponse()
 */

export type Subscription = "free" | "vip";

export interface AuthUser {
  id: string;
  role: "USER" | "ADMIN";
  subscription: Subscription;
  authenticated: true;
  userId: string;
  jti: string;
}

/** 从 DB User 行推导 subscription */
export function deriveSubscription(vipExpiresAt: Date | null | undefined): Subscription {
  if (vipExpiresAt && new Date(vipExpiresAt) > new Date()) return "vip";
  return "free";
}

export function isAdmin(user: AuthUser): boolean {
  return user.role === "ADMIN";
}

export function isMember(user: AuthUser): boolean {
  return user.subscription === "vip";
}

export function requireAdmin(user: AuthUser): Response | null {
  if (!isAdmin(user)) {
    return new Response(
      JSON.stringify({ success: false, error: "Forbidden: admin only" }),
      { status: 403, headers: { "Content-Type": "application/json" } }
    );
  }
  return null;
}

/** 非会员访问受限功能的标准 403 响应 */
export function accessDeniedResponse(): Response {
  return new Response(
    JSON.stringify({ error: "ACCESS_DENIED", message: "您已被拒绝访问！请联系叙境项目组" }),
    { status: 403, headers: { "Content-Type": "application/json" } }
  );
}
