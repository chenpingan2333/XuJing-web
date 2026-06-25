import { jsonOk, jsonErr } from "../../_base/response";
import { requireAuth } from "../../_base/auth";
import { apiConfigRepository } from "@/server/repositories/api-config.repository";

/**
 * 切换到平台模型 — 仅 VIP 用户可用
 * 免费用户必须自行配置 API Key。
 */
export async function POST(req: Request) {
  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;

  // 非 VIP 用户禁止使用平台模型
  if (auth.subscription !== "vip") {
    return jsonErr("平台模型仅限 VIP 用户使用，请配置您自己的 API Key", 403);
  }

  try {
    await apiConfigRepository.deactivateAll(auth.userId);
    return jsonOk({ platform: true });
  } catch (err) {
    return jsonErr(err instanceof Error ? err.message : "Failed to switch to platform model", 500);
  }
}
