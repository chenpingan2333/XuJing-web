/**
 * API Route SSE Helper
 *
 * 薄封装 lib/sse，为 API route 提供便捷的 SSE 流式返回。
 */

export { createSSEResponse } from "@/lib/sse";
export type { SSEEvent } from "@/lib/sse";
