/**
 * Phase 6.1 — API Connection System 集成测试
 *
 * 运行方式: npx tsx tests/phase6-api-connections.test.ts
 * 前置条件: Next.js dev server 必须在 http://localhost:3003 运行
 */

const BASE = "http://localhost:3003";
const TEST_EMAIL = "test-phase6@example.com";

interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  timestamp: string;
}

interface ProviderConfig {
  id: string;
  name: string;
  platform: string;
  apiUrl: string;
  modelId: string;
  isDefault: boolean;
  isActive: boolean;
}

let token = "";
let testConfigId = "";
let testConfigId2 = "";
const results: { name: string; passed: boolean; detail: string }[] = [];

function record(name: string, passed: boolean, detail: string) {
  results.push({ name, passed, detail });
  const icon = passed ? "✓" : "✗";
  console.log(`  ${icon} ${name}${detail ? ": " + detail : ""}`);
}

function summary() {
  const total = results.length;
  const passed = results.filter((r) => r.passed).length;
  const failed = total - passed;
  console.log(`\n${"=".repeat(50)}`);
  console.log(`Test Results: ${passed}/${total} passed, ${failed} failed`);
  console.log(`${"=".repeat(50)}`);
  if (failed > 0) process.exit(1);
}

async function api<T>(
  path: string,
  options: { method?: string; body?: unknown; token?: string } = {}
): Promise<ApiResponse<T>> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (options.token) headers["Authorization"] = "Bearer " + options.token;
  const res = await fetch(`${BASE}${path}`, {
    method: options.method || "GET",
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const data = await res.json();
  return data as ApiResponse<T>;
}

async function runTests() {
  console.log("Phase 6.1 — API Connection System Integration Tests\n");

  // ——— 1. Health Check ———
  console.log("1. Health Check");
  const health = await api("/api/health");
  record("Health endpoint responds", health.success, health.data ? "ok" : "no data");

  // ——— 2. Auth Validation ———
  console.log("\n2. Auth Validation");
  const noAuthList = await api("/api/api-configs");
  record("GET /api/api-configs without token", noAuthList.error?.includes("Authentication") ?? false, noAuthList.error ?? "");

  const noAuthCreate = await api("/api/api-configs", { method: "POST", body: { name: "x" } });
  record("POST /api/api-configs without token", noAuthCreate.error?.includes("Authentication") ?? false, noAuthCreate.error ?? "");

  const fakeTokenList = await api("/api/api-configs", { token: "invalid-token" });
  record("GET with invalid token", fakeTokenList.error?.includes("Invalid") ?? false, fakeTokenList.error ?? "");

  // ——— 3. Get dev token ———
  console.log("\n3. Get Dev Token");
  const devRes = await api<{ accessToken: string }>("/api/auth/dev/token", {
    method: "POST",
    body: { email: TEST_EMAIL },
  });
  if (devRes.success && devRes.data) {
    token = devRes.data.accessToken;
    record("Dev token obtained", true, "token received");
  } else {
    record("Dev token obtained", false, devRes.error || "failed");
    summary();
    return;
  }

  // ——— 4. Provider CRUD ———
  console.log("\n4. Provider CRUD");

  // List (should be empty or have existing data)
  const list1 = await api<ProviderConfig[]>("/api/api-configs", { token });
  record("List providers (initial)", list1.success, `count: ${(list1.data || []).length}`);

  // Create first provider
  const create1 = await api<ProviderConfig>("/api/api-configs", {
    method: "POST",
    token,
    body: {
      name: "Test OpenAI",
      platform: "OPENAI",
      apiUrl: "https://api.openai.com",
      apiKey: "sk-test-key-123456",
      modelId: "gpt-4.1",
      isDefault: false,
    },
  });
  if (create1.success && create1.data) {
    testConfigId = create1.data.id;
    record("Create first provider", true, `id: ${testConfigId}`);
    // First provider should be auto-default
    record("First provider is default", create1.data.isDefault === true, `isDefault: ${create1.data.isDefault}`);
  } else {
    record("Create first provider", false, create1.error || "failed");
  }

  // Create second provider
  const create2 = await api<ProviderConfig>("/api/api-configs", {
    method: "POST",
    token,
    body: {
      name: "Test DeepSeek",
      platform: "DEEPSEEK",
      apiUrl: "https://api.deepseek.com",
      apiKey: "sk-deepseek-key-123456",
      modelId: "deepseek-chat",
    },
  });
  if (create2.success && create2.data) {
    testConfigId2 = create2.data.id;
    record("Create second provider", true, `id: ${testConfigId2}`);
    record("Second provider is not default", create2.data.isDefault === false, `isDefault: ${create2.data.isDefault}`);
  } else {
    record("Create second provider", false, create2.error || "failed");
  }

  // Get single config
  const get1 = await api<ProviderConfig>(`/api/api-configs/${testConfigId}`, { token });
  record("Get single provider", get1.success, get1.data ? get1.data.name : "not found");

  // API key is desensitized
  if (get1.data) {
    record("API key desensitized", (get1.data as any).apiKeyEncrypted === "********", "key hidden in response");
  }

  // Update provider
  const update = await api<ProviderConfig>(`/api/api-configs/${testConfigId}`, {
    method: "PUT",
    token,
    body: { name: "Test OpenAI Updated", modelId: "gpt-4o" },
  });
  record("Update provider", update.success, update.data ? `name: ${update.data.name}` : (update.error || ""));

  // ——— 5. Provider Default Switch ———
  console.log("\n5. Provider Default Switch");

  if (testConfigId2) {
    const setDefault = await api<ProviderConfig>(`/api/api-configs/${testConfigId2}/default`, {
      method: "PUT",
      token,
    });
    record("Set default provider", setDefault.success, setDefault.data ? `new default: ${testConfigId2}` : (setDefault.error || ""));

    // Verify list reflects change
    const list2 = await api<ProviderConfig[]>("/api/api-configs", { token });
    if (list2.data) {
      const defs = list2.data.filter((p) => p.isDefault);
      record("Only one default after switch", defs.length === 1, `default count: ${defs.length}`);
      record("Correct default provider", defs[0]?.id === testConfigId2, `default id: ${defs[0]?.id}`);
    }
  }

  // ——— 6. Provider Test ———
  console.log("\n6. Provider Test Connection");
  const test = await api<{ ok?: boolean; error?: string }>(`/api/api-configs/${testConfigId}/test`, {
    method: "POST",
    token,
  });
  record("Test connection endpoint", test.success, test.data ? (test.data.ok ? "connected" : "connection failed (expected)") : (test.error || ""));

  // ——— 7. Permission / Ownership Validation ———
  console.log("\n7. Permission / Ownership Validation");

  // Get token for a different user
  const devRes2 = await api<{ accessToken: string }>("/api/auth/dev/token", {
    method: "POST",
    body: { email: "other-user@example.com" },
  });
  if (devRes2.success && devRes2.data) {
    const otherToken = devRes2.data.accessToken;

    // Try to access other user's config
    const otherGet = await api(`/api/api-configs/${testConfigId}`, { token: otherToken });
    record("Cross-user access blocked", otherGet.error?.includes("无权") || otherGet.error?.includes("Unauthorized") || otherGet.error?.includes("Forbidden") || !otherGet.success, otherGet.error || "blocked");

    // Try to update other user's config
    const otherUpdate = await api(`/api/api-configs/${testConfigId}`, {
      method: "PUT",
      token: otherToken,
      body: { name: "Hacked" },
    });
    record("Cross-user update blocked", !otherUpdate.success, otherUpdate.error || "blocked");

    // Try to delete other user's config
    const otherDelete = await api(`/api/api-configs/${testConfigId}`, {
      method: "DELETE",
      token: otherToken,
    });
    record("Cross-user delete blocked", !otherDelete.success, otherDelete.error || "blocked");
  } else {
    record("Get second user token", false, devRes2.error || "failed");
  }

  // ——— 8. Delete Provider ———
  console.log("\n8. Provider Delete");
  if (testConfigId2) {
    const del = await api(`/api/api-configs/${testConfigId2}`, { method: "DELETE", token });
    record("Delete provider", del.success, del.success ? "deleted" : (del.error || ""));
  }

  // ——— 9. FREE User Flow ———
  console.log("\n9. FREE User Flow");
  // List after operations should still work
  const list3 = await api<ProviderConfig[]>("/api/api-configs", { token });
  record("List after delete", list3.success, `remaining: ${(list3.data || []).length}`);

  // ——— Summary ———
  summary();
}

runTests().catch((err) => {
  console.error("Test suite failed:", err);
  process.exit(1);
});
