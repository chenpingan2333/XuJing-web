import { z } from "zod";

/**
 * 环境变量 Schema — Phase 3.6 运行时校验
 *
 * 所有敏感变量严格限定在 Node.js 服务端，绝不添加 NEXT_PUBLIC_ 前缀。
 * 可选变量配合 Fail-open 策略：缺失时不阻塞启动，运行时优雅降级。
 */

const envSchema = z.object({
  // ── 数据库 ──
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),

  // ── 认证 ──
  JWT_SECRET: z.string().min(16, "JWT_SECRET must be at least 16 characters"),

  // ── 加密 ──
  API_KEY_ENCRYPTION_KEY: z.string().min(16, "AES_KEY must be at least 16 characters"),

  // ── Redis ──
  REDIS_URL: z.string().optional(),

  // ── 邮件（Resend）──
  // 可选：未配置时验证码降级为 console.log 输出
  RESEND_API_KEY: z.string().optional(),

  // ── VIP 平台模型 ──
  // 服务端专属路由，API Key 不经数据库加密层，永不暴露给前端
  PLATFORM_API_URL: z.string().optional().default("https://api.deepseek.com"),
  PLATFORM_API_KEY: z.string().optional(),
  PLATFORM_MODEL_ID: z.string().optional().default("deepseek-chat"),
});

let _env: z.infer<typeof envSchema> | null = null;

export function getEnv(): z.infer<typeof envSchema> {
  if (_env) return _env;
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    console.error("[env] Validation failed:", parsed.error.flatten());
    throw new Error("Environment validation failed. Check server logs.");
  }
  _env = parsed.data;
  return _env;
}

export type Env = z.infer<typeof envSchema>;
