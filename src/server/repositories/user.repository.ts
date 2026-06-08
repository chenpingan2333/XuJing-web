import { db } from "@/db";
import { users } from "@/db/schema/users";
import { eq } from "drizzle-orm";

export class UserRepository {
  async findById(id: string) {
    const rows = await db.select().from(users).where(eq(users.id, id)).limit(1);
    return rows[0] ?? null;
  }

  async findByEmail(email: string) {
    const rows = await db.select().from(users).where(eq(users.email, email)).limit(1);
    return rows[0] ?? null;
  }

  async create(data: typeof users.$inferInsert) {
    const [result] = await db.insert(users).values(data).returning();
    return result;
  }

  async update(id: string, data: Partial<typeof users.$inferInsert>) {
    const [result] = await db
      .update(users)
      .set(data)
      .where(eq(users.id, id))
      .returning();
    return result;
  }

  async updateVip(id: string, vipExpiresAt: Date | null) {
    return this.update(id, { vipExpiresAt } as Partial<typeof users.$inferInsert>);
  }

  async updateStarDiamonds(id: string, starDiamonds: number) {
    return this.update(id, { starDiamonds } as Partial<typeof users.$inferInsert>);
  }

  async ban(id: string) {
    return this.update(id, { status: "BANNED" } as Partial<typeof users.$inferInsert>);
  }

  async unban(id: string) {
    return this.update(id, { status: "ACTIVE" } as Partial<typeof users.$inferInsert>);
  }
}

export const userRepository = new UserRepository();
