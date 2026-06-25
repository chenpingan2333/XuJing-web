/**
 * API Config Validation Schemas — Phase 6.1
 *
 * Zod 验证规则，严格遵循 05-provider-validation-rules.md。
 * 所有 API Route 共享此模块，禁止各 Route 重复实现验证逻辑。
 *
 * Pro 偷跑防线第 2 层：modelId 格式验证 + Pro 模型黑名单
 * - 格式验证：拒绝中文、邮箱、URL、纯数字等垃圾 modelId
 * - Pro 黑名单：创建/更新时拒绝已知的 Pro/高端模型 ID
 *   （自备 Key 用户如需 Pro 模型，应通过 platform 字段匹配对应 Provider）
 */

import { z } from "zod";

const PLATFORM_VALUES = [
  "OPENAI", "ANTHROPIC", "GEMINI",
  "DEEPSEEK", "GROK",
  "CUSTOM_OPENAI", "CUSTOM_ANTHROPIC", "CUSTOM_GEMINI",
] as const;

/**
 * Pro/高端模型 ID 黑名单 — 防止免费用户配置 Pro 模型偷跑平台 Key
 *
 * 匹配规则：modelId 包含以下模式之一即拒绝（不区分大小写）
 * - gpt-4 系列（gpt-4, gpt-4o, gpt-4-turbo, gpt-4.1 等）
 * - o1/o3 系列推理模型
 * - claude opus/sonnet 系列
 * - gemini pro/ultra 系列
 *
 * 注意：deepseek-v4-flash 是平台免费模型，不在黑名单中
 */
export const PRO_MODEL_PATTERNS = [
  /^gpt-4/i,           // gpt-4, gpt-4o, gpt-4-turbo, gpt-4.1
  /^o1-/i,             // o1-mini, o1-preview
  /^o3-/i,             // o3-mini
  /claude.*opus/i,     // claude-3-opus, claude-4-opus
  /claude.*sonnet/i,   // claude-sonnet-4, claude-3.5-sonnet
  /gemini.*pro/i,      // gemini-2.5-pro, gemini-1.5-pro
  /gemini.*ultra/i,    // gemini-ultra
] as const;

/** 检查 modelId 是否为 Pro 模型 */
export function isProModel(modelId: string): boolean {
  return PRO_MODEL_PATTERNS.some(pattern => pattern.test(modelId));
}

/** 合法 modelId 格式：字母/数字开头，仅含字母数字、连字符、点号、斜杠 */
const MODEL_ID_REGEX = /^[a-zA-Z0-9][a-zA-Z0-9.\/-]{0,99}$/;

/** 创建 Provider 的 Zod Schema */
export const CreateApiConfigSchema = z.object({
  name: z.string()
    .min(1, "名称不能为空")
    .max(50, "名称最长 50 个字符"),

  platform: z.enum(PLATFORM_VALUES),

  apiUrl: z.string()
    .url("请输入有效的 URL")
    .min(1, "API 地址不能为空"),

  apiKey: z.string()
    .min(8, "API Key 至少 8 个字符"),

  modelId: z.string()
    .min(1, "模型 ID 不能为空")
    .max(100, "模型 ID 最长 100 个字符")
    .regex(MODEL_ID_REGEX, "模型 ID 格式无效：仅允许字母、数字、连字符、点号、斜杠，且以字母或数字开头")
    .refine(
      (id) => !isProModel(id),
      (id) => ({ message: `模型「${id}」为 Pro 付费模型，免费用户请使用基础模型（如 deepseek-v4-flash）` })
    ),

  isDefault: z.boolean().optional().default(false),
});

export type CreateApiConfigInput = z.infer<typeof CreateApiConfigSchema>;

/** 更新 Provider 的 Zod Schema */
export const UpdateApiConfigSchema = z.object({
  name: z.string().min(1, "名称不能为空").max(50, "名称最长 50 个字符").optional(),
  apiUrl: z.string().url("请输入有效的 URL").optional(),
  apiKey: z.string().min(8, "API Key 至少 8 个字符").optional(),
  modelId: z.string().min(1, "模型 ID 不能为空").max(100, "模型 ID 最长 100 个字符")
    .regex(MODEL_ID_REGEX, "模型 ID 格式无效：仅允许字母、数字、连字符、点号、斜杠，且以字母或数字开头")
    .refine(
      (id) => !isProModel(id),
      (id) => ({ message: `模型「${id}」为 Pro 付费模型，免费用户请使用基础模型（如 deepseek-v4-flash）` })
    ).optional(),
  isDefault: z.boolean().optional(),
});

export type UpdateApiConfigInput = z.infer<typeof UpdateApiConfigSchema>;
