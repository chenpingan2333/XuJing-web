# 废弃删除调用替换清单 (DEPRECATED_DELETE_CALLS)

> **P1 安全边界建设** — 工作台账
> 生成时间：2026-06-17
> 状态：待人工替换

---

## 概述

本文档列出代码库中所有直接调用 `db.delete()` 的位置，这些调用需替换为 `AssetService` 对应的软删除方法，以实现审计追踪和逻辑删除。

**扫描范围**：`src/` 目录下所有 `.ts` 文件
**扫描模式**：`db.delete()`、原生 `DELETE FROM` SQL、`fs.unlink`/`fs.rm` 文件删除

### 扫描结果摘要

| 类型 | 数量 |
|------|------|
| `db.delete()` 直接调用 | 8 处 |
| 间接调用（通过 Repository） | 1 处 |
| 原生 `DELETE FROM` SQL | 0 处 |
| `fs.unlink`/`fs.rm` 文件删除 | 0 处 |

---

## 一、`db.delete()` 直接调用（8 处）

### 1. 用户角色设置删除

| 属性 | 值 |
|------|------|
| **文件** | `src/app/api/characters/[id]/settings/route.ts` |
| **行号** | L116 |
| **HTTP 方法** | DELETE |
| **函数** | DELETE Handler |
| **当前调用** | `db.delete(userCharacterSettings).where(and(eq(userId), eq(characterId)))` |
| **替换方法** | `AssetService.softDeleteUserCharacterSetting(characterId, userId, options)` |
| **风险等级** | 🟡 中 — 用户自定义设置丢失不可恢复 |
| **备注** | 需传入 `options.actorId`（从 `auth.userId` 获取） |

```typescript
// 当前代码（L114-122）
await db
  .delete(userCharacterSettings)
  .where(
    and(
      eq(userCharacterSettings.userId, auth.userId),
      eq(userCharacterSettings.characterId, characterId),
    ),
  );

// 替换为
import { AssetService } from '@/services/AssetService';
await AssetService.softDeleteUserCharacterSetting(characterId, auth.userId, {
  actorId: auth.userId,
});
```

---

### 2. 聊天消息批量删除

| 属性 | 值 |
|------|------|
| **文件** | `src/app/api/chat/[characterId]/route.ts` |
| **行号** | L96 |
| **HTTP 方法** | DELETE |
| **函数** | DELETE Handler |
| **当前调用** | `db.delete(messages).where(and(eq(characterId), eq(userId)))` |
| **替换方法** | `AssetService.softDeleteMessages(characterId, userId, options)` |
| **风险等级** | 🔴 高 — 批量删除聊天记录，数据不可恢复 |
| **备注** | 需传入 `options.actorId`（从 `auth.userId` 获取） |

```typescript
// 当前代码（L96）
await db.delete(messages).where(and(eq(messages.characterId, characterId), eq(messages.userId, auth.userId)));

// 替换为
import { AssetService } from '@/services/AssetService';
await AssetService.softDeleteMessages(characterId, auth.userId, {
  actorId: auth.userId,
});
```

---

### 3. API 配置删除

| 属性 | 值 |
|------|------|
| **文件** | `src/server/repositories/api-config.repository.ts` |
| **行号** | L96 |
| **函数** | `delete(id: string)` |
| **当前调用** | `db.delete(apiConfigs).where(eq(apiConfigs.id, id))` |
| **替换方法** | `AssetService.softDeleteApiConfig(id, options)` |
| **风险等级** | 🔴 高 — API 密钥配置丢失影响服务可用性 |
| **备注** | 调用方 `api-config.service.ts:59` 需同步修改传入 `actorId` |

```typescript
// 当前代码（L95-96）
async delete(id: string) {
  await db.delete(apiConfigs).where(eq(apiConfigs.id, id));
}

// 替换为
import { AssetService } from '@/services/AssetService';
async delete(id: string, actorId?: string) {
  await AssetService.softDeleteApiConfig(id, { actorId: actorId ?? 'system' });
}
```

---

### 4. 记忆淘汰（最低权重）

