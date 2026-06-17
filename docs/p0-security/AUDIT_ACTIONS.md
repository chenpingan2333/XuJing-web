# Audit Actions 参考手册

> 叙境（XuJing）审计操作常量完整定义与使用指南
>
> 版本：1.0.0 | 创建日期：2026-06-17 | 状态：P0 设计阶段

---

## 1. 概述

`AuditAction` 是审计日志系统的核心常量对象，定义了所有可被审计记录的业务操作。每个操作以 `category.action` 格式命名，确保全局唯一且语义清晰。

### 设计原则

| 原则 | 说明 |
|------|------|
| **分类前缀** | 所有操作按业务域分组，格式 `{category}.{action}` |
| **动词统一** | CRUD 操作使用 `create`/`update`/`delete`，特殊操作使用语义化动词 |
| **可扩展性** | `action` 字段使用 `VARCHAR(50)` 而非 `pgEnum`，新增操作无需数据库迁移 |
| **常量引用** | 代码中通过 `AuditAction.xxx` 引用，禁止硬编码字符串 |

---

## 2. 操作分类总览

| 分类 | 操作数 | 常量前缀 | 说明 |
|------|--------|----------|------|
| `auth` | 4 | `AuditAction.auth.*` | 认证与授权 |
| `file` | 2 | `AuditAction.file.*` | 文件上传 |
| `character` | 3 | `AuditAction.character.*` | 角色管理 |
| `message` | 3 | `AuditAction.message.*` | 消息操作 |
| `conversation` | 3 | `AuditAction.conversation.*` | 会话管理 |
| `memory` | 2 | `AuditAction.memory.*` | 记忆管理 |
| `user_character_settings` | 3 | `AuditAction.user_character_settings.*` | 用户角色设置 |
| `user` | 3 | `AuditAction.user.*` | 用户管理 |
| `order` | 2 | `AuditAction.order.*` | 订单管理 |
| `vip_record` | 1 | `AuditAction.vip_record.*` | VIP 记录 |
| `transaction` | 1 | `AuditAction.transaction.*` | 交易记录 |
| `system` | 2 | `AuditAction.system.*` | 系统配置 |
| **合计** | **29** | | |

> **注意**：实际 `audit-logs.ts` 中定义了 26 个操作常量，以下列表以代码定义为准。

---

## 3. 完整操作列表

### 3.1 auth — 认证与授权（4 项）

| 常量 | 值 | action_category | 说明 | 典型触发场景 |
|------|-----|-----------------|------|--------------|
| `AuditAction.auth.login` | `"auth.login"` | `auth` | 用户登录 | 用户通过登录表单认证成功 |
| `AuditAction.auth.logout` | `"auth.logout"` | `auth` | 用户登出 | 用户主动退出或 Token 失效 |
| `AuditAction.auth.tokenRefresh` | `"auth.token.refresh"` | `auth` | Token 刷新 | Access Token 过期后自动续期 |
| `AuditAction.auth.failure` | `"auth.failure"` | `auth` | 认证失败 | 密码错误、Token 无效、账号锁定等 |

**使用示例：**

```typescript
import { AuditAction } from "@/db/schema/audit-logs";

// 记录登录成功
await db.insert(auditLogs).values({
  action: AuditAction.auth.login,
  actionCategory: "auth",
  actorType: "user",
  actorId: userId,
  actionResult: "success",
  targetId: userId,
  targetType: "user",
});

// 记录认证失败
await db.insert(auditLogs).values({
  action: AuditAction.auth.failure,
  actionCategory: "auth",
  actorType: "anonymous",
  actorId: null,
  actionResult: "failure",
  targetId: null,
  targetType: null,
  metadata: { reason: "invalid_password", ip: clientIp },
});
```

---

### 3.2 file — 文件上传（2 项）

