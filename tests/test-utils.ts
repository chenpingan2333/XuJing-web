/**
 * 测试工具共享模块
 * 避免测试文件之间的重复声明错误
 */

export const BASE = "http://localhost:3003";

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  timestamp: string;
}

export interface ProviderConfig {
  id: string;
  name: string;
  platform: string;
  apiUrl: string;
  modelId: string;
  isDefault: boolean;
  isActive: boolean;
}

export function record(name: string, passed: boolean, detail: string) {
  const icon = passed ? "✓" : "✗";
  console.log(`  ${icon} ${name}${detail ? ": " + detail : ""}`);
}

export async function api<T>(
  path: string,
  options: { method?: string; body?: unknown; token?: string } = {}
): Promise<ApiResponse<T> & { status: number }> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (options.token) headers["Authorization"] = "Bearer " + options.token;
  const res = await fetch(`${BASE}${path}`, {
    method: options.method || "GET",
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const data = await res.json();
  return { ...data, status: res.status } as ApiResponse<T> & { status: number };
}

export function summary(results: { name: string; passed: boolean; detail: string }[]) {
  const total = results.length;
  const passed = results.filter((r) => r.passed).length;
  const failed = total - passed;
  console.log(`\n${'='.repeat(50)}`);
  console.log(`Test Results: ${passed}/${total} passed, ${failed} failed`);
  console.log(`${'='.repeat(50)}`);
  if (failed > 0) process.exit(1);
}