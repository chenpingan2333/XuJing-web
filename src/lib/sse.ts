/**
 * SSE Helper — Server-Sent Events 基础封装
 *
 * 提供标准化的事件流格式：delta / done / error。
 * 不绑定任何业务逻辑，纯工具层。
 */

export interface SSEEvent {
  type: "delta" | "done" | "error";
  content?: string;
  message?: string;
}

/**
 * 创建 SSE Response。
 * 调用方通过 controller 推送事件。
 */
export function createSSEResponse(): {
  response: Response;
  controller: ReadableStreamDefaultController;
  send: (event: SSEEvent) => void;
  close: () => void;
} {
  let controller!: ReadableStreamDefaultController;

  const stream = new ReadableStream({
    start(c) {
      controller = c;
    },
  });

  const encoder = new TextEncoder();

  function send(event: SSEEvent) {
    if (!controller) return;
    const data = JSON.stringify(event);
    controller.enqueue(encoder.encode("data: " + data + "\n\n"));
  }

  function close() {
    if (!controller) return;
    try { controller.close(); } catch { /* already closed */ }
  }

  return {
    response: new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    }),
    controller,
    send,
    close,
  };
}