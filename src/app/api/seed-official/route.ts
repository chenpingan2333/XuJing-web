import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { characters } from "@/db/schema/characters";
import { eq, and, isNull } from "drizzle-orm";
import officialCharacters from "@/server/data/official-characters.json";

export async function GET(_req: NextRequest) {
  const results: string[] = [];

  for (const t of officialCharacters) {
    // Check if global official already exists
    const existing = await db.select({ id: characters.id })
      .from(characters)
      .where(and(eq(characters.isOfficial, true), isNull(characters.userId), eq(characters.name, t.name)))
      .limit(1);

    if (existing.length > 0) {
      results.push("EXISTS: " + t.name);
      continue;
    }

    await db.insert(characters).values({
      name: t.name,
      setting: t.setting,
      greeting: t.greeting,
      avatarUrl: t.avatar || null,
      personality: (t.advanced_definitions as any)?.personality || null,
      scenario: (t.advanced_definitions as any)?.scenario || null,
      dialogueExamples: (t.advanced_definitions as any)?.dialogueExamples || null,
      nickname: (t.extended_fields as any)?.nickname || null,
      groupGreeting: (t.extended_fields as any)?.groupGreeting || null,
      mainPrompt: (t.system_instructions as any)?.mainPrompt || null,
      postHistoryInstructions: (t.system_instructions as any)?.postHistoryInstructions || null,
      isOfficial: true,
      version: 1,
    } as any);

    results.push("CREATED: " + t.name);
  }

  // Verify
  const all = await db.select({ name: characters.name, id: characters.id, userId: characters.userId })
    .from(characters)
    .where(eq(characters.isOfficial, true));
  const summary = all.map(c => c.name + " userId=" + (c.userId ?? "NULL")).join("\n");

  return NextResponse.json({ results, summary });
}
