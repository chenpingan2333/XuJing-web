/**
 * Auth Guard — Phase 4.2 Strict
 *
 * Strict mode: middleware passes user context via request headers.
 */

import { getAuthUser } from "./context";
import type { AuthUser } from "@/lib/auth";

export type { AuthUser };

export async function authGuard(): Promise<AuthUser> {
  const user = await getAuthUser();
  if (!user) throw new Error("Authentication required — no user in request context");
  return user;
}
