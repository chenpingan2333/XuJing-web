/**
 * Auth — Phase 4.2 Strict Auth + User Tier Enforcement
 *
 * AuthUser 类型：
 *   - subscription: "free" | "vip" (基于 vip_expires_at 推导)
 *   - 移除 mockUser fallback
 *   - 强制 JWT 认证
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

export function isVip(user: AuthUser): boolean {
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
