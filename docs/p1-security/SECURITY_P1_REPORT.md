# 叙境（XuJing-web）安全边界建设 P1 阶段验收报告

> **项目**：叙境-web 安全边界建设
> **阶段**：P1 — 软删除基础设施 + 审计日志 + 数据完整性
> **报告日期**：2026-06-17
> **报告类型**：最终验收报告
> **状态**：✅ P1 全部交付物完成，待人工执行 db.delete 替换

---

## 一、项目概述

### 1.1 事故背景

`rsync -avz --delete` 误删 uploads 目录，暴露出系统缺乏软删除机制和审计追踪的根本缺陷。P0 阶段完成了应急恢复和防护方案设计，P1 阶段聚焦于**软删除基础设施**建设，确保所有删除操作可追溯、可恢复。

### 1.2 P1 目标

| 目标 | 说明 |
|------|------|
| 软删除字段 | 核心业务表添加 `deleted_at` 字段 |
| Schema 更新 | Drizzle ORM Schema 同步支持软删除 |
| 统一删除服务 | AssetService 替代所有 `db.delete()` 调用 |
| 审计日志 | 每次软删除自动记录操作者、时间、原因 |
| 数据完整性 | integrity-check.ts 适配软删除逻辑 |
| 调用台账 | 记录所有待替换的 `db.delete()` 调用位置 |

### 1.3 P1 严格限制

- ❌ 禁止执行 `drizzle-kit push` / `drizzle-kit migrate`
- ❌ 禁止修改 API Route 业务逻辑（仅替换删除调用）
- ❌ 禁止物理删除硬盘文件（`rm` / `rsync --delete`）

---

## 二、交付物清单与验收状态

### 2.1 任务总览

| 任务 | 描述 | 状态 | 验收 |
|------|------|------|------|
| P1-任务1 | 迁移SQL + Schema更新 + helpers.ts + index.ts | ✅ 完成 | TS编译通过 |
| P1-任务2 | AssetService.ts 统一软删除服务 | ✅ 完成 | TS编译通过 |
| P1-任务3-1 | DEPRECATED_DELETE_CALLS.md 台账 | ✅ 完成 | 全局扫描一致 |
| P1-任务3-2 | integrity-check.ts 适配 | ✅ 完成 | TS编译通过 + 脚本运行成功 |
| P1-任务3-3 | SECURITY_P1_REPORT.md 验收报告 | ✅ 完成 | 本文档 |

### 2.2 交付文件清单

| # | 文件路径 | 说明 |
|---|----------|------|
| 1 | `docs/p1-security/migrations/001_add_deleted_at.sql` | 6表加 deleted_at 迁移SQL |
| 2 | `drizzle/0002_flawless_sue_storm.sql` | Drizzle 迁移文件 |
| 3 | `src/db/schema/users.ts` | users 表 Schema（含 deletedAt + activeIdx） |
| 4 | `src/db/schema/memories.ts` | memories 表 Schema |
| 5 | `src/db/schema/conversations.ts` | conversations 表 Schema |
| 6 | `src/db/schema/messages.ts` | messages 表 Schema |
| 7 | `src/db/schema/user-character-settings.ts` | user_character_settings 表 Schema |
| 8 | `src/db/schema/api-configs.ts` | api_configs 表 Schema |
| 9 | `src/db/schema/characters.ts` | characters 表 Schema（已有 deletedAt，更新索引） |
| 10 | `src/db/schema/audit-logs.ts` | audit_logs 表 Schema + 4枚举 + AuditAction |
| 11 | `src/db/schema/index.ts` | 12表导出 + 枚举/类型导出 |
| 12 | `src/db/helpers.ts` | SoftDeletableTable + withNotDeleted + uuidv7 |
| 13 | `src/services/AssetService.ts` | 统一软删除服务（8公开方法） |
| 14 | `src/scripts/integrity-check.ts` | 数据完整性检查脚本（软删除适配） |
| 15 | `docs/p1-security/DEPRECATED_DELETE_CALLS.md` | db.delete 替换台账 |
| 16 | `docs/p1-security/SECURITY_P1_REPORT.md` | 本验收报告 |

