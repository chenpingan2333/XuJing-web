# 18 — Phase 9 Migration Plan (Memory-First Refactoring)

> **Phase 9 Design Freeze** | **Date**: 2026-06-08
> **Status**: Design Only — No Implementation
> **Builds on**: 17-memory-first-architecture.md

---

## 1. 实施路线图概览

Phase 9 分 4 个 Wave，严格按顺序执行。每个 Wave 完成后必须通过验证才能进入下一个。

| Wave | 名称 | 范围 | Schema 变更 | 文件数 |
|------|------|------|------------|--------|
| W1 | 安全隔离 | 修复 userId 隔离 + Greeting 持久化 | 无 | 2 修改, 0 新建 |
| W2 | Conversation | 引入 conversations 表 + messages 关联 | 新增表 + messages 加 FK | 2 新建, 3 修改 |
| W3 | Memory Engine | MemoryExtractor + Retriever + Consolidator | memories 加 4 列 + enum | 4 新建, 2 修改 |
| W4 | Context Builder | Token-aware context + Story hooks | 无 | 2 新建, 1 修改 |

---

## 2. Wave 1 — 安全隔离（Week 1）

**目标**：在不改 Schema 的前提下修复两个严重 Bug。这是最紧急的部分。

### Step W1.1：`findHistory` 加 `userId`

**修改文件**：`src/server/repositories/message.repository.ts`

```diff
- async findHistory(characterId: string, limit = 50) {
+ async findHistory(characterId: string, userId: string, limit = 50, before?: string) {
    return db.query.messages.findMany({
-     where: eq(messages.characterId, characterId),
+     where: and(
+       eq(messages.characterId, characterId),
+       eq(messages.userId, userId),
+     ),
      orderBy: desc(messages.createdAt),
      limit,
    });
  }
```

**同步修改调用方** — `src/server/services/chat.service.ts`：

| 位置 | 当前 | 改为 |
|------|------|------|
| `sendMessage()` L75 | `findHistory(characterId, CONTEXT_MESSAGE_LIMIT)` | `findHistory(characterId, userId, CONTEXT_MESSAGE_LIMIT)` |
| `regenerateLastAssistantMessage()` L130 | `findHistory(characterId, CONTEXT_MESSAGE_LIMIT)` | `findHistory(characterId, userId, CONTEXT_MESSAGE_LIMIT)` |
| `getSuggestedReply()` L185 | `findHistory(characterId, 10)` | `findHistory(characterId, userId, 10)` |

### Step W1.2：`deleteLastAssistant` 加 `userId`

```diff
- async deleteLastAssistant(characterId: string) {
+ async deleteLastAssistant(characterId: string, userId: string) {
    const last = await db.query.messages.findFirst({
      where: and(
        eq(messages.characterId, characterId),
+       eq(messages.userId, userId),
        eq(messages.role, "ASSISTANT")
      ),
      orderBy: desc(messages.createdAt),
    });
-   if (last) { await db.delete(messages).where(eq(messages.id, last.id)); }
+   if (last) {
+     await db.delete(messages).where(eq(messages.id, last.id));
+   }
+   return last ?? null;
  }
```

同步修改 `chat.service.ts`：
- `regenerateLastAssistantMessage()` 中 `deleteLastAssistant(characterId)` → `deleteLastAssistant(characterId, userId)`

### Step W1.3：Greeting 持久化（预埋）

在 `sendMessage()` 中，当 conversation history 为空且有 greeting 时，写入 DB：

```typescript
// 在 sendMessage() 中，save user message 之前：
if (historyMessages.length === 0 && character.greeting) {
  const greetingParts = character.greeting.split("<START>");
  const greetingText = greetingParts[0]?.trim();
  if (greetingText) {
    await messageRepository.create({
      characterId,
      userId,
      role: "ASSISTANT",
      content: greetingText,
    });
  }
}
```

同时**删除** Prompt 中的 greeting 注入（改为从 DB 加载历史时自然包含）。

### W1 验证清单

- [ ] 用户 A 调用 `GET /api/chat/[characterId]` 只看到自己的消息
- [ ] 用户 A 点"重新生成"不会删除用户 B 的回复
- [ ] 新对话首次发送 → Greeting 写入 DB → 刷新页面后仍可见
- [ ] 已有对话（无 Greeting）→ 行为不变
- [ ] `npx tsc --noEmit` 零错误

