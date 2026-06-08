# Phase 6 — Provider Routing & User Flow

> **版本**: V1.0 | **日期**: 2026-06-07

---

## 1. FREE 用户完整流程

```mermaid
flowchart TD
    A["FREE 用户登录"] --> B{"有已配置的 Provider?"}
    B -->|否| C["/api-connections 页面"]
    C --> D["显示: 未配置 API 接口"]
    D --> E["点击 '添加 Provider'"]
    E --> F["/api-connections/new"]
    F --> G["填写表单: 类型/名称/URL/Key/模型"]
    G --> H["点击 '保存并测试'"]
    H --> I["POST /api/api-configs"]
    I --> J{"创建成功?"}
    J -->|是| K["POST /api/api-configs/[id]/test"]
    J -->|否| L["显示错误信息"]
    K --> M{"测试连接成功?"}
    M -->|是| N["显示: 连接成功 ✅"]
    M -->|否| O["显示: 连接失败 ❌ + 原因"]
    N --> P["返回列表页"]
    O --> P
    P --> Q["Provider 卡片显示: 状态正常/失败"]

    B -->|是| R["/api-connections 列表"]
    R --> S["显示已配置的 Provider 列表"]
    S --> T["聊天时使用默认 Provider"]
```

### 关键决策点

| 节点 | 条件 | 行为 |
|------|------|------|
| 无 Provider 时聊天 | FREE + 无 api_configs | 返回 `"未配置 API 接口，请前往 API 连接页面配置"` |
| 有 Provider 但测试失败 | FREE + 有 config + 测试失败 | 允许使用（由用户自行判断），标记状态为"未测试"或"失败" |
| 多个 Provider | FREE + 多个 configs | 使用 `is_default=true` 的 Provider |

## 2. VIP 用户完整流程

```mermaid
flowchart TD
    A["VIP 用户登录"] --> B["/api-connections 页面"]
    B --> C["顶部: ★ 叙境专属模型 (系统默认)"]
    C --> D{"用户有自定义 Provider?"}
    D -->|否| E["仅使用系统模型"]
    D -->|是| F["下方: 自定义 Provider 列表"]
    F --> G{"用户将自定义 Provider 设为默认?"}
    G -->|否| H["聊天仍使用系统模型"]
    G -->|是| I["聊天切换到自定义 Provider"]
    I --> J["系统模型卡片显示 '可用' 而非 '当前'"]
```

### VIP 模型优先级

```
聊天时选择模型的优先级:
1. 用户自定义 Provider (is_default=true) → 使用该 Provider
2. 无自定义默认 → 使用平台模型 (getPlatformConfig)
```

### VIP 系统模型展示规则

| 场景 | 系统模型卡片显示 |
|------|----------------|
| 无自定义默认 Provider | ★ 叙境专属模型 **[当前]** |
| 已设置自定义默认 Provider | ★ 叙境专属模型 (可用) |
| 自定义 Provider 被删除 | 自动回退到系统模型，恢复 [当前] |

## 3. Provider 切换流程

```mermaid
flowchart LR
    A["列表页: 点击某 Provider"] --> B["详情页 /api-connections/[id]"]
    B --> C["点击 '设为默认'"]
    C --> D["PUT /api/api-configs/[id]/default"]
    D --> E{"成功?"}
    E -->|是| F["列表刷新: 新默认 Provider 标记 [默认]"]
    E -->|否| G["显示错误"]
    F --> H["聊天自动使用新默认 Provider"]
```

> `setDefault` 为事务操作：先清除该用户所有 `is_default=true`，再设置目标配置。保证原子性。

## 4. 测试连接流程

```mermaid
flowchart TD
    A["点击 '测试连接'"] --> B["POST /api/api-configs/[id]/test"]
    B --> C["ProviderGateway.testConnection()"]
    C --> D["发送最小请求 (Hi → ok)"]
    D --> E{"10秒内收到 200?"}
    E -->|是| F["显示: ✅ 连接成功"]
    E -->|否| G{"错误类型?"}
    G -->|401/403| H["❌ API Key 无效"]
    G -->|超时| I["❌ 连接超时 (10s)"]
    G -->|其他| J["❌ HTTP {status} / {message}"]
```

## 5. 删除 Provider 流程

```mermaid
flowchart TD
    A["详情页: 点击 '删除'"] --> B["确认弹窗: '确定删除此 Provider?'"]
    B -->|取消| C["返回"]
    B -->|确认| D["DELETE /api/api-configs/[id]"]
    D --> E{"成功?"}
    E -->|是| F["返回列表页"]
    F --> G{"被删的是默认 Provider?"}
    G -->|是| H["列表无默认标记; 聊天回退"]
    H --> I{"用户是 VIP?"}
    I -->|是| J["回退到系统模型"]
    I -->|否| K["聊天返回: 未配置 API"]
    G -->|否| L["列表正常"]
```

## 6. API Route 权限矩阵

| Route | Method | Auth | FREE | VIP | ADMIN |
|-------|--------|------|------|-----|-------|
| `/api/api-configs` | GET | ✅ | ✅ 自己的列表 | ✅ | ✅ |
| `/api/api-configs` | POST | ✅ | ✅ | ✅ | ✅ |
| `/api/api-configs/[id]` | PUT | ✅ | ✅ (自己的) | ✅ | ✅ |
| `/api/api-configs/[id]` | DELETE | ✅ | ✅ (自己的) | ✅ | ✅ |
| `/api/api-configs/[id]/test` | POST | ✅ | ✅ | ✅ | ✅ |
| `/api/api-configs/[id]/default` | PUT | ✅ | ✅ | ✅ | ✅ |

> 所有操作均校验 `config.userId === auth.userId`，Service 层已实现归属检查。

---

**下一文档**: 05-provider-validation-rules.md