/**
 * MemoryEngine — Phase 9 LLM-based Memory Extraction
 *
 * 取代 Regex 提取方案，使用大模型从对话中提取结构化记忆。
 * 异步执行，永不阻塞主聊天 SSE 流。
 */

import { messageRepository } from "../repositories/message.repository";
import { memoryRepository } from "../repositories/memory.repository";
import { userRepository } from "../repositories/user.repository";
import type { ChatMessage } from "./provider-gateway";
import { decryptApiKey } from "./crypto";
import type { ApiConfig } from "@/db/schema/api-configs";

// ─── System Prompt ──────────────────────────────────

const MEMORY_EXTRACTOR_PROMPT = `你是一个记忆提取助手。你的任务是从用户与AI角色的对话中，提取关于用户的新事实、偏好和重要事件。

## 提取规则
1. 只提取关于**用户**的信息（第一人称"我"相关），不提取AI角色的信息。
2. 只提取**新增的、持久性的**信息，忽略临时的闲聊内容。
3. 每条记忆用第三人称表述（如"用户喜欢..."、"用户在..."、"用户偏好..."）。
4. 每条记忆不超过40字，简洁准确。
5. 如果对话中没有值得记录的新信息，返回空数组。

## 分类定义
- FACT: 用户的客观信息（身份、经历、技能等）。例："用户在杭州工作"、"用户是程序员"
- PREFERENCE: 用户的主观偏好（喜好、厌恶、习惯等）。例："用户喜欢喝冰美式"、"用户讨厌香菜"
- EVENT: 用户经历或提及的重要事件。例："用户下周要去旅行"、"用户最近换了工作"

## 输出格式
你必须只输出一个合法的JSON对象，放在代码块中：

\`\`\`json
{
  "memories": [
    { "content": "用户喜欢喝冰美式", "category": "PREFERENCE" },
    { "content": "用户在杭州工作", "category": "FACT" }
  ]
}
\`\`\`

如果没有值得提取的记忆，输出：
\`\`\`json
{ "memories": [] }
\`\`\`

现在开始提取。`;

// ─── JSON Schema ────────────────────────────────────

interface ExtractedMemory {
  content: string;
  category: "FACT" | "PREFERENCE" | "EVENT";
}

interface ExtractionResult {
  memories: ExtractedMemory[];
}

// ─── Memory Retriever — Keyword-based retrieval (pre-pgvector) ───

export class MemoryRetriever {
  /**
   * 根据用户当前输入，从记忆中检索最相关的 Top-K。
   * 过渡方案：关键词子串匹配 + importance 排序。
   * Phase 9 后期替换为 pgvector embedding 检索。
   */
  async retrieve(
    characterId: string,
    userId: string,
    userInput: string,
    topK: number,
  ) {
    // 获取该角色下所有记忆（有上限，避免全量加载）
    const all = await memoryRepository.findByCharacter(characterId, userId, 200);

    if (all.length === 0) return [];

    // 从用户输入中提取关键词（中文：2-4 字符滑动窗口）
    const keywords = this._extractKeywords(userInput);

    if (keywords.length === 0) {
      // 无关键词：返回 importance 最高的
      return all.slice(0, topK);
    }

    // 计分：每条记忆匹配到的关键词数 + importance 加权
    const scored = all.map((mem) => {
      let score = 0;
      for (const kw of keywords) {
        if (mem.content.includes(kw)) score += 1;
      }
      // importance 作为次要排序因子
      score += Number(mem.importance ?? "0.50") * 0.1;
      return { memory: mem, score };
    });

    // 按 score DESC, importance DESC 排序
    scored.sort((a, b) => b.score - a.score || Number(b.memory.importance ?? 0) - Number(a.memory.importance ?? 0));

    return scored.slice(0, topK).map((s) => s.memory);
  }

