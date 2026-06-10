import postgres from "postgres";
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
 * Infra Health Check — 校验 DB + Redis + ENV 全链路连通性。
 * 使用标准 postgres 驱动替代 neon()，兼容本地 PostgreSQL。
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

  // 2. PostgreSQL
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    result.error = "DATABASE_URL missing";
    return result;
  }

  try {
    const sql = postgres(dbUrl, { connect_timeout: 5, max: 1 });
    await sql`SELECT 1`;
    await sql.end();
    result.postgres = true;
  } catch (e) {
    result.error = "PG: " + ((e as Error).message);
    return result;
  }

  // 3. Redis
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
