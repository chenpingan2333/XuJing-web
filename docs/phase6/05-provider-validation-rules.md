# Phase 6 — Provider Validation Rules

> **版本**: V1.0 | **日期**: 2026-06-07

---

## 1. 输入校验（Zod Schema）

### 1.1 创建 Provider

```typescript
const CreateApiConfigSchema = z.object({
  name: z.string()
    .min(1, "名称不能为空")
    .max(50, "名称最长 50 个字符"),

  platform: z.enum([
    "OPENAI", "ANTHROPIC", "GEMINI",
    "DEEPSEEK", "GROK",
    "CUSTOM_OPENAI", "CUSTOM_ANTHROPIC", "CUSTOM_GEMINI",
  ]),

  apiUrl: z.string()
    .url("请输入有效的 URL")
    .min(1, "API 地址不能为空"),

  apiKey: z.string()
    .min(8, "API Key 至少 8 个字符"),

  modelId: z.string()
    .min(1, "模型 ID 不能为空")
    .max(100, "模型 ID 最长 100 个字符"),

  isDefault: z.boolean().optional().default(false),
});
```

### 1.2 更新 Provider

```typescript
const UpdateApiConfigSchema = z.object({
  name: z.string().min(1).max(50).optional(),
  apiUrl: z.string().url().optional(),
  apiKey: z.string().min(8).optional(),
  modelId: z.string().min(1).max(100).optional(),
  isDefault: z.boolean().optional(),
});
```

### 1.3 测试连接

```typescript
const TestConnectionSchema = z.object({
  // 无 body 参数 — 通过 URL params 获取 configId
});
```

## 2. 业务规则校验

### 2.1 创建时

| 规则 | 校验方式 | 错误响应 |
|------|---------|---------|
| 名称不能与已有 Provider 重名 | DB 查询同用户下同名 config | 400 "已存在同名配置" |
| API Key 不为纯空格 | `.trim().length >= 8` | 400 "API Key 格式无效" |
| CUSTOM 类型必须提供完整 URL | platform 包含 CUSTOM → URL 不与默认值相同 | 仅前端提示（不强制） |

### 2.2 更新时

| 规则 | 校验方式 | 错误响应 |
|------|---------|---------|
| config 存在 | `findById` | 404 "配置不存在" |
| 归属校验 | `config.userId === auth.userId` | 403 "无权操作" |
| platform 不可更改 | 请求体中含 platform → 忽略或报错 | 前端禁止发送 platform 字段 |

### 2.3 删除时

| 规则 | 校验方式 | 错误响应 |
|------|---------|---------|
| 归属校验 | `config.userId === auth.userId` | 403 "无权操作" |
| 可删除默认 Provider | 无限制 | — |
| 删除后 VIP 自动回退 | 客户端判断: 列表为空 → 标记回退 | — |

### 2.4 测试连接时

| 规则 | 校验方式 | 错误响应 |
|------|---------|---------|
| 归属校验 | `config.userId === auth.userId` | 403 "无权操作" |
| 超时 | `AbortController` 10s | 408 "连接超时" |
| API Key 可解密 | `decryptApiKey` 不抛异常 | 500 "密钥解密失败" |

## 3. 默认 Provider 规则

| 场景 | 行为 |
|------|------|
| 用户创建第一个 Provider | 自动设为默认（`isDefault: true`） |
| 用户创建额外 Provider | 默认不开启 `isDefault` |
| 用户手动切换默认 | `PUT /api/api-configs/[id]/default` |
| 删除当前默认 Provider | 无自动回退到其他；列表无默认标记 |
| VIP 无自定义默认 | 聊天使用系统模型 |
| FREE 无默认 | 聊天返回"未配置 API"提示 |

## 4. 安全校验清单

| 层级 | 检查 | 实现位置 |
|------|------|---------|
| Middleware | JWT 验证 + JTI 黑名单 | ✅ 已有 |
| Route | `requireAuth()` | Phase 6.1 添加 |
| Route | Zod schema 校验 | Phase 6.1 添加 |
| Service | 归属校验 `config.userId === userId` | ✅ 已有 |
| Service | AES 加密 apiKey | ✅ 已有 |
| Route | 响应脱敏 `apiKeyEncrypted: "********"` | ✅ Service 已有 |
| DB | FK 约束 `user_id → users.id` | ✅ 已有 |
| DB | 部分唯一索引 `is_default` | ✅ 已有 |

## 5. 错误码汇总

| HTTP | 错误信息 | 触发条件 |
|------|---------|---------|
| 400 | Invalid JSON body | 请求体非 JSON |
| 400 | `{field}` is required | Zod 必填校验失败 |
| 400 | 已存在同名配置 | 同用户下 name 重复 |
| 401 | Authentication required | 无 token |
| 403 | 无权操作 | config 不属于当前用户 |
| 404 | 配置不存在 | configId 无效 |
| 408 | 连接超时 | 测试连接 10s 未响应 |
| 500 | Internal server error | 未预期异常 |

## 6. 前端校验（补充）

| 字段 | 前端即时校验 | 说明 |
|------|------------|------|
| 名称 | 非空 + ≤50 字符 | 输入时实时检查 |
| API 地址 | URL 格式 | 选择 Platform 后自动填充默认值 |
| API Key | ≥8 字符 | 密码框，默认隐藏 |
| 模型 ID | 非空 + ≤100 字符 | 选择 Platform 后显示 placeholder 建议 |
| 测试连接 | — | 按钮触发，显示 loading 状态 10 秒 |

---

## 7. 文档状态

全部 5 份 Phase 6 Freeze 文档已完成：

| # | 文档 | 状态 |
|---|------|------|
| 01 | API Provider Architecture | ✅ |
| 02 | Schema Review | ✅ |
| 03 | Page Design | ✅ |
| 04 | Routing & User Flow | ✅ |
| 05 | Validation Rules | ✅ |

**验收通过后，进入 Phase 6.1: API Connection Implementation。**