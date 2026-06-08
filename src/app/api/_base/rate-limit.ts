/**
 * Redis Rate Limiter — Phase 5 (Vercel Serverless)
 *
 * 基于统一 Redis 抽象层的固定窗口速率限制。
 * Key 格式: rate_limit:{userId}:{action}
 */

import { getRedis } from "@/server/redis/client";
import { jsonErr } from "./response";

interface TierConfig {
  limit: number;
  windowMs: number;
}

interface RateLimitConfig {
  free: TierConfig;
  vip: TierConfig;
}

const KEY_PREFIX = "rate_limit:";

/**
 * 检查速率限制。返回 Response 表示触发限制，null 表示放行。
 */
export async function rateLimit(
  userId: string,
  action: string,
  config: RateLimitConfig,
  subscription: string,
): Promise<Response | null> {
  const tier = subscription === "vip" ? config.vip : config.free;
  const key = `${KEY_PREFIX}${userId}:${action}`;
  const ttlSeconds = Math.ceil(tier.windowMs / 1000);

  try {
    const redis = getRedis();
    const count = await redis.incr(key);

    if (count === 1) {
      await redis.expire(key, ttlSeconds);
    }

    if (count > tier.limit) {
      return jsonErr("操作过于频繁，请稍后再试", 429);
    }

    return null;
  } catch (err) {
    console.warn("[rate-limit] Redis error, allowing request:", err instanceof Error ? err.message : String(err));
    return null;
  }
}
