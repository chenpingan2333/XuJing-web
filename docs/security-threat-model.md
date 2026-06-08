# Security Threat Model

> **Phase**: 4.0 — Auth & Security Architecture Freeze
> **Date**: 2026-06-07

---

## 1. 威胁模型范围

本模型覆盖叙境 MVP 阶段的 6 类核心威胁。每个威胁含：攻击向量、影响、缓解措施、残余风险。

---

## 2. SSRF 防护

### 2.1 攻击向量

用户通过 API Connection 配置自定义 API URL，攻击者在 URL 中指向内网服务：

```
POST /api/config
{ "apiUrl": "http://169.254.169.254/latest/meta-data/" }    // AWS metadata
{ "apiUrl": "http://10.0.0.1:6379/" }                        // 内网 Redis
{ "apiUrl": "http://localhost:5432/" }                        // 本地 PG
```

ProviderGateway 的 `fetch()` 会从服务器端请求这些地址。

### 2.2 影响

- 读取云平台 metadata（含临时凭证）
- 探测内网拓扑
- 访问未授权的内部服务

### 2.3 缓解措施

| 层 | 措施 | 说明 |
|----|------|------|
| **URL 解析** | 在发起请求前解析 hostname | 拒绝 RFC 1918、localhost、link-local |
| **DNS 解析后检查** | `dns.resolve()` 后二次校验 IP | 防止 DNS rebinding |
| **Blocklist** | 硬编码禁止的 IP 段 | `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `127.0.0.0/8`, `169.254.0.0/16`, `0.0.0.0/8` |
| **Allowlist** | 仅允许 `https://`（生产环境） | MVP 开发阶段允许 `http://localhost` |
| **Timeout** | fetch 超时 30 秒 | 防止慢速连接占用资源 |
| **Redirect Restriction** | 不跟随重定向到内网 | fetch `redirect: "error"` 或手动检查 |

### 2.4 残余风险

- DNS rebinding 时间窗口攻击（极低概率）
- 用户使用 ngrok/localhost.run 等隧道（合法用例，应允许）

---

## 3. API 滥用防护

### 3.1 攻击向量

| 攻击 | 描述 | 影响 |
|------|------|------|
| **Credential Stuffing** | 暴力尝试验证码 | 无密码体系下不适用 |
| **验证码爆破** | 遍历 6 位验证码 | 低（100万组合 + 5分钟过期 + 限频） |
| **API Key 探测** | 未认证用户调用 chat API | 消耗平台资源或用户配额 |
| **批量注册** | 脚本自动注册大量账号 | 垃圾账号 |
| **Token 重放** | 复用 access token | 已在 middleware 层防御 |

### 3.2 缓解措施

| 措施 | 说明 |
|------|------|
| **Rate Limiting** | Per IP + Per User 双层限流（见 redis-auth-design.md） |
| **验证码限频** | 60s 内每邮箱 1 次，每天 10 次 |
| **JWT 短时效** | 15 分钟，减少窃取后可用窗口 |
| **JTI Blacklist** | Logout 后 token 不可复用 |
| **Refresh Rotation** | Refresh token 一次性使用 |
| **注册验证** | 必须通过真实邮箱验证码 |
| **Middleware 全局鉴权** | 所有非 public 路由强制认证 |

---

## 4. SSE 滥用风险

### 4.1 攻击向量

| 攻击 | 描述 |
|------|------|
| **SSE 连接耗尽** | 攻击者打开大量 SSE 连接，耗尽服务器资源 |
| **Idle Connection** | 建立 SSE 但不发消息，占用连接 |
| **Reconnection Storm** | 异常频繁重连 |

### 4.2 缓解措施

| 措施 | 说明 |
|------|------|
| **Authentication Required** | SSE 建立前必须通过 JWT 验证 |
| **Per-User Connection Limit** | 同一用户最多 3 个并发 SSE 连接 |
| **Connection Timeout** | 无消息的 SSE 连接 5 分钟后自动关闭 |
| **Rate Limit on Connect** | 同用户 60 秒内最多建立 5 次 SSE 连接 |
| **Backpressure** | 如果 AI API 响应卡住，不无限期持有连接 |

