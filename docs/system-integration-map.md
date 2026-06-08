# System Integration Map — Auth & Security

> **Phase**: 4.0 — Auth & Security Architecture Freeze
> **Date**: 2026-06-07

---

## 1. 整体集成视图

```
┌──────────────────────────────────────────────────────────┐
│                     Client (Browser)                      │
│  localStorage: device_id, refresh_token                   │
│  Header: Authorization: Bearer <access_token>             │
└──────────────────────┬───────────────────────────────────┘
                       │
┌──────────────────────▼───────────────────────────────────┐
│              Next.js Middleware (src/middleware.ts)        │
│                                                           │
│  ┌─────────────┐  ┌──────────┐  ┌───────────────────┐   │
│  │ Runtime Gate │─▶│ Rate Lim │─▶│ JWT Verify +      │   │
│  │ (Phase 3.6)  │  │ (Phase 4)│  │ Blacklist Check   │   │
│  └─────────────┘  └──────────┘  └────────┬──────────┘   │
│                                           │               │
│  ┌────────────────────────────────────────▼──────────┐   │
│  │ Context Injection: { userId, role, jti, traceId } │   │
│  └───────────────────────────────────────────────────┘   │
└──────────────────────┬───────────────────────────────────┘
                       │
┌──────────────────────▼───────────────────────────────────┐
│                   API Route Handlers                       │
│                                                           │
│  /api/auth/*     /api/chat     /api/characters/*          │
│  /api/store/*    /api/admin/*  /api/health                │
└──────────────────────┬───────────────────────────────────┘
                       │
┌──────────────────────▼───────────────────────────────────┐
│                    Service Layer                           │
│                                                           │
│  ChatService ◀── Auth Context ──▶ userId                  │
│  MemoryService                                              │
│  CharacterService                                           │
│  ProviderGateway (decrypt API key, call AI API)            │
└──────────────────────┬───────────────────────────────────┘
                       │
┌──────────────────────▼───────────────────────────────────┐
│                    Data Layer                              │
│                                                           │
│  PostgreSQL (Drizzle)          Redis                      │
│  - users                       - xujing:refresh:*         │
│  - characters                  - xujing:code:*            │
│  - messages                    - xujing:blocked:*         │
│  - memories                    - xujing:ratelimit:*       │
│  - api_configs                                           │
│  - orders / vip_records / admin_logs                      │
└──────────────────────────────────────────────────────────┘
```

---

## 2. Auth 与 Runtime Gate 集成

| 组件 | 文件 | 关系 |
|------|------|------|
| Runtime Gate | `src/server/runtime/gate.ts` | Phase 3.6 已实现 |
| Middleware | `src/middleware.ts` | Phase 3.6 已集成 Gate |

**Phase 4 变化：**

Middleware 中 auth 逻辑在 Gate 之后执行：

```
middleware(req):
  initRuntimeGate()                     // 现有
  if (/api/health) return next()        // 现有
  if (not isReady()) return 503          // 现有
  ─── 以下为 Phase 4 新增 ───
  if (publicRoute) return next()
  checkRateLimit(req)                   // 新增
  token = extractBearerToken(req)       // 新增
  payload = verifyJWT(token)            // 新增
  if (blocked(payload.jti)) return 401  // 新增
  user = getUser(payload.sub)           // 新增
  if (user.status == BANNED) return 403 // 新增
  if (adminRoute && user.role != ADMIN) return 403  // 新增
  injectContext(user)                   // 复用现有 pattern
```

**Gate 文件本身无需修改。** Middleware 追加 auth 层即可。

---

## 3. Auth 与 ChatService 集成

### 3.1 当前 ChatService 接口

```
// src/server/services/chat.service.ts
class ChatService {
  sendMessage(userId, characterId, content)
  regenerateLastAssistantMessage(userId, characterId)
  continueAssistantMessage(userId, characterId)
  getSuggestedReply(userId, characterId)
}
```

### 3.2 Phase 4 变化

**ChatService 自身不需要修改。** userId 已作为参数传入，不依赖 context。

变化在 Route Handler 层：

```
// Phase 3 (当前):
POST /api/chat  →  chatService.sendMessage("mock-user-id", characterId, content)

// Phase 4 (升级后):
POST /api/chat  →  const user = requireUser()
                 →  chatService.sendMessage(user.userId, characterId, content)
```

### 3.3 SSE 认证

```
// Phase 4 SSE 认证流程:
POST /api/chat  (Authorization: Bearer <token>)
  → Middleware: JWT 验证 → inject context
  → Route handler: requireUser() → 获取 userId
  → chatService.sendMessage(userId, ...)
  → SSE 流式返回
  // 整个 stream 期间认证已建立，无需重复
```

---

## 4. Auth 与 ProviderGateway 集成

### 4.1 当前接口

```
// src/server/services/provider-gateway.ts
class ProviderGateway {
  chat(config, messages, systemPrompt): AsyncGenerator<ChatEvent>
  testConnection(config): Promise<{ ok: boolean }>
}
```