| 属性 | 值 |
|------|------|
| **文件** | `src/server/repositories/memory.repository.ts` |
| **行号** | L48 |
| **函数** | `evictLowest(characterId, userId, keepCount)` |
| **当前调用** | `db.delete(memories).where(eq(memories.id, toEvict[0].id))` |
| **替换方法** | `AssetService.softDeleteMemory(memoryId, options)` |
| **风险等级** | 🟡 中 — 记忆淘汰是业务逻辑，需保留审计记录 |
| **备注** | 单条删除，需传入被淘汰记忆的 ID |

```typescript
// 当前代码（L45-49）
if (toEvict.length > 0) {
  await db.delete(memories).where(eq(memories.id, toEvict[0].id));
}

// 替换为
import { AssetService } from '@/services/AssetService';
if (toEvict.length > 0) {
  await AssetService.softDeleteMemory(toEvict[0].id, { actorId: 'system' });
}
```

---

### 5. 角色记忆批量删除

| 属性 | 值 |
|------|------|
| **文件** | `src/server/repositories/memory.repository.ts` |
| **行号** | L53 |
| **函数** | `deleteByCharacter(characterId)` |
| **当前调用** | `db.delete(memories).where(eq(memories.characterId, characterId))` |
| **替换方法** | `AssetService.softDeleteMemories(characterId, options)` |
| **风险等级** | 🔴 高 — 批量删除角色所有记忆，数据不可恢复 |
| **备注** | 需确认是否需要传入 `actorId`（当前无 userId 参数） |

```typescript
// 当前代码（L52-53）
async deleteByCharacter(characterId: string) {
  await db.delete(memories).where(eq(memories.characterId, characterId));
}

// 替换为
import { AssetService } from '@/services/AssetService';
async deleteByCharacter(characterId: string, actorId?: string) {
  await AssetService.softDeleteMemories(characterId, { actorId: actorId ?? 'system' });
}
```

---

### 6. 单条消息删除

| 属性 | 值 |
|------|------|
| **文件** | `src/server/repositories/message.repository.ts` |
| **行号** | L21 |
| **函数** | `deleteMessage(id: string)` |
| **当前调用** | `db.delete(messages).where(eq(messages.id, id))` |
| **替换方法** | `AssetService.softDeleteMessage(id, options)` |
| **风险等级** | 🟡 中 — 单条消息删除 |
| **备注** | 需补充 `actorId` 参数 |

```typescript
// 当前代码（L20-21）
async deleteMessage(id: string) {
  await db.delete(messages).where(eq(messages.id, id));
}

// 替换为
import { AssetService } from '@/services/AssetService';
async deleteMessage(id: string, actorId?: string) {
  await AssetService.softDeleteMessage(id, { actorId: actorId ?? 'system' });
}
```

---

### 7. 角色消息批量删除

| 属性 | 值 |
|------|------|
| **文件** | `src/server/repositories/message.repository.ts` |
| **行号** | L33 |
| **函数** | `deleteAllByCharacter(characterId, userId)` |
| **当前调用** | `db.delete(messages).where(and(eq(characterId), eq(userId)))` |
| **替换方法** | `AssetService.softDeleteMessages(characterId, userId, options)` |
| **风险等级** | 🔴 高 — 批量删除角色所有消息，数据不可恢复 |
| **备注** | 与第 2 处（chat route）调用相同 AssetService 方法 |

```typescript
// 当前代码（L32-33）
async deleteAllByCharacter(characterId: string, userId: string) {
  await db.delete(messages).where(and(eq(messages.characterId, characterId), eq(messages.userId, userId)));
}

// 替换为
import { AssetService } from '@/services/AssetService';
async deleteAllByCharacter(characterId: string, userId: string, actorId?: string) {
  await AssetService.softDeleteMessages(characterId, userId, { actorId: actorId ?? userId });
}
```

---

### 8. 删除最后一条助手消息

| 属性 | 值 |
|------|------|
| **文件** | `src/server/repositories/message.repository.ts` |
| **行号** | L38 |
| **函数** | `deleteLastAssistant(characterId, userId)` |
| **当前调用** | `db.delete(messages).where(eq(messages.id, last.id))` |
| **替换方法** | `AssetService.softDeleteLastAssistantMessage(characterId, userId, options)` |
| **风险等级** | 🟡 中 — 重生成场景，删除最后一条 ASSISTANT 消息 |
| **备注** | AssetService 方法内部已处理查询最后一条 ASSISTANT 消息的逻辑 |

