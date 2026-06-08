# Phase 6 — API Provider Schema Review

> **版本**: V1.0 | **日期**: 2026-06-07

---

## 1. 现有 Schema 审计

### api_configs 表

| 维度 | 状态 | 详情 |
|------|------|------|
| **表结构** | ✅ 通过 | 11 列，含 PK、FK、索引 |
| **枚举类型** | ✅ 通过 | 8 个 platform 值覆盖全部需求 |
| **唯一约束** | ✅ 通过 | 每用户至多一个 is_default |
| **外键** | ✅ 通过 | user_id → users.id |
| **AES 加密** | ✅ 通过 | AES-256-CBC，密钥来自环境变量 |
| **脱敏输出** | ✅ 通过 | listConfigs 返回 `"********"` |

### 索引审计

| 索引名 | 类型 | 列 | 评估 |
|-------|------|-----|------|
| `api_configs_pkey` | PK | id | ✅ |
| `idx_api_configs_user_id` | B-tree | user_id | ✅ 按用户查询列表 |
| `idx_api_configs_user_default` | Partial Unique | user_id WHERE is_default=true | ✅ 防多默认 |

> **结论**: 无需新增索引。现有两个索引覆盖 `findByUser`（列表）和 `findDefault`（单个默认查询）。

## 2. Repository 方法审计

| 方法 | 参数 | 返回 | 事务安全 | 评估 |
|------|------|------|---------|------|
| `findById` | id | single | N/A | ✅ |
| `findByUser` | userId | array | N/A | ✅ |
| `findDefault` | userId | single | N/A | ✅ 使用部分唯一索引 |
| `create` | data | inserted row | 单语句 | ✅ |
| `update` | id, data | updated row | 单语句 | ✅ |
| `setDefault` | userId, configId | updated row | 事务（先清后设） | ✅ 防并发 |
| `delete` | id | void | 单语句 | ✅ |

> **结论**: 所有 CRUD 操作已完备，无需新增方法。

## 3. Service 层审计

| 方法 | 安全检查 | 评估 |
|------|---------|------|
| `listConfigs` | 脱敏 apiKeyEncrypted → `"********"` | ✅ |
| `createConfig` | AES 加密 apiKey | ✅ |
| `updateConfig` | 仅加密新传入的 apiKey | ✅ |
| `deleteConfig` | 校验 `config.userId === userId` | ✅ |
| `setDefaultConfig` | 校验归属 | ✅ |
| `testConfig` | 校验归属 + 委托 ProviderGateway | ✅ |

> **结论**: 所有业务逻辑已完备，Phase 6.1 仅需暴露为 API Routes。

## 4. ProviderGateway 审计

| 平台 | 协议 | 流式聊天 | 测试连接 | 评估 |
|------|------|---------|---------|------|
| OPENAI | OpenAI Compatible | ✅ | ✅ | |
| DEEPSEEK | OpenAI Compatible | ✅ | ✅ | |
| GROK | OpenAI Compatible | ✅ | ✅ | |
| CUSTOM_OPENAI | OpenAI Compatible | ✅ | ✅ | |
| ANTHROPIC | Anthropic Messages | ✅ | 部分（走 OpenAI 路径） | ⚠️ 见下 |
| CUSTOM_ANTHROPIC | Anthropic Messages | ✅ | 部分 | ⚠️ |
| GEMINI | Gemini generateContent | ✅ | 部分 | ⚠️ |
| CUSTOM_GEMINI | Gemini generateContent | ✅ | 部分 | ⚠️ |

> ⚠️ `testConnection` 当前仅适配 OpenAI 兼容协议（走 `/chat/completions` + `Authorization: Bearer`）。Anthropic（`x-api-key` 头）和 Gemini（URL query key）的测试连接会走到 `isOpenAI` 分支，需要单独适配。**此项留到 Phase 6.1 实施时处理**。

## 5. 数据完整性检查

| 检查项 | 结果 |
|-------|------|
| 无孤儿配置（user_id 外键） | ✅ FK 约束保证 |
| api_key 永不泄露到前端 | ✅ Service 层脱敏 + AES 加密 |
| 每个用户最多一个默认配置 | ✅ 部分唯一索引 + 事务 setDefault |
| api_key_encrypted 不可为空 | ✅ NOT NULL 约束 |
| model_id 不可为空 | ✅ NOT NULL 约束 |

## 6. Phase 6.1 数据库相关变更

**零变更**。不新增表、不修改列、不新增索引。

---

**结论**: api_configs 的 Schema + Repository + Service + Gateway 全部冻结，Phase 6.1 仅需暴露 API Routes + 构建前端页面。