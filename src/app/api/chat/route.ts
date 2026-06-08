/**
 * Chat API Route — Phase 4.2 Tier Enforcement
 *
 * free user no API key → error
 * VIP user → own key or platform model
 * SSE inherits auth from middleware + route-level JWT verify
 */

import { requireAuth } from "../_base/auth";
import { jsonErr } from "../_base/response";
import { chatService } from "@/server/services/chat.service";
import { apiConfigRepository } from "@/server/repositories/api-config.repository";

export async function POST(req: Request) {
  const authResult = await requireAuth(req);
  if (authResult instanceof Response) return authResult;
  const user = authResult;

  let body: { characterId?: string; content?: string };
  try { body = await req.json(); } catch { return jsonErr("Invalid JSON body", 400); }
  if (!body.characterId || !body.content) return jsonErr("characterId and content are required", 400);

  // Free user must have API key
  if (user.subscription === "free") {
    const config = await apiConfigRepository.findDefault(user.userId);
    if (!config) {
      return jsonErr("未配置 API 接口，请前往 API 连接页面配置", 400);
    }
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const event of chatService.sendMessage(user.userId, body.characterId!, body.content!)) {
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

