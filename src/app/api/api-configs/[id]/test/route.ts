/**
 * POST /api/api-configs/[id]/test — 测试连接
 *
 * Phase 6.1 — 归属校验 + ProviderGateway.testConnection
 */

import { jsonOk, jsonErr } from "../../../_base/response";
import { requireAuth } from "../../../_base/auth";
import { apiConfigService } from "@/server/services/api-config.service";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;
  const { id } = await params;

  try {
    const result = await apiConfigService.testConfig(auth.userId, id);
    if (result instanceof Response) return result;
    return jsonOk(result);
  } catch (err) {
    return jsonErr(err instanceof Error ? err.message : "Test failed", 500);
  }
}
