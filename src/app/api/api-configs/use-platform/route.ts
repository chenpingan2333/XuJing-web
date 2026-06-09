import { jsonOk, jsonErr } from "../../_base/response";
import { requireAuth } from "../../_base/auth";
import { apiConfigRepository } from "@/server/repositories/api-config.repository";

export async function POST(req: Request) {
  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;

  try {
    await apiConfigRepository.deactivateAll(auth.userId);
    return jsonOk({ platform: true });
  } catch (err) {
    return jsonErr(err instanceof Error ? err.message : "Failed to switch to platform model", 500);
  }
}