---

## 3. Wave 2 — Conversation System（Week 2–3）

**目标**：引入多会话支持，为 Memory Engine 打好基础。

### Step W2.1：创建 Schema

**新建**：`src/db/schema/conversations.ts`

**修改**：`src/db/schema/messages.ts` — 加 `conversationId` 列

**修改**：`src/db/enums.ts` — 无需新增 enum（message_role 已有 USER/ASSISTANT）

**修改**：`src/db/relations.ts` — 加 conversations 关系

**修改**：`src/db/schema/index.ts` — 加 conversations export

### Step W2.2：Migration — 已有数据迁移

```
drizzle-kit generate  → 生成 migration SQL

Migration SQL 步骤：
  1. ALTER TABLE messages ADD COLUMN conversation_id UUID;
  2. 为每个 (user_id, character_id) 组合创建默认 Conversation
  3. UPDATE messages SET conversation_id = ... WHERE conversation_id IS NULL;
  4. ALTER TABLE messages ALTER COLUMN conversation_id SET NOT NULL;
  5. ALTER TABLE messages ADD CONSTRAINT fk_messages_conversation ...;
  6. CREATE INDEX idx_messages_conv_created ...;
```

### Step W2.3：新建 ConversationRepository

`src/server/repositories/conversation.repository.ts`

```typescript
export class ConversationRepository {
  async findById(id: string): Promise<Conversation | undefined>
  async findByUserAndCharacter(userId: string, characterId: string): Promise<Conversation[]>
  async create(data: NewConversation): Promise<Conversation>
  async update(id: string, data: Partial<NewConversation>): Promise<Conversation>
  async delete(id: string): Promise<void>
  async messageCount(id: string): Promise<number>  // SELECT count(*)
  async getOrCreate(userId: string, characterId: string): Promise<Conversation>
}
```

`getOrCreate()` 逻辑：
1. 查找用户+角色的最近活跃 Conversation（`updatedAt` DESC, LIMIT 1）
2. 如果存在且 `updatedAt` 在 24 小时内 → 复用
3. 否则 → 创建新 Conversation（title 默认为"新的对话"）

### Step W2.4：ChatService 重构为 Conversation-aware

```typescript
async *sendMessage(
  userId: string,
  characterId: string,
  content: string,
  conversationId?: string,
): AsyncGenerator<ChatEvent> {
  // 1. 解析 Conversation
  const conversation = conversationId
    ? await conversationRepository.findById(conversationId)
    : await conversationRepository.getOrCreate(userId, characterId);
  
  // 2. 权限检查
  const character = await characterRepository.findById(characterId);
  if (!character) { yield error; return; }
  
  // 3. 首次消息 → Greeting 持久化
  const msgCount = await conversationRepository.messageCount(conversation.id);
  if (msgCount === 0 && character.greeting) {
    // ... 写入 greeting 到 messages
  }
  
  // 4. 后续流程（同前，但用 conversation.id 查询历史）
  const historyMessages = await messageRepository.findByConversation(
    conversation.id, userId, CONTEXT_MESSAGE_LIMIT
  );
  // ...
  
  // 5. 保存用户消息时带上 conversationId
  await messageRepository.create({
    characterId,
    userId,
    conversationId: conversation.id,
    role: "USER",
    content,
  });
  
  // 6. 更新 conversation.updatedAt
  await conversationRepository.update(conversation.id, {
    updatedAt: new Date(),
  });
}
```

### Step W2.5：新增 API 端点

| 方法 | 路径 | 用途 |
|------|------|------|
| `GET` | `/api/chat/[characterId]/conversations` | 该角色下的会话列表 |
| `GET` | `/api/chat/[characterId]/[conversationId]` | 特定会话的消息历史 |
| `DELETE` | `/api/chat/[characterId]/[conversationId]` | 删除会话 |

### W2 验证清单

- [ ] 首次聊天 → 自动创建 Conversation → 消息归属于它
- [ ] 24 小时内再次聊天同一角色 → 复用同一 Conversation
- [ ] 超过 24 小时 → 创建新 Conversation
- [ ] 手动指定 conversationId → 聊天归入指定会话
- [ ] 一个角色下可以有多条 Conversation ↔ 消息完全隔离
- [ ] `GET /api/chat/[characterId]/conversations` 返回列表
- [ ] Migration 后已有消息不丢失