---

## 三、核心交付物详情

### 3.1 迁移 SQL

**文件**：`docs/p1-security/migrations/001_add_deleted_at.sql`

为 6 张核心业务表添加 `deleted_at` 字段及部分索引（characters 表已有，无需重复添加）：

| 表名 | 新增字段 | 部分索引 | 索引列 |
|------|----------|----------|--------|
| `users` | `deleted_at TIMESTAMPTZ` | `idx_users_active` | `(id) WHERE deleted_at IS NULL` |
| `memories` | `deleted_at TIMESTAMPTZ` | `idx_memories_active` | `(character_id, user_id) WHERE deleted_at IS NULL` |
| `conversations` | `deleted_at TIMESTAMPTZ` | `idx_conversations_active` | `(user_id, character_id) WHERE deleted_at IS NULL` |
| `messages` | `deleted_at TIMESTAMPTZ` | `idx_messages_active` | `(character_id, user_id) WHERE deleted_at IS NULL` |
| `user_character_settings` | `deleted_at TIMESTAMPTZ` | `idx_user_character_settings_active` | `(user_id, character_id) WHERE deleted_at IS NULL` |
| `api_configs` | `deleted_at TIMESTAMPTZ` | `idx_api_configs_active` | `(user_id) WHERE deleted_at IS NULL` |

**关键设计**：
- 使用 `ADD COLUMN IF NOT EXISTS` 确保幂等执行
- 使用 `CREATE INDEX IF NOT EXISTS` 确保幂等执行
- 部分索引（Partial Index）仅索引未删除记录，查询性能无损
- 事务包裹（`BEGIN` ... `COMMIT`）保证原子性

### 3.2 Schema 更新（7表）

所有 7 张软删除表均包含以下标准定义：

```typescript
// 每张软删除表的标准字段
deletedAt: timestamp("deleted_at", { withTimezone: true }),

// 对应的部分索引（以 messages 为例）
activeIdx: index("idx_messages_active").on(table.characterId, table.userId)
  .where(sql`${table.deletedAt} IS NULL`),
```

| 表 | 索引名 | 索引列 | WHERE 条件 |
|----|--------|--------|------------|
| users | idx_users_active | id | deletedAt IS NULL |
| memories | idx_memories_active | character_id, user_id | deletedAt IS NULL |
| conversations | idx_conversations_active | user_id, character_id | deletedAt IS NULL |
| messages | idx_messages_active | character_id, user_id | deletedAt IS NULL |
| user_character_settings | idx_user_character_settings_active | user_id, character_id | deletedAt IS NULL |
| api_configs | idx_api_configs_active | user_id | deletedAt IS NULL |
| characters | idx_characters_active | id | deletedAt IS NULL AND userId IS NOT NULL |

### 3.3 helpers.ts 工具函数

**文件**：`src/db/helpers.ts`

| 导出 | 类型 | 说明 |
|------|------|------|
| `SoftDeletableTable` | 类型 | 约束表必须包含 `deletedAt` 字段，用于 `withNotDeleted` 参数类型推断 |
| `withNotDeleted(table)` | 函数 | 返回 `sql\`${table.deletedAt} IS NULL\``，用于查询时过滤已软删除记录 |
| `uuidv7()` | 函数 | RFC 9562 兼容 UUID v7 生成，Web Crypto API 实现，跨运行时可移植 |

**用法示例**：

```typescript
import { eq, and } from "drizzle-orm";
import { withNotDeleted } from "@/db/helpers";
import { messages } from "@/db/schema";

db.select()
  .from(messages)
  .where(and(eq(messages.userId, userId), withNotDeleted(messages)));
```

### 3.4 schema/index.ts 导出

**文件**：`src/db/schema/index.ts`

**12 表导出**：

```
users, characters, messages, memories, conversations,
apiConfigs, orders, vipRecords, adminLogs,
starDiamondTransactions, userCharacterSettings, auditLogs
```

**枚举/常量/类型导出**：

