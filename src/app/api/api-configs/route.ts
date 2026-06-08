/**
 * GET  /api/api-configs — 列表
 * POST /api/api-configs — 创建
 *
 * Phase 6.1 — 消费现有 ApiConfigService，不修改后端。
 */

import { jsonOk, jsonErr } from "../_base/response";
import { requireAuth } from "../_base/auth";
import { apiConfigService } from "@/server/services/api-config.service";
import { CreateApiConfigSchema } from "./validations";

// ——— GET: 列表 ———
export async function GET(req: Request) {
  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;

  const configs = await apiConfigService.listConfigs(auth.userId);
  return jsonOk(configs);
}

// ——— POST: 创建 ———
export async function POST(req: Request) {
  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;

  let body: unknown;
  try { body = await req.json(); } catch { return jsonErr("Invalid JSON body", 400); }

  const parsed = CreateApiConfigSchema.safeParse(body);
  if (!parsed.success) {
    const first = parsed.error.errors[0];
    return jsonErr(first ? first.message : "Validation failed", 400);
  }

  const { name, platform, apiUrl, apiKey, modelId, isDefault } = parsed.data;

  // 检查同名
  const existing = await apiConfigService.listConfigs(auth.userId);
  if (existing.some((c: { name: string }) => c.name === name)) {
    return jsonErr("已存在同名配置", 400);
  }

  // 首个 Provider 自动设为默认
  const shouldDefault = existing.length === 0 ? true : isDefault;

  try {
    const config = await apiConfigService.createConfig(auth.userId, {
      name,
      platform,
      apiUrl,
      apiKey,
      modelId,
      isDefault: shouldDefault,
    });
    return jsonOk(config, 201);
  } catch (err) {
    return jsonErr(err instanceof Error ? err.message : "Create failed", 500);
  }
}
