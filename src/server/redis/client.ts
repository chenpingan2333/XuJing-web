/**
 * Redis Client Abstraction
 *
 * 自动选择驱动：
 *   - UPSTASH_REDIS_URL 存在 → @upstash/redis (HTTP, Vercel serverless)
 *   - REDIS_URL 存在 → ioredis (TCP, 本地 Docker)
 */

import { Redis as UpstashRedis } from "@upstash/redis";
import IORedis from "ioredis";

// ─── Shared interface ───

export interface RedisClient {
  set(key: string, value: string, ttlSeconds?: number): Promise<string | null>;
  get(key: string): Promise<string | null>;
  del(...keys: string[]): Promise<number>;
  incr(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<number>;
  ping(): Promise<string>;
}

// ─── Factory ───

let _client: RedisClient | null = null;

export function getRedis(): RedisClient {
  if (_client) return _client;

  if (process.env.UPSTASH_REDIS_URL && process.env.UPSTASH_REDIS_TOKEN) {
    console.log("[redis] Using Upstash driver");
    _client = createUpstashClient();
  } else if (process.env.REDIS_URL) {
    console.log("[redis] Using ioredis driver");
    _client = createIoredisClient();
  } else {
    throw new Error("No Redis configuration found. Set UPSTASH_REDIS_URL+UPSTASH_REDIS_TOKEN or REDIS_URL.");
  }

  return _client;
}

// ─── Upstash implementation ───

function createUpstashClient(): RedisClient {
  const redis = new UpstashRedis({
    url: process.env.UPSTASH_REDIS_URL!,
    token: process.env.UPSTASH_REDIS_TOKEN!,
  });

  return {
    async set(key, value, ttlSeconds) {
      if (ttlSeconds != null) {
        return redis.set(key, value, { ex: ttlSeconds });
      }
      return redis.set(key, value);
    },
    async get(key) {
      const val = await redis.get(key);
      // Upstash auto-deserializes values (e.g. "388509" → 388509).
      // Force string return to match the RedisClient interface contract.
      return val == null ? null : String(val);
    },
    async del(...keys) {
      return redis.del(...keys);
    },
    async incr(key) {
      return redis.incr(key);
    },
    async expire(key, seconds) {
      return redis.expire(key, seconds);
    },
    async ping() {
      return redis.ping();
    },
  };
}

// ─── ioredis implementation ───

function createIoredisClient(): RedisClient {
  const redis = new IORedis(process.env.REDIS_URL!, {
    maxRetriesPerRequest: 3,
    lazyConnect: false,
  });

  return {
    async set(key, value, ttlSeconds) {
      if (ttlSeconds != null) {
        return redis.set(key, value, "EX", ttlSeconds);
      }
      return redis.set(key, value);
    },
    async get(key) {
      const val = await redis.get(key);
      // ioredis always returns string | null, but guard against edge cases.
      return val == null ? null : String(val);
    },
    async del(...keys) {
      return redis.del(...keys);
    },
    async incr(key) {
      return redis.incr(key);
    },
    async expire(key, seconds) {
      return redis.expire(key, seconds);
    },
    async ping() {
      return redis.ping();
    },
  };
}

export { getRedis as getRedisClient };
