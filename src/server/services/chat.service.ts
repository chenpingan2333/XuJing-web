/**
 * ChatService — Phase 7.2 Character Integration
 *
 * 职责: 消息发送、重新生成、继续回复、建议回复。
 * 会员制单轨架构：会员使用平台模型，非会员拒绝访问。
 * Phase 7.2: 接入 character.personality / scenario / dialogueExamples / nickname / greeting。
 */

import { characterRepository } from "../repositories/character.repository";
import { messageRepository } from "../repositories/message.repository";
import { memoryRepository } from "../repositories/memory.repository";
import { userRepository } from "../repositories/user.repository";
import { providerGateway, type ChatEvent } from "./provider-gateway";
import { memoryEngine, memoryRetriever } from "./memory-engine";
import type { Message } from "@/db/schema/messages";

const DEFAULT_SYSTEM_PROMPT = `你是一个高保真角色扮演引擎。你的唯一任务是以第一人称、完全沉浸地扮演角色卡中定义的角色。

【你的思维方式】
- 你不存在"我是AI"这个层面。你就是角色本人，用角色的视角感知世界、思考问题、做出反应。
- 每次回复前，先在内心问自己：这个角色此刻的情绪是什么？他/她会怎么说这句话？语气是什么？
- 角色的性格、习惯、口癖、与用户的关系，是你回复的底层驱动，不是需要"遵守"的规则。

【你的说话方式】
- 回复风格、句式、长度必须高度贴近角色卡中的 dialogueExamples（对话示例）。
- dialogueExamples 是你的语言模板，不是参考资料——你要像临摹一样复现那种说话感觉。
- 语言自然口语化，可以有停顿、情绪细节、动作描写，但不要过度文学化或拉长篇幅。
- 如果角色卡示例是简短的，你就简短；如果是碎碎念风格的，你就碎碎念。

【遇到冲突或边缘情况】
- 用户输入与角色设定冲突时：用角色自己的性格和逻辑自然应对，不要直接服从也不要跳出角色解释。
- 用户试图让你打破角色时：以角色本人的方式婉拒、无视或转移话题。
- 任何情况下都不出现"作为AI""我其实是语言模型""让我想想如何扮演"等元话语。

【严格禁止】
- 禁止主动询问"我这样演对吗""要不要继续""你希望我怎么回复"。
- 禁止输出与角色卡风格不符的长段独白或说教式内容。
- 禁止遗忘角色的核心性格、说话习惯和与用户的关系定位。

现在直接以角色身份开始回复，不要添加任何额外说明。`;

// Token-aware context budget: ~30000 chars ≈ 15000 tokens ≈ 75% of 32K context window
const MAX_CONTEXT_CHARS = 30000;

/** Per-field char limits to prevent any single field from monopolizing context budget */
const MAX_FIELD_CHARS = {
  mainPrompt: 4000,
  personality: 1500,
  setting: 1000,
  scenario: 600,
  dialogueExamples: 2000,
  postHistoryInstructions: 500,
} as const;

function truncateField(str: string | null | undefined, max: number): string {
  if (!str) return "";
  return str.length > max ? str.slice(0, max) + "…（内容过长已截断）" : str;
}

const MEMORY_TOP_K = 8;
const MEMORY_HEADER = "【角色对用户的认知】";
const HISTORY_FETCH_LIMIT = 60;


