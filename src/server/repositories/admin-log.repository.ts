import { db } from "@/db";
import { adminLogs } from "@/db/schema/admin-logs";
import { eq, desc } from "drizzle-orm";

export class AdminLogRepository {
  async findById(id: string) {
    const [r] = await db.select().from(adminLogs).where(eq(adminLogs.id, id)).limit(1);
    return r ?? null;
  }

  async findByAdmin(adminId: string, limit = 50) {
    return db.select().from(adminLogs).where(eq(adminLogs.adminId, adminId)).orderBy(desc(adminLogs.createdAt)).limit(limit);
  }

  async findByRequest(requestId: string) {
    return db.select().from(adminLogs).where(eq(adminLogs.requestId, requestId));
  }

  async create(data: typeof adminLogs.$inferInsert) {
    const [result] = await db.insert(adminLogs).values(data).returning();
    return result;
  }
}

export const adminLogRepository = new AdminLogRepository();