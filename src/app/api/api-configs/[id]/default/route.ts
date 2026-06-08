/**
 * PUT /api/api-configs/[id]/default — 设为默认
 *
 * Phase 6.1 — 事务内先清除所有默认再设置目标
 */

import { jsonOk, jsonErr } from "../../../_base/response";
import { requireAuth } from "../../../_base/auth";
import { apiConfigService } from "@/server/services/api-config.service";

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;
  const { id } = await params;

  try {
    const result = await apiConfigService.setDefaultConfig(auth.userId, id);
    if (result instanceof Response) return result;
    return jsonOk(result);
  } catch (err) {
    return jsonErr(err instanceof Error ? err.message : "Set default failed", 500);
  }
}