### 4.2 Phase 4 变化

**ProviderGateway 自身不需要修改。** 它不依赖用户身份，仅使用 `ApiConfig` 对象调用 AI API。

API Key 解密在 ProviderGateway 内部，安全隔离：

```
ProviderGateway.chat(config):
  apiKey = decryptApiKey(config.apiKeyEncrypted)  // 仅内存中存在
  fetch(apiUrl, { headers: { Authorization: Bearer apiKey } })
  // apiKey 永不出现在日志、响应、或任何持久化存储中
```

---

## 5. 不受 Auth 影响的模块

以下模块在 Phase 4 中**完全不需要修改**：

| 模块 | 文件 | 原因 |
|------|------|------|
| DB Schema | `src/db/schema/*` | 已有 `users` 表包含 email、role、status |
| Repository Layer | `src/server/repositories/*` | 纯数据访问，不依赖 auth context |
| Memory Service | `src/server/services/memory.service.ts` | userId 已作为参数传入 |
| Infra Health | `src/server/services/infra-health.ts` | Phase 3.6 已完成，无变化 |
| SSE Helper | `src/lib/sse.ts` | 纯工具函数，无 auth 依赖 |
| Crypto | `src/server/services/crypto.ts` | 纯加解密工具 |
| Payment Service | `src/server/services/payment.service.ts` | Phase 5 实现，userId 参数传入 |
| VIP Service | `src/server/services/vip.service.ts` | Phase 5 实现，userId 参数传入 |
| DB Index | `src/db/index.ts` | Phase 3.6 已稳定 |
| Runtime Gate | `src/server/runtime/gate.ts` | Phase 3.6 已稳定 |

---

## 6. 需要修改的模块（Phase 4 Implementation）

| 模块 | 变更程度 | 变更内容 |
|------|---------|---------|
| **Middleware** | 🔴 重写 | 追加 JWT 验证 + Rate Limiting + 上下文注入 |
| **Auth API Routes** | 🆕 新建 | `/api/auth/send-code`, `/api/auth/verify`, `/api/auth/refresh`, `/api/auth/logout` |
| **Auth Service** | 🆕 新建 | JWT 签发/验证、验证码生成/校验 |
| **API Base Auth** | 🟡 升级 | `requireUser()`, `requireAdmin()`, `requireOwner()` |
| **Context Helper** | 🟡 升级 | `AuthUser` 类型扩展（增加 jti） |
| **Chat Route** | 🟢 微调 | 替换 mock userId 为真实值 |
| **Redis Helpers** | 🆕 新建 | 基础 Redis 客户端封装（用于 rate limit, session） |

---

## 7. 数据流完整链路（注册 → 聊天）

```
1. 注册/登录:
   Client → POST /api/auth/send-code { email }
   → Resend 发邮件 → Redis 存 code (5min TTL)

   Client → POST /api/auth/verify { email, code }
   → Redis 验证 code → 创建/查找 User
   → 签发 JWT access_token (15min) + refresh_token
   → Redis: SET refresh:{uid}:{did} = hash(refresh) EX 604800
   → Response: { access_token, refresh_token, user }

2. 聊天:
   Client → POST /api/chat { characterId, content }
          Header: Authorization: Bearer <access_token>
   → Middleware: JWT verify → inject context (userId)
   → Route: requireUser() → userId
   → ChatService.sendMessage(userId, characterId, content)
   → ProviderGateway.chat(config, messages, prompt)
   → SSE 流式返回

3. Token 刷新:
   Client → POST /api/auth/refresh { refresh_token, device_id }
   → 验证 refresh hash → 签发新 access + refresh pair
   → Response: { access_token, refresh_token }

4. 注销:
   Client → POST /api/auth/logout
          Header: Authorization: Bearer <access_token>
   → jti → Redis: SET blocked:{jti} = 1 EX <剩余有效期>
   → DEL refresh:{uid}:{did} (如果提供)
```

---

## 8. 模块依赖图

```
middleware.ts
  ├─ depends on: runtime/gate.ts (Phase 3.6)          ✅ 已有
  ├─ depends on: lib/auth.ts (JWT verify)              🆕 Phase 4
  ├─ depends on: redis (blacklist, rate limit)         🆕 Phase 4
  └─ depends on: lib/context.ts                        ✅ 已有

lib/auth.ts (Phase 4 新建)
  ├─ depends on: JWT_SECRET env var                   ✅ 已有
  └─ depends on: server/services/crypto.ts             ✅ 已有

api/auth/* (Phase 4 新建)
  ├─ depends on: Resend email service                 🆕 需配置
  ├─ depends on: redis (verification code)            ✅ 已有 infra
  ├─ depends on: db (users table)                     ✅ 已有
  └─ depends on: lib/auth.ts (JWT issue)              🆕 Phase 4

server/services/chat.service.ts
  └─ NO CHANGES required                              ✅

server/services/provider-gateway.ts
  └─ NO CHANGES required                              ✅
```
