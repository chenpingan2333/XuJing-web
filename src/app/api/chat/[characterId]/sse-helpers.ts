import type { ChatEvent } from "@/server/services/provider-gateway";

export function sseResponse(generator: AsyncGenerator<ChatEvent>): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const event of generator) {
          controller.enqueue(encoder.encode("data: " + JSON.stringify(event) + "\n\n"));
          if (event.type === "done" || event.type === "error") break;
        }
      } catch (err) {
        controller.enqueue(encoder.encode("data: " + JSON.stringify({
          type: "error", message: err instanceof Error ? err.message : "服务器内部错误",
        }) + "\n\n"));
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}