| 导出名 | 类型 | 来源 |
|--------|------|------|
| `actorTypeEnum` | pgEnum | audit-logs.ts |
| `actionCategoryEnum` | pgEnum | audit-logs.ts |
| `actionResultEnum` | pgEnum | audit-logs.ts |
| `targetTypeEnum` | pgEnum | audit-logs.ts |
| `AuditAction` | const 对象 | audit-logs.ts |
| `AuditActionType` | TypeScript 类型 | audit-logs.ts |

### 3.5 AssetService 统一软删除服务

**文件**：`src/services/AssetService.ts`

#### 接口定义

```typescript
interface SoftDeleteOptions {
  actorId?: string;       // 操作者ID（默认 'system'）
  actorIp?: string;       // 操作者IP
  actorUa?: string;       // User-Agent
  requestId?: string;     // 链路追踪ID
  requestMethod?: string; // HTTP方法
  requestPath?: string;   // HTTP路径
  reason?: string;        // 删除原因
}

interface SoftDeleteResult {
  success: boolean;        // 操作是否成功
  id?: string;            // 被操作记录ID
  affectedCount: number;  // 影响记录数
  alreadyDeleted?: boolean; // 幂等命中
  error?: string;         // 错误信息
}
```

#### 8 个公开方法

| # | 方法 | 参数 | 替代场景 |
|---|------|------|----------|
| 1 | `softDeleteCharacter` | `(characterId, options?)` | 角色删除 |
| 2 | `softDeleteMemory` | `(memoryId, options?)` | 单条记忆淘汰 |
| 3 | `softDeleteMemoriesByCharacter` | `(characterId, options?)` | 角色记忆批量删除 |
| 4 | `softDeleteMessage` | `(messageId, options?)` | 单条消息删除 |
| 5 | `softDeleteMessagesByCharacter` | `(characterId, userId, options?)` | 角色消息批量删除 |
| 6 | `softDeleteLastAssistantMessage` | `(characterId, userId, options?)` | 重生成场景删除最后助手消息 |
| 7 | `softDeleteUserCharacterSetting` | `(userId, characterId, options?)` | 用户角色设置删除 |
| 8 | `softDeleteApiConfig` | `(configId, options?)` | API配置删除 |

#### 设计原则

1. **统一入口**：所有删除操作必须通过 AssetService，禁止直接 `db.delete()`
2. **幂等设计**：已软删除的记录不会重复操作，返回 `alreadyDeleted: true`
3. **事务保证**：软删除与审计日志在同一 `db.transaction` 内
4. **审计追踪**：每次软删除自动写入 `audit_logs` 表
5. **脱敏处理**：API 配置记录的 `apiKeyEncrypted` 替换为 `[REDACTED]`
6. **批量审计**：批量操作审计记录前 10 条 `sampleIds`

#### 私有方法

| 方法 | 说明 |
|------|------|
| `insertAuditLog(tx, params)` | 事务内插入审计日志 |
| `sanitizeRecord(record)` | 通用脱敏（移除 apiKeyEncrypted） |
| `sanitizeApiConfigRecord(record)` | API配置脱敏（替换为 [REDACTED]） |

---

## 四、DEPRECATED_DELETE_CALLS.md 台账完整性确认

### 4.1 全局扫描结果

**扫描方法**：`grep -rn 'db\.delete\|fs\.unlink\|fs\.rm' src/`

| 类型 | 扫描结果 | 台账记录 | 一致性 |
|------|----------|----------|--------|
| `db.delete()` 直接调用 | 8 处 | 8 处 | ✅ 一致 |
| 间接调用（Repository → Service） | 1 处 | 1 处 | ✅ 一致 |
| 原生 `DELETE FROM` SQL | 0 处 | 0 处 | ✅ 一致 |
| `fs.unlink` / `fs.rm` | 0 处 | 0 处 | ✅ 一致 |

### 4.2 9 处调用明细