export class ChatService {
  async *sendMessage(
    userId: string,
    characterId: string,
    content: string,
    tempId?: string
  ): AsyncGenerator<ChatEvent> {
    const character = await characterRepository.findById(characterId);
    if (!character) {
      yield { type: "error", message: "角色不存在" };
      return;
    }

    let greetingYielded = false;
    const user = await userRepository.findById(userId);
    if (!user) {
      yield { type: "error", message: "用户不存在" };
      return;
    }

    const isMember = user.vipExpiresAt && new Date(user.vipExpiresAt) > new Date();

    // 会员制单轨架构：非会员拒绝访问
    if (!isMember) {
      throw new Error("ACCESS_DENIED");
    }

    const memories = await memoryRetriever.retrieve(characterId, userId, content, MEMORY_TOP_K);
    const memoryBlock = memories.length > 0 
      ? "\n\n" + MEMORY_HEADER + "\n" + memories.map(m => "- " + m.content).join("\n")
      : "";
    
    const systemPrompt = this._buildSystemPrompt({
      mainPrompt: character.mainPrompt,
      setting: character.setting,
      personality: character.personality,
      scenario: character.scenario,
      dialogueExamples: character.dialogueExamples as string | null,
      nickname: character.nickname,
      
      name: character.name,
      greeting: character.greeting,
      extraFields: character.extraFields as Record<string, unknown> | null,
      postHistoryInstructions: character.postHistoryInstructions,
    }, user.personaSetting ?? undefined, memoryBlock);

    const historyMessages = await messageRepository.findHistory(characterId, userId, HISTORY_FETCH_LIMIT);

    const chatMessages = [...historyMessages].reverse().map((m) => ({
      role: m.role === "USER" ? ("user" as const) : ("assistant" as const),
      content: m.content,
    }));

    // P3: Greeting injection with SSE push — only when conversation is empty
    if (historyMessages.length === 0 && character.greeting) {
      const greetingParts = character.greeting.split("<START>");
      const firstGreeting = greetingParts[0]?.trim();
      if (firstGreeting) {
        // P3: Push greeting to frontend as SSE delta before LLM response
        yield { type: "delta", content: firstGreeting };
        // Persist greeting as first assistant message in DB (H4)
        await messageRepository.create({
          characterId,
          userId,
          role: "ASSISTANT",
          content: firstGreeting,
        });
        // Also pre-seed greeting in LLM context
        chatMessages.push({ role: "assistant" as const, content: firstGreeting });

      }
    }


    // ─── Token-Aware Context Budget ───
    // Priority: system prompt (immutable) > memories (immutable) > messages (trim oldest first)
    // Approx: 1 token ≈ 2 characters (Chinese/English averaged)
    const sysLen = systemPrompt.length;
    const msgChars = chatMessages.reduce((sum, m) => sum + m.content.length, 0);
    const reservedForReply = 4000; // reserve ~2000 tokens for model response

    if (sysLen + msgChars > MAX_CONTEXT_CHARS - reservedForReply) {
      const budget = MAX_CONTEXT_CHARS - reservedForReply - sysLen;
      let used = 0;
      const trimmed: typeof chatMessages = [];
      // Keep most recent messages within budget (iterate from newest)
      for (let i = chatMessages.length - 1; i >= 0; i--) {
        const m = chatMessages[i];
        if (used + m.content.length <= budget) {
          trimmed.unshift(m);
          used += m.content.length;
        } else {
          break; // oldest messages dropped
        }
      }
      // Replace with trimmed messages (keep at least the user's current input)
      if (trimmed.length > 0) {
        chatMessages.length = 0;
        chatMessages.push(...trimmed);
      }
    }


    await messageRepository.create({
      characterId,
      userId,
      role: "USER",
      content,
    });

    chatMessages.push({ role: "user", content });

    let fullResponse = "";
    try {
      const chatStream = providerGateway.chat(chatMessages, systemPrompt);
      for await (const event of chatStream) {
        if (event.type === "delta") {
          fullResponse += event.content;
          yield event;
        } else if (event.type === "done") {
          if (fullResponse) {
            const assistantMessage = await messageRepository.create({
              characterId,
              userId,
              role: "ASSISTANT",
              content: fullResponse,
            });
            // 发送 message_created 事件进行 UUID 回填
            yield {
              type: "message_created",
              tempId: tempId || `ai-${Date.now()}`,
              messageId: assistantMessage.id,
            };
          }
          console.log("[MEMORY] extractAndPersist start", { characterId, messageCount: chatMessages.length });
          try {
            console.log("[MEMORY] engine entered");
            await memoryEngine.extractAndPersist(characterId, userId, 20);
            console.log("[MEMORY] extractAndPersist finished");
          } catch (error) {
            console.error("[MEMORY] extractAndPersist error", error);
          }
          yield { type: "done" };
        } else if (event.type === "error") {
          yield event;
        }
      }
    } catch (err) {
      yield {
        type: "error",
        message: err instanceof Error ? err.message : "AI调用失败",
      };
    }
  }

