# Middleware Security Design

> **Phase**: 4.0 — Auth & Security Architecture Freeze
> **Date**: 2026-06-07

---

## 1. Middleware 分层架构

```
Request → Next.js Middleware
              │
              ├─ 1. Runtime Gate (Phase 3.6)
              │     └─ 未 ready → 503，终止
              │
              ├─ 2. Route Classification
              │     ├─ /api/health → 直接放行
              │     ├─ public routes → 放行
              │     ├─ protected routes → 需要认证
              │     └─ admin routes → 需要认证 + ADMIN role
              │
              ├─ 3. Rate Limiting (Redis)
              │     └─ 超限 → 429
              │
              └─ 4. Context Injection
                    └─ traceId + userId 注入到 async context
```

## 2. Route 分类表

### 2.1 Public Routes（无需认证）

| 路由 | 方法 | 说明 |
|------|------|------|
| `/api/health` | GET | 健康检查 |
| `/api/auth/send-code` | POST | 发送验证码 |
| `/api/auth/verify` | POST | 验证码验证（注册/登录合一） |
| `/api/auth/refresh` | POST | Token 刷新 |
| `/login` | GET | 登录页面 |
| `/` | GET | 首页（如有） |

### 2.2 Protected Routes（需要认证）

| 路由 | 方法 | 说明 |
|------|------|------|
| `/api/chat` | POST | 发送消息（SSE 流式） |
| `/api/auth/logout` | POST | 注销 |
| `/api/characters/*` | ALL | 角色 CRUD |
| `/api/adventure/*` | ALL | 冒险引擎（未来） |
| `/api/users/me` | GET | 当前用户信息 |
| `/api/users/me` | PATCH | 更新个人信息 |
| `/api/store/*` | ALL | 商城相关 |
| `/api/payment/*` | ALL | 支付相关 |
| `/characters/*` | GET | 角色页面 |
| `/chat/*` | GET | 聊天页面 |
| `/store` | GET | 商城页面 |
| `/me` | GET | 个人页面 |

### 2.3 Admin Routes（需要 ADMIN role）

| 路由 | 方法 | 说明 |
|------|------|------|
| `/api/admin/*` | ALL | 管理后台所有操作 |
| `/admin` | GET | 管理后台页面 |

---

## 3. API Guard 设计

### 3.1 认证流程

```
Middleware (src/middleware.ts):

1. 提取 Authorization header → "Bearer <token>"
2. 无 header + 路由在 public 表 → 放行
3. 无 header + 路由在 protected 表 → 401
4. 验证 JWT (HS256, JWT_SECRET)
   - 失败 → 401 { error: "Invalid token" }
5. 检查 jti 是否在 Redis blacklist (blocked:{jti})
   - 命中 → 401 { error: "Token revoked" }
6. 从 User 表查询当前用户
   - 不存在 → 401
   - status = BANNED → 403 { error: "Account banned" }
7. 检查 role
   - 路由在 admin 表 + role != ADMIN → 403
8. 注入 context: userId, role, jti
9. 放行
```

### 3.2 Guard 函数签名（设计）

```
// Middleware 中的辅助函数

function isPublicRoute(pathname: string): boolean
function isAdminRoute(pathname: string): boolean
function extractBearerToken(req: NextRequest): string | null
function verifyAccessToken(token: string): JwtPayload | null
function isTokenBlocked(jti: string): Promise<boolean>
function getUserById(userId: string): Promise<User | null>
```

---

## 4. SSE 请求的认证策略

### 4.1 决策：SSE 请求必须认证

**理由：**
- Chat API 消耗的是用户的 API Key（自备或平台），必须鉴权
- Memory 存储按 (userId, characterId) 隔离，必须先确定 userId
- 防止未授权用户滥用 API 配额和 token 成本

### 4.2 SSE 认证时机

SSE 连接的认证在**连接建立阶段**完成：

```
Client → POST /api/chat  (Authorization: Bearer <token>)
   → Middleware: 验证 token → 注入 context
   → Chat route handler: 已获得 userId, 无需再次认证
   → SSE stream: 整个 stream 共享同一认证上下文
```

SSE 连接建立后，**不需要在每条 delta 消息上重复认证**。连接断开后需重新认证。

### 4.3 特殊情况

| 场景 | 处理 |
|------|------|
| Token 在 SSE 中途过期 | 不影响已建立的连接（认证已完成） |
| 用户 logout 在 SSE 中途 | 连接断开（refresh key 已删除，但已建立的不受影响） |
| SSE 断线重连 | 客户端用新 access token 重连（通过 /api/auth/refresh 获取） |

---

## 5. 错误响应标准

| HTTP 状态 | 场景 | Response Body |
|-----------|------|---------------|
| 401 | 无 token 或 token 无效 | `{ success: false, error: "Authentication required" }` |
| 401 | Token 过期 | `{ success: false, error: "Token expired" }` |
| 401 | Token 已吊销（logout） | `{ success: false, error: "Session ended" }` |
| 403 | 用户被禁 | `{ success: false, error: "Account suspended" }` |
| 403 | 权限不足 | `{ success: false, error: "Insufficient permissions" }` |
| 429 | 频率限制 | `{ success: false, error: "Too many requests" }` |
| 503 | Runtime 未 ready | `{ success: false, error: "Runtime not ready" }` |

---

## 6. Middleware 执行顺序

```
                         Request
                            │
                    ┌───────▼───────┐
                    │  Runtime Gate  │
                    │  (Phase 3.6)   │
                    └───────┬───────┘
                            │ ready
                    ┌───────▼───────┐
                    │ /api/health?   │──Yes──▶ 放行
                    └───────┬───────┘
                            │ No
                    ┌───────▼───────┐
                    │ Rate Limiter   │
                    │ (Redis)        │──429──▶ 拒绝
                    └───────┬───────┘
                            │ pass
                    ┌───────▼───────┐
                    │ Public Route?  │──Yes──▶ 放行 (无 userId)
                    └───────┬───────┘
                            │ No
                    ┌───────▼───────┐
                    │ JWT Verify     │──Fail──▶ 401
                    └───────┬───────┘
                            │ valid
                    ┌───────▼───────┐
                    │ Blacklist?     │──Yes──▶ 401
                    └───────┬───────┘
                            │ No
                    ┌───────▼───────┐
                    │ User Status?   │──BANNED──▶ 403
                    └───────┬───────┘
                            │ ACTIVE
                    ┌───────▼───────┐
                    │ Admin Route?   │──Yes + non-ADMIN──▶ 403
                    └───────┬───────┘
                            │ OK
                    ┌───────▼───────┐
                    │ Inject Context │
                    │ (userId, role) │
                    └───────┬───────┘
                            │
                    ┌───────▼───────┐
                    │  Route Handler │
                    └───────────────┘
```
