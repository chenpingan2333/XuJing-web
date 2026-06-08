/**
 * API Error Handler 鈥?统一错误处理
 *
 * 用法：route handler 中 try/catch 调用 handleApiError。
 */

import { jsonErr } from "./response";

/**
 * 统一错误处理：将异常转为标准化错误响应。
 */
export function handleApiError(err: unknown): Response {
  if (err instanceof Error) {
    console.error("[API Error]", err.message);
    return jsonErr(err.message, 500);
  }
  console.error("[API Error]", err);
  return jsonErr("Internal server error", 500);
}
