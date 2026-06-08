/**
 * DB Connection Lifecycle — Phase 5 (Vercel Serverless)
 *
 * 切换到 @neondatabase/serverless + drizzle-orm/neon-http，
 * 兼容 Vercel serverless（无持久 TCP）和本地开发。
 */

import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import type { NeonHttpDatabase } from "drizzle-orm/neon-http";
import * as schema from "./schema";

type DbType = NeonHttpDatabase<typeof schema>;

// ─── globalThis guard: 防 HMR 重复 ───
const GLOBAL_KEY = "__xujing_db_singleton__";

interface DbStore {
  db: DbType;
}

function getOrCreate(): DbStore {
  const existing = (globalThis as Record<string, unknown>)[GLOBAL_KEY] as DbStore | undefined;
  if (existing) return existing;

  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL environment variable is not set");

  const sql = neon(url);
  const db = drizzle(sql, { schema });

  const store: DbStore = { db };
  (globalThis as Record<string, unknown>)[GLOBAL_KEY] = store;
  return store;
}

/**
 * Lazy singleton Proxy。
 * import 不触发连接，首次属性访问时才建连。
 */
export const db: DbType = new Proxy({} as DbType, {
  get(_target, prop: string | symbol) {
    const store = getOrCreate();
    const value = (store.db as unknown as Record<string | symbol, unknown>)[prop];
    if (typeof value === "function") {
      return value.bind(store.db);
    }
    return value;
  },
}) as DbType;

export { schema };
