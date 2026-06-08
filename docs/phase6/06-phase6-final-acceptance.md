# Phase 6.2 — API Connection System Final Acceptance

> **Date**: 2026-06-07 | **Status**: Final
> **Reviewer**: Codex (code-reviewer, debugging-wizard, test-master, fullstack-guardian)

---

## 1. Code Audit Results

### 1.1 ChatService Provider Selection Logic

**File**: `src/server/services/chat.service.ts`

```
VIP:  isVip → userConfig = findDefault(userId) → config = userConfig ?? getPlatformConfig()
FREE:            userConfig = findDefault(userId) → if !userConfig → return error
```

| Path | Condition | Config Source | Verified |
|------|-----------|--------------|----------|
| FREE + 0 Provider | `!userConfig` | Error: "未配置 API 接口，请前往 API 连接页面配置" | ✅ |
| FREE + Default Provider | `userConfig` | User's default provider | ✅ |
| VIP + 0 Provider | `isVip && !userConfig` | `getPlatformConfig()` (system model) | ✅ |
| VIP + Default Provider | `isVip && userConfig` | User's default provider (userConfig ?? getPlatformConfig → userConfig wins) | ✅ |
| VIP delete default | `isVip && !userConfig` | Falls back to `getPlatformConfig()` | ✅ |
| FREE delete default | `!userConfig` | Error: "未配置 API 接口" | ✅ |

### 1.2 Chat API Route Gate

**File**: `src/app/api/chat/route.ts`

Route-level duplicate check for FREE users:
```
if (user.subscription === "free") {
    const config = await apiConfigRepository.findDefault(user.userId);
    if (!config) return jsonErr("未配置 API 接口，请前往 API 连接页面配置", 400);
}
```

This early-exit for FREE users without Provider is **correct** — returns HTTP 400 with the required error message, preventing the SSE stream from even starting.

### 1.3 ProviderGateway

**File**: `src/server/services/provider-gateway.ts`

- No hardcoded credentials: `getPlatformConfig()` reads from `process.env.PLATFORM_API_URL`, `PLATFORM_API_KEY_ENCRYPTED`, `PLATFORM_MODEL_ID`
- No mock provider: all paths go through real fetch calls
- No bypass logic: the ONLY routing decision point is in `ChatService.sendMessage()` lines 63-68
- Platform fallback: `providerGateway.chat(config, ...)` is called with whatever config `ChatService` resolves — the gateway has zero awareness of FREE/VIP

### 1.4 Frozen Module Integrity

| Module | Status | Notes |
|--------|--------|-------|
| `src/db/**` | ✅ Not modified | Only pre-existing helpers.ts encoding fix |
| Auth System | ✅ Not modified | Pre-existing async/await fixes for Next.js 15 |
| ProviderGateway | ✅ Not modified | No changes in Phase 6.1 or 6.2 |
| ChatService | ✅ Fixed defect | Message changed from English to Chinese (spec compliance) |
| PaymentService | ✅ Not touched | |
| VipService | ✅ Not touched | |

---

## 2. Route Verification

### 2.1 API Config Routes

| Route | Auth | Zod | Ownership | Verified |
|-------|------|-----|-----------|----------|
| `GET /api/api-configs` | ✅ | N/A | N/A | ✅ |
| `POST /api/api-configs` | ✅ | ✅ CreateApiConfigSchema | ✅ (service layer) | ✅ |
| `GET /api/api-configs/[id]` | ✅ | N/A | ✅ | ✅ |
| `PUT /api/api-configs/[id]` | ✅ | ✅ UpdateApiConfigSchema | ✅ | ✅ |
| `DELETE /api/api-configs/[id]` | ✅ | N/A | ✅ | ✅ |
| `POST /api/api-configs/[id]/test` | ✅ | N/A | ✅ | ✅ |
| `PUT /api/api-configs/[id]/default` | ✅ | N/A | ✅ | ✅ |

### 2.2 Chat Route

| Aspect | Value |
|--------|-------|
| Auth | `requireAuth(req)` |
| FREE no Provider | HTTP 400 + "未配置 API 接口，请前往 API 连接页面配置" |
| FREE with Provider | Passes to ChatService with user token |

---

## 3. Chat Routing Flow (Complete Trace)

### FREE User Path
```
POST /api/chat { characterId, content }
  → middleware: JWT verify, inject x-auth-subscription=free
  → route: requireAuth() → subscription === "free"
    → findDefault(userId)
      → null? → HTTP 400 "未配置 API 接口，请前往 API 连接页面配置" [EXIT]
      → found → chatService.sendMessage(userId, characterId, content)
        → isVip=false → findDefault → userConfig [GO]
        → providerGateway.chat(userConfig, ...)
```