| 常量 | 值 | action_category | 说明 | 典型触发场景 |
|------|-----|-----------------|------|--------------|
| `AuditAction.file.upload` | `"file.upload"` | `file` | 文件上传成功 | 用户上传头像/背景图通过校验 |
| `AuditAction.file.uploadRejected` | `"file.upload.rejected"` | `file` | 文件上传被拒 | 文件类型不符/超限/校验失败 |

**使用示例：**

```typescript
// 上传成功
await db.insert(auditLogs).values({
  action: AuditAction.file.upload,
  actionCategory: "file",
  actorType: "user",
  actorId: userId,
  actionResult: "success",
  targetId: fileId,
  targetType: "file",
  metadata: {
    fileName: originalName,
    fileSize: size,
    mimeType: type,
    storedAs: uuidName,
    uploadPath: `/uploads/${uuidName}`,
  },
});

// 上传被拒
await db.insert(auditLogs).values({
  action: AuditAction.file.uploadRejected,
  actionCategory: "file",
  actorType: "user",
  actorId: userId,
  actionResult: "failure",
  targetId: null,
  targetType: "file",
  metadata: {
    reason: "file_too_large",
    fileName: originalName,
    fileSize: size,
    maxSize: MAX_FILE_SIZE,
  },
});
```

---

### 3.3 character — 角色管理（3 项）

| 常量 | 值 | action_category | 说明 | 典型触发场景 |
|------|-----|-----------------|------|--------------|
| `AuditAction.character.create` | `"character.create"` | `data` | 创建角色 | 用户自建新角色 |
| `AuditAction.character.update` | `"character.update"` | `data` | 更新角色 | 修改角色名称/描述/头像等 |
| `AuditAction.character.delete` | `"character.delete"` | `data` | 删除角色 | 用户删除自建角色 |

---

### 3.4 message — 消息操作（3 项）

| 常量 | 值 | action_category | 说明 | 典型触发场景 |
|------|-----|-----------------|------|--------------|
| `AuditAction.message.create` | `"message.create"` | `data` | 创建消息 | 用户发送消息 / AI 生成回复 |
| `AuditAction.message.update` | `"message.update"` | `data` | 更新消息 | 用户改写消息内容 |
| `AuditAction.message.delete` | `"message.delete"` | `data` | 删除消息 | 用户删除消息 |

---

### 3.5 conversation — 会话管理（3 项）

| 常量 | 值 | action_category | 说明 | 典型触发场景 |
|------|-----|-----------------|------|--------------|
| `AuditAction.conversation.create` | `"conversation.create"` | `data` | 创建会话 | 用户开始新对话 |
| `AuditAction.conversation.update` | `"conversation.update"` | `data` | 更新会话 | 修改会话标题等 |
| `AuditAction.conversation.delete` | `"conversation.delete"` | `data` | 删除会话 | 用户删除对话 |

---

### 3.6 memory — 记忆管理（2 项）

| 常量 | 值 | action_category | 说明 | 典型触发场景 |
|------|-----|-----------------|------|--------------|
| `AuditAction.memory.create` | `"memory.create"` | `data` | 创建记忆 | AI 自动提取记忆 |
| `AuditAction.memory.delete` | `"memory.delete"` | `data` | 删除记忆 | 用户手动删除记忆 |

---

### 3.7 user_character_settings — 用户角色设置（3 项）

| 常量 | 值 | action_category | 说明 | 典型触发场景 |
|------|-----|-----------------|------|--------------|
| `AuditAction.user_character_settings.create` | `"user_character_settings.create"` | `data` | 创建设置 | 用户首次与角色互动生成设置 |
| `AuditAction.user_character_settings.update` | `"user_character_settings.update"` | `data` | 更新设置 | 修改背景图/自定义提示词等 |
| `AuditAction.user_character_settings.delete` | `"user_character_settings.delete"` | `data` | 删除设置 | 重置角色设置 |

---

### 3.8 user — 用户管理（3 项）

