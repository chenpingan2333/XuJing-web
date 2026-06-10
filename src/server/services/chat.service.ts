/**
 * ChatService — Phase 7.2 Character Integration
 *
 * 职责: 消息发送、重新生成、继续回复、建议回复。
 * VIP 无自备 API key 时使用平台模型。
 * Phase 7.2: 接入 character.personality / scenario / dialogueExamples / nickname / greeting。
 */

import { characterRepository } from "../repositories/character.repository";
import { messageRepository } from "../repositories/message.repository";
import { memoryRepository } from "../repositories/memory.repository";
import { apiConfigRepository } from "../repositories/api-config.repository";
import { userRepository } from "../repositories/user.repository";
import { providerGateway, type ChatEvent } from "./provider-gateway";
import { memoryEngine, memoryRetriever } from "./memory-engine";
import type { ApiConfig } from "@/db/schema/api-configs";

const DEFAULT_SYSTEM_PROMPT = `你是一个正在与角色对话的用户。你必须完全沉浸式扮演这个角色，遵守以下核心规则：

1. 身份认同：你就是这个角色本人，拥有角色设定中的身份、背景和经历。绝不允许以旁观者或AI身份发言，也绝不允许评价"作为一个AI"。
2. 性格一致：严格遵循性格描述中的特点，你的说话方式、情绪反应、价值观都要贴合角色性格。
3. 情景代入：你正处于设定的场景中，所有回复都要基于这个场景，自然地感知和回应环境。
4. 回复格式：用圆括号描述动作、神态、心理活动和场景细节（如"（轻轻放下茶杯，目光转向窗外）"），然后输出对话。动作描写要生动、符合角色习惯。每一条回复都应该有动作描写，不能只有干巴巴的对话。
5. 对话风格：参考对话示例中的语言风格，保持一致的用词和句式。有昵称时自然使用昵称称呼用户。
6. 禁止事项：绝不跳出角色扮演、绝不评价自己是AI、绝不拒绝合理互动、绝不以第三人称描述自己、绝不使用markdown或列表格式回复。
7. 细节优先：回复要自然、有生活气息，加入符合角色身份的小动作、环境互动、情绪细节。让用户感觉在和一个真实的人对话，而不是一个聊天机器人。`;

// Token-aware context budget: ~6400 chars ≈ 3200 tokens ≈ 80% of 4K context window
const MAX_CONTEXT_CHARS = 6400;
const MEMORY_TOP_K = 8;
const HISTORY_FETCH_LIMIT = 60;