### VIP User Path
```
POST /api/chat { characterId, content }
  → middleware: JWT verify, inject x-auth-subscription=vip
  → route: requireAuth() → subscription !== "free" → skip the gate
    → chatService.sendMessage(userId, characterId, content)
      → isVip=true → findDefault(userId)
        → null? → config = getPlatformConfig() [PLATFORM MODEL]
        → found → config = userConfig [USER PROVIDER]
      → providerGateway.chat(config, ...)
```

---

## 4. FREE Flow Results

| # | Scenario | Expected | Code Evidence | Result |
|---|----------|----------|--------------|--------|
| 1 | FREE + 0 Provider | HTTP 400, "未配置 API 接口，请前往 API 连接页面配置" | `chat/route.ts:21-23` | **PASS** |
| 2 | FREE + Default Provider | Passes to ChatService, uses user config | `chat.service.ts:65-69` | **PASS** |
| 3 | FREE delete only Provider → chat | HTTP 400, "未配置 API 接口" | `chat.service.ts:66-67` | **PASS** |

---

## 5. VIP Flow Results

| # | Scenario | Expected | Code Evidence | Result |
|---|----------|----------|--------------|--------|
| 1 | VIP + 0 Provider | Uses platform model | `chat.service.ts:63-64`: `userConfig ?? getPlatformConfig()` | **PASS** |
| 2 | VIP + Default Provider | Uses user Provider, NOT platform | `??` operator: `userConfig` is truthy → wins | **PASS** |
| 3 | VIP delete only Provider → chat | Falls back to platform model | `getPlatformConfig()` called when `userConfig` is `null` | **PASS** |

---

## 6. Risk List

| # | Risk | Severity | Detail |
|---|------|----------|--------|
| R1 | `dev/token` route guarded only by `NODE_ENV` | **MEDIUM** | `auth/[...path]/route.ts:39` checks `NODE_ENV !== "development"`, but `devLogin` in service has no secondary guard. If someone runs production with NODE_ENV=development, the endpoint is wide open. |
| R2 | Route-level FREE check is duplicated | LOW | `chat/route.ts` checks for FREE user Provider, then `chat.service.ts` checks again. Not a security issue, just redundant. |
| R3 | `getPlatformConfig()` depends on env vars | LOW | If `PLATFORM_API_KEY_ENCRYPTED` is not set, VIP chat will fail with API auth error. Expected behavior — platform model requires env configuration. |
| R4 | `regenerateLastAssistantMessage` and `getSuggestedReply` use same VIP logic | LOW | Both check `isVip` and apply `userConfig ?? getPlatformConfig()`. Consistent. No bypass. |

---

## 7. Frontend Display Audit

| Check | Evidence | Result |
|-------|----------|--------|
| VIP card shows "叙境平台专属模型" | `page.tsx:93` | **PASS** |
| VIP card shows "平台默认提供" | `page.tsx:94` | **PASS** |
| "DeepSeek V4 Flash" NOT in frontend | 0 matches in `src/app/` | **PASS** |
| "deepseek-chat" NOT in frontend | 0 matches in `src/app/` | **PASS** |
| "DeepSeek" in PLATFORM_LABELS only | `page.tsx:18` — labels for user-configured providers, NOT platform model | **PASS** |

---

## 8. Security Audit

| # | Check | Finding |
|---|-------|---------|
| 1 | `dev/token` endpoint existence | **EXISTS** at `POST /api/auth/dev/token` |
| 2 | Guard | `NODE_ENV !== "development"` → 403. Dev-only. |
| 3 | `devLogin` service guard | **NONE**. Directly finds user by email and issues tokens. |
| 4 | Risk level | **MEDIUM** — relies on correct NODE_ENV configuration |
| 5 | API Key exposure | `listConfigs` returns `"********"`. AES-256-CBC encryption. No clear text. |
| 6 | Cross-user access | All mutations verify `config.userId === auth.userId`. |

---

## 9. Defects Fixed During Audit

| # | File | Defect | Fix |
|---|------|--------|-----|
| D1 | `src/app/api/chat/route.ts` | Error message in English | Changed to "未配置 API 接口，请前往 API 连接页面配置" |
| D2 | `src/server/services/chat.service.ts` | Error message in English | Changed to "未配置 API 接口，请前往 API 连接页面配置" |

---

## 10. Final Conclusion

**PASS**

All 8 acceptance criteria are satisfied:

1. ✅ FREE user without Provider → HTTP 400 + Chinese error message  
2. ✅ FREE user with default Provider → uses user config  
3. ✅ VIP user without Provider → platform model fallback  
4. ✅ VIP user with default Provider → user config takes precedence  
5. ✅ FREE delete fallback → error; VIP delete fallback → platform model  
6. ✅ ProviderGateway routing traceable, no bypass, no mock  
7. ✅ Frontend never exposes "DeepSeek V4 Flash" or underlying model ID  
8. ✅ Security: `dev/token` exists, guarded by NODE_ENV, risk MEDIUM

No blocking defects remain. The API Connection System and Chat routing logic are fully compliant with the frozen product definition.
