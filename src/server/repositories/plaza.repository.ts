import { db } from "@/db";
import { characters } from "@/db/schema/characters";
import { users } from "@/db/schema/users";
import { conversations } from "@/db/schema/conversations";
import { eq, and, isNull, desc, sql, count, inArray } from "drizzle-orm";

export interface PlazaCharacter {
  id: string;
  name: string;
  avatarUrl: string | null;
  backgroundUrl: string | null;
  oneLineIntro: string | null;
  setting: string;
  greeting: string;
  personality: string | null;
  isOfficial: boolean;
  fakeChats: number;
  fakeLikes: number;
  createdAt: Date;
  creator: {
    id: string;
    nickname: string;
    avatarUrl: string | null;
  };
  stats: {
    realChats: number;
    realLikes: number;
    comments: number;
  };
  isFollowed: boolean;
}

export interface CreatorGroup {
  creator: {
    id: string;
    nickname: string;
    avatarUrl: string | null;
  };
  characters: PlazaCharacter[];
}

export class PlazaRepository {
  /**
   * 查询广场公开角色列表
   * @param userId 当前用户ID（用于判断关注关系）
   * @param page 页码（从1开始）
   * @param pageSize 每页数量
   * @param followingIds 用户关注的创作者ID列表（用于置顶排序）
   */
  async findPublicCharacters(
    userId: string | null,
    page = 1,
    pageSize = 20,
    followingIds: string[] = []
  ): Promise<{ items: PlazaCharacter[]; total: number }> {
    const offset = (page - 1) * pageSize;

    // 基础查询条件：公开 + 未删除
    const baseWhere = and(
      eq(characters.isPublic, true),
      isNull(characters.deletedAt)
    );

    // 获取总数
    const countResult = await db
      .select({ total: sql<number>`count(*)` })
      .from(characters)
      .where(baseWhere);
    const total = Number(countResult[0]?.total ?? 0);

    // 获取角色列表（带创作者信息和统计）
    // realChats: 使用原生 SQL 子查询避免 drizzle 构建复杂 JOIN
    // comments: 使用 to_regclass 检查 character_comments 表是否存在，不存在则返回 0
    const rows = await db
      .select({
        id: characters.id,
        name: characters.name,
        avatarUrl: characters.avatarUrl,
        backgroundUrl: characters.backgroundUrl,
        oneLineIntro: characters.oneLineIntro,
        setting: characters.setting,
        greeting: characters.greeting,
        personality: characters.personality,
        isOfficial: characters.isOfficial,
        fakeChats: characters.fakeChats,
        fakeLikes: characters.fakeLikes,
        createdAt: characters.createdAt,
        creatorId: users.id,
        creatorNickname: users.nickname,
        creatorAvatarUrl: users.avatarUrl,
        // 统计子查询 - 使用原生 SQL
        realChats: sql<number>`COALESCE((SELECT count(*) FROM conversations WHERE conversations.character_id = ${characters.id} AND conversations.deleted_at IS NULL), 0)`,
        comments: sql<number>`COALESCE((SELECT CASE WHEN to_regclass('character_comments') IS NOT NULL THEN (SELECT count(*) FROM character_comments WHERE character_comments.character_id = ${characters.id} AND character_comments.deleted_at IS NULL) ELSE 0 END), 0)`,
      })
      .from(characters)
      .leftJoin(users, eq(characters.userId, users.id))
      .where(baseWhere)
      .orderBy(
        // 关注者优先置顶
        followingIds.length > 0
          ? sql`CASE WHEN ${characters.userId} IN (${sql.join(followingIds.map(id => sql`${id}`))}) THEN 0 ELSE 1 END`
          : sql`1`,
        desc(characters.fakeLikes),
        desc(characters.createdAt)
      )
      .limit(pageSize)
      .offset(offset);

    // 查询当前用户是否关注了每个角色的创作者
    // 使用原生 SQL + try-catch 降级，因为 user_follows 表可能不存在
    let followedSet = new Set<string>();
    if (userId && rows.length > 0) {
      const creatorIds = rows
        .filter(r => r.creatorId)
        .map(r => r.creatorId!);
      
      if (creatorIds.length > 0) {
        try {
          const followRows = await db.execute(sql`
            SELECT following_id FROM user_follows
            WHERE follower_id = ${userId}
              AND following_id IN (${sql.join(creatorIds.map(id => sql`${id}`))})
          `);
          followedSet = new Set(followRows.map((r: any) => r.following_id));
        } catch (e) {
          // user_follows 表不存在时降级：所有角色均不置顶
          console.warn("[plaza] user_follows query failed, skipping follow status:", (e as Error).message);
        }
      }
    }

    const items: PlazaCharacter[] = rows.map((row) => ({
      id: row.id,
      name: row.name,
      avatarUrl: row.avatarUrl,
      backgroundUrl: row.backgroundUrl,
      oneLineIntro: row.oneLineIntro,
      setting: row.setting,
      greeting: row.greeting,
      personality: row.personality,
      isOfficial: row.isOfficial,
      fakeChats: row.fakeChats,
      fakeLikes: row.fakeLikes,
      createdAt: row.createdAt,
      creator: {
        id: row.creatorId ?? "",
        nickname: row.creatorNickname ?? "匿名创作者",
        avatarUrl: row.creatorAvatarUrl,
      },
      stats: {
        realChats: Number(row.realChats ?? 0),
        realLikes: 0, // 预留：后续接入真实点赞表
        comments: Number(row.comments ?? 0),
      },
      isFollowed: row.creatorId ? followedSet.has(row.creatorId) : false,
    }));

    return { items, total };
  }

