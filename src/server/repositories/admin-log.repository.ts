import { db } from "@/db";
import { adminLogs } from "@/db/schema/admin-logs";
import { eq, desc } from "drizzle-orm";

export class AdminLogRepository {
  async findById(id: string) {
    return db.query.adminLogs.findFirst({ where: eq(adminLogs.id, id) });
  }

  async findByAdmin(adminId: string, limit = 50) {
    return db.query.adminLogs.findMany({
      where: eq(adminLogs.adminId, adminId),
      orderBy: desc(adminLogs.createdAt),
      limit,
    });
  }

  async findByRequest(requestId: string) {
    return db.query.adminLogs.findMany({
      where: eq(adminLogs.requestId, requestId),
    });
  }

  async create(data: typeof adminLogs.$inferInsert) {
    const [result] = await db.insert(adminLogs).values(data).returning();
    return result;
  }
}

export const adminLogRepository = new AdminLogRepository();