```typescript
// 当前代码（L35-38）
async deleteLastAssistant(characterId: string, userId: string) {
  const [last] = await db.select().from(messages).where(...).orderBy(desc(messages.createdAt)).limit(1);
  if (last) {
    await db.delete(messages).where(eq(messages.id, last.id));
  }
}

// 替换为
import { AssetService } from '@/services/AssetService';
async deleteLastAssistant(characterId: string, userId: string, actorId?: string) {
  await AssetService.softDeleteLastAssistantMessage(characterId, userId, { actorId: actorId ?? userId });
}
```

---

## 二、间接调用（1 处）

### 9. API 配置服务层删除

| 属性 | 值 |
|------|------|
| **文件** | `src/server/services/api-config.service.ts` |
| **行号** | L59 |
| **函数** | `deleteConfig(userId, configId)` |
| **当前调用** | `apiConfigRepository.delete(configId)` |
| **底层调用** | → `db.delete(apiConfigs).where(eq(id))` （第 3 处） |
| **替换方式** | 修改 Repository 层（第 3 处）后自动生效 |
| **风险等级** | 🟡 中 — 需同步修改 Service 层传入 `actorId` |

```typescript
// 当前代码（L56-59）
async deleteConfig(userId: string, configId: string) {
  const config = await apiConfigRepository.findById(configId);
  if (!config || config.userId !== userId) throw new Error("Unauthorized");
  return apiConfigRepository.delete(configId);
}

// 替换为（Repository 修改后）
async deleteConfig(userId: string, configId: string) {
  const config = await apiConfigRepository.findById(configId);
  if (!config || config.userId !== userId) throw new Error("Unauthorized");
  return apiConfigRepository.delete(configId, userId);
}
```

---

## 三、替换优先级建议

| 优先级 | 调用点 | 原因 |
|--------|--------|------|
| **P0** | #2 chat/route.ts, #7 message.repository.ts:33 | 批量删除消息，用户数据丢失风险最高 |
| **P0** | #5 memory.repository.ts:53 | 批量删除记忆，无恢复手段 |
| **P1** | #3 api-config.repository.ts:96 | API 配置丢失影响服务可用性 |
| **P1** | #1 settings/route.ts:116 | 用户设置丢失 |
| **P2** | #4 memory.repository.ts:48 | 单条记忆淘汰，业务逻辑驱动 |
| **P2** | #6 message.repository.ts:21 | 单条消息删除 |
| **P2** | #8 message.repository.ts:38 | 重生成场景，单条删除 |

---

## 四、替换检查清单

替换完成后，逐项验证：

- [ ] #1 `settings/route.ts` — `db.delete(userCharacterSettings)` → `AssetService.softDeleteUserCharacterSetting()`
- [ ] #2 `chat/[characterId]/route.ts` — `db.delete(messages)` → `AssetService.softDeleteMessages()`
- [ ] #3 `api-config.repository.ts` — `db.delete(apiConfigs)` → `AssetService.softDeleteApiConfig()`
- [ ] #4 `memory.repository.ts:48` — `db.delete(memories)` → `AssetService.softDeleteMemory()`
- [ ] #5 `memory.repository.ts:53` — `db.delete(memories)` → `AssetService.softDeleteMemories()`
- [ ] #6 `message.repository.ts:21` — `db.delete(messages)` → `AssetService.softDeleteMessage()`
- [ ] #7 `message.repository.ts:33` — `db.delete(messages)` → `AssetService.softDeleteMessages()`
- [ ] #8 `message.repository.ts:38` — `db.delete(messages)` → `AssetService.softDeleteLastAssistantMessage()`
- [ ] #9 `api-config.service.ts:59` — 传入 `actorId` 参数
- [ ] 全局搜索 `db.delete` 确认零残留
- [ ] TypeScript 编译通过
- [ ] 运行 `integrity-check.ts` 验证数据完整性

---

## 五、安全锁

> ⚠️ **严禁在替换过程中执行以下操作**：
> - 自动执行 Drizzle 迁移（`drizzle-kit push` / `drizzle-kit migrate`）
> - 物理删除硬盘文件（`rm` / `rsync --delete`）
> - 修改 API Route 业务逻辑（仅替换删除调用）
> - 跳过审计日志记录（每次软删除必须写入 `audit_logs`）