| 常量 | 值 | action_category | 说明 | 典型触发场景 |
|------|-----|-----------------|------|--------------|
| `AuditAction.user.create` | `"user.create"` | `data` | 创建用户 | 新用户注册 |
| `AuditAction.user.update` | `"user.update"` | `data` | 更新用户 | 修改昵称/头像/VIP 状态等 |
| `AuditAction.user.delete` | `"user.delete"` | `data` | 删除用户 | 用户注销账号 |

---

### 3.9 order — 订单管理（2 项）

| 常量 | 值 | action_category | 说明 | 典型触发场景 |
|------|-----|-----------------|------|--------------|
| `AuditAction.order.create` | `"order.create"` | `data` | 创建订单 | 用户发起充值 |
| `AuditAction.order.update` | `"order.update"` | `data` | 更新订单 | 支付回调更新订单状态 |

---

### 3.10 vip_record — VIP 记录（1 项）

| 常量 | 值 | action_category | 说明 | 典型触发场景 |
|------|-----|-----------------|------|--------------|
| `AuditAction.vip_record.create` | `"vip_record.create"` | `data` | 创建 VIP 记录 | VIP 开通/续费 |

---

### 3.11 transaction — 交易记录（1 项）

| 常量 | 值 | action_category | 说明 | 典型触发场景 |
|------|-----|-----------------|------|--------------|
| `AuditAction.transaction.create` | `"transaction.create"` | `data` | 创建交易 | 星钻消费/充值记录 |

---

### 3.12 system — 系统配置（2 项）

| 常量 | 值 | action_category | 说明 | 典型触发场景 |
|------|-----|-----------------|------|--------------|
| `AuditAction.system.apiConfigUpdate` | `"system.api_config.update"` | `config` | 更新 API 配置 | 修改模型通道/网关配置 |
| `AuditAction.system.systemConfigUpdate` | `"system.system.config.update"` | `config` | 更新系统配置 | 修改全局系统参数 |

---

## 4. action_category 映射

每个 AuditAction 都对应一个 `action_category`（pgEnum），用于按大类筛选审计记录：

| action_category | 包含的操作 | 用途 |
|-----------------|-----------|------|
| `auth` | auth.login, auth.logout, auth.token.refresh, auth.failure | 认证安全审计 |
| `file` | file.upload, file.upload.rejected | 文件操作审计 |
| `data` | character/message/conversation/memory/settings/user/order/vip/transaction 的 CRUD | 业务数据审计 |
| `config` | system.api_config.update, system.system.config.update | 系统配置审计 |

---

## 5. actor_type 映射

| actor_type | 说明 | actorId 来源 |
|------------|------|-------------|
| `user` | 普通用户 | users.id |
| `admin` | 管理员 | users.id（需 admin 角色） |
| `system` | 系统自动 | 固定值 `"system"` |
| `anonymous` | 未认证请求 | `null` |

---

## 6. action_result 映射

| action_result | 说明 | 典型场景 |
|---------------|------|----------|
| `success` | 操作成功 | 正常业务流程 |
| `failure` | 操作失败 | 业务校验不通过 |
| `error` | 系统错误 | 异常/超时/服务不可用 |

---

## 7. audit_target_type 映射

| audit_target_type | 说明 | 对应表 |
|-------------------|------|--------|
| `user` | 用户 | users |
| `character` | 角色 | characters |
| `message` | 消息 | messages |
| `conversation` | 会话 | conversations |
| `memory` | 记忆 | memories |
| `file` | 文件 | 无（存储在文件系统） |
| `user_character_settings` | 用户角色设置 | user_character_settings |
| `order` | 订单 | orders |
| `vip_record` | VIP 记录 | vip_records |
| `transaction` | 交易 | star_diamond_transactions |
| `api_config` | API 配置 | api_configs |
| `system_config` | 系统配置 | 无（环境变量/运行时） |

---

## 8. 代码定义（audit-logs.ts）