### 4.3 SSE 连接生命周期

```
Client Connect
  → Auth check (JWT verify)
  → Check concurrent connections < 3
  → Accept connection
  → Start idle timer (5 min)
  → On message received: reset idle timer
  → On idle timeout: close connection with { type: "error", message: "Connection timeout" }
  → Client reconnects: same auth flow
```

---

## 5. Replay Attack 防护

### 5.1 攻击向量

攻击者截获合法用户的 access token，在 token 有效期内重放请求。

### 5.2 缓解措施

| 措施 | 说明 |
|------|------|
| **HTTPS 强制**（生产） | 防止中间人截获 token |
| **短期 Access Token** | 15 分钟，缩短攻击窗口 |
| **Refresh Token Rotation** | 旧 refresh 用完即废，检测到二次使用 = 全 session 注销 |
| **JTI Blacklist** | Logout 后的 token 立即失效 |
| **IP Change Detection**（可选） | 同一 token 从不同 IP 使用 → 标记可疑 |

### 5.3 Refresh Token Replay 特殊处理

```
正常流程:
  Client 用 refresh_A 换取 access_B + refresh_B
  Redis 更新: refresh:{uid}:{did} = hash(refresh_B)

Replay 检测:
  Client(攻击者) 再次用 refresh_A 请求
  Server 发现 Redis 中 hash 值 ≠ hash(refresh_A)
  → 判定为 replay attack
  → DEL refresh:{uid}:{did}  (强制注销)
  → 返回 401
  → 写入 AdminLog: REPLAY_DETECTED
```

---

## 6. Chat Endpoint Abuse Model

### 6.1 攻击向量

| 攻击 | 描述 | 缓解 |
|------|------|------|
| **Token 消耗轰炸** | 大量发送消息消耗用户的 AI API 配额 | Rate limit: 20 msg/min per user |
| **Prompt Injection** | 通过消息内容注入恶意 system prompt | 用户消息与 system prompt 分离，不可覆盖 |
| **Memory Pollution** | 故意输入垃圾内容污染记忆 | 记忆有 importance 权重 + 容量上限淘汰 |
| **API Key 泄露** | 如果错误日志包含了 API key | API key 仅在服务端解密，日志脱敏 |
| **Content Abuse** | 发送违法/违规内容 | 不在 MVP 范围；可后续接入内容审核 API |

### 6.2 Prompt Injection 防线

```
User Message ("假装你是一只狗")
   → ChatService: 追加到 messages[] 末尾
   → System Prompt: 始终在最前面，不可被 messages 覆盖
   → 角色设定: 在 system prompt 中固定
   → AI 模型自身的 prompt hierarchy 提供额外防护

结论: Prompt injection 风险由 AI 模型自身防护承担，
应用层不做额外的 prompt sanitization（会破坏正常对话）。
```

### 6.3 API Key 泄露防护链

```
存入: api_config.api_key_encrypted = AES-256-CBC(api_key, ENV_KEY)
读取: ProviderGateway 内部 decryptApiKey() → 仅在内存中使用
传输: API key 放入 fetch Authorization header (HTTPS)
日志: 日志中不得出现 decrypted API key
响应: API key 永不在 Response Body 中出现
错误: 错误消息不包含 API key 的任何部分（明文或密文）
```

---

## 7. 威胁优先级矩阵

| 威胁 | 可能性 | 影响 | 优先级 | MVP 处理 |
|------|--------|------|--------|----------|
| SSRF via custom API URL | 中 | 高 | **P0** | URL 校验 + IP blocklist |
| SSE 连接耗尽 | 低 | 中 | **P1** | Per-user 连接限制 |
| Access token replay | 低 | 高 | **P1** | JTI blacklist + HTTPS |
| 验证码爆破 | 低 | 中 | **P2** | Rate limit + TTL |
| Prompt injection | 高 | 低 | **P2** | 模型自身防护 |
| Refresh token replay | 低 | 高 | **P1** | Rotation + replay detection |
| Memory pollution | 中 | 低 | **P3** | 容量上限淘汰 |
| 批量注册 | 低 | 低 | **P3** | 邮箱验证码 + IP 限频 |
