/**
 * 鍙欏锛圶ujing锛塂atabase Health Check
 *
 * 妫€鏌ワ細杩炴帴銆丼chema 瀛樺湪銆丮igration 鍚屾
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
    // 1. Connection check
    status.connected = true;

    // 2. Schema check
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

    const result = await db.execute(
      sql`SELECT tablename FROM pg_catalog.pg_tables WHERE schemaname = 'public'`
    );

    const existingTables = result.map((r) => r.tablename) as string[];
    status.tables = existingTables;

    const missing = expectedTables.filter((t) => !existingTables.includes(t));
    status.schemaExists = missing.length === 0;
    if (!status.schemaExists) {
      status.error = `Missing tables: ${missing.join(", ")}`;
    }

    // 3. Migration check`r`n    try {
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
