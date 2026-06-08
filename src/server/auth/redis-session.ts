/**
 * Redis Session — Phase 5 (Vercel Serverless)
 *
 * 基于统一 Redis 抽象层：refresh token、JTI 黑名单、验证码缓存。
 */

import { getRedis } from "@/server/redis/client";

// ─── Refresh Token ───

const REFRESH_PREFIX = "xujing:refresh:";
const REFRESH_TTL = 604800; // 7 days

export async function setRefreshToken(userId: string, tokenHash: string): Promise<void> {
  await getRedis().set(REFRESH_PREFIX + userId, tokenHash, REFRESH_TTL);
}

export async function getRefreshToken(userId: string): Promise<string | null> {
  return getRedis().get(REFRESH_PREFIX + userId);
}

export async function revokeRefreshToken(userId: string): Promise<void> {
  await getRedis().del(REFRESH_PREFIX + userId);
}

// ─── JTI Blacklist ───

const JTI_PREFIX = "xujing:jti:";

export async function blacklistJti(jti: string): Promise<void> {
  await getRedis().set(JTI_PREFIX + jti, "1", 900);
}

/**
 * 检查 JTI 是否在黑名单中。
 * Redis 不可达时返回 false（degraded 模式）。
 */
export async function isJtiBlacklisted(jti: string): Promise<boolean> {
  try {
    const val = await getRedis().get(JTI_PREFIX + jti);
    return val === "1";
  } catch {
    console.warn("[redis] JTI blacklist check failed, allowing (degraded)");
    return false;
  }
}

// ─── Verification Code Cache ───

const CODE_PREFIX = "xujing:code:";
const CODE_TTL = 300; // 5 minutes

export async function setVerificationCode(email: string, code: string): Promise<void> {
  await getRedis().set(CODE_PREFIX + email, code, CODE_TTL);
}

export async function getVerificationCode(email: string): Promise<string | null> {
  return getRedis().get(CODE_PREFIX + email);
}

export async function deleteVerificationCode(email: string): Promise<void> {
  await getRedis().del(CODE_PREFIX + email);
}

// ─── Health ───

export async function pingRedis(): Promise<boolean> {
  try {
    const result = await getRedis().ping();
    return result === "PONG";
  } catch {
    return false;
  }
}