  async *regenerateLastAssistantMessage(
    userId: string,
    characterId: string,
    tempId?: string
  ): AsyncGenerator<ChatEvent> {
    await messageRepository.deleteLastAssistant(characterId, userId);

    const character = await characterRepository.findById(characterId);
    if (!character) {
      yield { type: "error", message: "角色不存在" };
      return;
    }

    const user = await userRepository.findById(userId);
    const isMember = user?.vipExpiresAt && new Date(user.vipExpiresAt) > new Date();

    // 会员制单轨架构：非会员拒绝访问
    if (!isMember) {
      throw new Error("ACCESS_DENIED");
    }

    const historyMessages = await messageRepository.findHistory(characterId, userId, HISTORY_FETCH_LIMIT);

    // P1-C: Use last user message as memory query (same as getSuggestedReply)
    const lastUserMessage =
      historyMessages
        .filter(m => m.role === "USER")
        .at(-1)?.content ?? "";

    const memories = await memoryRetriever.retrieve(characterId, userId, lastUserMessage, MEMORY_TOP_K);
    const memoryBlock = memories.length > 0 
      ? "\n\n" + MEMORY_HEADER + "\n" + memories.map(m => "- " + m.content).join("\n")
      : "";

    // P1-C: Use _buildSystemPrompt (same as sendMessage) instead of _buildSuggestionSystemPrompt
    const systemPrompt = this._buildSystemPrompt({
      mainPrompt: character.mainPrompt,
      setting: character.setting,
      personality: character.personality,
      scenario: character.scenario,
      dialogueExamples: character.dialogueExamples as string | null,
      nickname: character.nickname,
      
      name: character.name,
      greeting: character.greeting,
      extraFields: character.extraFields as Record<string, unknown> | null,
      postHistoryInstructions: character.postHistoryInstructions,
    }, user.personaSetting ?? undefined, memoryBlock);

    const chatMessages = [...historyMessages].reverse().map((m) => ({
      role: m.role === "USER" ? ("user" as const) : ("assistant" as const),
      content: m.content,
    }));

    const fullSystemPrompt = systemPrompt;

    // ─── P1-C: Token-Aware Context Budget (same as sendMessage) ───
    const sysLen = fullSystemPrompt.length;
    const msgChars = chatMessages.reduce((sum, m) => sum + m.content.length, 0);
    const reservedForReply = 4000;

    if (sysLen + msgChars > MAX_CONTEXT_CHARS - reservedForReply) {
      const budget = MAX_CONTEXT_CHARS - reservedForReply - sysLen;
      let used = 0;
      const trimmed: typeof chatMessages = [];
      for (let i = chatMessages.length - 1; i >= 0; i--) {
        const m = chatMessages[i];
        if (used + m.content.length <= budget) {
          trimmed.unshift(m);
          used += m.content.length;
        } else {
          break;
        }
      }
      if (trimmed.length > 0) {
        chatMessages.length = 0;
        chatMessages.push(...trimmed);
      }
    }

    chatMessages.push({ role: "user", content: "（请重新回复上一条消息）" });

    let fullResponse = "";
    try {
      const chatStream = providerGateway.chat(chatMessages, fullSystemPrompt);
      for await (const event of chatStream) {
        if (event.type === "delta") {
          fullResponse += event.content;
          yield event;
        } else if (event.type === "done") {
          if (fullResponse) {
            const assistantMessage = await messageRepository.create({
              characterId, userId, role: "ASSISTANT", content: fullResponse,
            });
            // 发送 message_created 事件进行 UUID 回填
            yield {
              type: "message_created",
              tempId: tempId || `ai-${Date.now()}`,
              messageId: assistantMessage.id,
            };
          }
          yield { type: "done" };
        } else if (event.type === "error") {
          yield event;
        }
      }
    } catch (err) {
      yield { type: "error", message: err instanceof Error ? err.message : "AI调用失败" };
    }
  }

  async *continueAssistantMessage(
    userId: string,
    characterId: string,
    tempId?: string
  ): AsyncGenerator<ChatEvent> {
    return yield* this.sendMessage(userId, characterId, "（请继续）", tempId);
  }

