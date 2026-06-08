# Auth Architecture Design

> **Phase**: 4.0 — Auth & Security Architecture Freeze
> **Date**: 2026-06-07
> **Status**: Design Freeze (no implementation)

---

## 1. Session 模型选择

### 1.1 JWT vs Redis Session 对比

| 维度 | JWT (自包含) | Redis Session |
|------|-------------|---------------|
| **性能** | 零 IO，直接验签 | 每次请求查 Redis |
| **吊销** | 需黑名单机制 | 直接删 key，即时生效 |
| **扩展性** | 无状态，天然水平扩展 | Redis 成为瓶颈 |
| **体积** | Token 较大（~200B header） | Session ID 轻量 |
| **多设备** | 每设备独立 token | 每设备独立 session key |
| **安全性** | 密钥泄露 = 全部伪造 | 窃取单个 session 影响有限 |
| **复杂度** | 需自行管理 refresh/revoke | Redis 承担状态管理 |

### 1.2 最终选择：JWT Access Token + Redis Refresh Token（混合模型）

**理由：**
- MVP 阶段部署简单（Docker 单机），Redis 已存在
- Access Token 短时效（15 分钟），Refresh Token 长时效（7 天）
- 注销即时生效（Refresh Token 从 Redis 删除）
- Access Token 验证零 IO，高频请求性能最优
- 未来扩展多实例时 Access Token 仍然无状态

### 1.3 Token 结构

**Access Token (JWT, HS256):**
```
Header: { "alg": "HS256", "typ": "JWT" }
Payload:
  sub: userId (UUID v7)
  role: "USER" | "ADMIN"
  iat: issued_at (epoch seconds)
  exp: expires_at (iat + 900s = 15 min)
  jti: token_id (UUID v7, 用于审计)
Signature: HMAC-SHA256(JWT_SECRET)
```

**Refresh Token:**
- 格式：32 bytes random hex string
- 存储：Redis `refresh:{userId}:{deviceId}` = token_hash
- 有效期：7 天（与 Redis TTL 一致）
- 不可用于 API 鉴权，仅用于换取新 Access Token

---

## 2. 登录流程

### 2.1 Register（注册即登录）

```
User → POST /api/auth/send-code  { email }
  → Server: 生成 6 位验证码
  → Redis: SET code:{email} = code EX 300
  → Resend: 发送邮件
  → Response: { success: true }

User → POST /api/auth/verify    { email, code }
  → Server: 检查 code:{email} 是否匹配
  → 不匹配 → 400 "Invalid or expired code"
  → 匹配后:
      → 查找 User by email (LOWER)
      → 不存在 → INSERT User (status=ACTIVE)
      → 存在 BANNED → 403 "Account banned"
      → 生成 access_token + refresh_token
      → Redis: SET refresh:{userId}:{deviceId} = refresh_hash EX 604800
      → Redis: DEL code:{email}
      → Response: { access_token, refresh_token, user: { id, email, role } }
```

### 2.2 Login（已有账号）

流程与 Register 完全相同。邮箱验证码登录，无密码。

### 2.3 Token Refresh

```
User → POST /api/auth/refresh  { refresh_token, device_id }
  → Server: 从 refresh_token 提取 userId
  → Redis: GET refresh:{userId}:{deviceId}
  → 不存在或不匹配 → 401 "Session expired"
  → 匹配:
      → 生成新 access_token + refresh_token pair
      → 新 refresh 覆盖旧值，重置 TTL
      → Response: { access_token, refresh_token }
```

### 2.4 Logout

```
User → POST /api/auth/logout  { refresh_token?, device_id? }
  (Authorization: Bearer <access_token>)

  → 如果提供 refresh_token:
      → 提取 userId，Redis: DEL refresh:{userId}:{deviceId}
  → 如果不提供（仅注销当前 access）：
      → access_token 的 jti 加入 Redis blacklist:
        SET blocked:{jti} = 1 EX <剩余有效期>
  → Response: { success: true }
```

---

## 3. Token 生命周期

```
┌──────────┐     ┌──────────┐     ┌──────────┐
│  生成     │────▶│  活跃期   │────▶│  过期     │
│ Access   │     │ 0~15 min │     │ >15 min  │
│ Refresh  │     │ 0~7 day  │     │ >7 day   │
└──────────┘     └──────────┘     └──────────┘
                       │
                       ▼ (Refresh)
                 ┌──────────┐
                 │  续期     │
                 │ 新 Access │
                 │ 新 Refresh│
                 │ (TTL 重置) │
                 └──────────┘

边缘情况处理：
- Access 过期 + Refresh 有效 → 前端自动用 refresh 换新 access，用户无感知
- Access 过期 + Refresh 也过期 → 401，前端跳转登录页
- Refresh 被管理员吊销 → 同上
- 用户被封禁(BANNED) → 即使 token 有效也拒绝，返回 403
```

---

## 4. Refresh 机制

### 4.1 Refresh Token Rotation

每次使用 refresh token 换取新 access token 时，**同时签发新的 refresh token**，旧 refresh token 立即失效。

```
刷新前: Redis refresh:{uid}:{did} = hash_old
请求 POST /api/auth/refresh
刷新后: Redis refresh:{uid}:{did} = hash_new  (覆盖写入)
```

### 4.2 防重放攻击

如果同一个 refresh token 被使用两次（意味着可能被盗用）：
- 第二次使用时发现 Redis 中对应 key 的值已变更
- 判定为 replay attack
- 立即删除 `refresh:{uid}:{did}`
- 强制该设备重新登录
- 记录 AdminLog（REPLAY_DETECTED）

---

## 5. Multi-Device 策略

### 5.1 设备标识

每个客户端生成持久化 `device_id`（UUID v7，存 localStorage），用于区分不同设备。

### 5.2 策略选择：允许多设备独立登录

| 场景 | 行为 |
|------|------|
| 用户手机登录 | 新 session，独立 refresh key |
| 用户电脑同时登录 | 新 device_id，独立 refresh key |
| 手机 logout | 仅删除手机对应的 refresh key，电脑不受影响 |
| 全局 logout（"退出所有设备"） | `DEL refresh:{userId}:*` |
| 设备上限 | MVP 不限制，未来可设 max 5 devices |

### 5.3 Redis Key 设计（多设备）

```
refresh:{userId}:{deviceId} = <refresh_token_hash>
TTL = 604800 (7 days)

blocked:{jti} = 1
TTL = <access token 剩余有效期>
```

---

## 6. 安全约束

| 规则 | 说明 |
|------|------|
| JWT_SECRET | 至少 32 字节，环境变量注入，禁止硬编码 |
| Access Token TTL | 15 分钟（短期，减少泄露风险） |
| Refresh Token TTL | 7 天 |
| 验证码 TTL | 5 分钟 |
| 验证码每日上限 | 每邮箱 10 次/天 |
| Token 传输 | 仅 HTTPS（生产），开发 localhost 例外 |
| Token 存储 | 前端存内存或 httpOnly cookie（推荐），禁止 localStorage 存 access token 在非 https 环境 |
