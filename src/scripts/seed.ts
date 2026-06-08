/**
 * 叙境（Xujing）Seed Script
 */

import { db } from "@/db";
import { eq } from "drizzle-orm";
import { users } from "@/db/schema/users";
import { characters } from "@/db/schema/characters";
import { uuidv7 } from "@/db/helpers";

async function seed() {
  // Idempotent guard
  const existing = await db.query.users.findFirst({
    where: eq(users.email, "admin@xujing.local"),
  });
  if (existing) {
    console.log("DB already seeded, skipping.");
    process.exit(0);
  }

  console.log("🌱 开始填充测试数据...\n");

  const adminId = uuidv7();
  const [admin] = await db
    .insert(users)
    .values({
      id: adminId,
      email: "admin@xujing.local",
      nickname: "管理员",
      role: "ADMIN",
      status: "ACTIVE",
      starDiamonds: 999999,
      hasPurchasedVip: false,
    })
    .returning();
  console.log("✅ Admin:", admin!.email);

  const userId = uuidv7();
  const [user] = await db
    .insert(users)
    .values({
      id: userId,
      email: "test@xujing.local",
      nickname: "测试用户",
      role: "USER",
      status: "ACTIVE",
      vipExpiresAt: new Date("2027-06-07"),
      starDiamonds: 5000,
      personaSetting: "你是我的好朋友。",
      hasPurchasedVip: true,
    })
    .returning();
  console.log("✅ Test User (VIP):", user!.email);

  var o1 = await db.insert(characters).values({
    name: "小叙",
    setting: "小叙是一个温柔体贴的邻家女孩，今年22岁，在一家书店工作。她喜欢阅读、烘焙和在下雨天听音乐。",
    greeting: "你好呀~ 今天天气真不错呢！<START>嗯！我刚泡了杯红茶，要来一杯吗？",
    personality: "温柔、体贴、偶尔会害羞、喜欢照顾人",
    scenario: "你们在街角的书店初次相遇。",
    isOfficial: true,
    version: 1,
  }).returning();
  console.log("✅ Official Character:", o1[0]!.name);

  var o2 = await db.insert(characters).values({
    name: "阿境",
    setting: "阿境是一个热爱旅行的自由摄影师，28岁，走遍了大半个中国。他幽默风趣，总能讲出有趣的故事。",
    greeting: "嘿！刚从一个超棒的地方回来~<START>你知道凌晨四点的山顶有多美吗？",
    personality: "幽默、自由、冒险精神、有点小傲娇",
    scenario: "你们在一次旅行团中认识。",
    isOfficial: true,
    version: 1,
  }).returning();
  console.log("✅ Official Character:", o2[0]!.name);

  var c1 = await db.insert(characters).values({
    userId: user!.id,
    name: "我的AI助手",
    setting: "一个全能的AI助手，帮助处理日常事务。",
    greeting: "你好！有什么我可以帮你的吗？",
    isOfficial: false,
    version: 1,
  }).returning();
  console.log("✅ User Character 1:", c1[0]!.name);

  var c2 = await db.insert(characters).values({
    userId: user!.id,
    name: "深夜聊天伙伴",
    setting: "一个喜欢在深夜聊天的神秘网友，总能给你新的视角。",
    greeting: "睡不着吗？我也是。来聊聊吧。",
    personality: "神秘、深刻、善于倾听",
    isOfficial: false,
    version: 1,
  }).returning();
  console.log("✅ User Character 2:", c2[0]!.name);

  var c3 = await db.insert(characters).values({
    userId: user!.id,
    name: "教练角色",
    setting: "你的私人健身教练，督促你坚持运动。",
    greeting: "今天的训练准备好了吗？别偷懒哦！",
    personality: "严格、鼓励、正能量",
    isOfficial: false,
    version: 1,
  }).returning();
  console.log("✅ User Character 3:", c3[0]!.name);

  console.log("\n🎉 数据填充完成！");
  console.log("   Admin: admin@xujing.local");
  console.log("   User:  test@xujing.local (VIP)");
  console.log("   2 Official + 3 User Characters");
  process.exit(0);
}

seed().catch((err) => {
  console.error("❌ Seed 失败:", err);
  process.exit(1);
});

