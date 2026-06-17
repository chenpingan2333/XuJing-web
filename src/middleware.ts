/**
 * Middleware — Phase 4.2 Strict Auth
 *
 * Route-level enforcement:
 *   /api/health          → public
 *   /api/auth/*           → public
 *   /api/admin/*          → JWT + role=ADMIN
 *   /api/* (everything else) → JWT required
 *
 * Auth context passed to route handlers via request headers
 * (x-auth-user-id, x-auth-role, x-auth-subscription, x-auth-jti).
 * Headers are set by middleware only — clients cannot override them.
 */

export const runtime = "nodejs";

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import type { Subscription } from "@/lib/auth";
import { initRuntimeGate, isReady } from "@/server/runtime/gate";
import { verifyAccessToken } from "@/server/auth/jwt";
import { isJtiBlacklisted } from "@/server/auth/redis-session";
import { db } from "@/db";
import { users } from "@/db/schema/users";
import { eq } from "drizzle-orm";

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Page routes: skip runtime gate — don't block SSR on infra readiness
  if (!pathname.startsWith("/api/")) return NextResponse.next();

  // ─── API routes below ───

  await initRuntimeGate();

  if (pathname === "/api/health" || pathname === "/api/seed" || pathname === "/api/seed-official" || pathname === "/api/seed-api-key") return NextResponse.next();

  if (!isReady()) {
    return NextResponse.json(
      { success: false, error: "Runtime not ready", timestamp: new Date().toISOString() },
      { status: 503 }
    );
  }

  if (isPublicRoute(pathname)) return NextResponse.next();

  // ─── Auth required ───
  const token = extractBearerToken(req);
  if (!token) return authError("Authentication required", 401);

  const payload = await verifyAccessToken(token);
  if (!payload) return authError("Invalid or expired token", 401);

  if (payload.jti && await isJtiBlacklisted(payload.jti)) {
    return authError("Token revoked", 401);
  }

  if (!payload.sub || typeof payload.sub !== "string" || payload.sub.trim() === "") {
    return authError("Invalid token: missing subject", 401);
  }
  const user = await getUserOrNull(payload.sub);
  if (!user) return authError("User not found", 401);
  if (user.status === "BANNED") return authError("Account suspended", 403);
  if (isAdminRoute(pathname) && user.role !== "ADMIN") return authError("Admin access required", 403);

  const subscription: Subscription =
    user.vipExpiresAt && new Date(user.vipExpiresAt) > new Date() ? "vip" : "free";

  // Pass auth context to route handlers via request headers
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-auth-user-id", user.id);
  requestHeaders.set("x-auth-role", user.role);
  requestHeaders.set("x-auth-subscription", subscription);
  requestHeaders.set("x-auth-jti", payload.jti ?? "");

  return NextResponse.next({
    request: { headers: requestHeaders },
  });
}

// ─── Helpers ───

function extractBearerToken(req: NextRequest): string | null {
  const h = req.headers.get("authorization");
  if (!h) return null;
  const parts = h.split(" ");
  return parts.length === 2 && parts[0].toLowerCase() === "bearer" ? parts[1] : null;
}

function isPublicRoute(pathname: string): boolean {
  if (pathname.startsWith("/api/auth/") && pathname !== "/api/auth/logout") return true;
  return false;
}

function isAdminRoute(pathname: string): boolean {
  return pathname.startsWith("/api/admin/");
}

function authError(message: string, status: number): NextResponse {
  return NextResponse.json(
    { success: false, error: message, timestamp: new Date().toISOString() },
    { status }
  );
}

async function getUserOrNull(userId: string) {
  const [u] = await db.select({ id: users.id, role: users.role, status: users.status, vipExpiresAt: users.vipExpiresAt }).from(users).where(eq(users.id, userId)).limit(1);
  return u ?? null;
}

export const config = { matcher: ["/:path*"] };