```typescript
export const AuditAction = {
  // Auth
  auth: {
    login: "auth.login",
    logout: "auth.logout",
    tokenRefresh: "auth.token.refresh",
    failure: "auth.failure",
  },
  // File
  file: {
    upload: "file.upload",
    uploadRejected: "file.upload.rejected",
  },
  // Character
  character: {
    create: "character.create",
    update: "character.update",
    delete: "character.delete",
  },
  // Message
  message: {
    create: "message.create",
    update: "message.update",
    delete: "message.delete",
  },
  // Conversation
  conversation: {
    create: "conversation.create",
    update: "conversation.update",
    delete: "conversation.delete",
  },
  // Memory
  memory: {
    create: "memory.create",
    delete: "memory.delete",
  },
  // User Character Settings
  user_character_settings: {
    create: "user_character_settings.create",
    update: "user_character_settings.update",
    delete: "user_character_settings.delete",
  },
  // User
  user: {
    create: "user.create",
    update: "user.update",
    delete: "user.delete",
  },
  // Order
  order: {
    create: "order.create",
    update: "order.update",
  },
  // VIP Record
  vip_record: {
    create: "vip_record.create",
  },
  // Transaction
  transaction: {
    create: "transaction.create",
  },
  // System
  system: {
    apiConfigUpdate: "system.api_config.update",
    systemConfigUpdate: "system.system.config.update",
  },
} as const;
```

---

## 9. 新增操作流程

当业务需要新增审计操作时，按以下步骤执行：

### 9.1 评估是否需要新操作

- ✅ **需要**：涉及数据变更（CUD）、安全事件、合规要求
- ❌ **不需要**：纯查询（R）操作、前端状态变更、缓存操作

### 9.2 命名规范

```
{category}.{verb}           # 标准 CRUD
{category}.{noun.verb}      # 嵌套操作
{category}.{verb.result}    # 带结果的操作
```

**示例：**
- `character.avatar.update` — 角色头像更新（比 `character.update` 更细粒度）
- `file.upload.rejected` — 上传被拒（比 `file.upload` + failure 更语义化）
- `conversation.export` — 会话导出（非 CRUD 的特殊操作）

### 9.3 添加步骤

1. **在 `audit-logs.ts` 中添加常量**

```typescript
export const AuditAction = {
  // ...existing
  character: {
    // ...existing
    avatarUpdate: "character.avatar.update",  // 新增
  },
} as const;
```

2. **在业务代码中引用**

```typescript
await db.insert(auditLogs).values({
  action: AuditAction.character.avatarUpdate,
  // ...
});
```

3. **更新本文档**

在对应分类下添加新操作的说明行。

4. **无需数据库迁移**

`action` 字段为 `VARCHAR(50)`，新值直接写入即可。如需新增 `action_category` 或 `audit_target_type` 枚举值，则需要 ALTER ENUM。

---

## 10. 与 admin-logs 的关系

| 维度 | audit_logs | admin_logs |
|------|-----------|------------|
| **范围** | 全部用户操作 | 仅管理员操作 |
| **粒度** | 细粒度（26+ 操作） | 粗粒度（登录/配置变更） |
| **保护** | INSERT-ONLY（RLS + 触发器） | 无特殊保护 |
| **查询** | 按用户/操作/目标 | 按管理员/时间 |
| **互补** | ✅ admin 操作同时记录到两张表 | ✅ 管理员专属操作仅记录到 admin_logs |

---

## 11. 安全注意事项

1. **禁止硬编码**：始终通过 `AuditAction.*` 常量引用，避免拼写错误
2. **敏感数据**：`metadata` 中禁止存储密码、Token、密钥等敏感信息
3. **内容哈希**：记录内容变更时使用哈希值而非原文（如 `previousContentHash`）
4. **IP 记录**：`auth.failure` 必须记录 `clientIp`，用于暴力破解检测
5. **批量操作**：批量操作应逐条记录，每条记录独立的 `targetId`
6. **异步写入**：审计日志写入失败不应阻塞业务流程，建议 try-catch 包裹

---

## 12. 变更记录

| 日期 | 版本 | 变更内容 |
|------|------|----------|
| 2026-06-17 | 1.0.0 | 初始版本，定义 26 个操作常量 |
