/**
 * 叙境（Xujing）Database Health Check
 *
 * 检查：连接、Schema 存在、Migration 同步
 */

import { db } from "@/db";
import { sql } from "drizzle-orm";

export interface HealthStatus {
  connected: boolean;
  schemaExists: boolean;
  migrationSynced: boolean;
  tables: string[];
  error?: string;
}

export async function checkDatabaseHealth(): Promise<HealthStatus> {
  const status: HealthStatus = {
    connected: false,
    schemaExists: false,
    migrationSynced: false,
    tables: [],
  };

  try {
    // 1. 连接检查
    await db.execute(sql`SELECT 1`);
    status.connected = true;

    // 2. Schema 存在检查 — 枚举所有预期表
    const expectedTables = [
      "users",
      "characters",
      "messages",
      "memories",
      "api_configs",
      "orders",
      "vip_records",
      "admin_logs",
      "star_diamond_transactions",
    ];

    const result = await db.execute<{ tablename: string }>(
      sql`SELECT tablename FROM pg_catalog.pg_tables WHERE schemaname = 'public'`
    );

    const existingTables = result.map((r) => r.tablename);
    status.tables = existingTables;

    const missing = expectedTables.filter((t) => !existingTables.includes(t));
    status.schemaExists = missing.length === 0;
    if (!status.schemaExists) {
      status.error = `Missing tables: ${missing.join(", ")}`;
    }

    // 3. Migration 同步检查 — drizzle __drizzle_migrations 表
    try {
      const migrationResult = await db.execute<{ count: string }>(
        sql`SELECT COUNT(*) as count FROM __drizzle_migrations`
      );
      status.migrationSynced = Number(migrationResult[0]?.count ?? 0) > 0;
    } catch {
      status.migrationSynced = false;
      status.error = (status.error ?? "") + " Migration table not found.";
    }

    return status;
  } catch (err) {
    status.error = err instanceof Error ? err.message : "Unknown error";
    return status;
  }
}