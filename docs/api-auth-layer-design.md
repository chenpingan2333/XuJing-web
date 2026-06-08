# API Auth Layer Design

> **Phase**: 4.0 — Auth & Security Architecture Freeze
> **Date**: 2026-06-07

---

## 1. API Auth Wrapper 设计

### 1.1 设计目标

所有 API Route Handler 不直接处理认证逻辑，通过 Middleware + Context 注入已认证的 userId。

### 1.2 三层认证架构

```
┌─────────────────────────────────────┐
│ Layer 1: Middleware (全局)           │
│ - JWT 验证 + Blacklist 检查         │
│ - User 状态检查 (BANNED)            │
│ - Role 检查 (ADMIN)                 │
│ - Context 注入 (userId, role, jti) │
├─────────────────────────────────────┤
│ Layer 2: Route Handler (可选)       │
│ - 业务级权限检查                    │
│   (e.g. 角色所有者才能编辑角色)     │
├─────────────────────────────────────┤
│ Layer 3: Service Layer (隐式)       │
│ - 通过 Repository 层的数据隔离      │
│   (e.g. 只能查自己的角色列表)       │
└─────────────────────────────────────┘
```

---

## 2. Request Context 注入机制

### 2.1 现有 Context 结构（Phase 3.6）

```
// src/lib/context.ts — 已存在
interface RequestContext {
  user: AuthUser | null;
  traceId: string;
  timestamp: number;
}
```

### 2.2 Phase 4 扩展

```
// 扩展后的 AuthUser
interface AuthUser {
  userId: string;        // UUID v7, not null after auth
  email: string;
  role: "USER" | "ADMIN";
  jti: string;           // token_id, 用于审计
}

// 未认证请求: AuthUser 为 null
// 已认证请求: AuthUser 完整填充
```

### 2.3 Context 在 Route Handler 中的使用

```
// Route handler 中获取当前用户
// 方式: 从 async context 中读取（非参数传递）

import { getContext } from "@/lib/context";

export async function POST(req: Request) {
  const ctx = getContext();
  if (!ctx.user) {
    // 这种情况不应出现（middleware 已拦截）
    return jsonErr("Authentication required", 401);
  }

  const userId = ctx.user.userId;
  // ... 业务逻辑
}
```

---

## 3. userId 传递方式

### 3.1 决策表

| 方式 | 说明 | 采用 |
|------|------|------|
| URL 参数 (`?userId=xxx`) | 不安全，可被篡改 | ❌ |
| Header (`X-User-Id`) | 可被篡改 | ❌ |
| JWT payload (sub) | Middleware 解析后注入 context | ✅ |
| Cookie (httpOnly) | 备选方案，与 Bearer Token 并存 | 🔮 未来 |

### 3.2 传递链路

```
Client (Authorization: Bearer <JWT>)
   → Middleware: jwt.verify() → 提取 { sub: userId, role, jti }
   → Context: setContext({ user: { userId, role, jti } })
   → Route Handler: getContext().user.userId
   → Service Layer: 接收 userId 作为参数（显式）
```

### 3.3 Service Layer 约定

Service 层不直接从 context 读 userId。**userId 必须作为方法参数传入**：

```
// ✅ Correct: 显式传递
chatService.sendMessage(userId, characterId, content)

// ❌ Wrong: 从 context 隐式获取
chatService.sendMessage(characterId, content)
// Service 内部: const { userId } = getContext()
```

这个约定保持 Service 层纯净：可测试、不依赖 HTTP context。

---

## 4. API Auth Helper

### 4.1 函数设计（声明，不实现）

```
// src/app/api/_base/auth.ts — Phase 4 升级

// 从 context 获取已认证用户（middleware 已保证非 null）
function requireUser(): AuthUser

// 检查是否为 ADMIN
function requireAdmin(): AuthUser (throws if role != ADMIN)

// 检查资源所有权
function requireOwner(resourceOwnerId: string): void
  (throws 403 if ctx.user.userId != resourceOwnerId)
```

### 4.2 使用示例（伪代码）

```
// 公开端点
export async function POST(req: Request) {
  // middleware 已处理，无需认证
  const body = await req.json();
  // ...
}

// 受保护端点
export async function GET(req: Request) {
  const user = requireUser();
  const characters = await characterRepository.findByUser(user.userId);
  return jsonOk(characters);
}

// 管理员端点
export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  requireAdmin();
  await adminService.unlistCharacter(params.id);
  return jsonOk({ deleted: true });
}

// 所有权端点
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const user = requireUser();
  const character = await characterRepository.findById(params.id);
  requireOwner(character.userId);
  // ... update
}
```

---

## 5. 错误响应标准

### 5.1 401 Unauthorized

```
// 未提供 token 或 token 无效
{
  "success": false,
  "error": "Authentication required",
  "timestamp": "2026-06-07T..."
}
HTTP 401

// Token 过期
{
  "success": false,
  "error": "Token expired",
  "timestamp": "2026-06-07T..."
}
HTTP 401

// Token 已吊销 (logout)
{
  "success": false,
  "error": "Session ended. Please login again.",
  "timestamp": "2026-06-07T..."
}
HTTP 401
```

### 5.2 403 Forbidden

```
// 用户被禁
{
  "success": false,
  "error": "Account suspended. Contact support.",
  "timestamp": "2026-06-07T..."
}
HTTP 403

// 权限不足
{
  "success": false,
  "error": "Admin access required",
  "timestamp": "2026-06-07T..."
}
HTTP 403

// 资源所有权不匹配
{
  "success": false,
  "error": "You don't have permission to modify this resource",
  "timestamp": "2026-06-07T..."
}
HTTP 403
```

### 5.3 429 Too Many Requests

```
{
  "success": false,
  "error": "Too many requests. Try again in 60 seconds.",
  "retryAfter": 60,
  "timestamp": "2026-06-07T..."
}
HTTP 429
```

---

## 6. 与现有 Runtime Gate 的集成

Phase 3.6 Runtime Gate 在 middleware 中先于 Auth 执行：

```
Request
  → Runtime Gate (未 ready → 503)
  → Auth (未认证 → 401)
  → Route Handler

两个 Layer 互不干扰：
- Gate 失败返回 503，Auth 根本不触发
- Gate 通过后，Auth 独立执行
- /api/health 绕过两者（直接放行）
```