| # | 文件 | 行号 | 函数 | 替换方法 | 优先级 |
|---|------|------|------|----------|--------|
| 1 | `settings/route.ts` | L116 | DELETE Handler | `softDeleteUserCharacterSetting` | P1 |
| 2 | `chat/[characterId]/route.ts` | L96 | DELETE Handler | `softDeleteMessagesByCharacter` | P0 |
| 3 | `api-config.repository.ts` | L96 | `delete(id)` | `softDeleteApiConfig` | P1 |
| 4 | `memory.repository.ts` | L48 | `evictLowest` | `softDeleteMemory` | P2 |
| 5 | `memory.repository.ts` | L53 | `deleteByCharacter` | `softDeleteMemoriesByCharacter` | P0 |
| 6 | `message.repository.ts` | L21 | `deleteMessage` | `softDeleteMessage` | P2 |
| 7 | `message.repository.ts` | L33 | `deleteAllByCharacter` | `softDeleteMessagesByCharacter` | P0 |
| 8 | `message.repository.ts` | L38 | `deleteLastAssistant` | `softDeleteLastAssistantMessage` | P2 |
| 9 | `api-config.service.ts` | L59 | `deleteConfig` | 修改传入 actorId | P1 |

> **注意**：#1 `settings/route.ts:116` 为链式调用 `.delete(userCharacterSettings)`，首次 grep 因换行未匹配，但经人工确认存在且已录入台账。

### 4.3 台账完整性结论

✅ **台账完整**：全局扫描结果与 `DEPRECATED_DELETE_CALLS.md` 记录完全一致，无遗漏、无多余。

---

## 五、integrity-check.ts 适配

**文件**：`src/scripts/integrity-check.ts`

### 5.1 修改内容（6处）

| # | 修改位置 | 修改内容 |
|---|----------|----------|
| 1 | 新增函数 | `hasDeletedAtColumn(table)` — 检测表是否有 deleted_at 列 |
| 2 | characters active 查询 | 降级：列不存在时返回 `undefined!` |
| 3 | settings active 查询 | 降级：列不存在时返回 `undefined!` |
| 4 | characters deleted 查询 | 降级：列不存在时返回 `[]` |
| 5 | settings deleted 查询 | 降级：列不存在时返回 `[]` |
| 6 | result.rows 类型 | 修复类型断言，确保 TS 编译通过 |

### 5.2 运行结果

```
状态：WARN（非 FAIL）
缺失文件：0
僵尸文件：12（待 deleted_at 列就绪后精确判定）
退出码：0（PASS/WARN）
```

### 5.3 软删除处理规则

- 已软删除记录的引用标记为 `[DELETED]`
- missing 检测时忽略已软删除记录
- orphan 检测时排除已软删除记录

---

## 六、编译验证

### 6.1 TypeScript 编译

| 验证项 | 结果 |
|--------|------|
| P1-任务1 完成后编译 | ✅ 通过 |
| P1-任务2 完成后编译 | ✅ 通过 |
| P1-任务3-2 完成后编译 | ✅ 通过 |
| 已知非本次范围错误 | `tests/phase6-*.test.ts`（P0遗留） |

### 6.2 运行时验证

| 验证项 | 结果 |
|--------|------|
| integrity-check.ts 运行 | ✅ WARN，0缺失/12僵尸 |
| AssetService 方法调用 | ✅ 编译通过，待 migrate 后运行时验证 |

---

## 七、数据资产快照

### 7.1 有效 uploads 引用（3个）

| 文件名 | 类型 |
|--------|------|
| `bb08dc53-9def-401b-8961-aab9ef0e0600.jpeg` | 用户上传 |
| `122c6ef4-2907-49da-bd96-8188361faeb6.jpeg` | 用户上传 |
| `92a1c804-d403-4eb8-bb03-b63c8867e5b8.png` | 用户上传 |

### 7.2 僵尸文件（12个）

> 待 `deleted_at` 列就绪后重新校验精确判定

| 文件名 | 类型 |
|--------|------|
| `126b5acb...png` | 僵尸 |
| `1743ea6a...jpeg` | 僵尸 |
| `18c22c9e...png` | 僵尸 |
| `229b550c...jpeg` | 僵尸 |
| `5aec58d5...jpg` | 僵尸 |
| `6e879b3e...png` | 僵尸 |
| `706a64f2...jpeg` | 僵尸 |
| `81a3b734...jpg` | 僵尸 |
| `9784f52a...png` | 僵尸 |
| `a99af6d1...jpeg` | 僵尸 |
| `d560e0c3...png` | 僵尸 |
| `ed71ac30...jpg` | 僵尸 |

