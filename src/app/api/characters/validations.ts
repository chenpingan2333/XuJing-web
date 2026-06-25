/**
 * Character Validation Schemas — Phase 7.1
 *
 * Zod 验证规则，严格遵循 05-character-validation-rules.md。
 * 所有 Character API Route 共享此模块，禁止各 Route 重复实现验证逻辑。
 *
 * 字段限制（按产品原则）：
 *   短文本：name ≤10, nickname ≤10, greeting ≤200, group_greeting ≤200, dialogue_examples ≤500
 *   长文本：setting ≤10000, personality ≤10000, scenario ≤10000, main_prompt ≤10000, post_history_instructions ≤10000
 */

import { z } from "zod";

// ============================================================================
// Create Character Schema
// ============================================================================

export const CreateCharacterSchema = z.object({
  name: z.string()
    .min(1, "角色名称不能为空")
    .max(10, "角色名称最长 10 个中文字符")
    .trim(),

  setting: z.string()
    .min(1, "角色设定不能为空")
    .max(10000, "角色设定最长 10000 字"),

  greeting: z.string()
    .min(1, "开场白不能为空")
    .max(200, "开场白最长 200 字"),

  avatar_url: z.string()
    .max(500, "头像 URL 最长 500 个字符")
    .optional()
    .or(z.literal("")),

  background_url: z.string()
    .max(500, "背景图 URL 最长 500 个字符")
    .optional()
    .or(z.literal("")),

  personality: z.string()
    .max(10000, "性格特点最长 10000 字")
    .optional()
    .or(z.literal("")),

  scenario: z.string()
    .max(10000, "情景设定最长 10000 字")
    .optional()
    .or(z.literal("")),

  dialogue_examples: z.string()
    .max(500, "对话示例最长 500 字")
    .optional()
    .or(z.literal("")),

  nickname: z.string()
    .max(10, "昵称最长 10 个中文字符")
    .optional()
    .or(z.literal("")),

  group_greeting: z.string()
    .max(200, "群聊开场白最长 200 字")
    .optional()
    .or(z.literal("")),

  main_prompt: z.string()
    .max(10000, "主要提示最长 10000 字")
    .optional()
    .or(z.literal("")),

  post_history_instructions: z.string()
    .max(10000, "历史后指令最长 10000 字")
    .optional()
    .or(z.literal("")),

  one_line_intro: z.string()
    .max(255, "一句话介绍最长 255 字")
    .optional()
    .or(z.literal("")),
  is_public: z.boolean().optional(),
  publicity_fields: z.array(z.string()).optional(),
  extra_fields: z.record(z.unknown()).optional(),
});

export type CreateCharacterInput = z.infer<typeof CreateCharacterSchema>;

// ============================================================================
// Update Character Schema
// ============================================================================

export const UpdateCharacterSchema = z.object({
  name: z.string()
    .min(1, "角色名称不能为空")
    .max(10, "角色名称最长 10 个中文字符")
    .trim()
    .optional(),

  setting: z.string()
    .min(1, "角色设定不能为空")
    .max(10000, "角色设定最长 10000 字")
    .optional(),

  greeting: z.string()
    .min(1, "开场白不能为空")
    .max(200, "开场白最长 200 字")
    .optional(),

  avatar_url: z.string()
    .max(500, "头像 URL 最长 500 个字符")
    .optional()
    .nullable(),

  background_url: z.string()
    .max(500, "背景图 URL 最长 500 个字符")
    .optional()
    .nullable(),

  personality: z.string()
    .max(10000, "性格特点最长 10000 字")
    .optional()
    .nullable(),

  scenario: z.string()
    .max(10000, "情景设定最长 10000 字")
    .optional()
    .nullable(),

  dialogue_examples: z.string()
    .max(500, "对话示例最长 500 字")
    .optional()
    .nullable(),

  nickname: z.string()
    .max(10, "昵称最长 10 个中文字符")
    .optional()
    .nullable(),

  group_greeting: z.string()
    .max(200, "群聊开场白最长 200 字")
    .optional()
    .nullable(),

  main_prompt: z.string()
    .max(10000, "主要提示最长 10000 字")
    .optional()
    .nullable(),

  post_history_instructions: z.string()
    .max(10000, "历史后指令最长 10000 字")
    .optional()
    .nullable(),

  one_line_intro: z.string()
    .max(255, "一句话介绍最长 255 字")
    .optional()
    .nullable(),
  is_public: z.boolean().optional().nullable(),
  publicity_fields: z.array(z.string()).optional().nullable(),
  extra_fields: z.record(z.unknown()).optional().nullable(),
});

export type UpdateCharacterInput = z.infer<typeof UpdateCharacterSchema>;

// ============================================================================
// Import Character Schema
// ============================================================================

/** Xujing 原生格式 */
export const ImportXujingCharacterSchema = z.object({
  name: z.string().min(1).max(10).trim(),
  setting: z.string().min(1).max(10000),
  greeting: z.string().min(1).max(200),
  avatar_url: z.string().max(500).optional().or(z.literal("")),
  background_url: z.string().max(500).optional().or(z.literal("")),
  personality: z.string().max(10000).optional().or(z.literal("")),
  scenario: z.string().max(10000).optional().or(z.literal("")),
  dialogue_examples: z.string().max(500).optional().or(z.literal("")),
  nickname: z.string().max(10).optional().or(z.literal("")),
  group_greeting: z.string().max(200).optional().or(z.literal("")),
  main_prompt: z.string().max(10000).optional().or(z.literal("")),
  post_history_instructions: z.string().max(10000).optional().or(z.literal("")),
  extra_fields: z.record(z.unknown()).optional(),
  // Metadata
  exported_at: z.string().optional(),
  exported_version: z.number().optional(),
  source: z.string().optional(),
});

/** Tavern Card v2 */
export const ImportTavernCharacterSchema = z.object({
  spec: z.literal("chara_card_v2"),
  spec_version: z.literal("2.0"),
  data: z.object({
    name: z.string().min(1).max(10),
    description: z.string().min(1).max(10000),
    first_mes: z.string().min(1).max(200),
    personality: z.string().max(10000).optional(),
    scenario: z.string().max(10000).optional(),
    mes_example: z.string().max(500).optional(),
    creator_notes: z.string().max(10000).optional(),
    system_prompt: z.string().max(10000).optional(),
    post_history_instructions: z.string().max(10000).optional(),
    alternate_greetings: z.array(z.string()).optional(),
    character_version: z.string().optional(),
    tags: z.array(z.string()).optional(),
  }),
});

export const ImportCharacterSchema = z.union([
  ImportXujingCharacterSchema,
  ImportTavernCharacterSchema,
]);

// ============================================================================
// Export Character Schema
// ============================================================================

export const ExportCharacterSchema = z.object({
  name: z.string(),
  setting: z.string(),
  greeting: z.string(),
  avatar_url: z.string().nullable().optional(),
  background_url: z.string().nullable().optional(),
  personality: z.string().nullable().optional(),
  scenario: z.string().nullable().optional(),
  dialogue_examples: z.string().nullable().optional(),
  nickname: z.string().nullable().optional(),
  group_greeting: z.string().nullable().optional(),
  main_prompt: z.string().nullable().optional(),
  post_history_instructions: z.string().nullable().optional(),
  extra_fields: z.record(z.unknown()).nullable().optional(),
  exported_at: z.string(),
  exported_version: z.literal(1),
  source: z.literal("xujing"),
});