---

## 4. Wave 3 — Memory Engine（Week 4–5）

### Step W3.1：Schema 变更

**修改**：`src/db/enums.ts` — 新增 `memoryCategoryEnum`

**修改**：`src/db/schema/memories.ts` — 新增 4 列 + 3 个索引

Migration SQL：
```sql
CREATE TYPE memory_category AS ENUM ('IDENTITY','RELATIONSHIP','PREFERENCE','GOAL','EXPERIENCE','PROFILE');

ALTER TABLE memories ADD COLUMN category memory_category NOT NULL DEFAULT 'PROFILE';
ALTER TABLE memories ADD COLUMN last_referenced_at TIMESTAMPTZ;
ALTER TABLE memories ADD COLUMN reference_count INTEGER NOT NULL DEFAULT 0;
-- importance 列已存在，但改为 NOT NULL DEFAULT 0.5

CREATE INDEX idx_memories_category ON memories(category);
CREATE INDEX idx_memories_last_ref ON memories(last_referenced_at);
CREATE INDEX idx_memories_cat_importance ON memories(category, importance DESC);
```

### Step W3.2：新建 MemoryExtractor

`src/server/services/memory-extractor.ts`

核心逻辑：
1. 接收最近 10 条消息
2. 构建提取 Prompt（见 17-architecture §5.2）
3. 调用轻量 LLM（VIP 用用户自己的 key，Free 用 deepseek-chat）
4. 解析 JSON 响应
5. 返回 `ExtractedMemory[]`

错误处理：JSON 解析失败返回 `[]`，不抛异常。

### Step W3.3：新建 MemoryRetriever

`src/server/services/memory-retriever.ts`

```typescript
class MemoryRetriever {
  async search(
    userId: string,
    characterId: string,
    query: string,
    topK: number,
  ): Promise<Memory[]> {
    // Phase 1: 关键词文本匹配
    const keywords = this.extractKeywords(query);
    const all = await memoryRepository.findByCharacter(characterId, userId, 500);
    
    // 得分 = 关键词匹配率 × importance
    const scored = all.map(m => ({
      memory: m,
      score: this.similarity(keywords, m.content) * Number(m.importance),
    }));
    
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, topK).map(s => s.memory);
  }
}
```

### Step W3.4：新建 MemoryConsolidator

`src/server/services/memory-consolidator.ts`

- `consolidate(userId, characterId)` — 合并+清理+提升
- `deduplicate()` — 相似记忆合并
- `pruneLowValue()` — 低 importance + 长期未引用 → 删除
- `boostFrequent()` — referenceCount 高的 → 提升 importance

触发方式：定时任务（`setInterval` 每 6 小时），或 message 数每达到 50 条触发。

### Step W3.5：修改 MemoryRepository

新增方法：
- `findLowValue(characterId, userId, maxImportance, staleDays)`
- `markReferenced(id)` — `UPDATE SET last_referenced_at = now(), reference_count = reference_count + 1`
- `incrementImportance(id, delta)` — `UPDATE SET importance = LEAST(1.0, importance + delta)`
- `delete(id)` — 单条删除

### Step W3.6：修改 ChatService

- 删除 `_extractMemoriesAsync()` 方法（整个函数）
- `sendMessage()` 的 "done" 后改为调用 `MemoryExtractor.extract()`
- Context 组装改为使用 `MemoryRetriever.search()`

### W3 验证清单

- [ ] MemoryExtractor 正确提取身份、偏好、关系变化
- [ ] MemoryExtractor 忽略临时情绪、一次性事件
- [ ] 记忆写入 DB，category + importance 正确
- [ ] MemoryRetriever 返回与当前消息相关的记忆
- [ ] 不相关的记忆不被注入 Context
- [ ] MemoryConsolidator 合并重复记忆
- [ ] 低价值记忆被清理
- [ ] 高频记忆 importance 提升

---

## 5. Wave 4 — Context Builder（Week 6）

### Step W4.1：新建 ContextBuilder

`src/server/services/context-builder.ts`

```typescript
class ContextBuilder {
  build(params: {
    character: Character;
    personaSetting?: string;
    relationshipState: string | null;
    storyState: StoryState | null;
    memories: Memory[];
    messages: Message[];
  }, budget: ContextBudget): {
    systemPrompt: string;
    messages: ChatMessage[];
  }
}
```