### 7.3 不可恢复数据

| 表 | 记录数 | 说明 |
|----|--------|------|
| characters | 9 条 | 角色数据，需重新上传头像 |
| user_character_settings | 2 条 | character_id: 019eae1d, 019ec49a |

---

## 八、遗留事项与后续计划

### 8.1 P1 遗留（待人工执行）

| # | 事项 | 优先级 | 说明 |
|---|------|--------|------|
| 1 | 执行迁移 SQL | P0 | `001_add_deleted_at.sql` 需 DBA 审核后执行 |
| 2 | 替换 9 处 db.delete() | P0 | 按 `DEPRECATED_DELETE_CALLS.md` 台账逐项替换 |
| 3 | 全局搜索确认零残留 | P0 | 替换后 `grep -rn 'db\.delete' src/` 确认 |
| 4 | TS 编译验证 | P0 | 替换后重新编译 |
| 5 | integrity-check 重新运行 | P1 | migrate 后重新校验 12 僵尸文件 |

### 8.2 P0 遗留

| # | 事项 | 说明 |
|---|------|------|
| 1 | 9 个角色头像重新上传 | 事故中丢失的图片 |
| 2 | 2 个聊天背景图重新上传 | 事故中丢失的图片 |
| 3 | deploy.sh 加 `--exclude='uploads'` | 防止 rsync 误删 |
| 4 | P0 Phase 1-4 实施 | 完整安全防护方案执行 |

### 8.3 P2 后续规划

| # | 事项 | 说明 |
|---|------|------|
| 1 | 上传 API 路径遍历防护 | 校验文件路径合法性 |
| 2 | Magic bytes 校验 | 文件类型真实性验证 |
| 3 | 备份异地容灾（COS） | 腾讯云对象存储备份 |
| 4 | 审计查询 API | 管理端审计日志查询接口 |
| 5 | 软删除数据清理策略 | 定期清理超过保留期的软删除数据 |

---

## 九、安全锁

> ⚠️ **P1 阶段安全约束，在遗留事项完成前持续有效**：
>
> 1. **禁止自动执行迁移**：`drizzle-kit push` / `drizzle-kit migrate` 需 DBA 审核后手动执行
> 2. **禁止物理删除文件**：`rm` / `rsync --delete` 严禁使用
> 3. **禁止跳过审计日志**：每次软删除必须写入 `audit_logs`
> 4. **禁止直接 db.delete()**：所有删除必须通过 AssetService
> 5. **备份铁律**：严禁 `rsync --delete`，deploy.sh 必须加 `--exclude='uploads'`

---

## 十、验收签收

| 项目 | 状态 | 备注 |
|------|------|------|
| 迁移 SQL（6表） | ✅ 已编写 | 待 DBA 审核执行 |
| Schema 更新（7表） | ✅ 已完成 | 含 deletedAt + activeIdx |
| helpers.ts 工具函数 | ✅ 已完成 | SoftDeletableTable + withNotDeleted + uuidv7 |
| schema/index.ts 导出 | ✅ 已完成 | 12表 + 4枚举 + AuditAction + AuditActionType |
| AssetService（8方法） | ✅ 已完成 | 幂等 + 事务 + 审计 + 脱敏 |
| DEPRECATED_DELETE_CALLS.md | ✅ 已完成 | 9处台账，全局扫描一致 |
| integrity-check.ts 适配 | ✅ 已完成 | 降级运行 WARN，0缺失 |
| TypeScript 编译 | ✅ 通过 | 排除已知 tests/phase6-*.test.ts |
| SECURITY_P1_REPORT.md | ✅ 已完成 | 本报告 |

---

*报告生成时间：2026-06-17 19:30 CST*
*生成工具：OrcaTerm AI*
*项目路径：/root/XuJing-web/*
