import type { AuthUser } from "@/lib/auth";

export type { AuthUser };

/** JWT Payload */
export interface JwtPayload {
  sub: string;       // user id
  role: "USER" | "ADMIN";
  iat: number;       // issued at
  exp: number;       // expires at
}
