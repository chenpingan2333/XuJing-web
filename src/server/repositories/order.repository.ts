import { db } from "@/db";
import { orders } from "@/db/schema/orders";
import { users } from "@/db/schema/users";
import { starDiamondTransactions } from "@/db/schema/star-diamond-transactions";
import { adminLogs } from "@/db/schema/admin-logs";
import { eq, desc, sql } from "drizzle-orm";
import { uuidv7 } from "@/db/helpers";

export class OrderRepository {
  async findById(id: string) {
    const [r] = await db.select().from(orders).where(eq(orders.id, id)).limit(1);
    return r ?? null;
  }

  async findByUser(userId: string) {
    return db.select().from(orders).where(eq(orders.userId, userId)).orderBy(desc(orders.createdAt));
  }

  async findPendingReview() {
    return db.select().from(orders).where(eq(orders.status, "PENDING_REVIEW")).orderBy(orders.createdAt);
  }

  async create(data: typeof orders.$inferInsert) {
    const [result] = await db.insert(orders).values(data).returning();
    return result;
  }

  /**
   * step 1: update order -> COMPLETED
   * step 2: add user star diamonds
   * step 3: write fund flow
   * step 4: write admin log
   */
  async approve(orderId: string, adminId: string) {
    return db.transaction(async (tx) => {
      const [order] = await tx.select().from(orders).where(eq(orders.id, orderId)).limit(1);
      if (!order || order.status !== "PENDING_REVIEW") return null;
      if (order.transactionId) return null;

      const now = new Date();
      const transactionId = uuidv7();

      // step 1: update order status
      await tx
        .update(orders)
        .set({
          status: "COMPLETED",
          reviewedBy: adminId,
          reviewedAt: now,
          transactionId,
          completedAt: now,
        })
        .where(eq(orders.id, orderId));

      // step 2: add user star diamonds
      const newBalance = (order.starDiamonds ?? 0);
      await tx
        .update(users)
        .set({ starDiamonds: sql`${users.starDiamonds} + ${newBalance}` })
        .where(eq(users.id, order.userId));

      const [u] = await tx.select({ starDiamonds: users.starDiamonds }).from(users).where(eq(users.id, order.userId)).limit(1);

      // step 3: write fund flow
      await tx.insert(starDiamondTransactions).values({
        userId: order.userId,
        amount: BigInt(order.starDiamonds),
        balanceAfter: BigInt(u?.starDiamonds ?? 0),
        type: "RECHARGE",
        referenceId: order.id,
      } as any);

      // step 4: write admin log
      await tx.insert(adminLogs).values({
        adminId,
        actionType: "ORDER_APPROVE",
        targetType: "ORDER",
        targetId: order.id,
        detail: {
          orderId: order.id,
          userId: order.userId,
          amountRmb: order.amountRmb,
          starDiamonds: order.starDiamonds,
          transactionId,
        },
      });

      return { orderId, transactionId, starDiamonds: newBalance };
    });
  }

  async reject(orderId: string, adminId: string, note: string) {
    const existing = await this.findById(orderId);
    if (!existing || existing.status !== "PENDING_REVIEW") return null;

    const [result] = await db
      .update(orders)
      .set({
        status: "REJECTED",
        reviewedBy: adminId,
        reviewedAt: new Date(),
        reviewNote: note,
      })
      .where(eq(orders.id, orderId))
      .returning();
    return result;
  }

  async updateOrder(id: string, data: { screenshotUrl?: string; status?: string }) {
    const [result] = await db
      .update(orders)
      .set(data as any)
      .where(eq(orders.id, id))
      .returning();
    return result;
  }
}

export const orderRepository = new OrderRepository();

