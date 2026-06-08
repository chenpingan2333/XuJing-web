# Redis Auth Design

> **Phase**: 4.0 — Auth & Security Architecture Freeze
> **Date**: 2026-06-07

---

## 1. Redis 在 Auth 系统中的角色

| 用途 | 数据结构 | 说明 |
|------|---------|------|
| 验证码缓存 | STRING | 5 分钟 TTL |
| Refresh Token 存储 | STRING | 7 天 TTL |
| Token Blacklist | STRING | 跟随 access token 剩余有效期 |
| Rate Limiter | SORTED SET | 滑动窗口 |
| 验证码发送频率 | STRING | 每日计数器 |

---

## 2. Key 设计规范

### 2.1 命名约定

```
{namespace}:{resource}:{identifier}
```

所有 key 前缀使用 `xujing:` 避免与同一 Redis 实例中的其他应用冲突。

### 2.2 Key 详细定义

| Key Pattern | 类型 | TTL | 说明 |
|-------------|------|-----|------|
| `xujing:code:{email}` | STRING | 300s | 邮箱验证码（6位数字） |
| `xujing:code:count:{email}:{date}` | STRING | 86400s | 某邮箱当日发送次数 |
| `xujing:refresh:{userId}:{deviceId}` | STRING | 604800s (7d) | Refresh token hash |
| `xujing:blocked:{jti}` | STRING | ≤900s | 吊销的 access token jti |
| `xujing:ratelimit:ip:{ip}:{route}` | SORTED SET | 窗口大小 | IP 级别限流 |
| `xujing:ratelimit:user:{userId}:{route}` | SORTED SET | 窗口大小 | 用户级别限流 |

### 2.3 Key 示例

```
# 验证码
xujing:code:user@example.com = "482917"
xujing:code:count:user@example.com:2026-06-07 = "5"

# Refresh Token
xujing:refresh:550e8400-e29b-41d4-a716-446655440000:abc123device = "a3f8b2c1... (sha256 hash)"

# Blacklist
xujing:blocked:660e8400-e29b-41d4-a716-446655440001 = "1"

# Rate Limit (IP)
xujing:ratelimit:ip:192.168.1.1:/api/chat = SORTED SET { timestamp: "req_id" }
```

---

## 3. Rate Limiting 设计

### 3.1 分层限流

| 层级 | 维度 | 路由 | 窗口 | 限制 |
|------|------|------|------|------|
| **L1** | Per IP | `/api/auth/send-code` | 60s | 3 次/分钟 |
| **L1** | Per IP | 所有 `/api/*` | 60s | 60 次/分钟 |
| **L2** | Per Email | `/api/auth/send-code` | 1 day | 10 次/天 |
| **L3** | Per User | `/api/chat` | 60s | 20 次/分钟 |
| **L3** | Per User | `/api/chat` | 1 day | 500 次/天 |
| **L3** | Per User | 其他 API | 60s | 100 次/分钟 |
| **Admin** | - | 所有 | - | 无限流（内网信任域） |

### 3.2 滑动窗口算法（Sliding Window）

使用 Redis SORTED SET 实现：

```
// 伪代码（声明，不实现）

// 检查限流
async function checkRateLimit(
  key: string,
  windowSeconds: number,
  maxRequests: number
): Promise<{ allowed: boolean; retryAfter?: number }> {
  const now = Date.now();
  const windowStart = now - windowSeconds * 1000;

  // 1. 移除窗口外的旧记录
  ZREMRANGEBYSCORE key 0 windowStart

  // 2. 统计窗口内请求数
  const count = ZCARD key

  if (count >= maxRequests) {
    const oldest = ZRANGE key 0 0 WITHSCORES
    const retryAfter = Math.ceil((oldest[1] + windowSeconds * 1000 - now) / 1000)
    return { allowed: false, retryAfter }
  }

  // 3. 添加当前请求
  ZADD key now <unique_id>
  EXPIRE key windowSeconds

  return { allowed: true }
}
```

### 3.3 限流响应

```
HTTP 429 Too Many Requests
Retry-After: 15

{
  "success": false,
  "error": "Too many requests. Try again in 15 seconds.",
  "retryAfter": 15,
  "timestamp": "2026-06-07T..."
}
```

---

## 4. Token Blacklist 机制

### 4.1 触发场景

| 场景 | 操作 |
|------|------|
| 用户主动 logout | 将当前 access token 的 `jti` 加入 blacklist |
| 检测到 replay attack | 将当前 access token 的 `jti` 加入 blacklist |
| 管理员封禁用户 | 将所有该用户的 refresh key 删除 + 当前 access jti blacklist |
| 管理员强制下线用户 | 删除用户所有 refresh key |

### 4.2 Blacklist 生命周期

```
blocked:{jti} = "1"
TTL = access token 的剩余有效期

// 例如：access token 在 10 分钟后过期，
// TTL = 600s，过期后 Redis 自动删除（无需清理）
```

### 4.3 性能考量

Access token 15 分钟过期，blacklist 条目自动清理，无需后台任务。在 token 验证时检查 blacklist 是 O(1) 操作，不影响请求性能。

---

## 5. 验证码存储设计

### 5.1 流程

```
1. 用户请求发送验证码
2. 检查当日发送次数 < 10
3. 生成 6 位随机数字
4. SET xujing:code:{email} = code EX 300
5. INCR xujing:code:count:{email}:{date}
6. EXPIRE xujing:code:count:{email}:{date} 86400
7. 调用 Resend 发送邮件

验证:
8. GET xujing:code:{email}
9. 匹配 → DEL key + 放行
10. 不匹配 → 400 "Invalid or expired code"
```

### 5.2 安全措施

- 验证码仅数字（0-9），6 位 → 100 万种组合
- 5 分钟过期
- 每日每邮箱 10 次上限
- 验证成功后立即删除 code key
- 同一邮箱在 60 秒内仅允许请求 1 次验证码（防轰炸）

---

## 6. 数据持久化

Redis 已配置 `--appendonly yes`（docker-compose.yml），重启后数据不丢失。无需额外备份策略。

---

## 7. 监控 Key

Production 阶段可选监控指标：

| 指标 | Redis 命令 | 含义 |
|------|-----------|------|
| 活跃 session 数 | `KEYS xujing:refresh:*` | 当前登录用户数 |
| Blacklist 大小 | `KEYS xujing:blocked:*` | 吊销 token 数量 |
| 验证码发送量 | `GET xujing:code:count:*` | 日发送统计 |
| 限流触发次数 | 应用层计数 | 滥用趋势 |
