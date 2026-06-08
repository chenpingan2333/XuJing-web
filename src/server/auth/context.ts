/**
 * Auth Context — Phase 4.2 Strict Auth
 *
 * Extracts auth context from middleware-injected request headers.
 * No longer depends on AsyncLocalStorage.
 */

import { headers } from "next/headers";
import type { AuthUser } from "@/lib/auth";

export async function getAuthUser(): Promise<AuthUser | null> {
  const h = await headers();
  const userId = h.get("x-auth-user-id");
  if (!userId) return null;

  return {
    id: userId,
    userId,
    role: (h.get("x-auth-role") as "USER" | "ADMIN") ?? "USER",
    subscription: (h.get("x-auth-subscription") as "free" | "vip") ?? "free",
    authenticated: true,
    jti: h.get("x-auth-jti") ?? "",
  };
}

export async function requireAuthUser(): Promise<AuthUser> {
  const user = await getAuthUser();
  if (!user) throw new Error("Auth required but no authenticated user in context");
  return user;
}
