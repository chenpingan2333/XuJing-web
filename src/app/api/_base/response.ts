/**
 * API Response 标准化格式 — Phase 3.6
 *
 * 所有 API 输出必须经过 jsonOk / jsonErr。
 * 统一注入 timestamp，便于调试和日志关联。
 */

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  timestamp: string;
}

/** 成功响应 */
export function jsonOk<T>(data: T, status = 200): Response {
  return Response.json(
    { success: true, data, timestamp: new Date().toISOString() } satisfies ApiResponse<T>,
    { status }
  );
}

/** 错误响应 */
export function jsonErr(message: string, status = 400): Response {
  return Response.json(
    { success: false, error: message, timestamp: new Date().toISOString() } satisfies ApiResponse,
    { status }
  );
}

/** 纯对象版 — 用于组合或测式 */
export function ok<T>(data: T): ApiResponse<T> {
  return { success: true, data, timestamp: new Date().toISOString() };
}

export function err(message: string): ApiResponse<never> {
  return { success: false, error: message, timestamp: new Date().toISOString() };
}
