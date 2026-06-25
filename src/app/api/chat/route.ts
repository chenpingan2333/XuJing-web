/**
 * Chat API Route — Phase 4.2 Tier Enforcement
 * Phase 7.3: Integrate active public copy check via characterService.
 */
import { requireAuth } from "../_base/auth";
import { jsonErr } from "../_base/response";
import { chatService } from "@/server/services/chat.service";
import { characterService } from "@/server/services/character.service";
import { apiConfigRepository } from "@/server/repositories/api-config.repository";
export async function POST(req: Request) {
  const authResult = await requireAuth(req);
  if (authResult instanceof Response) return authResult;
  const user = authResult;
  let body: { characterId?: string; content?: string; tempId?: string };
  try { body = await req.json(); } catch { return jsonErr("Invalid JSON body", 400); }
  if (!body.characterId || !body.content) return jsonErr("characterId and content are required", 400);
  // Free user must have API key
  if (user.subscription === "free") {
    const config = await apiConfigRepository.findActive(user.userId);
    if (!config) {
      return jsonErr("未配置 API 接口，请前往 API 连接页面配置", 400);
    }
  }
  // Phase 7.3 广场聊天前置自动副本激活：
  try {
    await characterService.getCharacter(user, body.characterId);
  } catch (err) {
    return jsonErr(err instanceof Error ? err.message : "获取或激活角色失败", 403);
  }
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const event of chatService.sendMessage(user.userId, body.characterId!, body.content!, body.tempId)) {
          controller.enqueue(encoder.encode("data: " + JSON.stringify(event) + "\n\n"));
          if (event.type === "done" || event.type === "error") break;
        }
      } catch (err) {
        controller.enqueue(encoder.encode("data: " + JSON.stringify({
          type: "error", message: err instanceof Error ? err.message : "Unknown error",
        }) + "\n\n"));
      } finally { controller.close(); }
    },
  });
  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" },
  });
}
