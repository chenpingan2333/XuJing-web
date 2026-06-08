/**
 * MemoryService — 记忆管理（MVP：关键词匹配）
 *
 * 禁止: embedding、AI 提取、pgvector
 */

import { memoryRepository } from "../repositories/memory.repository";

export class MemoryService {
  /**
   * 从用户消息提取关键事实（纯关键词匹配）
   */
  extractFacts(messages: { role: string; content: string }[]): string[] {
    const facts: string[] = [];
    const patterns: [RegExp, string][] = [
      [/我是(.+?)[，。！？\n]|我是(.+?)$/g, ""],
      [/我喜欢(.+?)[，。！？\n]|我喜欢(.+?)$/g, ""],
      [/我在(.+?)[，。！？\n]|我在(.+?)$/g, ""],
      [/我住在(.+?)[，。！？\n]|我住在(.+?)$/g, ""],
      [/我叫(.+?)[，。！？\n]|我叫(.+?)$/g, ""],
      [/我的(.+?)是(.+?)[，。！？\n]|我的(.+?)是(.+?)$/g, ""],
    ];

    for (const msg of messages) {
      if (msg.role !== "USER") continue;
      for (const [pattern] of patterns) {
        let match;
        const regex = new RegExp(pattern.source, "g");
        while ((match = regex.exec(msg.content)) !== null) {
          const fact = match[0].replace(/[，。！？\n]$/, "").trim();
          if (fact.length > 3 && fact.length < 100) {
            facts.push(fact);
          }
        }
      }
    }

    return [...new Set(facts)]; // 去重
  }

  /**
   * 批量保存记忆（含去重和淘汰）
   */
  async saveMemories(
    characterId: string,
    userId: string,
    facts: string[],
    maxCapacity: number
  ): Promise<void> {
    const existing = await memoryRepository.findByCharacter(characterId, userId, 500);
    const existingContents = existing.map((m) => m.content);

    // 去重：新事实不与已有记忆重复
    const newFacts = facts.filter(
      (f) => !existingContents.some((e) => e.includes(f) || f.includes(e))
    );

    for (const fact of newFacts) {
      const currentCount = await memoryRepository.countByCharacter(characterId, userId);
      if (currentCount >= maxCapacity) {
        await memoryRepository.evictLowest(characterId, userId, maxCapacity);
      }
      await memoryRepository.create({
        characterId,
        userId,
        content: fact,
        importance: "0.50",
      });
    }
  }

  /** Top-N 记忆 */
  async getMemories(characterId: string, userId: string, limit = 10) {
    return memoryRepository.findByCharacter(characterId, userId, limit);
  }

  /** 淘汰最低权重记忆 */
  async evictMemories(characterId: string, userId: string, keepCount: number) {
    return memoryRepository.evictLowest(characterId, userId, keepCount);
  }
}

export const memoryService = new MemoryService();