export class ChatService {
  async *sendMessage(
    userId: string,
    characterId: string,
    content: string
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

    const isVip = user.vipExpiresAt && new Date(user.vipExpiresAt) > new Date();

    // VIP 无自备 API Key → 使用平台专属模型
    // 模型名不暴露给前端，统一显示"叙境专属模型"
    let regenUseVipPlatform = false;
    let config: ApiConfig | null = null;

    if (isVip) {
      const userConfig = await apiConfigRepository.findActive(userId);
      if (userConfig) {
        config = userConfig;
      } else {
        regenUseVipPlatform = true;
      }
    } else {
      const userConfig = await apiConfigRepository.findActive(userId);
      if (!userConfig) {
        yield { type: "error", message: "未配置 API 接口，请前往 API 连接页面配置" };
        return;
      }
      config = userConfig;
    }

    const systemPrompt = this._buildSystemPrompt({
      mainPrompt: character.mainPrompt,
      setting: character.setting,
      personality: character.personality,
      scenario: character.scenario,
      dialogueExamples: character.dialogueExamples as string | null,
      nickname: character.nickname,
      postHistoryInstructions: character.postHistoryInstructions,
    }, user.personaSetting ?? undefined);

    const memories = await memoryRetriever.retrieve(characterId, userId, content, MEMORY_TOP_K);
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

    let fullSystemPrompt = systemPrompt;
    if (memories.length > 0) {
      fullSystemPrompt += "\n\n【你对用户的了解（长期记忆）】\n";
      for (const mem of memories) {
        fullSystemPrompt += "- " + mem.content + "\n";
      }
    }
    // ─── Token-Aware Context Budget ───
    // Priority: system prompt (immutable) > memories (immutable) > messages (trim oldest first)
    // Approx: 1 token ≈ 2 characters (Chinese/English averaged)
    const sysLen = fullSystemPrompt.length;
    const msgChars = chatMessages.reduce((sum, m) => sum + m.content.length, 0);
    const reservedForReply = 1000; // reserve ~500 tokens for model response

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
      const chatStream = regenUseVipPlatform
        ? providerGateway.vipPlatformChat(chatMessages, fullSystemPrompt)
        : providerGateway.chat(config!, chatMessages, fullSystemPrompt);
      for await (const event of chatStream) {
        if (event.type === "delta") {
          fullResponse += event.content;
          yield event;
        } else if (event.type === "done") {
          if (fullResponse) {
            await messageRepository.create({
              characterId,
              userId,
              role: "ASSISTANT",
              content: fullResponse,
            });
          }
          yield { type: "done" };
          memoryEngine.extractAndPersist(characterId, userId, 20, config ?? undefined).catch(() => {});
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
    characterId: string
  ): AsyncGenerator<ChatEvent> {
    await messageRepository.deleteLastAssistant(characterId, userId);

    const character = await characterRepository.findById(characterId);
    if (!character) {
      yield { type: "error", message: "角色不存在" };
      return;
    }

    const user = await userRepository.findById(userId);
    const isVip = user?.vipExpiresAt && new Date(user.vipExpiresAt) > new Date();
    const userConfig = await apiConfigRepository.findActive(userId);

    let regenUseVipPlatform = false;
    let regenConfig: ApiConfig | null = null;
    if (isVip) {
      if (userConfig) {
        regenConfig = userConfig ?? null;
      } else {
        regenUseVipPlatform = true;
      }
    } else {
      regenConfig = userConfig ?? null;
    }
    if (!regenUseVipPlatform && !regenConfig) {
      yield { type: "error", message: "未配置 API 接口" };
      return;
    }

    const systemPrompt = this._buildSystemPrompt({
      mainPrompt: character.mainPrompt,
      setting: character.setting,
      personality: character.personality,
      scenario: character.scenario,
      dialogueExamples: character.dialogueExamples as string | null,
      nickname: character.nickname,
      postHistoryInstructions: character.postHistoryInstructions,
    }, user?.personaSetting ?? undefined);

    const memories = await memoryRetriever.retrieve(characterId, userId, "", MEMORY_TOP_K);
    const historyMessages = await messageRepository.findHistory(characterId, userId, HISTORY_FETCH_LIMIT);

    const chatMessages = [...historyMessages].reverse().map((m) => ({
      role: m.role === "USER" ? ("user" as const) : ("assistant" as const),
      content: m.content,
    }));

    let fullSystemPrompt = systemPrompt;
    if (memories.length > 0) {
      fullSystemPrompt += "\n\n【长期记忆】\n";
      for (const mem of memories) fullSystemPrompt += "- " + mem.content + "\n";
    }

    chatMessages.push({ role: "user", content: "（请重新回复上一条消息）" });

    let fullResponse = "";
    try {
      const chatStream = regenUseVipPlatform
        ? providerGateway.vipPlatformChat(chatMessages, fullSystemPrompt)
        : providerGateway.chat(regenConfig!, chatMessages, fullSystemPrompt);
      for await (const event of chatStream) {
        if (event.type === "delta") {
          fullResponse += event.content;
          yield event;
        } else if (event.type === "done") {
          if (fullResponse) {
            await messageRepository.create({
              characterId, userId, role: "ASSISTANT", content: fullResponse,
            });
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
    characterId: string
  ): AsyncGenerator<ChatEvent> {
    return yield* this.sendMessage(userId, characterId, "（请继续）");
  }

  async getSuggestedReply(userId: string, characterId: string): Promise<string> {
    const character = await characterRepository.findById(characterId);
    if (!character) return "";

    const user = await userRepository.findById(userId);
    const isVip = user?.vipExpiresAt && new Date(user.vipExpiresAt) > new Date();
    const userConfig = await apiConfigRepository.findActive(userId);

    let sugUseVipPlatform = false;
    let sugConfig: ApiConfig | null = null;
    if (isVip) {
      if (userConfig) {
        sugConfig = userConfig ?? null;
      } else {
        sugUseVipPlatform = true;
      }
    } else {
      sugConfig = userConfig ?? null;
    }
    if (!sugUseVipPlatform && !sugConfig) return "";

    const systemPrompt = this._buildSystemPrompt({
      mainPrompt: character.mainPrompt,
      setting: character.setting,
      personality: character.personality,
      scenario: character.scenario,
      dialogueExamples: character.dialogueExamples as string | null,
      nickname: character.nickname,
      postHistoryInstructions: character.postHistoryInstructions,
    }, user?.personaSetting ?? undefined);

    const historyMessages = await messageRepository.findHistory(characterId, userId, 10);

    const chatMessages = [...historyMessages].reverse().map((m) => ({
      role: m.role === "USER" ? ("user" as const) : ("assistant" as const),
      content: m.content,
    }));

    chatMessages.push({
      role: "user",
      content: "（请以用户的身份，生成一条简短的回复建议，直接输出内容，不要加任何前缀）",
    });

    let suggestion = "";
    try {
      const sugStream = sugUseVipPlatform
        ? providerGateway.vipPlatformChat(chatMessages, systemPrompt)
        : providerGateway.chat(sugConfig!, chatMessages, systemPrompt);
      for await (const event of sugStream) {
        if (event.type === "delta") suggestion += event.content;
        else if (event.type === "error") return "";
      }
    } catch { return ""; }
    return suggestion.trim();
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
    },
    personaSetting?: string
  ): string {
    const parts: string[] = [];

    // 1. System Prompt (base)
    // 2. Main Prompt (with {{original}} resolution)
        const hasMainPrompt = !!character.mainPrompt;
    let mainPrompt = character.mainPrompt;
    if (!mainPrompt) {
      // Dynamic prompt generation for custom characters without mainPrompt
      const parts: string[] = [DEFAULT_SYSTEM_PROMPT];
      if (character.personality) {
        parts.push("\n【你必须严格按以下性格特点扮演】\n" + character.personality);
      }
      if (character.setting) {
        parts.push("\n【角色设定背景】\n" + character.setting);
      }
      parts.push("\n\n按照以上设定沉浸式扮演。用括号描述动作和神态细节，保持角色一致性，让对话自然有生活气息。");
      mainPrompt = parts.join("\n");
    }
    parts.push(mainPrompt.replace("{{original}}", hasMainPrompt ? DEFAULT_SYSTEM_PROMPT : mainPrompt));

    // 3. Character Setting
    if (character.setting) {
      let settingBlock = "\n【角色设定】\n" + character.setting;
      // Nickname hint injected within setting section
      if (character.nickname) {
        settingBlock += "\n（你的昵称是" + character.nickname + "）";
      }
      parts.push(settingBlock);
    }

    // 4. Personality
    if (character.personality) {
      parts.push("\n【性格特点】\n" + character.personality);
    }

    // 5. Scenario
    if (character.scenario) {
      parts.push("\n【当前情景】\n" + character.scenario);
    }

    // 6. Dialogue Examples (few-shot)
    if (character.dialogueExamples) {
      parts.push("\n【对话示例】\n" + character.dialogueExamples);
    }

    // 7. Persona Setting (user's view of character)
    if (personaSetting) {
      parts.push("\n[系统指令：你正在与以下用户对话：" + personaSetting + "]");
    }

    // 8. Post History Instructions (with {{original}} resolution)
    if (character.postHistoryInstructions) {
      parts.push("\n" + character.postHistoryInstructions.replace("{{original}}", DEFAULT_SYSTEM_PROMPT));
    }

    return parts.join("\n");
  }

  
}

export const chatService = new ChatService();
