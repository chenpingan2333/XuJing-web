import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "@/db";
import { users } from "@/db/schema/users";
import { sql } from "drizzle-orm";

export async function GET(_req: NextRequest) {
  const accounts = [
    { email: "3471066141@qq.com", password: "20060217abc", uid: 2 },
    { email: "3580353344@qq.com", password: "roycheung0270", uid: 3 },
  ];

  const results: string[] = [];

  for (const acct of accounts) {
    const existing = await db.select({ uid: users.uid }).from(users).where(sql`${users.email} = ${acct.email}`).limit(1);
    if (existing.length > 0) {
      results.push(`SKIP: ${acct.email} already exists (uid=${existing[0].uid})`);
      continue;
    }

    const hash = await bcrypt.hash(acct.password, 12);
    await db.insert(users).values({
      email: acct.email,
      passwordHash: hash,
      uid: acct.uid,
      role: "USER",
      status: "ACTIVE",
      starDiamonds: 0,
      hasPurchasedVip: false,
    } as any);

    results.push(`CREATED: ${acct.email} (uid=${acct.uid}, pwd=${acct.password})`);
  }

  // Reset sequence
  await db.execute(sql`SELECT setval('users_uid_seq', GREATEST(${accounts[1].uid}, (SELECT COALESCE(MAX(uid), 0) FROM users)))`);

  // Verify
  const all = await db.select({ uid: users.uid, email: users.email, role: users.role }).from(users).orderBy(users.uid);
  const summary = all.map(u => `uid=${u.uid} ${u.email} ${u.role}`).join("\n");

  return NextResponse.json({ results, allUsers: summary });
}
