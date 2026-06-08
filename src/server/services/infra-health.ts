import { neon } from "@neondatabase/serverless";
import { getRedis } from "@/server/redis/client";
import { getEnv } from "@/lib/env";

export interface InfraStatus {
  ok: boolean;
  postgres: boolean;
  redis: boolean;
  env: boolean;
  error?: string;
}

/**
 * Phase 5 — Infra Health Check (Vercel Serverless)
 * 启动前校验 DB + Redis + ENV 全链路连通性。
 */
export async function checkInfra(): Promise<InfraStatus> {
  const result: InfraStatus = {
    ok: false,
    postgres: false,
    redis: false,
    env: false,
  };

  // 1. ENV 校验
  try {
    getEnv();
    result.env = true;
  } catch (e) {
    result.error = "ENV: " + ((e as Error).message);
    return result;
  }

  // 2. PostgreSQL (Neon HTTP)
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    result.error = "DATABASE_URL missing";
    return result;
  }

  try {
    const sql = neon(dbUrl);
    await sql`SELECT 1`;
    result.postgres = true;
  } catch (e) {
    result.error = "PG: " + ((e as Error).message);
    return result;
  }

  // 3. Redis (统一抽象层)
  try {
    const redis = getRedis();
    const pong = await redis.ping();
    result.redis = pong === "PONG";
  } catch (e) {
    result.error = "Redis: " + ((e as Error).message);
    return result;
  }

  result.ok = result.postgres && result.redis && result.env;
  return result;
}
