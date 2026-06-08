/**
 * JWT — Phase 4.1 Auth Core Skeleton
 *
 * 使用 jose 库（已安装）实现 HS256 JWT。
 * - createAccessToken: 签发 15min Access Token
 * - verifyAccessToken: 验证并解析 payload
 */

import { SignJWT, jwtVerify } from "jose";

const JWT_TTL_SEC = 900; // 15 minutes
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
 * 签发 Access Token。TTL = 15 分钟。
 */
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
 * 验证并解析 Access Token。
 * 成功返回 payload，失败返回 null（不抛异常）。
 */
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
