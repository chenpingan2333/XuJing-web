/**
 * CharacterService — Phase 7.2
 *
 * Responsibilities: character CRUD, import/export, quota control, permission checks.
 * Reuses CharacterRepository; does not modify database Schema.
 */

import { characterRepository } from "../repositories/character.repository";
import { CreateCharacterSchema, UpdateCharacterSchema, ImportCharacterSchema } from "@/app/api/characters/validations";
import type { AuthUser } from "@/lib/auth";
import type { NewCharacter } from "@/db/schema/characters";

// ============================================================================
// Constants
// ============================================================================

const FREE_USER_CHARACTER_LIMIT = 2;

// ============================================================================
// Business Errors
// ============================================================================

export class CharacterError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number = 400,
  ) {
    super(message);
    this.name = "CharacterError";
  }
}

// ============================================================================
// Helpers
// ============================================================================

/** jsonb columns do not accept empty strings; normalize to null */
function nullIfEmpty(value: string | null | undefined): string | null {
  if (value === "" || value === undefined || value === null) return null;
  return value;
}

/** undefined -> null for optional fields */
function undefToNull(value: string | null | undefined): string | null {
  if (value === undefined) return null;
  if (value === "") return null;
  return value;
}

/** Type-safe Insert data constructor aligned with Drizzle $inferInsert */
function toInsertData(params: {
  userId: string;
  name: string;
  setting: string;
  greeting: string;
  avatarUrl?: string | null;
  backgroundUrl?: string | null;
  personality?: string | null;
  scenario?: string | null;
  dialogueExamples?: string | null;
  nickname?: string | null;
  groupGreeting?: string | null;
  mainPrompt?: string | null;
  postHistoryInstructions?: string | null;
  extraFields?: Record<string, unknown> | null;
  isOfficial?: boolean;
  version?: number;
}): NewCharacter {
  return {
    userId: params.userId,
    name: params.name,
    setting: params.setting,
    greeting: params.greeting,
    avatarUrl: undefToNull(params.avatarUrl),
    backgroundUrl: undefToNull(params.backgroundUrl),
    personality: undefToNull(params.personality),
    scenario: undefToNull(params.scenario),
    dialogueExamples: params.dialogueExamples ?? null,
    nickname: undefToNull(params.nickname),
    groupGreeting: undefToNull(params.groupGreeting),
    mainPrompt: undefToNull(params.mainPrompt),
    postHistoryInstructions: undefToNull(params.postHistoryInstructions),
    extraFields: params.extraFields ?? null,
    isOfficial: params.isOfficial ?? false,
    version: params.version ?? 1,
  };
}

// ============================================================================
// Service
// ============================================================================

export class CharacterService {
  // ==========================================================================
  // Quota — only count private (non-official) characters
  // ==========================================================================

  private async checkQuota(userId: string, subscription: string): Promise<void> {
    if (subscription === "vip") return;
    const count = await characterRepository.countUserCharacters(userId);
    if (count >= FREE_USER_CHARACTER_LIMIT) {
      throw new CharacterError(
        "CHARACTER_QUOTA_EXCEEDED",
        "Character limit reached (2/2)",
        403,
      );
    }
  }

  // ==========================================================================
  // Ownership — character must belong to the user and be non-official
  // ==========================================================================

  private async requireOwnership(characterId: string, userId: string) {
    const character = await characterRepository.findById(characterId);
    if (!character || character.deletedAt) {
      throw new CharacterError("CHARACTER_NOT_FOUND", "Character not found", 404);
    }
    if (character.userId !== userId) {
      throw new CharacterError("CHARACTER_NOT_OWNED", "Permission denied", 403);
    }
    if (character.isOfficial) {
      throw new CharacterError(
        "CHARACTER_OFFICIAL_IMMUTABLE",
        "Official characters cannot be edited or deleted",
        403,
      );
    }
    return character;
  }

  // ==========================================================================
  // Duplicate Name — case-insensitive
  // ==========================================================================

  private async checkDuplicateName(
    userId: string,
    name: string,
    excludeId?: string,
  ): Promise<void> {
    const trimmed = name.trim();
    if (!trimmed) return;
    const lower = trimmed.toLowerCase();
    const chars = await characterRepository.findUserCharacters(userId);
    const duplicate = chars.find(
      (c) => c.name.trim().toLowerCase() === lower && c.id !== excludeId,
    );
    if (duplicate) {
      throw new CharacterError(
        "CHARACTER_DUPLICATE_NAME",
        `A character named "${trimmed}" already exists`,
        409,
      );
    }
  }