  private _extractKeywords(text: string): string[] {
    const cleaned = text.replace(/[，。！？、\s\n\r"''""【】（）\(\)\[\]{}]/g, "");
    if (cleaned.length < 2) return [];
    const keywords = new Set<string>();
    // 2-char windows
    for (let i = 0; i < cleaned.length - 1; i++) {
      keywords.add(cleaned.substring(i, i + 2));
    }
    // 3-char windows
    for (let i = 0; i < cleaned.length - 2; i++) {
      keywords.add(cleaned.substring(i, i + 3));
    }
    return [...keywords];
  }
}

export const memoryRetriever = new MemoryRetriever();

// ─── Engine ─────────────────────────────────────────

export class MemoryEngine {
  /**
   * 从最近对话中异步提取记忆。
   *
   * @param characterId - 角色 ID
   * @param userId - 用户 ID
   * @param messageCount - 用于提取的最近消息数量（默认 20）
   */
  async extractAndPersist(
    characterId: string,
    userId: string,
    messageCount = 20,
  ): Promise<void> {
    try {
      // 1. 获取最近消息
      const recentMessages = await messageRepository.findHistory(
        characterId,
        userId,
        messageCount,
      );

      if (recentMessages.length < 4) return; // 消息太少，跳过

      const reversed = [...recentMessages].reverse();

      // 2. 构建提取请求的对话文本
      const conversationText = reversed
        .map((m) => `${m.role === "USER" ? "用户" : "AI"}: ${m.content}`)
        .join("\n");

      // 3. 获取 API 配置（优先平台模型，fallback 到用户自备 Key）
      let apiUrl = process.env.PLATFORM_API_URL ?? "https://api.deepseek.com";
      let apiKey = process.env.PLATFORM_API_KEY ?? "";
      let modelId = process.env.PLATFORM_MODEL_ID ?? "deepseek-chat";

      if (!apiKey && fallbackConfig) {
        apiKey = await decryptApiKey(fallbackConfig.apiKeyEncrypted);
        apiUrl = fallbackConfig.apiUrl;
        modelId = fallbackConfig.modelId;
      }
      if (!apiKey) return; // 无可用 API Key，静默跳过

      // 4. 调用大模型（非流式，15s 超时，低成本模型）
      const extractionMessages: ChatMessage[] = [
        { role: "user", content: conversationText },
      ];

      const responseText = await this._callNonStreaming(
        apiUrl,
        apiKey,
        "DEEPSEEK",
        modelId,
        extractionMessages,
        MEMORY_EXTRACTOR_PROMPT,
      );

      if (!responseText) return;

      // 5. 解析 JSON
      const extracted = this._parseResponse(responseText);
      if (!extracted || extracted.memories.length === 0) return;

      // 6. 去重：过滤已有记忆
      const existing = await memoryRepository.findByCharacter(characterId, userId, 200);
      const existingContents = new Set(existing.map((m) => m.content));

      const newMemories = extracted.memories.filter(
        (mem) => !existingContents.has(mem.content) && mem.content.length >= 4,
      );

      if (newMemories.length === 0) return;

      // 7. 容量管理
      const user = await userRepository.findById(userId);
      const isVip = user?.vipExpiresAt && new Date(user.vipExpiresAt) > new Date();
      const maxCapacity = isVip ? 10000 : 100;

      // 8. 持久化
      for (const mem of newMemories) {
        const currentCount = await memoryRepository.countByCharacter(characterId, userId);
        if (currentCount >= maxCapacity) {
          await memoryRepository.evictLowest(characterId, userId, maxCapacity);
        }
        await memoryRepository.create({
          characterId,
          userId,
          content: mem.content,
          category: mem.category,
          importance: mem.category === "EVENT" ? "0.70" : "0.50",
          referenceIds: [],
        });
      }
    } catch {
      // 静默失败：记忆提取失败不阻塞任何流程
    }
  }

  // ─── Private helpers ─────────────────────────────

  private async _callNonStreaming(
    apiUrl: string,
    apiKey: string,
    platform: string,
    modelId: string,
    messages: ChatMessage[],
    systemPrompt: string,
  ): Promise<string> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    try {
      let url = apiUrl;
      if (!url.endsWith("/chat/completions")) {
        url = url.replace(/\/+$/, "") + "/chat/completions";
      }

      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: modelId,
          messages: [
            { role: "system", content: systemPrompt },
            ...messages,
          ],
          max_tokens: 512,
          temperature: 0.3,
          stream: false,
        }),
        signal: controller.signal,
      });

      if (!res.ok) return "";

      const json = await res.json();
      return json.choices?.[0]?.message?.content ?? "";
    } catch {
      return "";
    } finally {
      clearTimeout(timeout);
    }
  }

  private _parseResponse(text: string): ExtractionResult | null {
    try {
      // 尝试从 markdown 代码块中提取 JSON
      const codeBlock = text.match(/```(?:json)?\s*([\s\S]*?)```/);
      const jsonStr = codeBlock ? codeBlock[1].trim() : text.trim();

      const parsed = JSON.parse(jsonStr);

      // 校验结构
      if (!parsed || !Array.isArray(parsed.memories)) return null;

      const validCategories = new Set(["FACT", "PREFERENCE", "EVENT"]);
      const memories: ExtractedMemory[] = [];

      for (const item of parsed.memories) {
        if (
          typeof item.content === "string" &&
          item.content.length >= 2 &&
          typeof item.category === "string" &&
          validCategories.has(item.category)
        ) {
          memories.push({
            content: item.content.slice(0, 200), // 截断过长内容
            category: item.category as "FACT" | "PREFERENCE" | "EVENT",
          });
        }
      }

      return { memories };
    } catch {
      return null;
    }
  }
}

export const memoryEngine = new MemoryEngine();