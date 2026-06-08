/**
 * VipService — VIP 购买业务逻辑
 *
 * 事务安全: purchaseVip 使用 db.transaction()
 * 内部直接使用 tx 操作表（是 Service 层唯一使用 Drizzle API 的方法，交易安全优先）
 */

import { db } from "@/db";
import { users } from "@/db/schema/users";
import { vipRecords } from "@/db/schema/vip-records";
import { starDiamondTransactions } from "@/db/schema/star-diamond-transactions";
import { eq } from "drizzle-orm";
import { userRepository } from "../repositories/user.repository";
import { vipRepository } from "../repositories/vip.repository";
import { starDiamondTransactionRepository } from "../repositories/star-diamond-transaction.repository";
import { uuidv7 } from "@/db/helpers";

export interface VipPlan {
  type: "MONTHLY" | "QUARTERLY" | "YEARLY";
  name: string;
  price: number; // 星钻
  firstPurchasePrice: number;
  durationDays: number;
}

const PLANS: VipPlan[] = [
  { type: "MONTHLY", name: "月卡", price: 2990, firstPurchasePrice: 990, durationDays: 30 },
  { type: "QUARTERLY", name: "季卡", price: 7190, firstPurchasePrice: 7190, durationDays: 90 },
  { type: "YEARLY", name: "年卡", price: 19990, firstPurchasePrice: 19990, durationDays: 365 },
];

export class VipService {
  getPlans(): VipPlan[] {
    return PLANS;
  }

  /**
   * 购买 VIP — 事务内原子完成全部操作
   *
   * 步骤:
   *  1. 读取用户余额 + has_purchased_vip
   *  2. 计算实际价格（首次优惠）
   *  3. 检查余额
   *  4. 扣减星钻（基于当前值计算）
   *  5. 写入 VipRecord
   *  6. 写入 StarDiamondTransaction
   *  7. 更新 vip_expires_at + has_purchased_vip
   */
  async purchaseVip(userId: string, planType: "MONTHLY" | "QUARTERLY" | "YEARLY") {
    const plan = PLANS.find((p) => p.type === planType);
    if (!plan) throw new Error("Invalid plan type");

    return db.transaction(async (tx) => {
      // 1. 读取用户（在事务内读，保证一致性）
      const [user] = await tx
        .select({
          starDiamonds: users.starDiamonds,
          hasPurchasedVip: users.hasPurchasedVip,
          vipExpiresAt: users.vipExpiresAt,
        })
        .from(users)
        .where(eq(users.id, userId));

      if (!user) throw new Error("User not found");

      // 2. 计算实际价格
      const isFirstPurchase = !user.hasPurchasedVip;
      const price = isFirstPurchase ? plan.firstPurchasePrice : plan.price;

      // 3. 检查余额
      if (user.starDiamonds < price) {
        throw new Error(`余额不足，需要 ${price} 星钻，当前 ${user.starDiamonds} 星钻`);
      }

      // 4. 计算新余额（基于当前值）
      const newBalance = user.starDiamonds - price;

      // 5. 扣减余额
      await tx
        .update(users)
        .set({ starDiamonds: newBalance })
        .where(eq(users.id, userId));

      // 6. 计算到期时间
      const now = new Date();
      const currentExpiry = user.vipExpiresAt && new Date(user.vipExpiresAt) > now
        ? new Date(user.vipExpiresAt)
        : now;
      const expiresAt = new Date(currentExpiry.getTime() + plan.durationDays * 24 * 60 * 60 * 1000);

      // 7. 写入 VipRecord
      const [vipRecord] = await tx
        .insert(vipRecords)
        .values({
          userId,
          planType: plan.type,
          starDiamondsSpent: price,
          isFirstPurchase: isFirstPurchase,
          activatedAt: now,
          expiresAt,
        })
        .returning();

      // 8. 写入资金流水
      await tx.insert(starDiamondTransactions).values({
        userId,
        amount: BigInt(-price),
        balanceAfter: BigInt(newBalance),
        type: "VIP_PURCHASE",
        referenceId: vipRecord.id,
      } as any);

      // 9. 更新用户 VIP 状态
      await tx
        .update(users)
        .set({
          vipExpiresAt: expiresAt,
          hasPurchasedVip: true,
        })
        .where(eq(users.id, userId));

      return vipRecord;
    });
  }

  /** 获取用户当前 VIP 状态 */
  async getVipStatus(userId: string) {
    const user = await userRepository.findById(userId);
    if (!user) return { isVip: false, expiresAt: null };

    const isVip = !!(user.vipExpiresAt && new Date(user.vipExpiresAt) > new Date());
    return {
      isVip,
      expiresAt: isVip ? user.vipExpiresAt : null,
    };
  }
}

export const vipService = new VipService();