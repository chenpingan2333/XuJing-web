import { db } from "@/db";
import { apiConfigs } from "@/db/schema/api-configs";
import { eq, and } from "drizzle-orm";
import { assetService } from "@/services/AssetService";

export class ApiConfigRepository {
  async findById(id: string) {
    const [r] = await db.select().from(apiConfigs).where(eq(apiConfigs.id, id)).limit(1);
    return r ?? null;
  }

  async findByUser(userId: string) {
    return db.select().from(apiConfigs).where(eq(apiConfigs.userId, userId));
  }

  async findDefault(userId: string) {
    const [r] = await db.select().from(apiConfigs).where(and(eq(apiConfigs.userId, userId), eq(apiConfigs.isDefault, true))).limit(1);
    return r ?? null;
  }

  async create(data: typeof apiConfigs.$inferInsert) {
    const [result] = await db.insert(apiConfigs).values(data).returning();
    return result;
  }

  async update(id: string, data: Partial<typeof apiConfigs.$inferInsert>) {
    const [result] = await db
      .update(apiConfigs)
      .set(data)
      .where(eq(apiConfigs.id, id))
      .returning();
    return result;
  }

  /**
   * 设置默认配置 — 事务内原子完成：
   *  1. 清除当前用户全部 is_default
   *  2. 设置目标配置 is_default = true
   * 防止并发下出现 0 个或多个默认配置。
   */
  async setDefault(userId: string, configId: string) {
    return db.transaction(async (tx) => {
      await tx
        .update(apiConfigs)
        .set({ isDefault: false })
        .where(eq(apiConfigs.userId, userId));

      const [result] = await tx
        .update(apiConfigs)
        .set({ isDefault: true })
        .where(eq(apiConfigs.id, configId))
        .returning();

      return result;
    });
  }

  /**
   * 查询当前激活的配置（is_active = true）。
   */
  async findActive(userId: string) {
    const [r] = await db.select().from(apiConfigs).where(
      and(eq(apiConfigs.userId, userId), eq(apiConfigs.isActive, true))
    ).limit(1);
    return r ?? null;
  }

  /**
   * 设置激活配置 — 事务内原子完成：
   *  1. 清除当前用户全部 is_active
   *  2. 设置目标配置 is_active = true
   */
  async setActive(userId: string, configId: string) {
    return db.transaction(async (tx) => {
      await tx
        .update(apiConfigs)
        .set({ isActive: false })
        .where(eq(apiConfigs.userId, userId));

      const [result] = await tx
        .update(apiConfigs)
        .set({ isActive: true, isDefault: true })
        .where(eq(apiConfigs.id, configId))
        .returning();

      return result;
    });
  }
  /**
   * 停用当前用户全部自配 API Key——切回平台专属模型。
   */
  async deactivateAll(userId: string) {
    await db.update(apiConfigs).set({ isActive: false }).where(eq(apiConfigs.userId, userId));
  }

  async delete(id: string, options: { actorId?: string; actorIp?: string; actorUa?: string; requestMethod?: string; requestPath?: string; reason?: string } = {}) {
    const result = await assetService.softDeleteApiConfig(id, options);
    if (!result.success) {
      throw new Error(result.error ?? "Failed to soft delete api config");
    }
    return result;
  }
}

export const apiConfigRepository = new ApiConfigRepository();