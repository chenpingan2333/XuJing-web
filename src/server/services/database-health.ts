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
    await db.execute(sql`SELECT 1`);
    status.connected = true;

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

    const existingTables = result.map((r: any) => r.tablename) as string[];
    status.tables = existingTables;

    const missing = expectedTables.filter((t) => !existingTables.includes(t));
    status.schemaExists = missing.length === 0;
    if (!status.schemaExists) {
      status.error = `Missing tables: ${missing.join(", ")}`;
    }

    try {
      const migrationResult = await db.execute(
        sql`SELECT COUNT(*) as count FROM __drizzle_migrations`
      );
      status.migrationSynced = Number((migrationResult[0] as any)?.count ?? 0) > 0;
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
