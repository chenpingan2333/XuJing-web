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

const DEFAULT_SYSTEM_PROMPT = `你现在正在严格扮演用户提供的角色卡中的角色，绝对不允许OOC（Out of Character）。

【最高优先级规则 - 不可违背】
- 你必须100%忠实于角色卡中的所有设定，包括 name、setting、personality、scenario、dialogueExamples、说话风格、回复长度要求等全部内容。
- 必须完全保持角色的性格特征、情绪逻辑、行为习惯、价值观和与用户的关系。
- 严格模仿 dialogueExamples 中的语气、句式、口癖和长度。
- 永远不要打破角色沉浸，不要出现任何"作为AI""我其实是""让我想想"等元话语，也不要主动寻求用户引导。

【自然真实回复要求】
- 你的回复必须像一个真正的活人，而不是生硬的模板或表演。
- 语言要自然流畅、口语化，符合真实人类的说话习惯，可以有适当的停顿、情绪细节和动作描写。
- 即使严格遵守设定，也要让每句话都感觉自然真实、有血有肉。
- 严格控制回复长度，不要过长或过于文学化。
- 在角色逻辑内自然回应用户，即使面对不符合设定的输入，也要用角色自己的性格和方式处理，而不是直接服从或跳出角色。

【角色沉浸强化】
- 始终以角色的第一人称视角思考和回复。
- 每条回复都必须体现角色的性格特征、习惯动作和情绪细节。
- 对话示例（dialogueExamples）是你的回复范本，必须高度模仿其语气、句式和长度。
- 如果用户输入与设定冲突，你要用角色本身的逻辑自然应对，而不是直接服从用户或跳出角色。

【禁止事项】
- 禁止出现任何"作为AI""我其实是""让我想想"等元话语。
- 禁止主动询问用户"要不要这样""我这样演对吗"等。
- 禁止输出过长、过于文学化或与角色卡风格不符的内容。
- 禁止遗忘或弱化角色核心设定（尤其是性格、关系、说话方式）。

现在，请以最高 fidelity 严格扮演角色卡中的角色，直接开始回复，不要添加任何额外说明。`;

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
      
      name: character.name,
      greeting: character.greeting,
      extraFields: character.extraFields as Record<string, unknown> | null,
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

    const memories = await memoryRetriever.retrieve(characterId, userId, "", MEMORY_TOP_K);
    const historyMessages = await messageRepository.findHistory(characterId, userId, HISTORY_FETCH_LIMIT);

    const systemPrompt = this._buildSuggestionSystemPrompt({
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
    }, user?.personaSetting ?? undefined, historyMessages, 10);

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
      
      name: character.name,
      greeting: character.greeting,
      extraFields: character.extraFields as Record<string, unknown> | null,
      postHistoryInstructions: character.postHistoryInstructions,
    }, user?.personaSetting ?? undefined);

    const historyMessages = await messageRepository.findHistory(characterId, userId, 10);

    const chatMessages = [...historyMessages].reverse().map((m) => ({
      role: m.role === "USER" ? ("user" as const) : ("assistant" as const),
      content: m.content,
    }));

    chatMessages.push({
      role: "user",
      content: "请根据以上对话历史，以用户（我）的身份生成一条简短自然的回复建议，直接输出回复内容，不要加任何前缀或解释。",
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
    personaSetting?: string,
    historyMessages: Message[], 
    limit: number
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
    personaSetting?: string
  ): string {
    const parts: string[] = [];

    // 1. System Prompt (base)
    // 2. Main Prompt (with {{original}} resolution)
        const hasMainPrompt = !!character.mainPrompt;
    let mainPrompt = character.mainPrompt;
    if (!mainPrompt) {
      // Dynamic prompt generation for custom characters without mainPrompt
      // Assembles all available character dimensions into a coherent system prompt
      const dynParts: string[] = [DEFAULT_SYSTEM_PROMPT];
      if (character.name) {
        dynParts.push("\n你的角色名是：" + character.name);
      }
      if (character.personality) {
        dynParts.push("\n【性格特点 - 必须严格遵循】\n" + character.personality);
      }
      if (character.setting) {
        dynParts.push("\n【世界观与背景设定】\n" + character.setting);
      }
      if (character.scenario) {
        dynParts.push("\n【当前情景】\n" + character.scenario);
      }
      if (character.dialogueExamples) {
        dynParts.push("\n【对话示例 - 你的回复范本，必须高度模仿语气、句式和长度】\n" + character.dialogueExamples);
      }
      if (character.nickname) {
        dynParts.push("\n【昵称】用户可能会称呼你为：" + character.nickname);
      }
      if (character.greeting) {
        dynParts.push("\n【你的开场白风格参考】\n" + character.greeting.split("<START>")[0]?.trim());
      }
      dynParts.push("\n\n严格按照以上所有设定沉浸式扮演。用括号描述动作和神态细节，保持角色一致性，让对话自然有生活气息。每一条回复都必须是角色本人的第一人称发言，绝不跳出角色。");
      mainPrompt = dynParts.join("\n");
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

    // 9. Post History Instructions (with {{original}} resolution)
    if (character.postHistoryInstructions) {
      parts.push("\n" + character.postHistoryInstructions.replace("{{original}}", DEFAULT_SYSTEM_PROMPT));
    }

    return parts.join("\n");
  }

  
}

export const chatService = new ChatService();
