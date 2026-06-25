import { characterRepository } from "../repositories/character.repository";
import { z } from "zod";
import type { AuthUser } from "@/lib/auth";

export enum CharacterErrorCode {
  CHARACTER_NOT_FOUND = "CHARACTER_NOT_FOUND",
  UNAUTHORIZED = "UNAUTHORIZED",
  VALIDATION_ERROR = "VALIDATION_ERROR"
}

export class CharacterError extends Error {
  constructor(public code: CharacterErrorCode, message: string, public status: number = 400) {
    super(message);
    this.name = 'CharacterError';
  }
}

export const CreateCharacterSchema = z.object({
  name: z.string().min(1, "名称不能为空"),
  setting: z.string().default(""),
  greeting: z.string().default(""),
  avatarUrl: z.string().optional(),
  backgroundUrl: z.string().optional(),
  personality: z.string().optional(),
  scenario: z.string().optional(),
  dialogueExamples: z.string().optional().nullable(),
  nickname: z.string().optional(),
  groupGreeting: z.string().optional(),
  mainPrompt: z.string().optional().nullable(),
  postHistoryInstructions: z.string().optional().nullable(),
  extraFields: z.record(z.unknown()).optional(),
  oneLineIntro: z.string().optional(),
});

export class CharacterService {
  async listCharacters(auth: AuthUser) {
    const [official, user] = await Promise.all([
      characterRepository.findGlobalOfficial(),
      characterRepository.findUserCharacters(auth.userId)
    ]);
    
    return { official, user };
  }
  private characterRepository = characterRepository;

  // 对齐路由层原生调用：第一个参数为 auth 上下文，第二个参数为 id 字符串
  async getCharacter(auth: any, id: string): Promise<any> {
    const userId = auth?.userId;
    const userRole = auth?.role;

    const character = await this.characterRepository.findById(id);
    if (!character || character.deletedAt) {
      throw new CharacterError(CharacterErrorCode.CHARACTER_NOT_FOUND, "角色不存在", 404);
    }

    // 1. 未登录用户硬拦截
    if (!userId) {
      if (!character.isPublic) {
        return { blocked: true, message: '您无权限和该角色聊天，请联系叙境项目组' };
      }
      return character;
    }

    // 2. 方案A：广场角色自动激活（带 400 坏图清洗）
    if (character.isPublic) {
      await this.activatePublicCharacter(character, userId);
    }

    // 3. 管理员放行
    if (userRole === 'admin') return character;

    // 4. 私有角色所有权硬拦截
    if (!character.isPublic && character.userId !== userId) {
      return { blocked: true, message: '您无权限和该角色聊天，请联系叙境项目组' };
    }

    // 5. 非自身公开角色系统提示词精密脱敏
    if (character.isPublic && character.userId !== userId) {
      return {
        ...character,
        dialogueExamples: '[VIP用户不可见，升级管理员以查看]',
        mainPrompt: '[VIP用户不可见，升级管理员以查看]',
        postHistoryInstructions: '[VIP用户不可见，升级管理员以查看]',
      };
    }
    return character;
  }

  private async activatePublicCharacter(character: any, userId: string): Promise<void> {
    const list = await this.characterRepository.findUserCharacters(userId);
    const existing = list.find((c: any) => c.userId === userId && c.name === character.name && c.avatarUrl === character.avatarUrl);
    if (existing) return;

    let cleanAvatarUrl = character.avatarUrl || '';
    if (cleanAvatarUrl.startsWith('http')) {
      try {
        const urlObj = new URL(cleanAvatarUrl);
        if (urlObj.hostname === '43.138.193.173') {
          cleanAvatarUrl = urlObj.pathname + urlObj.search;
        }
      } catch (e) {}
    }

    await this.characterRepository.create({
      userId,
      name: character.name,
      avatarUrl: cleanAvatarUrl,
      backgroundUrl: character.backgroundUrl,
      setting: character.setting,
      greeting: character.greeting,
      personality: character.personality,
      scenario: character.scenario,
      dialogueExamples: null,
      nickname: character.nickname,
      groupGreeting: character.groupGreeting,
      mainPrompt: null,
      postHistoryInstructions: null,
      extraFields: character.extraFields,
      oneLineIntro: character.oneLineIntro,
      isPublic: false,
      publicityFields: character.publicityFields,
      fakeChats: character.fakeChats,
      fakeLikes: character.fakeLikes,
      isOfficial: false,
      version: character.version,
    } as any);
  }