  async getSuggestedReply(userId: string, characterId: string): Promise<string> {
    const character = await characterRepository.findById(characterId);
    if (!character) return "";

    const user = await userRepository.findById(userId);
    const isMember = user?.vipExpiresAt && new Date(user.vipExpiresAt) > new Date();

    // 会员制单轨架构：非会员拒绝访问
    if (!isMember) {
      throw new Error("ACCESS_DENIED");
    }

    const historyMessages = await messageRepository.findHistory(characterId, userId, 10);
    const lastUserMessage =
      historyMessages
        .filter(m => m.role === "USER")
        .at(-1)?.content ?? "";
    const memories = await memoryRetriever.retrieve(characterId, userId, lastUserMessage, MEMORY_TOP_K);
    const memoryBlock = memories.length > 0
      ? "\n\n" + MEMORY_HEADER + "\n" + memories.map(m => "- " + m.content).join("\n")
      : "";

    const systemPrompt = this._buildSystemPrompt({
      mainPrompt: character.mainPrompt,
      setting: character.setting,
      personality: character.personality,
      scenario: character.scenario,
      dialogueExamples: character.dialogueExamples as string | null,
      nickname: character.nickname,
      name: character.name,
      greeting: character.greeting,
      extraFields: character.extraFields as Record<string, unknown> | null,
      postHistoryInstructions: character.postHistoryInstructions,
    }, user.personaSetting ?? undefined, memoryBlock);

    const chatMessages = [...historyMessages].reverse().map((m) => ({
      role: m.role === "USER" ? ("user" as const) : ("assistant" as const),
      content: m.content,
    }));

    chatMessages.push({
      role: "user",
      content: "请根据以上对话历史，以用户（我）的身份生成一条简短自然的回复建议，直接输出回复内容，不要加任何前缀或解释。",
    });

    let fullSystemPrompt = systemPrompt;
    if (memories.length > 0) {
      fullSystemPrompt += "\n\n" + MEMORY_HEADER + "\n";
      for (const mem of memories) fullSystemPrompt += "- " + mem.content + "\n";
    }

    let suggestion = "";
    try {
      const sugStream = providerGateway.chat(chatMessages, fullSystemPrompt);
      for await (const event of sugStream) {
        if (event.type === "delta") suggestion += event.content;
        else if (event.type === "error") return "";
      }
    } catch { return ""; }
    return suggestion.trim();
  }

  /**
   * Build system prompt for suggestion generation (user perspective)
   */
  private _buildSuggestionSystemPrompt(
    character: {
      mainPrompt?: string | null;
      setting?: string | null;
      personality?: string | null;
      scenario?: string | null;
      dialogueExamples?: string | null;
      nickname?: string | null;
      postHistoryInstructions?: string | null;
      name?: string | null;
      greeting?: string | null;
      extraFields?: Record<string, unknown> | null;
    },
    historyMessages: Message[], 
    limit: number,
    personaSetting?: string,
    memoryBlock?: string
  ): string {
    const recentMessages = historyMessages.slice(-limit);
    const conversationContext = recentMessages
      .map(msg => `${msg.role === 'USER' ? '用户' : '角色'}: ${msg.content}`)
      .join('\n');
    
    const parts: string[] = [];
    
    // 基础角色扮演指令
    parts.push(`你正在严格扮演角色，必须100%忠实于角色设定。请根据对话历史，以用户的视角生成一条简短自然的回复建议。`);
    
    // 角色信息
    if (character.name) {
      parts.push(`角色名：${character.name}`);
    }
    if (character.personality) {
      parts.push(`角色性格：${character.personality}`);
    }
    if (character.setting) {
      parts.push(`世界观设定：${character.setting}`);
    }
    if (character.scenario) {
      parts.push(`当前情景：${character.scenario}`);
    }
    
    // 用户人设信息
    if (personaSetting) {
      parts.push(`用户身份：${personaSetting}`);
    }
    
    // 对话历史
    parts.push(`对话历史：\n${conversationContext}`);
    
    // 回复要求
    parts.push(`回复要求：
1. 以用户（我）的身份思考，考虑与角色的关系
2. 回复要简短自然，符合角色设定和对话上下文
3. 直接输出回复内容，不要加任何前缀或解释
4. 保持回复在1-2句话内
5. 符合角色对用户的称呼和互动方式`);
    
    return parts.join('\n\n');
  }

