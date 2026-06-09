import { db } from "@/db";
import { vipRecords } from "@/db/schema/vip-records";
import { eq, and, gte } from "drizzle-orm";

export class VipRepository {
  async findById(id: string) {
    const [r] = await db.select().from(vipRecords).where(eq(vipRecords.id, id)).limit(1);
    return r ?? null;
  }

  async findActive(userId: string) {
    const now = new Date();
    const [r] = await db.select().from(vipRecords).where(and(eq(vipRecords.userId, userId), gte(vipRecords.expiresAt, now))).orderBy(vipRecords.expiresAt).limit(1);
    return r ?? null;
  }

  async findByUser(userId: string) {
    return db.select().from(vipRecords).where(eq(vipRecords.userId, userId)).orderBy(vipRecords.createdAt);
  }

  async create(data: typeof vipRecords.$inferInsert) {
    const [result] = await db.insert(vipRecords).values(data).returning();
    return result;
  }
}

export const vipRepository = new VipRepository();