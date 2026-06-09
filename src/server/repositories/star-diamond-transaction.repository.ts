import { db } from "@/db";
import { starDiamondTransactions } from "@/db/schema/star-diamond-transactions";
import { eq, desc } from "drizzle-orm";

export class StarDiamondTransactionRepository {
  async findById(id: string) {
    const [r] = await db.select().from(starDiamondTransactions).where(eq(starDiamondTransactions.id, id)).limit(1);
    return r ?? null;
  }

  async findByUser(userId: string, limit = 50) {
    return db.select().from(starDiamondTransactions).where(eq(starDiamondTransactions.userId, userId)).orderBy(desc(starDiamondTransactions.createdAt)).limit(limit);
  }

  async create(data: typeof starDiamondTransactions.$inferInsert) {
    const [result] = await db
      .insert(starDiamondTransactions)
      .values(data)
      .returning();
    return result;
  }

  async getBalance(userId: string): Promise<number> {
    const [last] = await db.select().from(starDiamondTransactions).where(eq(starDiamondTransactions.userId, userId)).orderBy(desc(starDiamondTransactions.createdAt)).limit(1);
    return last?.balanceAfter ?? 0;
  }
}

export const starDiamondTransactionRepository = new StarDiamondTransactionRepository();