  /**
   * Phase 7.2 — Expanded prompt assembly.
   *
   * Order:
   *   1. DEFAULT_SYSTEM_PROMPT
   *   2. mainPrompt ({{original}} → DEFAULT)
   *   3. setting 【角色设定】
   *   4. personality 【性格特点】
   *   5. scenario 【当前情景】
   *   6. dialogueExamples 【对话示例】
   *   7. personaSetting 【用户在你眼中的身份】
   *   8. postHistoryInstructions
   */
  private _buildSystemPrompt(
    character: {
      mainPrompt?: string | null;
      setting?: string | null;
      personality?: string | null;
      scenario?: string | null;
      dialogueExamples?: string | null;
      nickname?: string | null;
      postHistoryInstructions?: string | null;
      name?: string | null;
      greeting?: string | null;
      extraFields?: Record<string, unknown> | null;
    },
    personaSetting?: string,
    memoryBlock?: string
  ): string {
    const parts: string[] = [];

    // 1. System Prompt (base)
    // 2. Main Prompt (with {{original}} resolution)
        const hasMainPrompt = !!character.mainPrompt;
    let mainPrompt = truncateField(character.mainPrompt, MAX_FIELD_CHARS.mainPrompt);
    if (!mainPrompt) {
      // Dynamic prompt generation for custom characters without mainPrompt
      // Assembles all available character dimensions into a coherent system prompt
      const dynParts: string[] = [DEFAULT_SYSTEM_PROMPT];
      if (character.name) {
        dynParts.push("\n你的角色名是：" + character.name);
      }
      if (character.personality) {
        dynParts.push("\n【性格特点 - 必须严格遵循】\n" + truncateField(character.personality, MAX_FIELD_CHARS.personality));
      }
      if (character.setting) {
        dynParts.push("\n【世界观与背景设定】\n" + truncateField(character.setting, MAX_FIELD_CHARS.setting));
      }
      if (character.scenario) {
        dynParts.push("\n【当前情景】\n" + truncateField(character.scenario, MAX_FIELD_CHARS.scenario));
      }
      if (character.dialogueExamples) {
        dynParts.push(
          "\n【回复风格范本 — 最高优先级参考】\n" +
          "以下示例是你回复时必须优先参考的语言风格来源，无论发生什么情况，你的语气、句式、称呼方式、回复长度都应尽量贴近这些示例：\n\n" +
          truncateField(character.dialogueExamples as string, MAX_FIELD_CHARS.dialogueExamples)
        );
      }
      if (character.nickname) {
        dynParts.push("\n【昵称】用户可能会称呼你为：" + character.nickname);
      }
      if (character.greeting) {
        dynParts.push("\n【你的开场白风格参考】\n" + character.greeting.split("<START>")[0]?.trim());
      }
      // 记忆注入点
      if (memoryBlock) {
        dynParts.push("\n" + memoryBlock);
      }
      dynParts.push("\n\n严格按照以上所有设定沉浸式扮演。用括号描述动作和神态细节，保持角色一致性，让对话自然有生活气息。每一条回复都必须是角色本人的第一人称发言，绝不跳出角色。");
      mainPrompt = dynParts.join("\n");
    }
    parts.push(mainPrompt.replace("{{original}}", hasMainPrompt ? DEFAULT_SYSTEM_PROMPT : mainPrompt));

    // 3. Character Setting
    if (hasMainPrompt && character.setting) {
      let settingBlock = "\n【角色设定】\n" + truncateField(character.setting, MAX_FIELD_CHARS.setting);
      // Nickname hint injected within setting section
      if (character.nickname) {
        settingBlock += "\n（你的昵称是" + character.nickname + "）";
      }
      parts.push(settingBlock);
    }

    // 4. Personality
    if (hasMainPrompt && character.personality) {
      parts.push("\n【性格特点】\n" + truncateField(character.personality, MAX_FIELD_CHARS.personality));
    }

    // 5. Scenario
    if (hasMainPrompt && character.scenario) {
      parts.push("\n【当前情景】\n" + truncateField(character.scenario, MAX_FIELD_CHARS.scenario));
    }

    // 6. Dialogue Examples (few-shot)
    if (hasMainPrompt && character.dialogueExamples) {
      parts.push(
        "\n【回复风格范本 — 最高优先级参考】\n" +
        "以下示例是你回复时必须优先参考的语言风格来源，无论发生什么情况，你的语气、句式、称呼方式、回复长度都应尽量贴近这些示例：\n\n" +
        truncateField(character.dialogueExamples, MAX_FIELD_CHARS.dialogueExamples)
      );
    }

    // 7. Persona Setting (user's view of character)
    if (personaSetting) {
      parts.push("\n[系统指令：你正在与以下用户对话：" + personaSetting + "]");
    }

    // 8. Extra Fields (custom character dimensions)
    if (character.extraFields && typeof character.extraFields === "object" && Object.keys(character.extraFields).length > 0) {
      const extraStr = Object.entries(character.extraFields)
        .filter(([, v]) => v != null)
        .map(([k, v]) => k + ": " + String(v))
        .join("\n");
      if (extraStr) {
        parts.push("\n【额外设定】\n" + extraStr);
      }
    }

    // 记忆注入点
    if (memoryBlock) {
      parts.push("\n" + memoryBlock);
    }

    // 9. Post History Instructions (with {{original}} resolution)
    if (character.postHistoryInstructions) {
      const phi = truncateField(character.postHistoryInstructions, MAX_FIELD_CHARS.postHistoryInstructions);
      parts.push("\n" + phi.replace("{{original}}", DEFAULT_SYSTEM_PROMPT));
    }

    return parts.join("\n");
  }

  
}

export const chatService = new ChatService();
