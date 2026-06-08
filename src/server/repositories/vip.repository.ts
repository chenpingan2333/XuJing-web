import { db } from "@/db";
import { vipRecords } from "@/db/schema/vip-records";
import { eq, and, gte } from "drizzle-orm";

export class VipRepository {
  async findById(id: string) {
    return db.query.vipRecords.findFirst({ where: eq(vipRecords.id, id) });
  }

  async findActive(userId: string) {
    const now = new Date();
    return db.query.vipRecords.findFirst({
      where: and(
        eq(vipRecords.userId, userId),
        gte(vipRecords.expiresAt, now)
      ),
      orderBy: vipRecords.expiresAt,
    });
  }

  async findByUser(userId: string) {
    return db.query.vipRecords.findMany({
      where: eq(vipRecords.userId, userId),
      orderBy: vipRecords.createdAt,
    });
  }

  async create(data: typeof vipRecords.$inferInsert) {
    const [result] = await db.insert(vipRecords).values(data).returning();
    return result;
  }
}

export const vipRepository = new VipRepository();