### Step W4.2：Token 预算模型

```typescript
interface ContextBudget {
  maxTokens: number;        // 默认 8000
  reservedForReply: number; // 默认 2000
}
```

Token 估算函数：
```typescript
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3.5);
}
```

### Step W4.3：组装优先级

| 优先级 | Section | 内容 | 裁剪策略 |
|--------|---------|------|---------|
| 1 | System Prompt | 基础指令 | 从不裁剪 |
| 1 | Character Data | 角色设定 + 性格 + 情景 | 从不裁剪 |
| 2 | Relationship State | 当前关系 | 超预算时压缩为一行 |
| 3 | Memories | Top K 检索结果 | 超预算时减少 K |
| 3 | Story State | 故事状态 | 超预算时压缩摘要 |
| 5 | Messages | 聊天历史 | 从最早的消息开始移除 |

### Step W4.4：修改 ChatService

删除 `_buildSystemPrompt()` — 替换为 `contextBuilder.build()` 调用。

`sendMessage()` / `regenerateLastAssistantMessage()` / `getSuggestedReply()` 统一改为：

```typescript
const ctx = contextBuilder.build({
  character,
  personaSetting: user.personaSetting ?? undefined,
  relationshipState: relationshipService.getCurrentState(userId, characterId),
  storyState: conversation.storyState ?? null,
  memories: relevantMemories,
  messages: historyMessages,
}, { maxTokens: 8000, reservedForReply: 2000 });

// ctx.systemPrompt  →  发送给 ProviderGateway
// ctx.messages      →  发送给 ProviderGateway
```

### Step W4.5：新建 Story Engine 预留

`src/server/services/story-engine.ts`

仅定义接口，不实现逻辑：

```typescript
export interface StoryState {
  currentArc: string | null;
  currentGoal: string | null;
  currentConflict: string | null;
  worldState: Record<string, unknown> | null;
}

export interface StoryEvent {
  type: "ARC_START" | "ARC_END" | "GOAL_ACHIEVED" | "RELATIONSHIP_MILESTONE";
  timestamp: Date;
  description: string;
  metadata?: Record<string, unknown>;
}
```

### W4 验证清单

- [ ] System Prompt + Character Data 始终在 Context 中
- [ ] 消息过多时最早的消息被裁剪
- [ ] Memories 在预算超限时减少 K 值
- [ ] 总 Token 不超过 maxTokens - reservedForReply
- [ ] SSE 流正常，回复质量不劣化

---

## 6. 依赖关系图

```
W1 (安全隔离)
  │
  ├── W1.1 findHistory + userId ── 独立，无依赖
  ├── W1.2 deleteLastAssistant + userId ── 独立，无依赖
  └── W1.3 Greeting 持久化 ── 独立，无依赖

W2 (Conversation) ── depends on W1 (消息查询已隔离)
  │
  ├── W2.1 Schema ── 依赖 W1 完成
  ├── W2.2 Migration ── 依赖 W2.1
  ├── W2.3 ConversationRepository ── 依赖 W2.2
  ├── W2.4 ChatService 重构 ── 依赖 W2.3
  └── W2.5 API 端点 ── 依赖 W2.4

W3 (Memory Engine) ── depends on W2 (Conversation 体系就绪)
  │
  ├── W3.1 Schema 变更 ── 依赖 W2 完成
  ├── W3.2 MemoryExtractor ── 依赖 W3.1
  ├── W3.3 MemoryRetriever ── 依赖 W3.1
  ├── W3.4 MemoryConsolidator ── 依赖 W3.1
  ├── W3.5 MemoryRepository 扩展 ── 依赖 W3.1
  └── W3.6 ChatService 集成 ── 依赖 W3.2~W3.5

W4 (Context Builder) ── depends on W3 (Memory Engine 就绪)
  │
  ├── W4.1 ContextBuilder ── 依赖 W3
  ├── W4.2 Token 预算 ── 依赖 W4.1
  ├── W4.3 优先级组装 ── 依赖 W4.2
  ├── W4.4 ChatService 改用 ContextBuilder ── 依赖 W4.3
  └── W4.5 Story Engine 预留 ── 独立文件
```

---

## 7. 风险评估