  /**
   * 按创作者分组聚合公开角色
   * @param page 页码
   * @param pageSize 每页创作者数量
   */
  async findCreatorsWithCharacters(
    page = 1,
    pageSize = 10
  ): Promise<{ items: CreatorGroup[]; total: number }> {
    const offset = (page - 1) * pageSize;

    // 获取有公开角色的创作者列表
    const creatorRows = await db
      .select({
        creatorId: users.id,
        creatorNickname: users.nickname,
        creatorAvatarUrl: users.avatarUrl,
        characterCount: sql<number>`count(${characters.id})`,
      })
      .from(users)
      .innerJoin(characters, eq(users.id, characters.userId))
      .where(
        and(
          eq(characters.isPublic, true),
          isNull(characters.deletedAt)
        )
      )
      .groupBy(users.id, users.nickname, users.avatarUrl)
      .orderBy(desc(sql`count(${characters.id})`))
      .limit(pageSize)
      .offset(offset);

    // 获取总数
    const countResult = await db
      .select({ total: sql<number>`count(DISTINCT ${users.id})` })
      .from(users)
      .innerJoin(characters, eq(users.id, characters.userId))
      .where(
        and(
          eq(characters.isPublic, true),
          isNull(characters.deletedAt)
        )
      );
    const total = Number(countResult[0]?.total ?? 0);

    // 为每个创作者获取其公开角色
    const items: CreatorGroup[] = [];
    for (const creator of creatorRows) {
      const charRows = await db
        .select({
          id: characters.id,
          name: characters.name,
          avatarUrl: characters.avatarUrl,
          backgroundUrl: characters.backgroundUrl,
          oneLineIntro: characters.oneLineIntro,
          setting: characters.setting,
          greeting: characters.greeting,
          personality: characters.personality,
          isOfficial: characters.isOfficial,
          fakeChats: characters.fakeChats,
          fakeLikes: characters.fakeLikes,
          createdAt: characters.createdAt,
        })
        .from(characters)
        .where(
          and(
            eq(characters.userId, creator.creatorId),
            eq(characters.isPublic, true),
            isNull(characters.deletedAt)
          )
        )
        .orderBy(desc(characters.fakeLikes), desc(characters.createdAt));

      const charactersList: PlazaCharacter[] = charRows.map((row) => ({
        id: row.id,
        name: row.name,
        avatarUrl: row.avatarUrl,
        backgroundUrl: row.backgroundUrl,
        oneLineIntro: row.oneLineIntro,
        setting: row.setting,
        greeting: row.greeting,
        personality: row.personality,
        isOfficial: row.isOfficial,
        fakeChats: row.fakeChats,
        fakeLikes: row.fakeLikes,
        createdAt: row.createdAt,
        creator: {
          id: creator.creatorId,
          nickname: creator.creatorNickname ?? "匿名创作者",
          avatarUrl: creator.creatorAvatarUrl,
        },
        stats: {
          realChats: 0,
          realLikes: 0,
          comments: 0,
        },
        isFollowed: false,
      }));

      items.push({
        creator: {
          id: creator.creatorId,
          nickname: creator.creatorNickname ?? "匿名创作者",
          avatarUrl: creator.creatorAvatarUrl,
        },
        characters: charactersList,
      });
    }

    return { items, total };
  }

  /**
   * 获取用户关注的创作者ID列表
   * 使用原生 SQL + try-catch 降级，因为 user_follows 表可能不存在
   */
  async getFollowingIds(userId: string): Promise<string[]> {
    try {
      const rows = await db.execute(sql`
        SELECT following_id FROM user_follows
        WHERE follower_id = ${userId}
      `);
      return rows.map((r: any) => r.following_id);
    } catch (e) {
      // user_follows 表不存在时降级：返回空列表
      console.warn("[plaza] getFollowingIds failed, returning empty:", (e as Error).message);
      return [];
    }
  }
}

export const plazaRepository = new PlazaRepository();
