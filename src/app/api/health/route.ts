import { checkInfra } from "@/server/services/infra-health";
import { jsonOk, jsonErr } from "../_base/response";

/**
 * GET /api/health — Phase 3.6
 *
 * 返回：
 * {
 *   runtime: "ready" | "degraded",
 *   postgres: boolean,
 *   redis: boolean,
 *   env: boolean
 * }
 */
export async function GET() {
  const status = await checkInfra();

  return jsonOk({
    runtime: status.ok ? ("ready" as const) : ("degraded" as const),
    postgres: status.postgres,
    redis: status.redis,
    env: status.env,
  });
}