| 风险 | 概率 | 影响 | 缓解措施 |
|------|------|------|---------|
| Migration 中已有消息关联到默认 Conversation 出错 | 中 | 高 | 先在 staging 环境验证 migration SQL |
| MemoryExtractor JSON 解析不稳定 | 中 | 中 | 严格的 try/catch + Zod 校验 + 失败返回 `[]` |
| Vocabulary 文本匹配精度不足（Retriever） | 高 | 中 | Phase 1 接受；Phase 2 迁移到 embedding+pgvector |
| Token 估算偏差大 | 中 | 低 | chars/3.5 偏保守，确保不超预算 |
| Conversation 自动创建/复用逻辑在生产中行为不对 | 低 | 中 | 24h 复用阈值可配置，加详细日志 |
| 删除 `_extractMemoriesAsync` 后无回退方案 | 低 | 中 | Git 保留旧代码；新 Extractor 空返回时不影响主流程 |

---

## 8. 回滚策略

每个 Wave 独立可回滚：

- **W1**：`findHistory` 和 `deleteLastAssistant` 是纯函数签名变更 + 条件追加 → git revert 即可
- **W2**：Migration 不可回滚，但可以不删除旧列（conversationId 先设为 nullable），回滚时忽略该列
- **W3**：新增列 + 新增文件 → git revert + 删除新增列即可（数据无损）
- **W4**：纯代码变更，无 schema 变更 → git revert 即可

---

## 9. 总文件清单

### 新建文件（11 个）

| # | 文件 | Wave |
|---|------|------|
| 1 | `src/db/schema/conversations.ts` | W2 |
| 2 | `src/server/repositories/conversation.repository.ts` | W2 |
| 3 | `src/server/services/memory-extractor.ts` | W3 |
| 4 | `src/server/services/memory-retriever.ts` | W3 |
| 5 | `src/server/services/memory-consolidator.ts` | W3 |
| 6 | `src/server/services/context-builder.ts` | W4 |
| 7 | `src/server/services/story-engine.ts` | W4 |
| 8–11 | W2 API 端点（3 个 route.ts + 可能的 page 组件） | W2 |

### 修改文件（10 个）

| # | 文件 | Wave | 变更类型 |
|---|------|------|---------|
| 1 | `src/server/repositories/message.repository.ts` | W1 | 方法签名 + 条件 |
| 2 | `src/server/services/chat.service.ts` | W1+W2+W3+W4 | 重写 sendMessage，删除 _extractMemoriesAsync |
| 3 | `src/db/enums.ts` | W3 | 新增 enum |
| 4 | `src/db/schema/memories.ts` | W3 | 新增 4 列 + 3 索引 |
| 5 | `src/db/schema/messages.ts` | W2 | 新增 conversationId + 索引 |
| 6 | `src/db/relations.ts` | W2 | 新增 conversations 关系 |
| 7 | `src/db/schema/index.ts` | W2 | 新增 export |
| 8 | `src/server/repositories/memory.repository.ts` | W3 | 新增 4 个方法 |
| 9 | `src/server/services/memory.service.ts` | W3 | 删除 extractFacts |
| 10 | `src/app/api/chat/route.ts` | W2 | 新增 conversationId 可选参数 |

### 删除内容

| # | 位置 | 内容 | Wave |
|---|------|------|------|
| 1 | `chat.service.ts` | `_extractMemoriesAsync()` 整个方法 | W3 |
| 2 | `chat.service.ts` | `CONTEXT_MESSAGE_LIMIT` 常量 | W4 |
| 3 | `chat.service.ts` | `_buildSystemPrompt()` 方法 | W4 |
| 4 | `memory.service.ts` | `extractFacts()` 方法 | W3 |

---

## 10. 完成标准

重构完成后，通过以下场景验证：

1. **用户隔离**：用户 A 无法以任何方式访问用户 B 的聊天数据
2. **多会话**：同一角色创建 3 个 Conversation，消息完全隔离
3. **记忆提取**：与角色聊 20 轮后，角色能记住用户的核心身份信息
4. **记忆检索**：相关记忆被注入，无关记忆不出现在 Context
5. **记忆不膨胀**：连续使用 1 个月，记忆总量稳定（合并+清理机制生效）
6. **Greeting 持久化**：新对话的 Greeting 刷新后仍存在
7. **Token 预算**：Context 不超过模型限制，最早消息被正确裁剪
8. **向后兼容**：现有 SSE 流格式不变，前端无需大幅改动
