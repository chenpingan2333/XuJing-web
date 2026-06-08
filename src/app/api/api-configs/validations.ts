/**
 * API Config Validation Schemas — Phase 6.1
 *
 * Zod 验证规则，严格遵循 05-provider-validation-rules.md。
 * 所有 API Route 共享此模块，禁止各 Route 重复实现验证逻辑。
 */

import { z } from "zod";

const PLATFORM_VALUES = [
  "OPENAI", "ANTHROPIC", "GEMINI",
  "DEEPSEEK", "GROK",
  "CUSTOM_OPENAI", "CUSTOM_ANTHROPIC", "CUSTOM_GEMINI",
] as const;

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
    .max(100, "模型 ID 最长 100 个字符"),

  isDefault: z.boolean().optional().default(false),
});

export type CreateApiConfigInput = z.infer<typeof CreateApiConfigSchema>;

/** 更新 Provider 的 Zod Schema */
export const UpdateApiConfigSchema = z.object({
  name: z.string().min(1, "名称不能为空").max(50, "名称最长 50 个字符").optional(),
  apiUrl: z.string().url("请输入有效的 URL").optional(),
  apiKey: z.string().min(8, "API Key 至少 8 个字符").optional(),
  modelId: z.string().min(1, "模型 ID 不能为空").max(100, "模型 ID 最长 100 个字符").optional(),
  isDefault: z.boolean().optional(),
});

export type UpdateApiConfigInput = z.infer<typeof UpdateApiConfigSchema>;
