import { AsyncLocalStorage } from "node:async_hooks";
import type { AuthUser } from "./auth";

/**
 * Request Context 鈥?基于 AsyncLocalStorage 的请求级上下文
 *
 * 在 middleware 中注入，在 route handler 中读取。
 * 避免通过参数层层传递 user/traceId 等信息。
 */

interface RequestContext {
  user: AuthUser;
  traceId: string;
  timestamp: number;
}

const storage = new AsyncLocalStorage<RequestContext>();

/** 在 middleware 中调用，注入上下文 */
export function runWithContext(ctx: RequestContext, fn: () => unknown) {
  return storage.run(ctx, fn);
}

/** 在 route handler 中调用，读取当前请求上下文 */
export function getRequestContext(): RequestContext {
  const ctx = storage.getStore();
  if (!ctx) {
    throw new Error(
      "Request context not available. Ensure middleware runs before route handler."
    );
  }
  return ctx;
}

/** 安全读取上下文，不抛异常 */
export function getOptionalContext(): RequestContext | undefined {
  return storage.getStore();
}
