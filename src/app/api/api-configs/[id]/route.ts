/**
 * GET    /api/api-configs/[id] — 详情
 * PUT    /api/api-configs/[id] — 更新
 * DELETE /api/api-configs/[id] — 删除
 *
 * Phase 6.1 — 归属校验: config.userId === auth.userId
 */

import { jsonOk, jsonErr } from "../../_base/response";
import { requireAuth } from "../../_base/auth";
import { apiConfigService } from "@/server/services/api-config.service";
import { apiConfigRepository } from "@/server/repositories/api-config.repository";
import { UpdateApiConfigSchema } from "../validations";

async function getConfig(auth: { userId: string }, configId: string) {
  const config = await apiConfigRepository.findById(configId);
  if (!config) return jsonErr("配置不存在", 404);
  if (config.userId !== auth.userId) return jsonErr("无权操作", 403);
  return config;
}

// ——— GET: 详情 ———
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;
  const { id } = await params;

  const config = await getConfig(auth, id);
  if (config instanceof Response) return config;

  // 脱敏 apiKey
  return jsonOk({ ...config, apiKeyEncrypted: "********" });
}

// ——— PUT: 更新 ———
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;
  const { id } = await params;

  const config = await getConfig(auth, id);
  if (config instanceof Response) return config;

  let body: unknown;
  try { body = await req.json(); } catch { return jsonErr("Invalid JSON body", 400); }

  const parsed = UpdateApiConfigSchema.safeParse(body);
  if (!parsed.success) {
    const first = parsed.error.errors[0];
    return jsonErr(first ? first.message : "Validation failed", 400);
  }

  const updates: Record<string, unknown> = {};
  if (parsed.data.name !== undefined) updates.name = parsed.data.name;
  if (parsed.data.apiUrl !== undefined) updates.apiUrl = parsed.data.apiUrl;
  if (parsed.data.modelId !== undefined) updates.modelId = parsed.data.modelId;
  if (parsed.data.apiKey !== undefined) updates.apiKey = parsed.data.apiKey;

  try {
    const updated = await apiConfigService.updateConfig(auth.userId, id, updates as any);
    return jsonOk(updated);
  } catch (err) {
    return jsonErr(err instanceof Error ? err.message : "Update failed", 500);
  }
}

// ——— DELETE: 删除 ———
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;
  const { id } = await params;

  const config = await getConfig(auth, id);
  if (config instanceof Response) return config;

  try {
    await apiConfigService.deleteConfig(auth.userId, id);
    return jsonOk({ deleted: true });
  } catch (err) {
    return jsonErr(err instanceof Error ? err.message : "Delete failed", 500);
  }
}
