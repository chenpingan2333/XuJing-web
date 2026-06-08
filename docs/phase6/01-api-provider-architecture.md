# Phase 6 — API Provider Architecture

> **版本**: V1.0 | **日期**: 2026-06-07 | **阶段**: Phase 6 Freeze
> **状态**: 设计冻结，待验收后进入 Phase 6.1 实施

---

## 1. 模块定位

API 连接系统是叙境的**核心商业逻辑**——它决定了用户能否使用 AI 聊天。

| 用户类型 | API 策略 | 说明 |
|---------|---------|------|
| **FREE** | 必须自备 API Key | 无自备 Key → 聊天返回引导提示 |
| **VIP** | 默认使用叙境系统模型 + 可选自备 Key | 系统模型隐藏真实名称，前端统一显示"叙境专属模型" |

## 2. 架构分层

```
┌──────────────────────────────────┐
│  UI Layer (Phase 6.1 新建)       │
│  /api-connections                 │
│  列表 / 新建 / 编辑 / 删除 / 测试   │
└──────────────┬───────────────────┘
               │ fetch
┌──────────────▼───────────────────┐
│  API Routes (Phase 6.1 新建)     │
│  GET    /api/api-configs          │  ← 列表
│  POST   /api/api-configs          │  ← 创建
│  PUT    /api/api-configs/[id]     │  ← 更新
│  DELETE /api/api-configs/[id]     │  ← 删除
│  POST   /api/api-configs/[id]/test│  ← 测试连接
│  PUT    /api/api-configs/[id]/default│ ← 设为默认
└──────────────┬───────────────────┘
               │
┌──────────────▼───────────────────┐
│  Service Layer (已冻结，不改)      │
│  ApiConfigService                 │
│  - listConfigs / createConfig     │
│  - updateConfig / deleteConfig    │
│  - setDefaultConfig / testConfig  │
├──────────────────────────────────┤
│  ProviderGateway (已冻结，不改)    │
│  - OpenAI / Anthropic / Gemini    │
│  - DeepSeek / Grok / Custom       │
│  - testConnection()               │
├──────────────────────────────────┤
│  Crypto (已冻结)                  │
│  - AES-256-CBC encrypt/decrypt    │
└──────────────┬───────────────────┘
               │
┌──────────────▼───────────────────┐
│  Data Layer (已冻结，不改)         │
│  api_configs 表                   │
│  ApiConfigRepository              │
└──────────────────────────────────┘
```

## 3. Provider 类型矩阵

| Platform Enum | 协议族 | 默认 API URL | 认证方式 |
|--------------|--------|-------------|---------|
| `OPENAI` | OpenAI Compatible | `https://api.openai.com` | `Bearer <key>` |
| `ANTHROPIC` | Anthropic Messages | `https://api.anthropic.com` | `x-api-key` |
| `GEMINI` | Gemini generateContent | `https://generativelanguage.googleapis.com` | URL query `?key=` |
| `DEEPSEEK` | OpenAI Compatible | `https://api.deepseek.com` | `Bearer <key>` |
| `GROK` | OpenAI Compatible | `https://api.x.ai` | `Bearer <key>` |
| `CUSTOM_OPENAI` | OpenAI Compatible | （用户自定义） | `Bearer <key>` |
| `CUSTOM_ANTHROPIC` | Anthropic Messages | （用户自定义） | `x-api-key` |
| `CUSTOM_GEMINI` | Gemini generateContent | （用户自定义） | URL query `?key=` |

> **协议族归并**：三个底层协议（OpenAI Compatible / Anthropic Messages / Gemini generateContent），ProviderGateway 已全部实现。

## 4. 数据模型（现有，不改）

表 `api_configs`（9 业务列 + 2 时间戳）：

| 列 | 类型 | 说明 |
|----|------|------|
| `id` | uuid PK | |
| `user_id` | uuid FK → users | 所属用户 |
| `name` | varchar(100) | 用户自定义名称 |
| `platform` | enum api_platform | 8 个枚举值 |
| `api_url` | varchar(500) | API 端点地址 |
| `api_key_encrypted` | varchar(500) | AES-256-CBC 密文 |
| `model_id` | varchar(100) | 模型标识符 |
| `is_active` | boolean | 是否启用（默认 true） |
| `is_default` | boolean | 是否默认（每用户至多一个） |

> 约束：`idx_api_configs_user_default` 部分唯一索引确保每用户至多一个默认配置。

## 5. 关键设计决策

### D1: API Key 绝不对前端暴露
- **决策**: `listConfigs` 返回时 `apiKeyEncrypted` 字段脱敏为 `"********"`
- **编辑时**: 用户输入新 key → 后端 AES 加密 → 存入 `api_key_encrypted`
- **现有实现**: `ApiConfigService.listConfigs` 已做脱敏

### D2: VIP 系统模型为虚拟 Provider
- VIP 用户看到"叙境专属模型 (DeepSeek V4 Flash)"
- 这是**平台级配置**，不在 `api_configs` 表中
- 聊天时 `ChatService` 判断 `isVip && !userConfig` → 使用 `getPlatformConfig()`
- **Phase 6 UI 仅展示此状态，不操作它**

### D3: 每个用户最多一个默认 Provider
- 部分唯一索引 `idx_api_configs_user_default` 保证
- `setDefault` 在事务内先清后设，防并发多默认

### D4: 测试连接超时 10 秒
- `ProviderGateway.testConnection` 使用 `AbortController` + 10s timeout

## 6. 与现有系统的交互边界

| 交互点 | 方向 | 状态 |
|-------|------|------|
| Auth middleware | 被动（路由受保护） | ✅ 已有 |
| ApiConfigService | 消费（只读调用） | ✅ 已有 |
| ProviderGateway.testConnection | 消费 | ✅ 已有 |
| ChatService | 消费者（通过 apiConfigRepository.findDefault） | ✅ 已有，不改 |
| Crypto.encryptApiKey | 消费 | ✅ 已有 |

## 7. Phase 6.1 待建清单

| 编号 | 交付物 | 类型 |
|------|-------|------|
| R1 | `GET /api/api-configs` | API Route |
| R2 | `POST /api/api-configs` | API Route |
| R3 | `PUT /api/api-configs/[id]` | API Route |
| R4 | `DELETE /api/api-configs/[id]` | API Route |
| R5 | `POST /api/api-configs/[id]/test` | API Route |
| R6 | `PUT /api/api-configs/[id]/default` | API Route |
| P1 | `/api-connections` 列表页 | Page |
| P2 | `/api-connections/new` 新建表单 | Page |
| P3 | `/api-connections/[id]/edit` 编辑表单 | Page |

---

**下一文档**: 02-api-provider-schema-review.md