  async createCharacter(auth: any, data: any): Promise<any> {
    return this.characterRepository.create({ ...data, userId: auth.userId });
  }

  async exportCharacter(auth: any, id: string): Promise<any> {
    const character = await this.characterRepository.findById(id);
    if (!character || character.deletedAt) {
      throw new CharacterError(CharacterErrorCode.CHARACTER_NOT_FOUND, "角色不存在", 404);
    }
    if (auth.role !== 'ADMIN' && character.userId !== auth.userId) {
      throw new CharacterError(CharacterErrorCode.UNAUTHORIZED, "无权导出该角色", 403);
    }
    return character;
  }

  async updateCharacter(auth: AuthUser, id: string, data: any): Promise<any> {
    const character = await this.characterRepository.findById(id);
    if (!character || character.deletedAt) {
      throw new CharacterError(CharacterErrorCode.CHARACTER_NOT_FOUND, "角色不存在", 404);
    }
    if (auth.role !== 'ADMIN' && character.userId !== auth.userId) {
      throw new CharacterError(CharacterErrorCode.UNAUTHORIZED, "无权修改该角色", 403);
    }
    return this.characterRepository.update(id, data);
  }

  async deleteCharacter(auth: AuthUser, id: string): Promise<any> {
    const character = await this.characterRepository.findById(id);
    if (!character || character.deletedAt) {
      throw new CharacterError(CharacterErrorCode.CHARACTER_NOT_FOUND, "角色不存在", 404);
    }
    if (auth.role !== 'ADMIN' && character.userId !== auth.userId) {
      throw new CharacterError(CharacterErrorCode.UNAUTHORIZED, "无权删除该角色", 403);
    }
    return this.characterRepository.softDelete(id);
  }

  async importCharacter(auth: any, imported: any): Promise<any> {
    let mapped: any = {};
    if ("spec" in imported) {
      const inner = imported.data;
      mapped = { name: inner.name, setting: inner.description, greeting: inner.first_mes };
      if (inner.personality) mapped.personality = inner.personality;
      if (inner.scenario) mapped.scenario = inner.scenario;
      if (inner.mes_example) mapped.dialogueExamples = inner.mes_example;
      if (inner.system_prompt) mapped.mainPrompt = inner.system_prompt;
      if (inner.post_history_instructions) mapped.postHistoryInstructions = inner.post_history_instructions;
      const extra: Record<string, unknown> = {};
      if (inner.creator_notes) extra.creatorNotes = inner.creator_notes;
      if (inner.alternate_greetings) extra.alternateGreetings = inner.alternate_greetings;
      if (inner.tags) extra.tags = inner.tags;
      if (Object.keys(extra).length > 0) mapped.extraFields = extra;
    } else {
      mapped = { name: imported.name, setting: imported.setting, greeting: imported.greeting };
      if (imported.avatar_url) mapped.avatarUrl = imported.avatar_url;
      if (imported.background_url) mapped.backgroundUrl = imported.background_url;
      if (imported.personality) mapped.personality = imported.personality;
      if (imported.scenario) mapped.scenario = imported.scenario;
      if (imported.dialogue_examples) mapped.dialogueExamples = imported.dialogue_examples;
      if (imported.nickname) mapped.nickname = imported.nickname;
      if (imported.group_greeting) mapped.groupGreeting = imported.group_greeting;
      if (imported.main_prompt) mapped.mainPrompt = imported.main_prompt;
      if (imported.post_history_instructions) mapped.postHistoryInstructions = imported.post_history_instructions;
      if (imported.extra_fields) mapped.extraFields = imported.extra_fields;
    }
    const validated = CreateCharacterSchema.parse(mapped);
    return this.createCharacter(auth, validated);
  }
}

export const characterService = new CharacterService();
