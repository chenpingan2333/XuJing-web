import { db } from "@/db";
import { starDiamondTransactions } from "@/db/schema/star-diamond-transactions";
import { eq, desc } from "drizzle-orm";

export class StarDiamondTransactionRepository {
  async findById(id: string) {
    return db.query.starDiamondTransactions.findFirst({
      where: eq(starDiamondTransactions.id, id),
    });
  }

  async findByUser(userId: string, limit = 50) {
    return db.query.starDiamondTransactions.findMany({
      where: eq(starDiamondTransactions.userId, userId),
      orderBy: desc(starDiamondTransactions.createdAt),
      limit,
    });
  }

  async create(data: typeof starDiamondTransactions.$inferInsert) {
    const [result] = await db
      .insert(starDiamondTransactions)
      .values(data)
      .returning();
    return result;
  }

  async getBalance(userId: string): Promise<number> {
    const last = await db.query.starDiamondTransactions.findFirst({
      where: eq(starDiamondTransactions.userId, userId),
      orderBy: desc(starDiamondTransactions.createdAt),
    });
    return last?.balanceAfter ?? 0;
  }
}

export const starDiamondTransactionRepository = new StarDiamondTransactionRepository();