  // ==========================================================================
  // CRUD
  // ==========================================================================

  async createCharacter(
    auth: AuthUser,
    data: {
      name: string;
      setting: string;
      greeting: string;
      avatar_url?: string;
      background_url?: string;
      personality?: string;
      scenario?: string;
      dialogue_examples?: string;
      nickname?: string;
      group_greeting?: string;
      main_prompt?: string;
      post_history_instructions?: string;
      extra_fields?: Record<string, unknown>;
    },
  ) {
    const validated = CreateCharacterSchema.parse(data);

    await this.checkQuota(auth.userId, auth.subscription);
    await this.checkDuplicateName(auth.userId, validated.name);

    const created = await characterRepository.create(toInsertData({
      userId: auth.userId,
      name: validated.name.trim(),
      setting: validated.setting,
      greeting: validated.greeting,
      avatarUrl: nullIfEmpty(validated.avatar_url),
      backgroundUrl: nullIfEmpty(validated.background_url),
      personality: nullIfEmpty(validated.personality),
      scenario: nullIfEmpty(validated.scenario),
      dialogueExamples: nullIfEmpty(validated.dialogue_examples),
      nickname: nullIfEmpty(validated.nickname),
      groupGreeting: nullIfEmpty(validated.group_greeting),
      mainPrompt: nullIfEmpty(validated.main_prompt),
      postHistoryInstructions: nullIfEmpty(validated.post_history_instructions),
      extraFields: validated.extra_fields || null,
      isOfficial: false,
      version: 1,
    }));

    return created;
  }

  async updateCharacter(
    auth: AuthUser,
    characterId: string,
    data: {
      name?: string;
      setting?: string;
      greeting?: string;
      avatar_url?: string | null;
      background_url?: string | null;
      personality?: string | null;
      scenario?: string | null;
      dialogue_examples?: string | null;
      nickname?: string | null;
      group_greeting?: string | null;
      main_prompt?: string | null;
      post_history_instructions?: string | null;
      extra_fields?: Record<string, unknown> | null;
    },
  ) {
    const validated = UpdateCharacterSchema.parse(data);
    const character = await this.requireOwnership(characterId, auth.userId);

    if (validated.name && validated.name.trim()) {
      await this.checkDuplicateName(auth.userId, validated.name, characterId);
    }

    const updateData: Record<string, unknown> = {};

    if (validated.name !== undefined) updateData.name = validated.name.trim();
    if (validated.setting !== undefined) updateData.setting = validated.setting;
    if (validated.greeting !== undefined) updateData.greeting = validated.greeting;
    if (validated.avatar_url !== undefined) updateData.avatarUrl = nullIfEmpty(validated.avatar_url);
    if (validated.background_url !== undefined) updateData.backgroundUrl = nullIfEmpty(validated.background_url);
    if (validated.personality !== undefined) updateData.personality = nullIfEmpty(validated.personality);
    if (validated.scenario !== undefined) updateData.scenario = nullIfEmpty(validated.scenario);
    if (validated.dialogue_examples !== undefined) updateData.dialogueExamples = nullIfEmpty(validated.dialogue_examples);
    if (validated.nickname !== undefined) updateData.nickname = nullIfEmpty(validated.nickname);
    if (validated.group_greeting !== undefined) updateData.groupGreeting = nullIfEmpty(validated.group_greeting);
    if (validated.main_prompt !== undefined) updateData.mainPrompt = nullIfEmpty(validated.main_prompt);
    if (validated.post_history_instructions !== undefined) updateData.postHistoryInstructions = nullIfEmpty(validated.post_history_instructions);
    if (validated.extra_fields !== undefined) updateData.extraFields = validated.extra_fields;

    const updated = await characterRepository.update(characterId, {
      ...updateData,
      version: (character.version ?? 1) + 1,
    });

    return updated;
  }

  async deleteCharacter(auth: AuthUser, characterId: string) {
    await this.requireOwnership(characterId, auth.userId);
    await characterRepository.softDelete(characterId);
    return { deleted: true };
  }

  /** getCharacter — permission rules:
   *  - Official characters: anyone can view
   *  - User characters: owner only
   */
  async getCharacter(auth: AuthUser, characterId: string) {
    const character = await characterRepository.findById(characterId);
    if (!character || character.deletedAt) {
      throw new CharacterError("CHARACTER_NOT_FOUND", "Character not found", 404);
    }
    if (!character.isOfficial && character.userId !== auth.userId) {
      throw new CharacterError("CHARACTER_NOT_OWNED", "Permission denied", 403);
    }
    return character;
  }

