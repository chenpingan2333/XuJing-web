/**
 * JWT 鈥?Phase 4.1 Auth Core Skeleton
 *
 * 浣跨敤 jose 搴擄紙宸插畨瑁咃級瀹炵幇 HS256 JWT銆? * - createAccessToken: 绛惧彂 15min Access Token
 * - verifyAccessToken: 楠岃瘉骞惰В鏋?payload
 */

import { SignJWT, jwtVerify } from "jose";

const JWT_TTL_SEC = 86400; // 24 hours — 聊天场景需要长会话
const JWT_ALG = "HS256";

export interface JwtPayload {
  sub: string;   // userId
  role: string;  // "USER" | "ADMIN"
  jti: string;   // token id
}

function getSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET environment variable is not set");
  return new TextEncoder().encode(secret);
}

/**
 * 绛惧彂 Access Token銆俆TL = 15 鍒嗛挓銆? */
export async function createAccessToken(user: {
  id: string;
  role: string;
}): Promise<string> {
  const jti = crypto.randomUUID();
  const secret = getSecret();

  return new SignJWT({ role: user.role, jti })
    .setProtectedHeader({ alg: JWT_ALG })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + JWT_TTL_SEC)
    .setJti(jti)
    .sign(secret);
}

/**
 * 楠岃瘉骞惰В鏋?Access Token銆? * 鎴愬姛杩斿洖 payload锛屽け璐ヨ繑鍥?null锛堜笉鎶涘紓甯革級銆? */
export async function verifyAccessToken(
  token: string
): Promise<JwtPayload | null> {
  try {
    const secret = getSecret();
    const { payload } = await jwtVerify(token, secret, {
      algorithms: [JWT_ALG],
    });
    return {
      sub: payload.sub ?? "",
      role: (payload.role as string) ?? "USER",
      jti: (payload.jti as string) ?? "",
    };
  } catch {
    return null;
  }
}

