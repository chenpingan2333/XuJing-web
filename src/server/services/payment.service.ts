/**
 * PaymentService — 充值订单业务逻辑
 */

import { orderRepository } from "../repositories/order.repository";

interface RechargeOption {
  amountRmb: number;
  starDiamonds: number;
  label: string;
}

const RECHARGE_OPTIONS: RechargeOption[] = [
  { amountRmb: 4.9, starDiamonds: 490, label: "4.9元 = 490星钻" },
  { amountRmb: 9.9, starDiamonds: 990, label: "9.9元 = 990星钻" },
  { amountRmb: 19.9, starDiamonds: 1990, label: "19.9元 = 1990星钻" },
  { amountRmb: 29.9, starDiamonds: 2990, label: "29.9元 = 2990星钻" },
  { amountRmb: 71.9, starDiamonds: 7190, label: "71.9元 = 7190星钻" },
  { amountRmb: 199.9, starDiamonds: 19990, label: "199.9元 = 19990星钻" },
];

export class PaymentService {
  getRechargeOptions(): RechargeOption[] {
    return RECHARGE_OPTIONS;
  }

  async createRechargeOrder(userId: string, amountRmb: number) {
    const option = RECHARGE_OPTIONS.find((o) => o.amountRmb === amountRmb);
    if (!option) throw new Error("Invalid recharge amount");

    return orderRepository.create({
      userId,
      amountRmb: String(amountRmb),
      starDiamonds: option.starDiamonds,
      status: "PENDING_PAYMENT",
    });
  }

  async uploadScreenshot(orderId: string, userId: string, screenshotUrl: string) {
    const order = await orderRepository.findById(orderId);
    if (!order) throw new Error("Order not found");
    if (order.userId !== userId) throw new Error("Unauthorized");
    if (order.status !== "PENDING_PAYMENT") throw new Error("Order status must be PENDING_PAYMENT");

    return orderRepository.updateOrder(orderId, {
      screenshotUrl,
      status: "PENDING_REVIEW",
    });
  }

  async getUserOrders(userId: string) {
    return orderRepository.findByUser(userId);
  }
}

export const paymentService = new PaymentService();