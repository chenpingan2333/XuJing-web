/**
 * DB Connection Lifecycle — Node.js Server (Tencent Cloud)
 *
 * 使用 postgres.js 驱动 + drizzle-orm/postgres-js，
 * 兼容标准 PostgreSQL TCP 连接（运行时 Node.js）。
 */

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

// ─── globalThis guard: 防止 HMR 重复 ───
const GLOBAL_KEY = "__xujing_db_singleton__";

interface DbStore {
  db: ReturnType<typeof drizzle<typeof schema>>;
  sql: ReturnType<typeof postgres>;
}

function getOrCreate(): DbStore {
  const existing = (globalThis as Record<string, unknown>)[GLOBAL_KEY] as DbStore | undefined;
  if (existing) return existing;

  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL environment variable is not set");

  const sql = postgres(url);
  const db = drizzle({ client: sql, schema });

  const store: DbStore = { db, sql };
  (globalThis as Record<string, unknown>)[GLOBAL_KEY] = store;
  return store;
}

/**
 * Lazy singleton Proxy。
 * import 不触发连接，首次属性访问时才建连。
 */
export const db = new Proxy({} as ReturnType<typeof drizzle<typeof schema>>, {
  get(_target, prop: string | symbol) {
    const store = getOrCreate();
    const value = (store.db as unknown as Record<string | symbol, unknown>)[prop];
    if (typeof value === "function") {
      return value.bind(store.db);
    }
    return value;
  },
}) as ReturnType<typeof drizzle<typeof schema>>;

export { schema };
