import { db } from "@/db";
import { characterComments } from "@/db/schema/character-comments";
import { characters } from "@/db/schema/characters";
import { users } from "@/db/schema/users";
import { eq, and, isNull, desc, sql } from "drizzle-orm";

export interface CommentWithUser {
  id: string;
  content: string;
  likes: number;
  createdAt: Date;
  user: {
    id: string;
    nickname: string;
    avatarUrl: string | null;
  };
}

export class CommentRepository {
  async findByCharacter(characterId: string, page = 1, pageSize = 20) {
    const offset = (page - 1) * pageSize;

    const rows = await db
      .select({
        id: characterComments.id,
        content: characterComments.content,
        likes: characterComments.likes,
        createdAt: characterComments.createdAt,
        userId: users.id,
        userNickname: users.nickname,
        userAvatarUrl: users.avatarUrl,
      })
      .from(characterComments)
      .leftJoin(users, eq(characterComments.userId, users.id))
      .where(
        and(
          eq(characterComments.characterId, characterId),
          isNull(characterComments.deletedAt)
        )
      )
      .orderBy(desc(characterComments.createdAt))
      .limit(pageSize)
      .offset(offset);

    return rows.map((row) => ({
      id: row.id,
      content: row.content,
      likes: row.likes,
      createdAt: row.createdAt,
      user: {
        id: row.userId ?? "",
        nickname: row.userNickname ?? "匿名用户",
        avatarUrl: row.userAvatarUrl,
      },
    }));
  }

  async countByCharacter(characterId: string) {
    const result = await db
      .select({ count: sql<number>`count(*)` })
      .from(characterComments)
      .where(
        and(
          eq(characterComments.characterId, characterId),
          isNull(characterComments.deletedAt)
        )
      );
    return Number(result[0]?.count ?? 0);
  }

  async create(data: typeof characterComments.$inferInsert) {
    const [result] = await db
      .insert(characterComments)
      .values(data)
      .returning();
    return result;
  }

  async findById(id: string) {
    const [r] = await db
      .select()
      .from(characterComments)
      .where(eq(characterComments.id, id))
      .limit(1);
    return r ?? null;
  }

  /** 软删除评论 */
  async softDelete(id: string) {
    const [result] = await db
      .update(characterComments)
      .set({ deletedAt: new Date() })
      .where(eq(characterComments.id, id))
      .returning();
    return result ?? null;
  }

  /** 获取评论所属角色的创作者ID */
  async getCharacterOwnerId(commentId: string): Promise<string | null> {
    const rows = await db
      .select({ userId: characters.userId })
      .from(characterComments)
      .innerJoin(characters, eq(characterComments.characterId, characters.id))
      .where(eq(characterComments.id, commentId))
      .limit(1);
    return rows[0]?.userId ?? null;
  }
}

export const commentRepository = new CommentRepository();