  async listCharacters(_auth: AuthUser) {
    const official = await characterRepository.findGlobalOfficial();
    const userChars = await characterRepository.findUserCharacters(_auth.userId);
    return { official, user: userChars };
  }

  // ==========================================================================
  // Export
  // ==========================================================================

  async exportCharacter(auth: AuthUser, characterId: string) {
    const character = await this.requireOwnership(characterId, auth.userId);

    return {
      name: character.name,
      setting: character.setting,
      greeting: character.greeting,
      avatar_url: character.avatarUrl,
      background_url: character.backgroundUrl,
      personality: character.personality,
      scenario: character.scenario,
      dialogue_examples: character.dialogueExamples,
      nickname: character.nickname,
      group_greeting: character.groupGreeting,
      main_prompt: character.mainPrompt,
      post_history_instructions: character.postHistoryInstructions,
      extra_fields: character.extraFields,
      exported_at: new Date().toISOString(),
      exported_version: 1,
      source: "xujing",
    };
  }

  // ==========================================================================
  // Import
  // ==========================================================================

  async importCharacter(
    auth: AuthUser,
    rawBody: unknown,
  ) {
    await this.checkQuota(auth.userId, auth.subscription);

    const parsed = ImportCharacterSchema.safeParse(rawBody);
    if (!parsed.success) {
      const first = parsed.error.errors[0];
      throw new CharacterError(
        "CHARACTER_IMPORT_INVALID",
        first ? `Invalid import format: ${first.message}` : "Invalid import format",
        400,
      );
    }

    const imported = parsed.data;
    let mapped: {
      name: string;
      setting: string;
      greeting: string;
      avatar_url?: string;
      background_url?: string;
      personality?: string;
      scenario?: string;
      dialogue_examples?: string;
      nickname?: string;
      group_greeting?: string;
      main_prompt?: string;
      post_history_instructions?: string;
      extra_fields?: Record<string, unknown>;
    };

    if ("spec" in imported) {
      // Tavern v2
      const inner = imported.data;
      mapped = { name: inner.name, setting: inner.description, greeting: inner.first_mes };
      if (inner.personality) mapped.personality = inner.personality;
      if (inner.scenario) mapped.scenario = inner.scenario;
      if (inner.mes_example) mapped.dialogue_examples = inner.mes_example;
      if (inner.system_prompt) mapped.main_prompt = inner.system_prompt;
      if (inner.post_history_instructions) mapped.post_history_instructions = inner.post_history_instructions;

      const extra: Record<string, unknown> = {};
      if (inner.creator_notes) extra.creatorNotes = inner.creator_notes;
      if (inner.alternate_greetings) extra.alternateGreetings = inner.alternate_greetings;
      if (inner.tags) extra.tags = inner.tags;
      if (Object.keys(extra).length > 0) mapped.extra_fields = extra;
    } else {
      // Xujing native
      mapped = { name: imported.name, setting: imported.setting, greeting: imported.greeting };
      if ("avatar_url" in imported && imported.avatar_url) mapped.avatar_url = imported.avatar_url;
      if ("background_url" in imported && imported.background_url) mapped.background_url = imported.background_url;
      if ("personality" in imported && imported.personality) mapped.personality = imported.personality;
      if ("scenario" in imported && imported.scenario) mapped.scenario = imported.scenario;
      if ("dialogue_examples" in imported && imported.dialogue_examples) mapped.dialogue_examples = imported.dialogue_examples;
      if ("nickname" in imported && imported.nickname) mapped.nickname = imported.nickname;
      if ("group_greeting" in imported && imported.group_greeting) mapped.group_greeting = imported.group_greeting;
      if ("main_prompt" in imported && imported.main_prompt) mapped.main_prompt = imported.main_prompt;
      if ("post_history_instructions" in imported && imported.post_history_instructions) mapped.post_history_instructions = imported.post_history_instructions;
      if ("extra_fields" in imported && imported.extra_fields) mapped.extra_fields = imported.extra_fields as Record<string, unknown>;
    }

    const validated = CreateCharacterSchema.parse(mapped);
    return this.createCharacter(auth, validated);
  }
}

export const characterService = new CharacterService();
